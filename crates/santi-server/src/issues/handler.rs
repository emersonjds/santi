use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use santi_types::Problem;
use santi_types::issues::{
    Comment, CreateComment, CreateIssue, Issue, IssueFilter, MoveIssue, Page, PageParams,
    StatusFilter, UpdateIssue,
};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::service;
use crate::AppState;
use crate::error::AppError;
use crate::extract::{JsonBody, PathParams, QueryParams};
use crate::members::Member;

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(create_issue, search_issues))
        .routes(routes!(get_issue, update_issue))
        .routes(routes!(move_issue))
        .routes(routes!(add_comment, list_comments))
        .routes(routes!(list_labels))
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

#[utoipa::path(post, path = "/api/projects/{key}/issues/{number}/move", tag = "issues", request_body = MoveIssue,
    params(
        ("key" = String, Path, description = "Project key"),
        ("number" = i64, Path, description = "Issue number, the N of KEY-N")),
    responses(
        (status = 200, body = Issue, description = "Status changed (done timer per D8) and/or placed right next to one anchor (D4)"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json"),
        (status = 409, body = Problem, content_type = "application/problem+json", description = "`status-unmapped`"),
        (status = 422, body = Problem, content_type = "application/problem+json")))]
pub async fn move_issue(
    State(state): State<AppState>,
    member: Member,
    PathParams((_key, number)): PathParams<(String, i64)>,
    JsonBody(input): JsonBody<MoveIssue>,
) -> Result<Json<Issue>, AppError> {
    Ok(Json(
        service::move_issue(&state.pool, &member, number, input).await?,
    ))
}

#[utoipa::path(get, path = "/api/projects/{key}/issues", tag = "issues",
    params(("key" = String, Path, description = "Project key"), IssueFilter, StatusFilter, PageParams),
    responses(
        (status = 200, body = Page<Issue>, description = "Matching issues by id (D3, D29)"),
        (status = 400, body = Problem, content_type = "application/problem+json", description = "Unparsable query value"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "Limit out of range or parent of another project")))]
pub async fn search_issues(
    State(state): State<AppState>,
    member: Member,
    QueryParams(filter): QueryParams<IssueFilter>,
    QueryParams(status): QueryParams<StatusFilter>,
    QueryParams(page): QueryParams<PageParams>,
) -> Result<Json<Page<Issue>>, AppError> {
    Ok(Json(
        service::search_issues(&state.pool, &member, filter, status, page).await?,
    ))
}

#[utoipa::path(get, path = "/api/projects/{key}/labels", tag = "issues",
    params(("key" = String, Path, description = "Project key")),
    responses(
        (status = 200, body = Vec<String>, description = "Labels in use, once each, alphabetical"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json")))]
pub async fn list_labels(
    State(state): State<AppState>,
    member: Member,
) -> Result<Json<Vec<String>>, AppError> {
    Ok(Json(service::list_labels(&state.pool, &member).await?))
}

#[utoipa::path(post, path = "/api/projects/{key}/issues/{number}/comments", tag = "issues", request_body = CreateComment,
    params(
        ("key" = String, Path, description = "Project key"),
        ("number" = i64, Path, description = "Issue number, the N of KEY-N")),
    responses(
        (status = 201, body = Comment),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json"),
        (status = 422, body = Problem, content_type = "application/problem+json")))]
pub async fn add_comment(
    State(state): State<AppState>,
    member: Member,
    PathParams((_key, number)): PathParams<(String, i64)>,
    JsonBody(input): JsonBody<CreateComment>,
) -> Result<(StatusCode, Json<Comment>), AppError> {
    let comment = service::add_comment(&state.pool, &member, number, input).await?;
    Ok((StatusCode::CREATED, Json(comment)))
}

#[utoipa::path(get, path = "/api/projects/{key}/issues/{number}/comments", tag = "issues",
    params(
        ("key" = String, Path, description = "Project key"),
        ("number" = i64, Path, description = "Issue number, the N of KEY-N"),
        PageParams),
    responses(
        (status = 200, body = Page<Comment>, description = "Oldest first, by id (D29)"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json"),
        (status = 422, body = Problem, content_type = "application/problem+json")))]
pub async fn list_comments(
    State(state): State<AppState>,
    member: Member,
    PathParams((_key, number)): PathParams<(String, i64)>,
    QueryParams(page): QueryParams<PageParams>,
) -> Result<Json<Page<Comment>>, AppError> {
    Ok(Json(
        service::list_comments(&state.pool, &member, number, page).await?,
    ))
}
