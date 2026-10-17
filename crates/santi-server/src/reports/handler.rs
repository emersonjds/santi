use axum::Json;
use axum::extract::State;
use santi_types::Problem;
use santi_types::issues::{Page, PageParams};
use santi_types::reports::{SprintReport, SprintTotals, Velocity};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::service;
use crate::AppState;
use crate::error::AppError;
use crate::extract::{PathParams, QueryParams};
use crate::members::Member;

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(sprint_history))
        .routes(routes!(velocity))
        .routes(routes!(sprint_report))
}

#[utoipa::path(get, path = "/api/projects/{key}/reports/sprints", tag = "reports",
    params(("key" = String, Path, description = "Project key"), PageParams),
    responses(
        (status = 200, body = Page<SprintTotals>, description = "Started sprints: the active one first, then closed ones, newest close first (D46); `cursor` is the last sprint id"),
        (status = 400, body = Problem, content_type = "application/problem+json", description = "Unparsable query value"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json"),
        (status = 409, body = Problem, content_type = "application/problem+json", description = "`kanban-has-no-sprints`"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "Limit out of range")))]
pub async fn sprint_history(
    State(state): State<AppState>,
    member: Member,
    QueryParams(page): QueryParams<PageParams>,
) -> Result<Json<Page<SprintTotals>>, AppError> {
    Ok(Json(
        service::sprint_history(&state.pool, &member, page).await?,
    ))
}

#[utoipa::path(get, path = "/api/projects/{key}/reports/velocity", tag = "reports",
    params(("key" = String, Path, description = "Project key")),
    responses(
        (status = 200, body = Velocity, description = "The 7 latest closed sprints, oldest first, with the average completed points"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json"),
        (status = 409, body = Problem, content_type = "application/problem+json", description = "`kanban-has-no-sprints`")))]
pub async fn velocity(
    State(state): State<AppState>,
    member: Member,
) -> Result<Json<Velocity>, AppError> {
    Ok(Json(service::velocity(&state.pool, &member).await?))
}

#[utoipa::path(get, path = "/api/projects/{key}/sprints/{id}/report", tag = "reports",
    params(
        ("key" = String, Path, description = "Project key"),
        ("id" = i64, Path, description = "Sprint id")),
    responses(
        (status = 200, body = SprintReport, description = "Issues grouped as completed, not completed and removed, with points at start and at the end; live for the active sprint"),
        (status = 400, body = Problem, content_type = "application/problem+json", description = "Unparsable sprint id"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json"),
        (status = 409, body = Problem, content_type = "application/problem+json", description = "`kanban-has-no-sprints` or `sprint-not-started`")))]
pub async fn sprint_report(
    State(state): State<AppState>,
    member: Member,
    PathParams((_key, sprint_id)): PathParams<(String, i64)>,
) -> Result<Json<SprintReport>, AppError> {
    Ok(Json(
        service::sprint_report(&state.pool, &member, sprint_id).await?,
    ))
}
