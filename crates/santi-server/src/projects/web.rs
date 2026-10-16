use askama::Template;
use axum::Router;
use axum::extract::{Form, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Redirect, Response};
use axum::routing::{get, post};
use santi_types::FieldError;
use santi_types::boards::BoardView;
use santi_types::issues::{CreateIssue, IssueType};
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
use crate::{boards, issues};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/projects/new", get(new_project_page))
        .route("/projects", post(create_project))
        .route("/p/{key}", get(project_page))
        .route("/p/{key}/issues", post(create_issue))
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
    board: BoardView,
    draft: IssueDraft,
}

/// What the create-issue form shows: typed values and their errors.
#[derive(Default)]
struct IssueDraft {
    summary: String,
    issue_type: IssueType,
    errors: Vec<FieldError>,
}

impl ProjectPage {
    /// Types offered by the board's create form; epics and subtasks are made from the API for now.
    fn board_types(&self) -> [IssueType; 3] {
        [IssueType::Story, IssueType::Task, IssueType::Bug]
    }

    fn error(&self, field: &str) -> &str {
        self.draft
            .errors
            .iter()
            .find(|error| error.field == field)
            .map_or("", |error| error.message.as_str())
    }

    fn issue_path(&self, key: &str) -> String {
        let number = key.rsplit_once('-').map_or(key, |(_, number)| number);
        format!("/p/{}/issues/{number}", self.project.key)
    }

    fn initials(&self, name: &str) -> String {
        name.split_whitespace()
            .take(2)
            .filter_map(|word| word.chars().next())
            .flat_map(char::to_uppercase)
            .collect()
    }
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
    let page = load_project_page(&state, &user, &member, None, IssueDraft::default()).await?;
    render(StatusCode::OK, &page)
}

async fn create_issue(
    State(state): State<AppState>,
    PageUser(user): PageUser,
    member: Member,
    Form(input): Form<CreateIssue>,
) -> Result<Response, AppError> {
    let (summary, issue_type) = (input.summary.clone(), input.issue_type);
    let (status, errors) = match issues::service::create_issue(&state.pool, &member, input).await {
        Ok(_) => return Ok(Redirect::to(&format!("/p/{}", member.project_key)).into_response()),
        Err(AppError::Validation(errors)) => (StatusCode::UNPROCESSABLE_ENTITY, errors),
        Err(AppError::Conflict { detail, .. }) => {
            let blocked = FieldError {
                field: "form".into(),
                message: detail,
            };
            (StatusCode::CONFLICT, vec![blocked])
        }
        Err(error) => return Err(error),
    };
    let draft = IssueDraft {
        summary,
        issue_type,
        errors,
    };
    let page = load_project_page(&state, &user, &member, None, draft).await?;
    render(status, &page)
}

/// The token is shown once, on the page this post renders.
async fn create_invite(
    State(state): State<AppState>,
    PageUser(user): PageUser,
    member: Member,
    Form(input): Form<CreateInvite>,
) -> Result<Response, AppError> {
    let invite = members::service::create_invite(&state.pool, &member, input).await?;
    let page =
        load_project_page(&state, &user, &member, Some(invite), IssueDraft::default()).await?;
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
    draft: IssueDraft,
) -> Result<ProjectPage, AppError> {
    Ok(ProjectPage {
        shell: shell(&state.pool, user, &member.project_key).await?,
        project: service::get_project(&state.pool, member).await?,
        members: members::service::list_members(&state.pool, member).await?,
        invite,
        board: boards::service::board_view(&state.pool, member).await?,
        draft,
    })
}
