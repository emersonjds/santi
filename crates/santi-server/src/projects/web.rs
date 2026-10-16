use askama::Template;
use axum::Router;
use axum::extract::{Form, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Redirect, Response};
use axum::routing::{get, post};
use santi_types::FieldError;
use santi_types::projects::{
    BoardType, CreateInvite, CreateProject, Invite, MemberInfo, MemberRole, Project,
};

use super::service;
use crate::AppState;
use crate::auth::extract::CurrentUser;
use crate::error::AppError;
use crate::extract::PathParams;
use crate::members::{self, Member};
use crate::web::{PageUser, Shell, render, shell};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/projects/new", get(new_project_page))
        .route("/projects", post(create_project))
        .route("/p/{key}", get(project_page))
        .route("/p/{key}/invites", post(create_invite))
        .route("/invites/{token}", get(invite_page).post(accept_invite))
}

#[derive(Template)]
#[template(path = "app/new_project.html")]
struct NewProjectPage {
    shell: Shell,
    key: String,
    name: String,
    board_type: BoardType,
    errors: Vec<FieldError>,
}

impl NewProjectPage {
    fn error(&self, field: &str) -> &str {
        self.errors
            .iter()
            .find(|error| error.field == field)
            .map_or("", |error| error.message.as_str())
    }
}

#[derive(Template)]
#[template(path = "app/project.html")]
struct ProjectPage {
    shell: Shell,
    project: Project,
    members: Vec<MemberInfo>,
    invite: Option<Invite>,
}

#[derive(Template)]
#[template(path = "app/invite.html")]
struct InvitePage {
    shell: Shell,
    token: String,
}

async fn new_project_page(
    State(state): State<AppState>,
    PageUser(user): PageUser,
) -> Result<Response, AppError> {
    let page = NewProjectPage {
        shell: shell(&state.pool, &user, "").await?,
        key: String::new(),
        name: String::new(),
        board_type: BoardType::Scrum,
        errors: Vec::new(),
    };
    render(StatusCode::OK, &page)
}

async fn create_project(
    State(state): State<AppState>,
    PageUser(user): PageUser,
    Form(input): Form<CreateProject>,
) -> Result<Response, AppError> {
    let (key, name, board_type) = (input.key.clone(), input.name.clone(), input.board_type);
    let (status, errors) = match service::create_project(&state.pool, &user, input).await {
        Ok(project) => return Ok(Redirect::to(&format!("/p/{}", project.key)).into_response()),
        Err(AppError::Validation(errors)) => (StatusCode::UNPROCESSABLE_ENTITY, errors),
        Err(AppError::Conflict { .. }) => {
            let taken = FieldError {
                field: "key".into(),
                message: "is already used by another project".into(),
            };
            (StatusCode::CONFLICT, vec![taken])
        }
        Err(error) => return Err(error),
    };
    let page = NewProjectPage {
        shell: shell(&state.pool, &user, "").await?,
        key,
        name,
        board_type,
        errors,
    };
    render(status, &page)
}

async fn project_page(
    State(state): State<AppState>,
    PageUser(user): PageUser,
    member: Member,
) -> Result<Response, AppError> {
    let page = load_project_page(&state, &user, &member, None).await?;
    render(StatusCode::OK, &page)
}

/// The token is shown once, on the page this post renders.
async fn create_invite(
    State(state): State<AppState>,
    PageUser(user): PageUser,
    member: Member,
    Form(input): Form<CreateInvite>,
) -> Result<Response, AppError> {
    let invite = members::service::create_invite(&state.pool, &member, input).await?;
    let page = load_project_page(&state, &user, &member, Some(invite)).await?;
    render(StatusCode::CREATED, &page)
}

async fn invite_page(
    State(state): State<AppState>,
    PageUser(user): PageUser,
    PathParams(token): PathParams<String>,
) -> Result<Response, AppError> {
    let shell = shell(&state.pool, &user, "").await?;
    render(StatusCode::OK, &InvitePage { shell, token })
}

async fn accept_invite(
    State(state): State<AppState>,
    PageUser(user): PageUser,
    PathParams(token): PathParams<String>,
) -> Result<Response, AppError> {
    let project = members::service::accept_invite(&state.pool, &user, &token).await?;
    Ok(Redirect::to(&format!("/p/{}", project.key)).into_response())
}

async fn load_project_page(
    state: &AppState,
    user: &CurrentUser,
    member: &Member,
    invite: Option<Invite>,
) -> Result<ProjectPage, AppError> {
    Ok(ProjectPage {
        shell: shell(&state.pool, user, &member.project_key).await?,
        project: service::get_project(&state.pool, member).await?,
        members: members::service::list_members(&state.pool, member).await?,
        invite,
    })
}
