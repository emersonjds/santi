use askama::Template;
use axum::Router;
use axum::extract::{Form, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Redirect, Response};
use axum::routing::{get, post};
use santi_types::FieldError;
use santi_types::boards::{BoardView, Card};
use santi_types::issues::{CreateIssue, IssueFilter, IssueType, MoveIssue};
use santi_types::projects::{BoardType, CreateInvite, CreateProject, Invite, MemberInfo, Project};

use serde::Deserialize;

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
        .route("/p/{key}", get(project_root))
        .route("/p/{key}/board", get(project_page))
        .route("/p/{key}/issues", post(create_issue))
        .route("/p/{key}/issues/{number}/move", post(move_card))
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
#[template(path = "app/project.html", blocks = ["board"])]
struct ProjectPage {
    shell: Shell,
    project: Project,
    members: Vec<MemberInfo>,
    invite: Option<Invite>,
    board: BoardView,
    draft: IssueDraft,
    /// Why the last drag or "Move to…" was refused; the card stays where it was.
    move_error: Option<String>,
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
        crate::web::issue_path(&self.project.key, key)
    }

    fn initials(&self, name: &str) -> String {
        crate::web::initials(name)
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
        Ok(project) => return Ok(Redirect::to(&landing(&project)).into_response()),
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

/// A new scrum project starts with planning, a kanban one with its board (IA resolved question 7).
fn landing(project: &Project) -> String {
    match project.board_type {
        BoardType::Scrum => format!("/p/{}/backlog", project.key),
        BoardType::Kanban => board_path(&project.key),
    }
}

pub(crate) fn board_path(key: &str) -> String {
    format!("/p/{key}/board")
}

async fn project_root(_user: PageUser, member: Member) -> Redirect {
    Redirect::to(&board_path(&member.project_key))
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
        Ok(_) => return Ok(Redirect::to(&board_path(&member.project_key)).into_response()),
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
    Ok(Redirect::to(&board_path(&project.key)).into_response())
}

async fn load_project_page(
    state: &AppState,
    user: &CurrentUser,
    member: &Member,
    invite: Option<Invite>,
    draft: IssueDraft,
) -> Result<ProjectPage, AppError> {
    Ok(ProjectPage {
        shell: shell(&state.pool, user, &member.project_key)
            .await?
            .on("board"),
        project: service::get_project(&state.pool, member).await?,
        members: members::service::list_members(&state.pool, member).await?,
        invite,
        board: boards::service::board_view(&state.pool, member, &IssueFilter::default()).await?,
        draft,
        move_error: None,
    })
}

/// A drop or a "Move to…" pick: the target column plus a neighbour key (drag) or top/bottom (form).
#[derive(Deserialize)]
struct MoveCard {
    column_id: i64,
    #[serde(default)]
    after: String,
    #[serde(default)]
    before: String,
    #[serde(default)]
    place: String,
}

/// D1: drag and drop and the "Move to…" control both post here; htmx gets the board fragment back.
async fn move_card(
    State(state): State<AppState>,
    PageUser(user): PageUser,
    member: Member,
    PathParams((_key, number)): PathParams<(String, i64)>,
    headers: HeaderMap,
    Form(card): Form<MoveCard>,
) -> Result<Response, AppError> {
    let moved = match to_move(&state, &member, number, card).await {
        Ok(input) => issues::service::move_issue(&state.pool, &member, number, input).await,
        Err(error) => Err(error),
    };
    let (status, move_error) = match moved {
        Ok(_) => (StatusCode::OK, None),
        Err(AppError::Validation(errors)) => {
            let messages: Vec<String> = errors.into_iter().map(|error| error.message).collect();
            (StatusCode::UNPROCESSABLE_ENTITY, Some(messages.join("; ")))
        }
        Err(AppError::Conflict { detail, .. }) => (StatusCode::CONFLICT, Some(detail)),
        Err(error) => return Err(error),
    };
    let from_htmx = headers.contains_key("hx-request");
    if !from_htmx && move_error.is_none() {
        return Ok(Redirect::to(&board_path(&member.project_key)).into_response());
    }
    let mut page = load_project_page(&state, &user, &member, None, IssueDraft::default()).await?;
    page.move_error = move_error;
    if from_htmx {
        return render(status, &page.as_board());
    }
    render(status, &page)
}

/// The column's status (the issue's own when it already sits there, else the column's first) and the rank anchor.
async fn to_move(
    state: &AppState,
    member: &Member,
    number: i64,
    card: MoveCard,
) -> Result<MoveIssue, AppError> {
    let settings = boards::service::get_settings(&state.pool, member).await?;
    let column = settings
        .columns
        .into_iter()
        .find(|column| column.id == card.column_id)
        .ok_or_else(|| AppError::invalid("column_id", "no such column on this board"))?;
    let issue = issues::service::get_issue(&state.pool, member, number).await?;
    let status_id = if column
        .statuses
        .iter()
        .any(|status| status.id == issue.status_id)
    {
        None
    } else {
        let first = column.statuses.first().ok_or_else(|| {
            AppError::conflict(
                "column-without-status",
                "Map a status to this column before moving issues into it.",
            )
        })?;
        Some(first.id)
    };
    let (after, before) = if card.after.is_empty() && card.before.is_empty() {
        let board =
            boards::service::board_view(&state.pool, member, &IssueFilter::default()).await?;
        let target = board.columns.iter().find(|target| target.id == column.id);
        target.map_or((None, None), |target| {
            place_anchor(&target.cards, &issue.key, &card.place)
        })
    } else {
        (
            Some(card.after).filter(|key| !key.is_empty()),
            Some(card.before).filter(|key| !key.is_empty()),
        )
    };
    Ok(MoveIssue {
        status_id,
        after,
        before,
        sprint_id: None,
    })
}

/// "top" lands before the first other card of the column or section; anything else after its last one.
pub(crate) fn place_anchor(
    cards: &[Card],
    moving_key: &str,
    place: &str,
) -> (Option<String>, Option<String>) {
    let mut others = cards.iter().filter(|card| card.key != moving_key);
    if place == "top" {
        return (None, others.next().map(|card| card.key.clone()));
    }
    (others.next_back().map(|card| card.key.clone()), None)
}
