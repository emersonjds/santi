use chrono::{DateTime, Utc};
use santi_types::auth::ExportedComment;
use santi_types::boards::StatusCategory;
use santi_types::issues::{Comment, Issue, IssueType, Priority};
use sqlx::PgConnection;

use super::domain::{EditableIssue, SearchQuery};

pub struct IssueKind {
    pub id: i64,
    pub issue_type: IssueType,
    pub sprint_id: Option<i64>,
}

pub struct NewIssue {
    pub project_id: i64,
    pub number: i64,
    pub issue_type: IssueType,
    pub summary: String,
    pub description: String,
    pub priority: Priority,
    pub status_id: i64,
    pub assignee_id: Option<i64>,
    pub reporter_id: i64,
    pub points: Option<f64>,
    pub labels: Vec<String>,
    pub parent_id: Option<i64>,
    pub sprint_id: Option<i64>,
    pub rank: String,
    pub done_at: Option<DateTime<Utc>>,
}

pub async fn insert_issue(conn: &mut PgConnection, issue: &NewIssue) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!(
        r#"WITH created AS (
             INSERT INTO issue (project_id, number, issue_type, summary, description, priority, status_id,
                                assignee_id, reporter_id, points, labels, parent_id, sprint_id, rank, done_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
             RETURNING id, reporter_id),
           worked AS (
             INSERT INTO issue_activity (user_id, issue_id, worked_at)
             SELECT reporter_id, id, now() FROM created)
         SELECT id AS "id!" FROM created"#,
        issue.project_id,
        issue.number,
        issue.issue_type as IssueType,
        issue.summary,
        issue.description,
        issue.priority as Priority,
        issue.status_id,
        issue.assignee_id,
        issue.reporter_id,
        issue.points,
        &issue.labels[..],
        issue.parent_id,
        issue.sprint_id,
        issue.rank,
        issue.done_at
    )
    .fetch_one(&mut *conn)
    .await
}

pub async fn find_issue(
    conn: &mut PgConnection,
    project_id: i64,
    number: i64,
) -> Result<Option<Issue>, sqlx::Error> {
    sqlx::query_as!(
        Issue,
        r#"SELECT i.id, p.key || '-' || i.number AS "key!", i.number, i.summary, i.description,
                  i.issue_type AS "issue_type: IssueType", i.priority AS "priority: Priority",
                  i.status_id, s.name AS status_name, i.assignee_id, assignee.display_name AS "assignee_name?",
                  i.reporter_id, reporter.display_name AS reporter_name, i.points, i.labels,
                  p.key || '-' || parent.number AS parent_key, i.sprint_id, sprint.name AS "sprint_name?",
                  i.rank, i.done_at, i.created_at, i.updated_at
           FROM issue i
           JOIN project p ON p.id = i.project_id
           JOIN status s ON s.id = i.status_id
           JOIN app_user reporter ON reporter.id = i.reporter_id
           LEFT JOIN app_user assignee ON assignee.id = i.assignee_id
           LEFT JOIN sprint ON sprint.id = i.sprint_id
           LEFT JOIN issue parent ON parent.id = i.parent_id
           WHERE i.project_id = $1 AND i.number = $2"#,
        project_id,
        number
    )
    .fetch_optional(&mut *conn)
    .await
}

pub async fn last_rank(
    conn: &mut PgConnection,
    project_id: i64,
) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_scalar!(
        "SELECT max(rank) FROM issue WHERE project_id = $1",
        project_id
    )
    .fetch_one(&mut *conn)
    .await
}

pub async fn find_kind(
    conn: &mut PgConnection,
    project_id: i64,
    number: i64,
) -> Result<Option<IssueKind>, sqlx::Error> {
    sqlx::query_as!(
        IssueKind,
        r#"SELECT id, issue_type AS "issue_type: IssueType", sprint_id FROM issue WHERE project_id = $1 AND number = $2"#,
        project_id,
        number
    )
    .fetch_optional(&mut *conn)
    .await
}

pub async fn find_editable_for_update(
    conn: &mut PgConnection,
    project_id: i64,
    number: i64,
) -> Result<Option<EditableIssue>, sqlx::Error> {
    sqlx::query_as!(
        EditableIssue,
        r#"SELECT id, summary, description, issue_type AS "issue_type: IssueType", priority AS "priority: Priority",
                  assignee_id, points, labels, parent_id, sprint_id
           FROM issue WHERE project_id = $1 AND number = $2
           FOR UPDATE"#,
        project_id,
        number
    )
    .fetch_optional(&mut *conn)
    .await
}

