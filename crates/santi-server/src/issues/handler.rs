use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use santi_types::Problem;
use santi_types::issues::{CreateIssue, Issue, UpdateIssue};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::service;
use crate::AppState;
use crate::error::AppError;
use crate::extract::{JsonBody, PathParams};
use crate::members::Member;

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(create_issue))
        .routes(routes!(get_issue, update_issue))
}

#[utoipa::path(post, path = "/api/projects/{key}/issues", tag = "issues", request_body = CreateIssue,
    params(("key" = String, Path, description = "Project key")),
    responses(
        (status = 201, body = Issue, description = "Numbered from the project counter, ranked last, in the given or first to-do status"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json"),
        (status = 409, body = Problem, content_type = "application/problem+json", description = "`status-unmapped` or `no-todo-status`"),
        (status = 422, body = Problem, content_type = "application/problem+json")))]
pub async fn create_issue(
    State(state): State<AppState>,
    member: Member,
    JsonBody(input): JsonBody<CreateIssue>,
) -> Result<(StatusCode, Json<Issue>), AppError> {
    let issue = service::create_issue(&state.pool, &member, input).await?;
    Ok((StatusCode::CREATED, Json(issue)))
}

#[utoipa::path(get, path = "/api/projects/{key}/issues/{number}", tag = "issues",
    params(
        ("key" = String, Path, description = "Project key"),
        ("number" = i64, Path, description = "Issue number, the N of KEY-N")),
    responses(
        (status = 200, body = Issue),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json")))]
pub async fn get_issue(
    State(state): State<AppState>,
    member: Member,
    PathParams((_key, number)): PathParams<(String, i64)>,
) -> Result<Json<Issue>, AppError> {
    Ok(Json(
        service::get_issue(&state.pool, &member, number).await?,
    ))
}

#[utoipa::path(patch, path = "/api/projects/{key}/issues/{number}", tag = "issues", request_body = UpdateIssue,
    params(
        ("key" = String, Path, description = "Project key"),
        ("number" = i64, Path, description = "Issue number, the N of KEY-N")),
    responses(
        (status = 200, body = Issue, description = "Absent fields untouched; null clears"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json"),
        (status = 422, body = Problem, content_type = "application/problem+json")))]
pub async fn update_issue(
    State(state): State<AppState>,
    member: Member,
    PathParams((_key, number)): PathParams<(String, i64)>,
    JsonBody(change): JsonBody<UpdateIssue>,
) -> Result<Json<Issue>, AppError> {
    Ok(Json(
        service::update_issue(&state.pool, &member, number, change).await?,
    ))
}
