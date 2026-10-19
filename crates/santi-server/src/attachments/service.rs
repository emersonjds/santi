use axum::extract::multipart::{Field, Multipart, MultipartError};
use axum::http::StatusCode;
use futures_util::StreamExt;
use santi_types::attachments::Attachment;
use sqlx::PgPool;

use super::repo::NewFile;
use super::{domain, repo};
use crate::error::AppError;
use crate::members::Member;
use crate::storage::{self, Download, Storage, object_key};
use crate::{issues, projects};

fn unreadable(error: MultipartError) -> AppError {
    if error.status() == StatusCode::PAYLOAD_TOO_LARGE {
        return AppError::PayloadTooLarge;
    }
    AppError::invalid("file", "The upload could not be read.")
}

/// Read in chunks: the longest `i64` is 20 bytes, and anything longer is refused unread.
async fn comment_id(mut field: Field<'_>) -> Result<i64, AppError> {
    let invalid = || AppError::invalid("comment_id", "must be a comment id");
    let mut text = Vec::new();
    while let Some(chunk) = field.chunk().await.map_err(unreadable)? {
        text.extend_from_slice(&chunk);
        if text.len() > 20 {
            return Err(invalid());
        }
    }
    std::str::from_utf8(&text)
        .ok()
        .and_then(|text| text.parse().ok())
        .ok_or_else(invalid)
}

fn storage_error(error: storage::Error) -> AppError {
    match error {
        storage::Error::NotFound { .. } => AppError::NotFound,
        error => AppError::Internal(error.to_string()),
    }
}

async fn issue_id(pool: &PgPool, member: &Member, number: i64) -> Result<i64, AppError> {
    let mut conn = pool.acquire().await?;
    issues::repo::find_id(&mut conn, member.project_id, number)
        .await?
        .ok_or(AppError::NotFound)
}

/// Best effort once the rows are gone: an object left behind is an orphan nothing serves (D53).
/// ponytail: one delete per object; a batched delete if purging large projects gets slow.
pub async fn delete_objects(storage: &Storage, keys: &[String]) {
    for key in keys {
        if let Err(error) = storage.delete(key).await {
            eprintln!("attachment object {key} not deleted: {error}");
        }
    }
}

/// Streams every `file` part to storage as it arrives, then records them all in one transaction;
/// any refusal or failure removes the objects already stored.
pub async fn upload(
    pool: &PgPool,
    storage: &Storage,
    member: &Member,
    number: i64,
    multipart: Multipart,
) -> Result<Vec<Attachment>, AppError> {
    let issue_id = issue_id(pool, member, number).await?;
    let existing = repo::count(&mut *pool.acquire().await?, issue_id).await?;
    let mut files = Vec::new();
    let saved = async {
        let comment_id =
            receive(storage, member, issue_id, existing, multipart, &mut files).await?;
        save(pool, member, issue_id, comment_id, &files).await
    }
    .await;
    if saved.is_err() {
        let keys: Vec<String> = files.into_iter().map(|file| file.storage_key).collect();
        delete_objects(storage, &keys).await;
    }
    saved
}

/// The `comment_id` part, if any; stored files are pushed to `files` as they complete.
async fn receive(
    storage: &Storage,
    member: &Member,
    issue_id: i64,
    existing: i64,
    mut multipart: Multipart,
    files: &mut Vec<NewFile>,
) -> Result<Option<i64>, AppError> {
    let mut comment_id = None;
    while let Some(field) = multipart.next_field().await.map_err(unreadable)? {
        match field.name() {
            Some("file") => {
                domain::check_count(existing, files.len() + 1)?;
                files.push(store(storage, member.project_id, issue_id, field).await?);
            }
            Some("comment_id") => comment_id = Some(self::comment_id(field).await?),
            _ => {}
        }
    }
    if files.is_empty() {
        return Err(AppError::invalid(
            "file",
            "attach at least one file as `file`",
        ));
    }
    Ok(comment_id)
}