/// Also records the write as the editor's work (SAN-72).
pub async fn update_fields(
    conn: &mut PgConnection,
    issue: &EditableIssue,
    editor_id: i64,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "WITH updated AS (
           UPDATE issue SET summary = $2, description = $3, issue_type = $4, priority = $5,
                            assignee_id = $6, points = $7, labels = $8, parent_id = $9
           WHERE id = $1)
         INSERT INTO issue_activity (user_id, issue_id, worked_at) VALUES ($10, $1, now())
         ON CONFLICT (user_id, issue_id) DO UPDATE SET worked_at = now()",
        issue.id,
        issue.summary,
        issue.description,
        issue.issue_type as IssueType,
        issue.priority as Priority,
        issue.assignee_id,
        issue.points,
        &issue.labels[..],
        issue.parent_id,
        editor_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// What a move needs to know about the issue, read under a row lock.
pub struct Position {
    pub id: i64,
    pub issue_type: IssueType,
    pub status_id: i64,
    pub category: StatusCategory,
    pub sprint_id: Option<i64>,
    pub rank: String,
    pub done_at: Option<DateTime<Utc>>,
}

pub async fn find_position_for_update(
    conn: &mut PgConnection,
    project_id: i64,
    number: i64,
) -> Result<Option<Position>, sqlx::Error> {
    sqlx::query_as!(
        Position,
        r#"SELECT i.id, i.issue_type AS "issue_type: IssueType", i.status_id,
                  s.category AS "category: StatusCategory", i.sprint_id, i.rank, i.done_at
           FROM issue i JOIN status s ON s.id = i.status_id
           WHERE i.project_id = $1 AND i.number = $2
           FOR UPDATE OF i"#,
        project_id,
        number
    )
    .fetch_optional(&mut *conn)
    .await
}

pub async fn find_rank(
    conn: &mut PgConnection,
    project_id: i64,
    number: i64,
) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_scalar!(
        "SELECT rank FROM issue WHERE project_id = $1 AND number = $2",
        project_id,
        number
    )
    .fetch_optional(&mut *conn)
    .await
}

/// The next rank after `rank` in the project, skipping the issue being moved.
pub async fn rank_after(
    conn: &mut PgConnection,
    project_id: i64,
    rank: &str,
    moving_id: i64,
) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_scalar!(
        "SELECT rank FROM issue WHERE project_id = $1 AND rank > $2 AND id <> $3 ORDER BY rank LIMIT 1",
        project_id,
        rank,
        moving_id
    )
    .fetch_optional(&mut *conn)
    .await
}

/// The previous rank before `rank` in the project, skipping the issue being moved.
pub async fn rank_before(
    conn: &mut PgConnection,
    project_id: i64,
    rank: &str,
    moving_id: i64,
) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_scalar!(
        "SELECT rank FROM issue WHERE project_id = $1 AND rank < $2 AND id <> $3 ORDER BY rank DESC LIMIT 1",
        project_id,
        rank,
        moving_id
    )
    .fetch_optional(&mut *conn)
    .await
}

/// Also records the move as the mover's work (SAN-72).
pub async fn update_position(
    conn: &mut PgConnection,
    issue_id: i64,
    status_id: i64,
    rank: &str,
    done_at: Option<DateTime<Utc>>,
    mover_id: i64,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "WITH moved AS (UPDATE issue SET status_id = $2, rank = $3, done_at = $4 WHERE id = $1)
         INSERT INTO issue_activity (user_id, issue_id, worked_at) VALUES ($5, $1, now())
         ON CONFLICT (user_id, issue_id) DO UPDATE SET worked_at = now()",
        issue_id,
        status_id,
        rank,
        done_at,
        mover_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

pub struct Deletable {
    pub id: i64,
    pub reporter_id: i64,
    pub sprint_id: Option<i64>,
}

pub async fn find_deletable_for_update(
    conn: &mut PgConnection,
    project_id: i64,
    number: i64,
) -> Result<Option<Deletable>, sqlx::Error> {
    sqlx::query_as!(
        Deletable,
        "SELECT id, reporter_id, sprint_id FROM issue WHERE project_id = $1 AND number = $2 FOR UPDATE",
        project_id,
        number
    )
    .fetch_optional(&mut *conn)
    .await
}

/// The issue and its subtasks; comments and attachments cascade, an epic's children lose their
/// parent (0011). Returns the storage keys of the attachments that went (D53).
pub async fn delete_issue(
    conn: &mut PgConnection,
    issue_id: i64,
) -> Result<Vec<String>, sqlx::Error> {
    sqlx::query_scalar!(
        "WITH gone AS (
           DELETE FROM issue WHERE id = $1 OR (parent_id = $1 AND issue_type = 'subtask')
           RETURNING id)
         SELECT storage_key FROM attachment WHERE issue_id IN (SELECT id FROM gone)",
        issue_id
    )
    .fetch_all(&mut *conn)
    .await
}

