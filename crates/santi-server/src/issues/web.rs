use askama::Template;
use axum::Router;
use axum::extract::{Form, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Redirect, Response};
use axum::routing::{get, post};
use chrono::{DateTime, Utc};
use santi_types::FieldError;
use santi_types::boards::Status;
use santi_types::issues::{CreateComment, Issue, IssueFilter, MoveIssue, PageParams, UpdateIssue};
use serde::Deserialize;

use super::service;
use crate::AppState;
use crate::auth::extract::CurrentUser;
use crate::error::AppError;
use crate::extract::{PathParams, QueryParams};
use crate::members::{self, Member};
use crate::web::{PageUser, Shell, render, shell};
use crate::{boards, pagination};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/p/{key}/issues/{number}", get(issue_page).post(edit_issue))
        .route("/p/{key}/issues/{number}/comments", post(add_comment))
        .route("/p/{key}/search", get(search_page))
}

#[derive(Deserialize)]
struct EditIssue {
    summary: String,
    description: String,
    status_id: i64,
}

#[derive(Template)]
#[template(path = "app/issue.html")]
struct IssuePage {
    shell: Shell,
    issue: Issue,
    /// Mapped statuses, column by column: the move-to choices (D1 keyboard fallback).
    statuses: Vec<Status>,
    status_name: String,
    edit: EditIssue,
    comments: Vec<CommentView>,
    /// Typed text of a refused comment.
    comment: String,
    errors: Vec<FieldError>,
}

struct CommentView {
    author: String,
    created_at: DateTime<Utc>,
    body: String,
}

#[derive(Template)]
#[template(path = "app/search.html")]
struct SearchPage {
    shell: Shell,
    q: String,
    issues: Vec<Issue>,
}

impl IssuePage {
    fn error(&self, field: &str) -> &str {
        self.errors
            .iter()
            .find(|error| error.field == field)
            .map_or("", |error| error.message.as_str())
    }
}

async fn issue_page(
    State(state): State<AppState>,
    PageUser(user): PageUser,
    member: Member,
    PathParams((_key, number)): PathParams<(String, i64)>,
) -> Result<Response, AppError> {
    let issue = service::get_issue(&state.pool, &member, number).await?;
    let edit = EditIssue {
        summary: issue.summary.clone(),
        description: issue.description.clone(),
        status_id: issue.status_id,
    };
    let page = load_issue_page(&state, &user, &member, issue, edit, Vec::new()).await?;
    render(StatusCode::OK, &page)
}

// ponytail: fields and status are two writes; a refused status keeps the saved fields.
async fn edit_issue(
    State(state): State<AppState>,
    PageUser(user): PageUser,
    member: Member,
    PathParams((_key, number)): PathParams<(String, i64)>,
    Form(edit): Form<EditIssue>,
) -> Result<Response, AppError> {
    let change = UpdateIssue {
        summary: Some(edit.summary.clone()),
        description: Some(edit.description.clone()),
        ..UpdateIssue::default()
    };
    let saved = match service::update_issue(&state.pool, &member, number, change).await {
        Ok(issue) if issue.status_id == edit.status_id => Ok(issue),
        Ok(_) => {
            let to_status = MoveIssue {
                status_id: Some(edit.status_id),
                ..MoveIssue::default()
            };
            service::move_issue(&state.pool, &member, number, to_status).await
        }
        Err(error) => Err(error),
    };
    let (status, errors) = match saved {
        Ok(_) => {
            let path = format!("/p/{}/issues/{number}", member.project_key);
            return Ok(Redirect::to(&path).into_response());
        }
        Err(AppError::Validation(errors)) => (StatusCode::UNPROCESSABLE_ENTITY, errors),
        Err(AppError::Conflict { detail, .. }) => {
            let refused = FieldError {
                field: "status_id".into(),
                message: detail,
            };
            (StatusCode::CONFLICT, vec![refused])
        }
        Err(error) => return Err(error),
    };
    let issue = service::get_issue(&state.pool, &member, number).await?;
    let page = load_issue_page(&state, &user, &member, issue, edit, errors).await?;
    render(status, &page)
}

async fn load_issue_page(
    state: &AppState,
    user: &CurrentUser,
    member: &Member,
    issue: Issue,
    edit: EditIssue,
    errors: Vec<FieldError>,
) -> Result<IssuePage, AppError> {
    let settings = boards::service::get_settings(&state.pool, member).await?;
    let mapped = settings
        .columns
        .into_iter()
        .flat_map(|column| column.statuses);
    let all: Vec<Status> = mapped.chain(settings.unmapped).collect();
    let status_name = all
        .iter()
        .find(|status| status.id == issue.status_id)
        .map_or_else(String::new, |status| status.name.clone());
    let statuses = all
        .into_iter()
        .filter(|status| status.column_id.is_some())
        .collect();
    // ponytail: first 200 comments; page with next_cursor when issues get longer threads.
    let first_page = PageParams {
        limit: Some(pagination::MAX_LIMIT),
        cursor: None,
    };
    let comments = service::list_comments(&state.pool, member, issue.number, first_page).await?;
    let people = members::service::list_members(&state.pool, member).await?;
    let comments = comments
        .items
        .into_iter()
        .map(|comment| CommentView {
            author: people
                .iter()
                .find(|person| person.user_id == comment.author_id)
                .map_or_else(
                    || "Former member".into(),
                    |person| person.display_name.clone(),
                ),
            created_at: comment.created_at,
            body: comment.body,
        })
        .collect();
    Ok(IssuePage {
        shell: shell(&state.pool, user, &member.project_key).await?,
        issue,
        statuses,
        status_name,
        edit,
        comments,
        comment: String::new(),
        errors,
    })
}

async fn add_comment(
    State(state): State<AppState>,
    PageUser(user): PageUser,
    member: Member,
    PathParams((_key, number)): PathParams<(String, i64)>,
    Form(input): Form<CreateComment>,
) -> Result<Response, AppError> {
    let typed = input.body.clone();
    let errors = match service::add_comment(&state.pool, &member, number, input).await {
        Ok(_) => {
            let path = format!("/p/{}/issues/{number}#comments", member.project_key);
            return Ok(Redirect::to(&path).into_response());
        }
        Err(AppError::Validation(errors)) => errors,
        Err(error) => return Err(error),
    };
    let issue = service::get_issue(&state.pool, &member, number).await?;
    let edit = EditIssue {
        summary: issue.summary.clone(),
        description: issue.description.clone(),
        status_id: issue.status_id,
    };
    let mut page = load_issue_page(&state, &user, &member, issue, edit, errors).await?;
    page.comment = typed;
    render(StatusCode::UNPROCESSABLE_ENTITY, &page)
}

// ponytail: first page only (50 by id); add next links when projects outgrow it.
async fn search_page(
    State(state): State<AppState>,
    PageUser(user): PageUser,
    member: Member,
    QueryParams(filter): QueryParams<IssueFilter>,
) -> Result<Response, AppError> {
    let q = filter.q.clone().unwrap_or_default();
    let found = service::search_issues(&state.pool, &member, filter, PageParams::default()).await?;
    let page = SearchPage {
        shell: shell(&state.pool, &user, &member.project_key).await?,
        q,
        issues: found.items,
    };
    render(StatusCode::OK, &page)
}