async fn store(
    storage: &Storage,
    project_id: i64,
    issue_id: i64,
    field: Field<'_>,
) -> Result<NewFile, AppError> {
    let file_name = domain::sanitize_file_name(field.file_name().unwrap_or_default());
    let mut inspector = domain::Inspector::for_name(&file_name)?;
    let storage_key = object_key(project_id, issue_id);
    let mut refused = None;
    let bytes = field.map(|chunk| {
        let checked = chunk
            .map_err(unreadable)
            .and_then(|chunk| inspector.feed(&chunk).map(|()| chunk));
        checked.map_err(|error| {
            refused = Some(error);
            std::io::Error::other("refused")
        })
    });
    let put = storage.put(&storage_key, bytes).await;
    if let Some(error) = refused {
        return Err(error);
    }
    put.map_err(storage_error)?;
    let size = match inspector.finish() {
        Ok(size) => size,
        Err(error) => {
            delete_objects(storage, &[storage_key]).await;
            return Err(error);
        }
    };
    Ok(NewFile {
        storage_key,
        file_name,
        content_type: inspector.content_type,
        size_bytes: size as i64,
    })
}

fn not_a_comment() -> AppError {
    AppError::invalid("comment_id", "must be a comment on this issue")
}

/// Only the comment's author or an admin adds files to a comment.
async fn save(
    pool: &PgPool,
    member: &Member,
    issue_id: i64,
    comment_id: Option<i64>,
    files: &[NewFile],
) -> Result<Vec<Attachment>, AppError> {
    let mut tx = pool.begin().await?;
    let state = projects::repo::lock_project(&mut tx, member.project_id).await?;
    projects::domain::check_active(state)?;
    let existing = repo::count_for_update(&mut tx, issue_id)
        .await?
        .ok_or(AppError::NotFound)?;
    domain::check_count(existing, files.len())?;
    if let Some(comment_id) = comment_id {
        let comment = issues::repo::find_comment(&mut tx, issue_id, comment_id)
            .await?
            .ok_or_else(not_a_comment)?;
        issues::domain::check_delete(member.role, member.user_id, comment.author_id)?;
    }
    let mut created = Vec::with_capacity(files.len());
    for file in files {
        let attachment = repo::insert(&mut tx, issue_id, comment_id, member.user_id, file)
            .await
            .map_err(|error| match error.as_database_error() {
                Some(error) if error.is_foreign_key_violation() => not_a_comment(),
                _ => AppError::from(error),
            })?;
        created.push(attachment);
    }
    repo::touch_issue(&mut tx, issue_id, member.user_id).await?;
    tx.commit().await?;
    Ok(created)
}

pub async fn list(
    pool: &PgPool,
    member: &Member,
    number: i64,
) -> Result<Vec<Attachment>, AppError> {
    let issue_id = issue_id(pool, member, number).await?;
    let mut conn = pool.acquire().await?;
    Ok(repo::list(&mut conn, issue_id).await?)
}

pub struct Served {
    pub download: Download,
    pub content_type: String,
    pub content_disposition: String,
}

pub async fn download(
    pool: &PgPool,
    storage: &Storage,
    member: &Member,
    number: i64,
    id: i64,
    save: bool,
) -> Result<Served, AppError> {
    let issue_id = issue_id(pool, member, number).await?;
    let mut conn = pool.acquire().await?;
    let stored = repo::find(&mut conn, issue_id, id)
        .await?
        .ok_or(AppError::NotFound)?;
    drop(conn);
    let content_disposition =
        domain::content_disposition(&stored.file_name, &stored.content_type, save);
    let download = storage
        .download(
            &stored.storage_key,
            &content_disposition,
            &stored.content_type,
        )
        .await
        .map_err(storage_error)?;
    Ok(Served {
        download,
        content_type: stored.content_type,
        content_disposition,
    })
}

/// OR-28: the uploader or an admin; the row goes first, the object after the commit (D53).
pub async fn delete(
    pool: &PgPool,
    storage: &Storage,
    member: &Member,
    number: i64,
    id: i64,
) -> Result<(), AppError> {
    let issue_id = issue_id(pool, member, number).await?;
    let mut tx = pool.begin().await?;
    let stored = repo::find(&mut tx, issue_id, id)
        .await?
        .ok_or(AppError::NotFound)?;
    issues::domain::check_delete(member.role, member.user_id, stored.uploader_id)?;
    if !repo::delete(&mut tx, issue_id, id).await? {
        return Err(AppError::NotFound);
    }
    repo::touch_issue(&mut tx, issue_id, member.user_id).await?;
    tx.commit().await?;
    delete_objects(storage, &[stored.storage_key]).await;
    Ok(())
}