pub async fn find_id(
    conn: &mut PgConnection,
    project_id: i64,
    number: i64,
) -> Result<Option<i64>, sqlx::Error> {
    sqlx::query_scalar!(
        "SELECT id FROM issue WHERE project_id = $1 AND number = $2",
        project_id,
        number
    )
    .fetch_optional(&mut *conn)
    .await
}

/// The issue a comment goes on, with the people a comment tells (SAN-172).
pub struct Watched {
    pub id: i64,
    pub reporter_id: i64,
    pub assignee_id: Option<i64>,
}

pub async fn find_watched(
    conn: &mut PgConnection,
    project_id: i64,
    number: i64,
) -> Result<Option<Watched>, sqlx::Error> {
    sqlx::query_as!(
        Watched,
        "SELECT id, reporter_id, assignee_id FROM issue WHERE project_id = $1 AND number = $2",
        project_id,
        number
    )
    .fetch_optional(&mut *conn)
    .await
}

pub async fn insert_comment(
    conn: &mut PgConnection,
    issue_id: i64,
    author_id: i64,
    body: &str,
) -> Result<Comment, sqlx::Error> {
    sqlx::query_as!(
        Comment,
        r#"WITH created AS (
             INSERT INTO issue_comment (issue_id, author_id, body) VALUES ($1, $2, $3)
             RETURNING id, author_id, body, created_at),
           worked AS (
             INSERT INTO issue_activity (user_id, issue_id, worked_at) VALUES ($2, $1, now())
             ON CONFLICT (user_id, issue_id) DO UPDATE SET worked_at = now())
         SELECT created.id AS "id!", created.author_id AS "author_id!", author.display_name AS author_name,
                created.body AS "body!", created.created_at AS "created_at!",
                NULL::timestamptz AS "edited_at?", NULL::bigint AS "edited_by_id?",
                NULL::text AS "edited_by_name?"
         FROM created JOIN app_user author ON author.id = created.author_id"#,
        issue_id,
        author_id,
        body
    )
    .fetch_one(&mut *conn)
    .await
}

pub async fn find_comment(
    conn: &mut PgConnection,
    issue_id: i64,
    comment_id: i64,
) -> Result<Option<Comment>, sqlx::Error> {
    sqlx::query_as!(
        Comment,
        r#"SELECT c.id, c.author_id, author.display_name AS author_name, c.body, c.created_at,
                  c.edited_at, c.edited_by AS edited_by_id, editor.display_name AS "edited_by_name?"
         FROM issue_comment c JOIN app_user author ON author.id = c.author_id
         LEFT JOIN app_user editor ON editor.id = c.edited_by
         WHERE c.issue_id = $1 AND c.id = $2"#,
        issue_id,
        comment_id
    )
    .fetch_optional(&mut *conn)
    .await
}

/// `None` when the comment is gone.
pub async fn update_comment(
    conn: &mut PgConnection,
    issue_id: i64,
    comment_id: i64,
    editor_id: i64,
    body: &str,
) -> Result<Option<Comment>, sqlx::Error> {
    sqlx::query_as!(
        Comment,
        r#"WITH edited AS (
             UPDATE issue_comment SET body = $4, edited_at = now(), edited_by = $3
             WHERE issue_id = $1 AND id = $2
             RETURNING id, issue_id, author_id, body, created_at, edited_at, edited_by),
           touched AS (
             UPDATE issue SET updated_at = now() WHERE id IN (SELECT issue_id FROM edited)),
           worked AS (
             INSERT INTO issue_activity (user_id, issue_id, worked_at)
             SELECT $3, issue_id, now() FROM edited
             ON CONFLICT (user_id, issue_id) DO UPDATE SET worked_at = now())
         SELECT edited.id AS "id!", edited.author_id AS "author_id!", author.display_name AS author_name,
                edited.body AS "body!", edited.created_at AS "created_at!",
                edited.edited_at AS "edited_at?", edited.edited_by AS "edited_by_id?",
                editor.display_name AS "edited_by_name?"
         FROM edited JOIN app_user author ON author.id = edited.author_id
         LEFT JOIN app_user editor ON editor.id = edited.edited_by"#,
        issue_id,
        comment_id,
        editor_id,
        body
    )
    .fetch_optional(&mut *conn)
    .await
}

