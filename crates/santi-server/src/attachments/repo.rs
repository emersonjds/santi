use santi_types::attachments::Attachment;
use sqlx::PgConnection;

pub struct NewFile {
    pub storage_key: String,
    pub file_name: String,
    pub content_type: &'static str,
    pub size_bytes: i64,
}

pub struct Stored {
    pub uploader_id: i64,
    pub file_name: String,
    pub content_type: String,
    pub storage_key: String,
}

pub async fn count(conn: &mut PgConnection, issue_id: i64) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT count(*) AS "count!" FROM attachment WHERE issue_id = $1"#,
        issue_id
    )
    .fetch_one(&mut *conn)
    .await
}

/// Locks the issue so concurrent uploads count each other; `None` when the issue is gone.
pub async fn count_for_update(
    conn: &mut PgConnection,
    issue_id: i64,
) -> Result<Option<i64>, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT (SELECT count(*) FROM attachment WHERE issue_id = i.id) AS "count!"
           FROM issue i WHERE i.id = $1 FOR UPDATE"#,
        issue_id
    )
    .fetch_optional(&mut *conn)
    .await
}

pub async fn insert(
    conn: &mut PgConnection,
    issue_id: i64,
    comment_id: Option<i64>,
    uploader_id: i64,
    file: &NewFile,
) -> Result<Attachment, sqlx::Error> {
    sqlx::query_as!(
        Attachment,
        r#"WITH created AS (
             INSERT INTO attachment (issue_id, comment_id, uploader_id, file_name, content_type, size_bytes, storage_key)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, file_name, content_type, size_bytes, uploader_id, comment_id, created_at)
           SELECT created.id AS "id!", created.file_name AS "file_name!",
                  created.content_type AS "content_type!", created.size_bytes AS "size_bytes!",
                  created.uploader_id AS "uploader_id!", uploader.display_name AS uploader_name,
                  created.comment_id, created.created_at AS "created_at!"
           FROM created JOIN app_user uploader ON uploader.id = created.uploader_id"#,
        issue_id,
        comment_id,
        uploader_id,
        file.file_name,
        file.content_type,
        file.size_bytes,
        file.storage_key
    )
    .fetch_one(&mut *conn)
    .await
}

/// A write on the issue: it moves its `updated_at` and the caller's last work on it.
pub async fn touch_issue(
    conn: &mut PgConnection,
    issue_id: i64,
    user_id: i64,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "WITH touched AS (UPDATE issue SET updated_at = now() WHERE id = $1)
         INSERT INTO issue_activity (user_id, issue_id, worked_at) VALUES ($2, $1, now())
         ON CONFLICT (user_id, issue_id) DO UPDATE SET worked_at = now()",
        issue_id,
        user_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

pub async fn list(conn: &mut PgConnection, issue_id: i64) -> Result<Vec<Attachment>, sqlx::Error> {
    sqlx::query_as!(
        Attachment,
        r#"SELECT a.id, a.file_name, a.content_type, a.size_bytes, a.uploader_id,
                  uploader.display_name AS uploader_name, a.comment_id, a.created_at
           FROM attachment a JOIN app_user uploader ON uploader.id = a.uploader_id
           WHERE a.issue_id = $1 ORDER BY a.id"#,
        issue_id
    )
    .fetch_all(&mut *conn)
    .await
}

pub async fn find(
    conn: &mut PgConnection,
    issue_id: i64,
    id: i64,
) -> Result<Option<Stored>, sqlx::Error> {
    sqlx::query_as!(
        Stored,
        "SELECT uploader_id, file_name, content_type, storage_key
         FROM attachment WHERE issue_id = $1 AND id = $2",
        issue_id,
        id
    )
    .fetch_optional(&mut *conn)
    .await
}

/// `false` when the attachment is gone.
pub async fn delete(conn: &mut PgConnection, issue_id: i64, id: i64) -> Result<bool, sqlx::Error> {
    let deleted = sqlx::query!(
        "DELETE FROM attachment WHERE issue_id = $1 AND id = $2",
        issue_id,
        id
    )
    .execute(&mut *conn)
    .await?;
    Ok(deleted.rows_affected() == 1)
}

pub async fn keys_of_comment(
    conn: &mut PgConnection,
    comment_id: i64,
) -> Result<Vec<String>, sqlx::Error> {
    sqlx::query_scalar!(
        "SELECT storage_key FROM attachment WHERE comment_id = $1",
        comment_id
    )
    .fetch_all(&mut *conn)
    .await
}
