use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use santi_types::Problem;
use santi_types::projects::{CreateProject, Project, ProjectsQuery};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::{sample, service};
use crate::AppState;
use crate::auth::extract::CurrentUser;
use crate::error::AppError;
use crate::extract::{JsonBody, PathParams, QueryParams};
use crate::members::Member;
use crate::rate_limit::Action;

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(create_project, list_projects))
        .routes(routes!(get_project, purge_project))
        .routes(routes!(archive_project))
        .routes(routes!(unarchive_project))
        .routes(routes!(trash_project))
        .routes(routes!(restore_project))
        .routes(routes!(create_sample_project))
}

#[utoipa::path(post, path = "/api/sample-project", tag = "projects",
    responses(
        (status = 201, body = Project, description = "Created the caller's sample scrum project: a running sprint, a future one, a backlog, epics, subtasks and comments"),
        (status = 200, body = Project, description = "The caller already has one; nothing changed"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 409, body = Problem, content_type = "application/problem+json", description = "Other projects took the sample's key and three random ones"),
        (status = 429, body = Problem, content_type = "application/problem+json", description = "Rate limited per account, shared with project creation (D44); wait `Retry-After` seconds")))]
pub async fn create_sample_project(
    State(state): State<AppState>,
    user: CurrentUser,
) -> Result<(StatusCode, Json<Project>), AppError> {
    state
        .limits
        .check(Action::CreateProject, None, Some(user.id))?;
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
        (status = 422, body = Problem, content_type = "application/problem+json"),
        (status = 429, body = Problem, content_type = "application/problem+json", description = "Rate limited per account (D44); wait `Retry-After` seconds")))]
pub async fn create_project(
    State(state): State<AppState>,
    user: CurrentUser,
    JsonBody(input): JsonBody<CreateProject>,
) -> Result<(StatusCode, Json<Project>), AppError> {
    state
        .limits
        .check(Action::CreateProject, None, Some(user.id))?;
    let project = service::create_project(&state.pool, &user, input).await?;
    Ok((StatusCode::CREATED, Json(project)))
}

#[utoipa::path(get, path = "/api/projects", tag = "projects", params(ProjectsQuery),
    responses(
        (status = 200, body = Vec<Project>, description = "The caller's projects in that state (default `active`), by key; `archived` and `trashed` only those the caller administers"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "Unknown state")))]
pub async fn list_projects(
    State(state): State<AppState>,
    user: CurrentUser,
    QueryParams(query): QueryParams<ProjectsQuery>,
) -> Result<Json<Vec<Project>>, AppError> {
    Ok(Json(
        service::list_projects(&state.pool, &user, query.state).await?,
    ))
}

#[utoipa::path(get, path = "/api/projects/{key}", tag = "projects",
    params(("key" = String, Path, description = "Project key")),
    responses(
        (status = 200, body = Project, description = "Also an archived project, read-only"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json", description = "Unknown, not a member, or in the trash")))]
pub async fn get_project(
    State(state): State<AppState>,
    member: Member,
) -> Result<Json<Project>, AppError> {
    Ok(Json(service::get_project(&state.pool, &member).await?))
}

#[utoipa::path(post, path = "/api/projects/{key}/archive", tag = "projects",
    params(("key" = String, Path, description = "Project key")),
    responses(
        (status = 204, description = "Archived: read-only for everyone and out of every list until unarchived"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 403, body = Problem, content_type = "application/problem+json", description = "Not an admin of the project"),
        (status = 404, body = Problem, content_type = "application/problem+json"),
        (status = 409, body = Problem, content_type = "application/problem+json", description = "`project-archived`: already archived")))]
pub async fn archive_project(
    State(state): State<AppState>,
    member: Member,
) -> Result<StatusCode, AppError> {
    service::archive(&state.pool, &member).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(post, path = "/api/projects/{key}/unarchive", tag = "projects",
    params(("key" = String, Path, description = "Project key")),
    responses(
        (status = 204, description = "Active again"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 403, body = Problem, content_type = "application/problem+json", description = "Not an admin of the project"),
        (status = 404, body = Problem, content_type = "application/problem+json"),
        (status = 409, body = Problem, content_type = "application/problem+json", description = "`project-not-archived`")))]
pub async fn unarchive_project(
    State(state): State<AppState>,
    member: Member,
) -> Result<StatusCode, AppError> {
    service::unarchive(&state.pool, &member).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(post, path = "/api/projects/{key}/trash", tag = "projects",
    params(("key" = String, Path, description = "Project key")),
    responses(
        (status = 204, description = "In the trash (an archived project is unarchived): 404 for everyone until restored; purged 60 days later"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 403, body = Problem, content_type = "application/problem+json", description = "Not an admin of the project"),
        (status = 404, body = Problem, content_type = "application/problem+json")))]
pub async fn trash_project(
    State(state): State<AppState>,
    member: Member,
) -> Result<StatusCode, AppError> {
    service::trash(&state.pool, &member).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(post, path = "/api/projects/{key}/restore", tag = "projects",
    params(("key" = String, Path, description = "Project key")),
    responses(
        (status = 204, description = "Back from the trash"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 403, body = Problem, content_type = "application/problem+json", description = "Not an admin of the project"),
        (status = 404, body = Problem, content_type = "application/problem+json", description = "Unknown, or trashed and the caller is not an admin"),
        (status = 409, body = Problem, content_type = "application/problem+json", description = "`project-not-trashed`")))]
pub async fn restore_project(
    State(state): State<AppState>,
    user: CurrentUser,
    PathParams(key): PathParams<String>,
) -> Result<StatusCode, AppError> {
    service::restore(&state.pool, &user, &key).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(delete, path = "/api/projects/{key}", tag = "projects",
    params(("key" = String, Path, description = "Project key")),
    responses(
        (status = 204, description = "Deleted for good with its issues, sprints, board, members and invites; cannot be undone"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 403, body = Problem, content_type = "application/problem+json", description = "Not an admin of the project"),
        (status = 404, body = Problem, content_type = "application/problem+json", description = "Unknown, or trashed and the caller is not an admin"),
        (status = 409, body = Problem, content_type = "application/problem+json", description = "`project-not-trashed`: only a trashed project can be purged")))]
pub async fn purge_project(
    State(state): State<AppState>,
    user: CurrentUser,
    PathParams(key): PathParams<String>,
) -> Result<StatusCode, AppError> {
    service::purge(&state.pool, &state.storage, &user, &key).await?;
    Ok(StatusCode::NO_CONTENT)
}
