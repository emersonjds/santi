use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use santi_types::Problem;
use santi_types::issues::{
    Comment, CreateComment, CreateIssue, Issue, IssueFilter, MoveIssue, Page, PageParams,
    StatusFilter, UpdateComment, UpdateIssue,
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
        .routes(routes!(get_issue, update_issue, delete_issue))
        .routes(routes!(move_issue))
        .routes(routes!(add_comment, list_comments))
        .routes(routes!(edit_comment, delete_comment))
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

#[utoipa::path(delete, path = "/api/projects/{key}/issues/{number}", tag = "issues",
    params(
        ("key" = String, Path, description = "Project key"),
        ("number" = i64, Path, description = "Issue number, the N of KEY-N")),
    responses(
        (status = 204, description = "Deleted with its subtasks, comments and attachments; an epic's children stay without an epic; the number is never reused (D40)"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 403, body = Problem, content_type = "application/problem+json", description = "Neither an admin nor the reporter"),
        (status = 404, body = Problem, content_type = "application/problem+json")))]
pub async fn delete_issue(
    State(state): State<AppState>,
    member: Member,
    PathParams((_key, number)): PathParams<(String, i64)>,
) -> Result<StatusCode, AppError> {
    service::delete_issue(&state.pool, &state.storage, &member, number).await?;
    Ok(StatusCode::NO_CONTENT)
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

#[utoipa::path(patch, path = "/api/projects/{key}/issues/{number}/comments/{id}", tag = "issues", request_body = UpdateComment,
    params(
        ("key" = String, Path, description = "Project key"),
        ("number" = i64, Path, description = "Issue number, the N of KEY-N"),
        ("id" = i64, Path, description = "Comment id")),
    responses(
        (status = 200, body = Comment, description = "Marked edited by the caller; the same text returns the comment untouched (D52)"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 403, body = Problem, content_type = "application/problem+json", description = "Neither an admin nor the author"),
        (status = 404, body = Problem, content_type = "application/problem+json"),
        (status = 409, body = Problem, content_type = "application/problem+json", description = "`project-archived`"),
        (status = 422, body = Problem, content_type = "application/problem+json")))]
pub async fn edit_comment(
    State(state): State<AppState>,
    member: Member,
    PathParams((_key, number, id)): PathParams<(String, i64, i64)>,
    JsonBody(input): JsonBody<UpdateComment>,
) -> Result<Json<Comment>, AppError> {
    Ok(Json(
        service::edit_comment(&state.pool, &member, number, id, input).await?,
    ))
}

#[utoipa::path(delete, path = "/api/projects/{key}/issues/{number}/comments/{id}", tag = "issues",
    params(
        ("key" = String, Path, description = "Project key"),
        ("number" = i64, Path, description = "Issue number, the N of KEY-N"),
        ("id" = i64, Path, description = "Comment id")),
    responses(
        (status = 204, description = "Deleted for good with its attachments (D52, D53)"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 403, body = Problem, content_type = "application/problem+json", description = "Neither an admin nor the author"),
        (status = 404, body = Problem, content_type = "application/problem+json"),
        (status = 409, body = Problem, content_type = "application/problem+json", description = "`project-archived`")))]
pub async fn delete_comment(
    State(state): State<AppState>,
    member: Member,
    PathParams((_key, number, id)): PathParams<(String, i64, i64)>,
) -> Result<StatusCode, AppError> {
    service::delete_comment(&state.pool, &state.storage, &member, number, id).await?;
    Ok(StatusCode::NO_CONTENT)
}