/// `false` when the comment is gone.
pub async fn delete_comment(
    conn: &mut PgConnection,
    issue_id: i64,
    comment_id: i64,
) -> Result<bool, sqlx::Error> {
    let touched = sqlx::query!(
        "WITH deleted AS (
           DELETE FROM issue_comment WHERE issue_id = $1 AND id = $2 RETURNING issue_id)
         UPDATE issue SET updated_at = now() WHERE id IN (SELECT issue_id FROM deleted)",
        issue_id,
        comment_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(touched.rows_affected() == 1)
}

pub async fn list_comments(
    conn: &mut PgConnection,
    issue_id: i64,
    after_id: i64,
    limit: i64,
) -> Result<Vec<Comment>, sqlx::Error> {
    sqlx::query_as!(
        Comment,
        r#"SELECT c.id, c.author_id, author.display_name AS author_name, c.body, c.created_at,
                  c.edited_at, c.edited_by AS edited_by_id, editor.display_name AS "edited_by_name?"
         FROM issue_comment c JOIN app_user author ON author.id = c.author_id
         LEFT JOIN app_user editor ON editor.id = c.edited_by
         WHERE c.issue_id = $1 AND c.id > $2 ORDER BY c.id LIMIT $3"#,
        issue_id,
        after_id,
        limit
    )
    .fetch_all(&mut *conn)
    .await
}

/// Every comment in the project, for the account export (D45).
pub async fn list_project_comments(
    conn: &mut PgConnection,
    project_id: i64,
) -> Result<Vec<ExportedComment>, sqlx::Error> {
    sqlx::query_as!(
        ExportedComment,
        r#"SELECT p.key || '-' || i.number AS "issue_key!", c.author_id, c.body, c.created_at,
                  c.edited_at, c.edited_by AS edited_by_id
           FROM issue_comment c
           JOIN issue i ON i.id = c.issue_id
           JOIN project p ON p.id = i.project_id
           WHERE i.project_id = $1
           ORDER BY c.id"#,
        project_id
    )
    .fetch_all(&mut *conn)
    .await
}

/// D3: empty arrays mean "no filter"; within one array any value matches; filters are AND-ed.
pub async fn search_issues(
    conn: &mut PgConnection,
    project_id: i64,
    query: &SearchQuery,
    after_id: i64,
    limit: i64,
) -> Result<Vec<Issue>, sqlx::Error> {
    sqlx::query_file_as!(
        Issue,
        "src/issues/search_issues.sql",
        project_id,
        after_id,
        &query.assignee_ids[..],
        &query.types[..] as &[IssueType],
        &query.labels[..],
        &query.parent_numbers[..],
        query.no_parent,
        query.pattern.as_deref(),
        query.updated_since,
        &query.categories[..] as &[StatusCategory],
        limit,
        query.unassigned,
        query.number
    )
    .fetch_all(&mut *conn)
    .await
}

/// Every label in use in the project, once each, in alphabetical order.
pub async fn list_labels(
    conn: &mut PgConnection,
    project_id: i64,
) -> Result<Vec<String>, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT DISTINCT label AS "label!" FROM issue, unnest(labels) AS label
           WHERE project_id = $1
           ORDER BY 1"#,
        project_id
    )
    .fetch_all(&mut *conn)
    .await
}

/// D6: a subtask's sprint always equals its parent's, so both change in one statement.
pub async fn set_sprint(
    conn: &mut PgConnection,
    issue_id: i64,
    sprint_id: Option<i64>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE issue SET sprint_id = $2 WHERE id = $1 OR (parent_id = $1 AND issue_type = 'subtask')",
        issue_id,
        sprint_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}
