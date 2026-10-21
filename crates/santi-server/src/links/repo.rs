use santi_types::boards::StatusCategory;
use santi_types::issues::{IssueType, Priority};
use sqlx::PgConnection;

/// A link as one of its issues sees it, with the other issue's fields.
pub struct LinkRow {
    pub id: i64,
    pub link_type: String,
    pub is_source: bool,
    pub key: String,
    pub summary: String,
    pub status_id: i64,
    pub status_name: String,
    pub status_category: StatusCategory,
    pub priority: Priority,
    pub assignee_id: Option<i64>,
    pub assignee_name: Option<String>,
    pub issue_type: IssueType,
}

/// The issue `user_id` can open as `project_key`-`number`: a member of its project, not trashed.
pub struct Visible {
    pub id: i64,
    pub archived: bool,
}

pub async fn find_visible(
    conn: &mut PgConnection,
    user_id: i64,
    project_key: &str,
    number: i64,
) -> Result<Option<Visible>, sqlx::Error> {
    sqlx::query_as!(
        Visible,
        r#"SELECT i.id, p.archived_at IS NOT NULL AS "archived!"
           FROM issue i
           JOIN project p ON p.id = i.project_id AND p.trashed_at IS NULL
           JOIN member m ON m.project_id = p.id AND m.user_id = $1
           WHERE p.key = $2 AND i.number = $3"#,
        user_id,
        project_key,
        number
    )
    .fetch_optional(&mut *conn)
    .await
}

pub async fn insert(
    conn: &mut PgConnection,
    source_id: i64,
    target_id: i64,
    link_type: &str,
    created_by: i64,
) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!(
        "INSERT INTO issue_link (source_id, target_id, link_type, created_by)
         VALUES ($1, $2, $3, $4) RETURNING id",
        source_id,
        target_id,
        link_type,
        created_by
    )
    .fetch_one(&mut *conn)
    .await
}

/// D59: the links of `issue_id` whose other issue `user_id` can open, by the other issue's key;
/// `link_id` narrows it to one link.
pub async fn list(
    conn: &mut PgConnection,
    user_id: i64,
    issue_id: i64,
    link_id: Option<i64>,
) -> Result<Vec<LinkRow>, sqlx::Error> {
    sqlx::query_as!(
        LinkRow,
        r#"SELECT l.id, l.link_type, l.source_id = $2 AS "is_source!",
                  p.key || '-' || o.number AS "key!", o.summary, o.status_id,
                  s.name AS status_name, s.category AS "status_category: StatusCategory",
                  o.priority AS "priority: Priority", o.assignee_id,
                  assignee.display_name AS "assignee_name?", o.issue_type AS "issue_type: IssueType"
           FROM issue_link l
           JOIN issue o ON o.id = CASE WHEN l.source_id = $2 THEN l.target_id ELSE l.source_id END
           JOIN project p ON p.id = o.project_id AND p.trashed_at IS NULL
           JOIN member m ON m.project_id = p.id AND m.user_id = $1
           JOIN status s ON s.id = o.status_id
           LEFT JOIN app_user assignee ON assignee.id = o.assignee_id
           WHERE (l.source_id = $2 OR l.target_id = $2) AND ($3::bigint IS NULL OR l.id = $3)
           ORDER BY p.key, o.number"#,
        user_id,
        issue_id,
        link_id
    )
    .fetch_all(&mut *conn)
    .await
}

/// Deletes a link of `issue_id` whose other issue `user_id` can open; false when there is none.
pub async fn delete(
    conn: &mut PgConnection,
    user_id: i64,
    issue_id: i64,
    link_id: i64,
) -> Result<bool, sqlx::Error> {
    let deleted = sqlx::query!(
        "DELETE FROM issue_link l
         USING issue o, project p, member m
         WHERE l.id = $3 AND (l.source_id = $2 OR l.target_id = $2)
           AND o.id = CASE WHEN l.source_id = $2 THEN l.target_id ELSE l.source_id END
           AND p.id = o.project_id AND p.trashed_at IS NULL
           AND m.project_id = p.id AND m.user_id = $1",
        user_id,
        issue_id,
        link_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(deleted.rows_affected() == 1)
}
