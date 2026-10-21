use axum::Json;
use axum::body::Bytes;
use axum::extract::{DefaultBodyLimit, FromRequest, Request, State};
use axum::http::StatusCode;
use santi_types::Problem;
use santi_types::auth::ProjectExport;
use santi_types::projects::RestoreResult;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::{domain, service};
use crate::AppState;
use crate::auth::extract::CurrentUser;
use crate::error::AppError;
use crate::rate_limit::{Action, ClientIp};

const MAX_BODY_BYTES: usize = 50 * 1024 * 1024;

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(restore_export))
        .layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
}

#[utoipa::path(post, path = "/api/projects/restore", tag = "projects", request_body = ProjectExport,
    responses(
        (status = 201, body = RestoreResult, description = "A new project from one project of `GET /api/me/export`, with its board, sprints, issue numbers and comments; the caller is its admin. Users missing here are replaced and listed in `problems`"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 409, body = Problem, content_type = "application/problem+json", description = "`project-exists`: a project holds the key; nothing written"),
        (status = 413, body = Problem, content_type = "application/problem+json", description = "`payload-too-large`: over 50 MB"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "Not JSON, not an export, over 50,000 issues or 500 statuses, or a key, parent, status or sprint the file does not hold; the field is named"),
        (status = 429, body = Problem, content_type = "application/problem+json", description = "Rate limited like imports (D44); wait `Retry-After` seconds")))]
pub async fn restore_export(
    State(state): State<AppState>,
    ClientIp(address): ClientIp,
    user: CurrentUser,
    request: Request,
) -> Result<(StatusCode, Json<RestoreResult>), AppError> {
    state.limits.check(Action::Import, address, Some(user.id))?; // before the up to 50 MB body is read
    let body = Bytes::from_request(request, &state)
        .await
        .map_err(|rejection| match rejection.status() {
            StatusCode::PAYLOAD_TOO_LARGE => AppError::PayloadTooLarge,
            _ => AppError::BadRequest(rejection.body_text()),
        })?;
    let export = tokio::task::spawn_blocking(move || domain::read(&body))
        .await
        .map_err(|error| AppError::Internal(error.to_string()))??;
    let restored = service::restore(&state.pool, &user, export).await?;
    Ok((StatusCode::CREATED, Json(restored)))
}
