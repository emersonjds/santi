use std::str::FromStr;

use askama::Template;
use axum::Router;
use axum::extract::{FromRequestParts, State};
use axum::http::header::{CACHE_CONTROL, CONTENT_TYPE};
use axum::http::request::Parts;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{Html, IntoResponse, Redirect, Response};
use axum::routing::get;
use santi_types::issues::Priority;
use santi_types::projects::Project;
use sqlx::PgPool;

use crate::AppState;
use crate::auth::extract::CurrentUser;
use crate::auth::service;
use crate::error::AppError;
use crate::extract::PathParams;

/// Most pressing first, as pickers list them.
pub const PRIORITIES: [Priority; 4] = [
    Priority::Urgent,
    Priority::High,
    Priority::Medium,
    Priority::Low,
];

/// Asset URL prefix; the version in the path lets browsers cache forever (D26).
pub const STATIC: &str = concat!("/static/", env!("CARGO_PKG_VERSION"));

const APP_CSS: &str = include_str!("../static/app.css");
const APP_JS: &str = include_str!("../static/app.js");
const HTMX_JS: &str = include_str!("../static/htmx.min.js");
const FAVICON: &str = include_str!("../static/favicon.svg");

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(home))
        .route("/static/{version}/{file}", get(asset))
        .merge(crate::auth::web::router())
        .merge(crate::projects::web::router())
        .merge(crate::issues::web::router())
        .merge(crate::sprints::web::router())
}

/// The signed-in caller on an HTML page; anonymous visitors are sent to the sign-in form.
pub struct PageUser(pub CurrentUser);

impl FromRequestParts<AppState> for PageUser {
    type Rejection = Response;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Response> {
        CurrentUser::from_request_parts(parts, state)
            .await
            .map(PageUser)
            .map_err(|error| match error {
                AppError::Unauthorized => Redirect::to("/login").into_response(),
                other => other.into_response(),
            })
    }
}

/// An htmx swap wants the page's fragment; a history restore after a cache miss wants the whole page.
pub fn wants_fragment(headers: &HeaderMap) -> bool {
    headers.contains_key("hx-request") && !headers.contains_key("hx-history-restore-request")
}

/// A form's optional number: blank is none, anything else must parse.
pub fn optional_number<T: FromStr>(value: &str, field: &str) -> Result<Option<T>, AppError> {
    let value = value.trim();
    if value.is_empty() {
        return Ok(None);
    }
    value
        .parse()
        .map(Some)
        .map_err(|_| AppError::invalid(field, "must be a number"))
}

pub fn render(status: StatusCode, page: &impl Template) -> Result<Response, AppError> {
    let html = page
        .render()
        .map_err(|error| AppError::Internal(error.to_string()))?;
    Ok((status, Html(html)).into_response())
}

/// What every signed-in page needs for the top bar and the sidebar.
pub struct Shell {
    pub display_name: String,
    pub projects: Vec<Project>,
    /// Key of the project being viewed; empty outside a project.
    pub current: String,
    /// The open view, marked current in the sidebar and the project tabs: `home`, `board`, `backlog`.
    pub tab: &'static str,
}

impl Shell {
    pub fn on(self, tab: &'static str) -> Self {
        Self { tab, ..self }
    }

    /// Top bar "+ Create": the create form of the current project, else of the first one (IA §5).
    pub fn create_href(&self) -> String {
        let project = self
            .projects
            .iter()
            .find(|project| project.key == self.current)
            .or(self.projects.first());
        project.map_or_else(
            || "/projects/new".into(),
            |project| format!("/p/{}/issues/new", project.key),
        )
    }
}

pub async fn shell(pool: &PgPool, user: &CurrentUser, current: &str) -> Result<Shell, AppError> {
    let me = service::me(pool, user).await?;
    let projects = crate::projects::service::list_projects(pool, user).await?;
    Ok(Shell {
        display_name: me.display_name,
        projects,
        current: current.into(),
        tab: "",
    })
}

/// `/p/KEY/issues/N` for the card key `KEY-N`.
pub fn issue_path(project_key: &str, card_key: &str) -> String {
    let number = card_key
        .rsplit_once('-')
        .map_or(card_key, |(_, number)| number);
    format!("/p/{project_key}/issues/{number}")
}

pub fn initials(name: &str) -> String {
    name.split_whitespace()
        .take(2)
        .filter_map(|word| word.chars().next())
        .flat_map(char::to_uppercase)
        .collect()
}

#[derive(Template)]
#[template(path = "app/home.html")]
struct HomePage {
    shell: Shell,
}

async fn home(
    State(state): State<AppState>,
    PageUser(user): PageUser,
) -> Result<Response, AppError> {
    let shell = shell(&state.pool, &user, "").await?.on("home");
    render(StatusCode::OK, &HomePage { shell })
}

async fn asset(PathParams((version, file)): PathParams<(String, String)>) -> Response {
    let (content_type, body) = match file.as_str() {
        "app.css" => ("text/css; charset=utf-8", APP_CSS),
        "app.js" => ("text/javascript; charset=utf-8", APP_JS),
        "htmx.min.js" => ("text/javascript; charset=utf-8", HTMX_JS),
        "favicon.svg" => ("image/svg+xml", FAVICON),
        _ => return AppError::NotFound.into_response(),
    };
    if version != env!("CARGO_PKG_VERSION") {
        return AppError::NotFound.into_response();
    }
    let cache = "public, max-age=31536000, immutable";
    ([(CONTENT_TYPE, content_type), (CACHE_CONTROL, cache)], body).into_response()
}
