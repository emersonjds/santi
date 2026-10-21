use axum::Json;
use axum::extract::State;
use santi_types::Problem;
use santi_types::people::TeamProgress;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::service;
use crate::AppState;
use crate::error::AppError;
use crate::members::Member;

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new().routes(routes!(team_progress))
}

#[utoipa::path(get, path = "/api/projects/{key}/people", tag = "people",
    params(("key" = String, Path, description = "Project key")),
    responses(
        (status = 200, body = TeamProgress, description = "Issues and points per assignee and status category, with stuck counts: the active sprint on Scrum, the board on Kanban"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json")))]
pub async fn team_progress(
    State(state): State<AppState>,
    member: Member,
) -> Result<Json<TeamProgress>, AppError> {
    Ok(Json(service::team_progress(&state.pool, &member).await?))
}
