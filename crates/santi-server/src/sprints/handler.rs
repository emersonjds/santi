use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use santi_types::Problem;
use santi_types::sprints::{CompleteSprint, CreateSprint, Sprint, StartSprint, UpdateSprint};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::service;
use crate::AppState;
use crate::error::AppError;
use crate::extract::{JsonBody, PathParams};
use crate::members::Member;

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(create_sprint, list_sprints))
        .routes(routes!(update_sprint, delete_sprint))
        .routes(routes!(start_sprint))
        .routes(routes!(complete_sprint))
}

#[utoipa::path(post, path = "/api/projects/{key}/sprints", tag = "sprints", request_body = CreateSprint,
    params(("key" = String, Path, description = "Project key")),
    responses(
        (status = 201, body = Sprint, description = "Future sprint, named `Sprint N` unless a name is given (D12)"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json"),
        (status = 409, body = Problem, content_type = "application/problem+json", description = "`kanban-has-no-sprints`"),
        (status = 422, body = Problem, content_type = "application/problem+json")))]
pub async fn create_sprint(
    State(state): State<AppState>,
    member: Member,
    JsonBody(input): JsonBody<CreateSprint>,
) -> Result<(StatusCode, Json<Sprint>), AppError> {
    let sprint = service::create_sprint(&state.pool, &member, input).await?;
    Ok((StatusCode::CREATED, Json(sprint)))
}

#[utoipa::path(get, path = "/api/projects/{key}/sprints", tag = "sprints",
    params(("key" = String, Path, description = "Project key")),
    responses(
        (status = 200, body = Vec<Sprint>, description = "Every sprint of the board in creation order (D13)"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json")))]
pub async fn list_sprints(
    State(state): State<AppState>,
    member: Member,
) -> Result<Json<Vec<Sprint>>, AppError> {
    Ok(Json(service::list_sprints(&state.pool, &member).await?))
}

#[utoipa::path(put, path = "/api/projects/{key}/sprints/{id}", tag = "sprints", request_body = UpdateSprint,
    params(
        ("key" = String, Path, description = "Project key"),
        ("id" = i64, Path, description = "Sprint id")),
    responses(
        (status = 200, body = Sprint, description = "Renamed or replanned; closed sprints keep their dates (SP-11)"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json"),
        (status = 422, body = Problem, content_type = "application/problem+json")))]
pub async fn update_sprint(
    State(state): State<AppState>,
    member: Member,
    PathParams((_key, sprint_id)): PathParams<(String, i64)>,
    JsonBody(input): JsonBody<UpdateSprint>,
) -> Result<Json<Sprint>, AppError> {
    Ok(Json(
        service::update_sprint(&state.pool, &member, sprint_id, input).await?,
    ))
}

#[utoipa::path(delete, path = "/api/projects/{key}/sprints/{id}", tag = "sprints",
    params(
        ("key" = String, Path, description = "Project key"),
        ("id" = i64, Path, description = "Sprint id")),
    responses(
        (status = 204, description = "Deleted; its issues return to the backlog with their rank (D32)"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json"),
        (status = 409, body = Problem, content_type = "application/problem+json", description = "`sprint-not-future`")))]
pub async fn delete_sprint(
    State(state): State<AppState>,
    member: Member,
    PathParams((_key, sprint_id)): PathParams<(String, i64)>,
) -> Result<StatusCode, AppError> {
    service::delete_sprint(&state.pool, &member, sprint_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(post, path = "/api/projects/{key}/sprints/{id}/start", tag = "sprints", request_body = StartSprint,
    params(
        ("key" = String, Path, description = "Project key"),
        ("id" = i64, Path, description = "Sprint id")),
    responses(
        (status = 200, body = Sprint, description = "Active; start defaults to today, end to two weeks later"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json"),
        (status = 409, body = Problem, content_type = "application/problem+json", description = "`sprint-not-future`, `sprint-already-active` or `sprint-empty` (D13)"),
        (status = 422, body = Problem, content_type = "application/problem+json")))]
pub async fn start_sprint(
    State(state): State<AppState>,
    member: Member,
    PathParams((_key, sprint_id)): PathParams<(String, i64)>,
    JsonBody(input): JsonBody<StartSprint>,
) -> Result<Json<Sprint>, AppError> {
    Ok(Json(
        service::start_sprint(&state.pool, &member, sprint_id, input).await?,
    ))
}

#[utoipa::path(post, path = "/api/projects/{key}/sprints/{id}/complete", tag = "sprints", request_body = CompleteSprint,
    params(
        ("key" = String, Path, description = "Project key"),
        ("id" = i64, Path, description = "Sprint id")),
    responses(
        (status = 200, body = Sprint, description = "Closed; open issues moved together, subtasks with their parent (D13)"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json"),
        (status = 409, body = Problem, content_type = "application/problem+json", description = "`sprint-not-active`"),
        (status = 422, body = Problem, content_type = "application/problem+json")))]
pub async fn complete_sprint(
    State(state): State<AppState>,
    member: Member,
    PathParams((_key, sprint_id)): PathParams<(String, i64)>,
    JsonBody(input): JsonBody<CompleteSprint>,
) -> Result<Json<Sprint>, AppError> {
    Ok(Json(
        service::complete_sprint(&state.pool, &member, sprint_id, input).await?,
    ))
}
