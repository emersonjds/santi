use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use santi_types::Problem;
use santi_types::boards::{
    BoardSettings, BoardView, CreateColumn, CreateStatus, DeleteColumnParams, ReorderColumns,
    Status, UpdateBoardSettings, UpdateColumn, UpdateStatus,
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
        .routes(routes!(board_view))
        .routes(routes!(get_settings, update_settings))
        .routes(routes!(create_column))
        .routes(routes!(reorder_columns))
        .routes(routes!(update_column, delete_column))
        .routes(routes!(create_status))
        .routes(routes!(update_status, delete_status))
}

#[utoipa::path(get, path = "/api/projects/{key}/board", tag = "boards",
    params(("key" = String, Path, description = "Project key")),
    responses(
        (status = 200, body = BoardView, description = "Columns left to right, cards in rank order"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json")))]
pub async fn board_view(
    State(state): State<AppState>,
    member: Member,
) -> Result<Json<BoardView>, AppError> {
    Ok(Json(service::board_view(&state.pool, &member).await?))
}

#[utoipa::path(get, path = "/api/projects/{key}/board/settings", tag = "boards",
    params(("key" = String, Path, description = "Project key")),
    responses(
        (status = 200, body = BoardSettings),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json")))]
pub async fn get_settings(
    State(state): State<AppState>,
    member: Member,
) -> Result<Json<BoardSettings>, AppError> {
    Ok(Json(service::get_settings(&state.pool, &member).await?))
}

#[utoipa::path(put, path = "/api/projects/{key}/board/settings", tag = "boards", request_body = UpdateBoardSettings,
    params(("key" = String, Path, description = "Project key")),
    responses(
        (status = 200, body = BoardSettings),
        (status = 403, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "Window not 7, 14, 30 or null, or set on a scrum board")))]
pub async fn update_settings(
    State(state): State<AppState>,
    member: Member,
    JsonBody(input): JsonBody<UpdateBoardSettings>,
) -> Result<Json<BoardSettings>, AppError> {
    Ok(Json(
        service::update_settings(&state.pool, &member, input).await?,
    ))
}

#[utoipa::path(post, path = "/api/projects/{key}/board/columns", tag = "boards", request_body = CreateColumn,
    params(("key" = String, Path, description = "Project key")),
    responses(
        (status = 201, body = BoardSettings, description = "The new column sits left of the rightmost one"),
        (status = 403, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json"),
        (status = 409, body = Problem, content_type = "application/problem+json", description = "`done-column`"),
        (status = 422, body = Problem, content_type = "application/problem+json")))]
pub async fn create_column(
    State(state): State<AppState>,
    member: Member,
    JsonBody(input): JsonBody<CreateColumn>,
) -> Result<(StatusCode, Json<BoardSettings>), AppError> {
    let settings = service::create_column(&state.pool, &member, input).await?;
    Ok((StatusCode::CREATED, Json(settings)))
}

#[utoipa::path(put, path = "/api/projects/{key}/board/columns/order", tag = "boards", request_body = ReorderColumns,
    params(("key" = String, Path, description = "Project key")),
    responses(
        (status = 200, body = BoardSettings),
        (status = 403, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json"),
        (status = 409, body = Problem, content_type = "application/problem+json", description = "`done-column`"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "Not every column listed exactly once")))]
pub async fn reorder_columns(
    State(state): State<AppState>,
    member: Member,
    JsonBody(input): JsonBody<ReorderColumns>,
) -> Result<Json<BoardSettings>, AppError> {
    Ok(Json(
        service::reorder_columns(&state.pool, &member, input).await?,
    ))
}

#[utoipa::path(put, path = "/api/projects/{key}/board/columns/{id}", tag = "boards", request_body = UpdateColumn,
    params(
        ("key" = String, Path, description = "Project key"),
        ("id" = i64, Path, description = "Column id")),
    responses(
        (status = 200, body = BoardSettings),
        (status = 403, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "`wip_limit` on a scrum board, or below 1")))]
pub async fn update_column(
    State(state): State<AppState>,
    member: Member,
    PathParams((_key, column_id)): PathParams<(String, i64)>,
    JsonBody(input): JsonBody<UpdateColumn>,
) -> Result<Json<BoardSettings>, AppError> {
    Ok(Json(
        service::update_column(&state.pool, &member, column_id, input).await?,
    ))
}

#[utoipa::path(delete, path = "/api/projects/{key}/board/columns/{id}", tag = "boards",
    params(
        ("key" = String, Path, description = "Project key"),
        ("id" = i64, Path, description = "Column id"),
        DeleteColumnParams),
    responses(
        (status = 200, body = BoardSettings),
        (status = 400, body = Problem, content_type = "application/problem+json"),
        (status = 403, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json"),
        (status = 409, body = Problem, content_type = "application/problem+json", description = "`rightmost-column` or `done-column`"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "`move_statuses_to` missing or not another column")))]
pub async fn delete_column(
    State(state): State<AppState>,
    member: Member,
    PathParams((_key, column_id)): PathParams<(String, i64)>,
    QueryParams(params): QueryParams<DeleteColumnParams>,
) -> Result<Json<BoardSettings>, AppError> {
    Ok(Json(
        service::delete_column(&state.pool, &member, column_id, params).await?,
    ))
}

#[utoipa::path(post, path = "/api/projects/{key}/statuses", tag = "boards", request_body = CreateStatus,
    params(("key" = String, Path, description = "Project key")),
    responses(
        (status = 201, body = Status, description = "Created unmapped"),
        (status = 403, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json"),
        (status = 409, body = Problem, content_type = "application/problem+json", description = "Name already used"),
        (status = 422, body = Problem, content_type = "application/problem+json")))]
pub async fn create_status(
    State(state): State<AppState>,
    member: Member,
    JsonBody(input): JsonBody<CreateStatus>,
) -> Result<(StatusCode, Json<Status>), AppError> {
    let status = service::create_status(&state.pool, &member, input).await?;
    Ok((StatusCode::CREATED, Json(status)))
}

#[utoipa::path(put, path = "/api/projects/{key}/statuses/{id}", tag = "boards", request_body = UpdateStatus,
    params(
        ("key" = String, Path, description = "Project key"),
        ("id" = i64, Path, description = "Status id")),
    responses(
        (status = 200, body = Status, description = "Renamed, mapped or unmapped"),
        (status = 403, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json"),
        (status = 409, body = Problem, content_type = "application/problem+json", description = "`done-column`"),
        (status = 422, body = Problem, content_type = "application/problem+json")))]
pub async fn update_status(
    State(state): State<AppState>,
    member: Member,
    PathParams((_key, status_id)): PathParams<(String, i64)>,
    JsonBody(input): JsonBody<UpdateStatus>,
) -> Result<Json<Status>, AppError> {
    Ok(Json(
        service::update_status(&state.pool, &member, status_id, input).await?,
    ))
}

#[utoipa::path(delete, path = "/api/projects/{key}/statuses/{id}", tag = "boards",
    params(
        ("key" = String, Path, description = "Project key"),
        ("id" = i64, Path, description = "Status id")),
    responses(
        (status = 204, description = "Deleted"),
        (status = 403, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json"),
        (status = 409, body = Problem, content_type = "application/problem+json", description = "`in-use`: an issue holds it")))]
pub async fn delete_status(
    State(state): State<AppState>,
    member: Member,
    PathParams((_key, status_id)): PathParams<(String, i64)>,
) -> Result<StatusCode, AppError> {
    service::delete_status(&state.pool, &member, status_id).await?;
    Ok(StatusCode::NO_CONTENT)
}
