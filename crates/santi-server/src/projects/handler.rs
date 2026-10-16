use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use santi_types::Problem;
use santi_types::projects::{CreateProject, Project};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::{sample, service};
use crate::AppState;
use crate::auth::extract::CurrentUser;
use crate::error::AppError;
use crate::extract::JsonBody;
use crate::members::Member;

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(create_project, list_projects))
        .routes(routes!(get_project))
        .routes(routes!(create_sample_project))
}

#[utoipa::path(post, path = "/api/sample-project", tag = "projects",
    responses(
        (status = 201, body = Project, description = "Created the caller's sample scrum project: a running sprint, a future one, a backlog, epics, subtasks and comments"),
        (status = 200, body = Project, description = "The caller already has one; nothing changed"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 409, body = Problem, content_type = "application/problem+json", description = "Another project took the sample's key")))]
pub async fn create_sample_project(
    State(state): State<AppState>,
    user: CurrentUser,
) -> Result<(StatusCode, Json<Project>), AppError> {
    let (project, created) = sample::create_sample(&state.pool, &user).await?;
    let status = if created {
        StatusCode::CREATED
    } else {
        StatusCode::OK
    };
    Ok((status, Json(project)))
}

#[utoipa::path(post, path = "/api/projects", tag = "projects", request_body = CreateProject,
    responses(
        (status = 201, body = Project, description = "Created; the caller is its admin"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 409, body = Problem, content_type = "application/problem+json"),
        (status = 422, body = Problem, content_type = "application/problem+json")))]
pub async fn create_project(
    State(state): State<AppState>,
    user: CurrentUser,
    JsonBody(input): JsonBody<CreateProject>,
) -> Result<(StatusCode, Json<Project>), AppError> {
    let project = service::create_project(&state.pool, &user, input).await?;
    Ok((StatusCode::CREATED, Json(project)))
}

#[utoipa::path(get, path = "/api/projects", tag = "projects",
    responses(
        (status = 200, body = Vec<Project>, description = "The caller's projects, by key"),
        (status = 401, body = Problem, content_type = "application/problem+json")))]
pub async fn list_projects(
    State(state): State<AppState>,
    user: CurrentUser,
) -> Result<Json<Vec<Project>>, AppError> {
    Ok(Json(service::list_projects(&state.pool, &user).await?))
}

#[utoipa::path(get, path = "/api/projects/{key}", tag = "projects",
    params(("key" = String, Path, description = "Project key")),
    responses(
        (status = 200, body = Project),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json")))]
pub async fn get_project(
    State(state): State<AppState>,
    member: Member,
) -> Result<Json<Project>, AppError> {
    Ok(Json(service::get_project(&state.pool, &member).await?))
}
