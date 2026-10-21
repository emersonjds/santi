use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use santi_types::Problem;
use santi_types::links::{CreateLink, IssueLink};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::service;
use crate::AppState;
use crate::error::AppError;
use crate::extract::{JsonBody, PathParams};
use crate::members::Member;

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(list_links, create_link))
        .routes(routes!(delete_link))
}

#[utoipa::path(get, path = "/api/projects/{key}/issues/{number}/links", tag = "links",
    params(
        ("key" = String, Path, description = "Project key"),
        ("number" = i64, Path, description = "Issue number, the N of KEY-N")),
    responses(
        (status = 200, body = Vec<IssueLink>, description = "Links read from this issue, by relation (blocks, is blocked by, relates, duplicates, is duplicated by, clones, is cloned by) then key; links to issues the caller cannot open are left out, uncounted (D59)"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json")))]
pub async fn list_links(
    State(state): State<AppState>,
    member: Member,
    PathParams((_key, number)): PathParams<(String, i64)>,
) -> Result<Json<Vec<IssueLink>>, AppError> {
    Ok(Json(service::list(&state.pool, &member, number).await?))
}

#[utoipa::path(post, path = "/api/projects/{key}/issues/{number}/links", tag = "links", request_body = CreateLink,
    params(
        ("key" = String, Path, description = "Project key"),
        ("number" = i64, Path, description = "Issue number, the N of KEY-N")),
    responses(
        (status = 201, body = IssueLink, description = "Linked; the other issue shows the inverse relation"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json", description = "This issue, or the other one, does not exist or is in a project the caller is not a member of"),
        (status = 409, body = Problem, content_type = "application/problem+json", description = "`project-archived`: this issue's project or the other issue's"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "`issue` is not an issue key, is this issue, or already has this link with it (either direction for `relates`)")))]
pub async fn create_link(
    State(state): State<AppState>,
    member: Member,
    PathParams((_key, number)): PathParams<(String, i64)>,
    JsonBody(input): JsonBody<CreateLink>,
) -> Result<(StatusCode, Json<IssueLink>), AppError> {
    let created = service::create(&state.pool, &member, number, input).await?;
    Ok((StatusCode::CREATED, Json(created)))
}

#[utoipa::path(delete, path = "/api/projects/{key}/issues/{number}/links/{id}", tag = "links",
    params(
        ("key" = String, Path, description = "Project key"),
        ("number" = i64, Path, description = "Issue number, the N of KEY-N"),
        ("id" = i64, Path, description = "Link id")),
    responses(
        (status = 204, description = "Removed from both issues"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json", description = "No such link on this issue, or its other issue is one the caller cannot open"),
        (status = 409, body = Problem, content_type = "application/problem+json", description = "`project-archived`")))]
pub async fn delete_link(
    State(state): State<AppState>,
    member: Member,
    PathParams((_key, number, id)): PathParams<(String, i64, i64)>,
) -> Result<StatusCode, AppError> {
    service::delete(&state.pool, &member, number, id).await?;
    Ok(StatusCode::NO_CONTENT)
}
