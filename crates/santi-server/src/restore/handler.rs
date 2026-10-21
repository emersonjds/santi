use axum::Json;
use axum::body::Bytes;
use axum::extract::{DefaultBodyLimit, FromRequest, Request, State};
use axum::http::StatusCode;
use santi_types::Problem;
use santi_types::auth::ProjectExport;
use santi_types::projects::RestoreResult;
use tokio::sync::Semaphore;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::service;
use crate::AppState;
use crate::auth::extract::CurrentUser;
use crate::error::AppError;
use crate::rate_limit::{Action, ClientIp};

const MAX_BODY_BYTES: usize = 50 * 1024 * 1024;

// ponytail: one restore at a time per process, bounding memory to one 50 MB body; a queue or
// per-instance budget if restores ever need to run side by side.
static RESTORES: Semaphore = Semaphore::const_new(1);

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(restore_export))
        .layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
}

#[utoipa::path(post, path = "/api/projects/restore", tag = "projects", request_body = ProjectExport,
    responses(
        (status = 201, body = RestoreResult, description = "A new project from one project of `GET /api/me/export`, with its board, sprints, issue numbers and comments; the caller is its only member, as admin (D58): other assignees are cleared, other reporters, comment authors and editors become the caller, each listed by name in `problems`"),
        (status = 400, body = Problem, content_type = "application/problem+json", description = "`bad-request`: the body could not be read"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 409, body = Problem, content_type = "application/problem+json", description = "`project-exists`: a project holds the key; nothing written"),
        (status = 413, body = Problem, content_type = "application/problem+json", description = "`payload-too-large`: over 50 MB"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "Malformed JSON is a 422 here, not a 400. Also: not an export, over 50,000 issues, 500 statuses, 2,000 sprints or 200,000 comments, a field a normal write refuses, or a key, parent, status or sprint the file does not hold; the field is named (`issues[3].summary`)"),
        (status = 429, body = Problem, content_type = "application/problem+json", description = "Rate limited like imports (D44); wait `Retry-After` seconds")))]
pub async fn restore_export(
    State(state): State<AppState>,
    ClientIp(address): ClientIp,
    user: CurrentUser,
    request: Request,
) -> Result<(StatusCode, Json<RestoreResult>), AppError> {
    state.limits.check(Action::Import, address, Some(user.id))?; // before the up to 50 MB body is read
    let _one_at_a_time = RESTORES
        .acquire()
        .await
        .map_err(|error| AppError::Internal(error.to_string()))?;
    let body = Bytes::from_request(request, &state)
        .await
        .map_err(|rejection| match rejection.status() {
            StatusCode::PAYLOAD_TOO_LARGE => AppError::PayloadTooLarge,
            _ => AppError::BadRequest(rejection.body_text()),
        })?;
    let restored = service::restore(&state.pool, &user, body).await?;
    Ok((StatusCode::CREATED, Json(restored)))
}
