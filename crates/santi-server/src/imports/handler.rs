use axum::Json;
use axum::extract::multipart::{Multipart, MultipartRejection};
use axum::extract::{DefaultBodyLimit, State};
use santi_types::Problem;
use santi_types::imports::{
    ImportMapping, ImportPreview, ImportResult, ImportUpload, PreviewUpload,
};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::domain::MAX_FILE_BYTES;
use super::service;
use crate::AppState;
use crate::error::AppError;
use crate::members::Member;
use crate::members::domain::require_admin;

/// Room for the multipart framing and the mapping next to a 10 MB file; past it the body is cut.
const MAX_BODY_BYTES: usize = MAX_FILE_BYTES + 1024 * 1024;

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(preview_import))
        .routes(routes!(import))
        .layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
}

/// A `multipart/form-data` body; anything else answers with problem+json (D24).
type Upload = Result<Multipart, MultipartRejection>;

struct Parts {
    file: Vec<u8>,
    mapping: Option<String>,
}

async fn read_parts(upload: Upload) -> Result<Parts, AppError> {
    let unreadable = |_| {
        AppError::invalid(
            "file",
            "the upload could not be read; files are at most 10 MB",
        )
    };
    let mut multipart = upload?;
    let mut file = None;
    let mut mapping = None;
    while let Some(field) = multipart.next_field().await.map_err(unreadable)? {
        match field.name() {
            Some("file") => file = Some(field.bytes().await.map_err(unreadable)?.to_vec()),
            Some("mapping") => mapping = Some(field.text().await.map_err(unreadable)?),
            _ => {}
        }
    }
    let file = file.ok_or_else(|| AppError::invalid("file", "attach the CSV export as `file`"))?;
    Ok(Parts { file, mapping })
}

#[utoipa::path(post, path = "/api/projects/{key}/imports/preview", tag = "imports",
    request_body(content = PreviewUpload, content_type = "multipart/form-data"),
    params(("key" = String, Path, description = "Project key")),
    responses(
        (status = 200, body = ImportPreview, description = "Source told by the header; statuses, people, sprints and types found, with suggestions (D41)"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 403, body = Problem, content_type = "application/problem+json", description = "Not an admin"),
        (status = 404, body = Problem, content_type = "application/problem+json"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "Not a known CSV export, or over 10 MB")))]
pub async fn preview_import(
    State(state): State<AppState>,
    member: Member,
    upload: Upload,
) -> Result<Json<ImportPreview>, AppError> {
    require_admin(&member)?; // before the up to 10 MB body is read
    let parts = read_parts(upload).await?;
    Ok(Json(
        service::preview(&state.pool, &member, parts.file).await?,
    ))
}

#[utoipa::path(post, path = "/api/projects/{key}/imports", tag = "imports",
    request_body(content = ImportUpload, content_type = "multipart/form-data"),
    params(("key" = String, Path, description = "Project key")),
    responses(
        (status = 200, body = ImportResult, description = "Issues numbered here and ranked last in file order; rows already imported from the same source are skipped (D41)"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 403, body = Problem, content_type = "application/problem+json", description = "Not an admin"),
        (status = 404, body = Problem, content_type = "application/problem+json"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "Not a known CSV export, over 10 MB, or a mapping to ids outside the project (`mapping.<kind>.<name>`)")))]
pub async fn import(
    State(state): State<AppState>,
    member: Member,
    upload: Upload,
) -> Result<Json<ImportResult>, AppError> {
    require_admin(&member)?;
    let parts = read_parts(upload).await?;
    let mapping = parts
        .mapping
        .ok_or_else(|| AppError::invalid("mapping", "attach the confirmed mapping as `mapping`"))?;
    let mapping: ImportMapping = serde_json::from_str(&mapping)
        .map_err(|error| AppError::invalid("mapping", &error.to_string()))?;
    Ok(Json(
        service::import(&state.pool, &member, parts.file, mapping).await?,
    ))
}
