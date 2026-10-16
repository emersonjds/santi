use askama::Template;
use axum::Router;
use axum::extract::{Form, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Redirect, Response};
use axum::routing::get;
use santi_types::FieldError;
use santi_types::boards::Status;
use santi_types::issues::{Issue, UpdateIssue};
use serde::Deserialize;

use super::service;
use crate::AppState;
use crate::auth::extract::CurrentUser;
use crate::boards;
use crate::error::AppError;
use crate::extract::PathParams;
use crate::members::Member;
use crate::web::{PageUser, Shell, render, shell};

pub fn router() -> Router<AppState> {
    Router::new().route("/p/{key}/issues/{number}", get(issue_page).post(edit_issue))
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
    errors: Vec<FieldError>,
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

// ponytail: fields and status are two writes; a refused status keeps the saved fields. One transaction when Task 6 lands the move.
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
        Ok(_) => service::change_status(&state.pool, &member, number, edit.status_id).await,
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
    Ok(IssuePage {
        shell: shell(&state.pool, user, &member.project_key).await?,
        issue,
        statuses,
        status_name,
        edit,
        errors,
    })
}
