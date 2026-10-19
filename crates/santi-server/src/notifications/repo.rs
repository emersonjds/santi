use santi_types::notifications::{Notification, NotificationKind};
use sqlx::PgConnection;

use crate::members::Member;

/// One statement for every person a change tells; ids that are not members of the project drop out.
pub async fn insert(
    conn: &mut PgConnection,
    actor: &Member,
    issue_id: i64,
    comment_id: Option<i64>,
    recipients: &[(i64, NotificationKind)],
) -> Result<(), sqlx::Error> {
    if recipients.is_empty() {
        return Ok(());
    }
    let (ids, kinds): (Vec<i64>, Vec<NotificationKind>) = recipients.iter().copied().unzip();
    sqlx::query!(
        "INSERT INTO notification (recipient_id, actor_id, kind, project_id, issue_id, comment_id)
         SELECT t.recipient_id, $1, t.kind, $2, $3, $4
         FROM unnest($5::bigint[], $6::text[]) AS t (recipient_id, kind)
         JOIN member m ON m.project_id = $2 AND m.user_id = t.recipient_id",
        actor.user_id,
        actor.project_id,
        issue_id,
        comment_id,
        &ids[..],
        &kinds[..] as &[NotificationKind]
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// Newest first, below `before_id`; only projects the recipient still belongs to and not trashed.
pub async fn list(
    conn: &mut PgConnection,
    recipient_id: i64,
    unread_only: bool,
    before_id: i64,
    limit: i64,
) -> Result<Vec<Notification>, sqlx::Error> {
    sqlx::query_as!(
        Notification,
        r#"SELECT n.id, n.kind AS "kind: NotificationKind", n.actor_id, actor.display_name AS actor_name,
                  p.key AS project_key, p.key || '-' || i.number AS "issue_key!",
                  i.summary AS issue_summary, n.comment_id,
                  left(coalesce(c.body, i.description), 140) AS "excerpt!", n.created_at, n.read_at
           FROM notification n
           JOIN member m ON m.project_id = n.project_id AND m.user_id = n.recipient_id
           JOIN project p ON p.id = n.project_id
           JOIN issue i ON i.id = n.issue_id
           JOIN app_user actor ON actor.id = n.actor_id
           LEFT JOIN issue_comment c ON c.id = n.comment_id
           WHERE n.recipient_id = $1 AND p.trashed_at IS NULL
             AND n.id < $2 AND (NOT $3 OR n.read_at IS NULL)
           ORDER BY n.id DESC
           LIMIT $4"#,
        recipient_id,
        before_id,
        unread_only,
        limit
    )
    .fetch_all(&mut *conn)
    .await
}

pub async fn unread_count(conn: &mut PgConnection, recipient_id: i64) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT count(*) AS "count!" FROM notification n
           JOIN member m ON m.project_id = n.project_id AND m.user_id = n.recipient_id
           JOIN project p ON p.id = n.project_id
           WHERE n.recipient_id = $1 AND n.read_at IS NULL AND p.trashed_at IS NULL"#,
        recipient_id
    )
    .fetch_one(&mut *conn)
    .await
}

/// `false` when the recipient cannot see it (another person's, gone or hidden).
pub async fn mark_read(
    conn: &mut PgConnection,
    recipient_id: i64,
    id: i64,
) -> Result<bool, sqlx::Error> {
    let updated = sqlx::query!(
        "UPDATE notification n SET read_at = coalesce(n.read_at, now())
         FROM member m JOIN project p ON p.id = m.project_id
         WHERE n.id = $2 AND n.recipient_id = $1
           AND m.project_id = n.project_id AND m.user_id = n.recipient_id AND p.trashed_at IS NULL",
        recipient_id,
        id
    )
    .execute(&mut *conn)
    .await?;
    Ok(updated.rows_affected() == 1)
}

pub async fn mark_all_read(conn: &mut PgConnection, recipient_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE notification n SET read_at = now()
         FROM member m JOIN project p ON p.id = m.project_id
         WHERE n.recipient_id = $1 AND n.read_at IS NULL
           AND m.project_id = n.project_id AND m.user_id = n.recipient_id AND p.trashed_at IS NULL",
        recipient_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// D45: the notifications a person received or caused.
pub async fn delete_for_user(conn: &mut PgConnection, user_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "DELETE FROM notification WHERE recipient_id = $1 OR actor_id = $1",
        user_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

// ponytail: sequential scan by created_at once an hour; index it if the table grows past millions.
pub async fn purge_older_than_90_days(conn: &mut PgConnection) -> Result<u64, sqlx::Error> {
    let deleted =
        sqlx::query!("DELETE FROM notification WHERE created_at < now() - interval '90 days'")
            .execute(&mut *conn)
            .await?;
    Ok(deleted.rows_affected())
}
