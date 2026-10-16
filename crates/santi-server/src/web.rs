use askama::Template;
use axum::Router;
use axum::extract::{FromRequestParts, State};
use axum::http::StatusCode;
use axum::http::header::{CACHE_CONTROL, CONTENT_TYPE};
use axum::http::request::Parts;
use axum::response::{Html, IntoResponse, Redirect, Response};
use axum::routing::get;

use crate::AppState;
use crate::auth::extract::CurrentUser;
use crate::auth::service;
use crate::error::AppError;
use crate::extract::PathParams;

/// Asset URL prefix; the version in the path lets browsers cache forever (D26).
pub const STATIC: &str = concat!("/static/", env!("CARGO_PKG_VERSION"));

const APP_CSS: &str = include_str!("../static/app.css");
const APP_JS: &str = include_str!("../static/app.js");
const HTMX_JS: &str = include_str!("../static/htmx.min.js");

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(home))
        .route("/static/{version}/{file}", get(asset))
        .merge(crate::auth::web::router())
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

pub fn render(status: StatusCode, page: &impl Template) -> Result<Response, AppError> {
    let html = page
        .render()
        .map_err(|error| AppError::Internal(error.to_string()))?;
    Ok((status, Html(html)).into_response())
}

#[derive(Template)]
#[template(path = "app/home.html")]
struct HomePage {
    display_name: String,
}

async fn home(
    State(state): State<AppState>,
    PageUser(user): PageUser,
) -> Result<Response, AppError> {
    let user = service::me(&state.pool, &user).await?;
    render(
        StatusCode::OK,
        &HomePage {
            display_name: user.display_name,
        },
    )
}

async fn asset(PathParams((version, file)): PathParams<(String, String)>) -> Response {
    let (content_type, body) = match file.as_str() {
        "app.css" => ("text/css; charset=utf-8", APP_CSS),
        "app.js" => ("text/javascript; charset=utf-8", APP_JS),
        "htmx.min.js" => ("text/javascript; charset=utf-8", HTMX_JS),
        _ => return AppError::NotFound.into_response(),
    };
    if version != env!("CARGO_PKG_VERSION") {
        return AppError::NotFound.into_response();
    }
    let cache = "public, max-age=31536000, immutable";
    ([(CONTENT_TYPE, content_type), (CACHE_CONTROL, cache)], body).into_response()
}
