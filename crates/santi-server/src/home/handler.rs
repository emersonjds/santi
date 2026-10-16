use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use santi_types::Problem;
use santi_types::home::{HomeIssue, HomeQuery, MyProject, Star};
use santi_types::issues::{Page, PageParams};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::service;
use crate::AppState;
use crate::auth::extract::CurrentUser;
use crate::error::AppError;
use crate::extract::{JsonBody, PathParams, QueryParams};

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(my_projects))
        .routes(routes!(my_issues))
        .routes(routes!(star))
        .routes(routes!(unstar))
}

#[utoipa::path(get, path = "/api/me/projects", tag = "home",
    responses(
        (status = 200, body = Vec<MyProject>, description = "The caller's projects: recently visited or worked first, then starred, then by key"),
        (status = 401, body = Problem, content_type = "application/problem+json")))]
pub async fn my_projects(
    State(state): State<AppState>,
    user: CurrentUser,
) -> Result<Json<Vec<MyProject>>, AppError> {
    Ok(Json(service::my_projects(&state.pool, &user).await?))
}

#[utoipa::path(get, path = "/api/me/issues", tag = "home",
    params(HomeQuery, PageParams),
    responses(
        (status = 200, body = Page<HomeIssue>, description = "Newest first across the caller's projects; `cursor` is an offset"),
        (status = 400, body = Problem, content_type = "application/problem+json", description = "Unknown view"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "Limit out of range")))]
pub async fn my_issues(
    State(state): State<AppState>,
    user: CurrentUser,
    QueryParams(query): QueryParams<HomeQuery>,
    QueryParams(page): QueryParams<PageParams>,
) -> Result<Json<Page<HomeIssue>>, AppError> {
    Ok(Json(
        service::my_issues(&state.pool, &user, query.view, page).await?,
    ))
}

#[utoipa::path(post, path = "/api/me/stars", tag = "home", request_body = Star,
    responses(
        (status = 204, description = "Starred; starring again keeps the first time"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json", description = "No such project or issue among the caller's projects"),
        (status = 422, body = Problem, content_type = "application/problem+json")))]
pub async fn star(
    State(state): State<AppState>,
    user: CurrentUser,
    JsonBody(input): JsonBody<Star>,
) -> Result<StatusCode, AppError> {
    service::set_star(&state.pool, &user, &input.key, true).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(delete, path = "/api/me/stars/{key}", tag = "home",
    params(("key" = String, Path, description = "Project key (`WEB`) or issue key (`WEB-12`)")),
    responses(
        (status = 204, description = "Not starred any more (also when it was not)"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json", description = "No such project or issue among the caller's projects"),
        (status = 422, body = Problem, content_type = "application/problem+json")))]
pub async fn unstar(
    State(state): State<AppState>,
    user: CurrentUser,
    PathParams(key): PathParams<String>,
) -> Result<StatusCode, AppError> {
    service::set_star(&state.pool, &user, &key, false).await?;
    Ok(StatusCode::NO_CONTENT)
}
