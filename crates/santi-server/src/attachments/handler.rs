use std::time::Duration;

use axum::body::Body;
use axum::extract::multipart::{Multipart, MultipartRejection};
use axum::extract::{DefaultBodyLimit, Request, State};
use axum::http::StatusCode;
use axum::http::header::{
    CONTENT_DISPOSITION, CONTENT_LENGTH, CONTENT_SECURITY_POLICY, CONTENT_TYPE, LOCATION,
    X_CONTENT_TYPE_OPTIONS,
};
use axum::response::{IntoResponse, Response};
use axum::{Json, middleware};
use santi_types::Problem;
use santi_types::attachments::{Attachment, AttachmentFile, AttachmentUpload};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::domain::{MAX_FILE_BYTES, MAX_PER_REQUEST};
use super::service;
use crate::AppState;
use crate::error::AppError;
use crate::extract::PathParams;
use crate::members::Member;
use crate::rate_limit::Action;
use crate::storage::Download;
use tower_http::timeout::DeadlineBody;

/// Ten full files plus the multipart framing; past it the body is cut.
const MAX_BODY_BYTES: usize = MAX_PER_REQUEST * MAX_FILE_BYTES as usize + 1024 * 1024;
/// The whole upload body, however slowly it trickles in.
const UPLOAD_DEADLINE: Duration = Duration::from_secs(10 * 60);

async fn deadline(request: Request) -> Request {
    request.map(|body| Body::new(DeadlineBody::new(UPLOAD_DEADLINE, body)))
}

pub fn router() -> OpenApiRouter<AppState> {
    let uploads = OpenApiRouter::new()
        .routes(routes!(upload_attachments, list_attachments))
        .layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
        .layer(middleware::map_request(deadline));
    OpenApiRouter::new()
        .routes(routes!(download_attachment, delete_attachment))
        .merge(uploads)
}

#[utoipa::path(post, path = "/api/projects/{key}/issues/{number}/attachments", tag = "attachments",
    request_body(content = AttachmentUpload, content_type = "multipart/form-data"),
    params(
        ("key" = String, Path, description = "Project key"),
        ("number" = i64, Path, description = "Issue number, the N of KEY-N")),
    responses(
        (status = 201, body = Vec<Attachment>, description = "Every file stored, in the order sent; the type is read from the bytes (D53)"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 403, body = Problem, content_type = "application/problem+json", description = "`comment_id` names a comment by someone else and the caller is not an admin; nothing is kept"),
        (status = 404, body = Problem, content_type = "application/problem+json"),
        (status = 409, body = Problem, content_type = "application/problem+json", description = "`project-archived`"),
        (status = 413, body = Problem, content_type = "application/problem+json", description = "`payload-too-large`: the body passed 10 × 25 MB plus framing; nothing is kept"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "A type not allowed, over 25 MB, over 10 files per request or 100 per issue, a broken multipart body, or `comment_id` not a comment of this issue; nothing is kept"),
        (status = 429, body = Problem, content_type = "application/problem+json", description = "Rate limited (D44); wait `Retry-After` seconds")))]
pub async fn upload_attachments(
    State(state): State<AppState>,
    member: Member,
    PathParams((_key, number)): PathParams<(String, i64)>,
    upload: Result<Multipart, MultipartRejection>,
) -> Result<(StatusCode, Json<Vec<Attachment>>), AppError> {
    state
        .limits
        .check(Action::Upload, None, Some(member.user_id))?;
    let created = service::upload(&state.pool, &state.storage, &member, number, upload?).await?;
    Ok((StatusCode::CREATED, Json(created)))
}

#[utoipa::path(get, path = "/api/projects/{key}/issues/{number}/attachments", tag = "attachments",
    params(
        ("key" = String, Path, description = "Project key"),
        ("number" = i64, Path, description = "Issue number, the N of KEY-N")),
    responses(
        (status = 200, body = Vec<Attachment>, description = "Every file of the issue, comment files included, oldest first"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json")))]
pub async fn list_attachments(
    State(state): State<AppState>,
    member: Member,
    PathParams((_key, number)): PathParams<(String, i64)>,
) -> Result<Json<Vec<Attachment>>, AppError> {
    Ok(Json(service::list(&state.pool, &member, number).await?))
}

#[utoipa::path(get, path = "/api/projects/{key}/issues/{number}/attachments/{id}", tag = "attachments",
    params(
        ("key" = String, Path, description = "Project key"),
        ("number" = i64, Path, description = "Issue number, the N of KEY-N"),
        ("id" = i64, Path, description = "Attachment id")),
    responses(
        (status = 200, content_type = "application/octet-stream", body = AttachmentFile, description = "The file, served by santi: images `inline`, the rest `attachment`, with `nosniff` and `Content-Security-Policy: sandbox`"),
        (status = 302, description = "S3 storage: a presigned URL valid 5 minutes in `Location`"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json")))]
pub async fn download_attachment(
    State(state): State<AppState>,
    member: Member,
    PathParams((_key, number, id)): PathParams<(String, i64, i64)>,
) -> Result<Response, AppError> {
    let served = service::download(&state.pool, &state.storage, &member, number, id).await?;
    Ok(match served.download {
        Download::Redirect(url) => (StatusCode::FOUND, [(LOCATION, url)]).into_response(),
        Download::Stream { body, size } => (
            [
                (CONTENT_TYPE, served.content_type),
                (CONTENT_DISPOSITION, served.content_disposition),
                (CONTENT_LENGTH, size.to_string()),
            ],
            [
                (X_CONTENT_TYPE_OPTIONS, "nosniff"),
                (CONTENT_SECURITY_POLICY, "sandbox"),
            ],
            body,
        )
            .into_response(),
    })
}

#[utoipa::path(delete, path = "/api/projects/{key}/issues/{number}/attachments/{id}", tag = "attachments",
    params(
        ("key" = String, Path, description = "Project key"),
        ("number" = i64, Path, description = "Issue number, the N of KEY-N"),
        ("id" = i64, Path, description = "Attachment id")),
    responses(
        (status = 204, description = "Deleted for good; the stored file is removed after the commit"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 403, body = Problem, content_type = "application/problem+json", description = "Neither an admin nor the uploader"),
        (status = 404, body = Problem, content_type = "application/problem+json"),
        (status = 409, body = Problem, content_type = "application/problem+json", description = "`project-archived`")))]
pub async fn delete_attachment(
    State(state): State<AppState>,
    member: Member,
    PathParams((_key, number, id)): PathParams<(String, i64, i64)>,
) -> Result<StatusCode, AppError> {
    service::delete(&state.pool, &state.storage, &member, number, id).await?;
    Ok(StatusCode::NO_CONTENT)
}
