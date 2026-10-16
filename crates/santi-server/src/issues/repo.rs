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
        "INSERT INTO issue (project_id, number, issue_type, summary, description, priority, status_id,
                            assignee_id, reporter_id, points, labels, parent_id, sprint_id, rank, done_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         RETURNING id",
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
                  i.status_id, i.assignee_id, i.reporter_id, i.points, i.labels,
                  p.key || '-' || parent.number AS parent_key, i.sprint_id, i.rank, i.done_at, i.created_at, i.updated_at
           FROM issue i
           JOIN project p ON p.id = i.project_id
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

pub async fn update_fields(
    conn: &mut PgConnection,
    issue: &EditableIssue,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE issue SET summary = $2, description = $3, issue_type = $4, priority = $5,
                          assignee_id = $6, points = $7, labels = $8, parent_id = $9
         WHERE id = $1",
        issue.id,
        issue.summary,
        issue.description,
        issue.issue_type as IssueType,
        issue.priority as Priority,
        issue.assignee_id,
        issue.points,
        &issue.labels[..],
        issue.parent_id
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

pub async fn update_position(
    conn: &mut PgConnection,
    issue_id: i64,
    status_id: i64,
    rank: &str,
    done_at: Option<DateTime<Utc>>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE issue SET status_id = $2, rank = $3, done_at = $4 WHERE id = $1",
        issue_id,
        status_id,
        rank,
        done_at
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

/// The issue and its subtasks; comments cascade, an epic's children lose their parent (0011).
pub async fn delete_issue(conn: &mut PgConnection, issue_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "DELETE FROM issue WHERE id = $1 OR (parent_id = $1 AND issue_type = 'subtask')",
        issue_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
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

pub async fn insert_comment(
    conn: &mut PgConnection,
    issue_id: i64,
    author_id: i64,
    body: &str,
) -> Result<Comment, sqlx::Error> {
    sqlx::query_as!(
        Comment,
        "INSERT INTO issue_comment (issue_id, author_id, body) VALUES ($1, $2, $3)
         RETURNING id, author_id, body, created_at",
        issue_id,
        author_id,
        body
    )
    .fetch_one(&mut *conn)
    .await
}

pub async fn list_comments(
    conn: &mut PgConnection,
    issue_id: i64,
    after_id: i64,
    limit: i64,
) -> Result<Vec<Comment>, sqlx::Error> {
    sqlx::query_as!(
        Comment,
        "SELECT id, author_id, body, created_at FROM issue_comment
         WHERE issue_id = $1 AND id > $2 ORDER BY id LIMIT $3",
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
        r#"SELECT p.key || '-' || i.number AS "issue_key!", c.author_id, c.body, c.created_at
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
    sqlx::query_as!(
        Issue,
        r#"SELECT i.id, p.key || '-' || i.number AS "key!", i.number, i.summary, i.description,
                  i.issue_type AS "issue_type: IssueType", i.priority AS "priority: Priority",
                  i.status_id, i.assignee_id, i.reporter_id, i.points, i.labels,
                  p.key || '-' || parent.number AS parent_key, i.sprint_id, i.rank, i.done_at, i.created_at, i.updated_at
           FROM issue i
           JOIN project p ON p.id = i.project_id
           LEFT JOIN issue parent ON parent.id = i.parent_id
           JOIN status s ON s.id = i.status_id
           WHERE i.project_id = $1
             AND i.id > $2
             AND (cardinality($3::bigint[]) = 0 OR i.assignee_id = ANY($3))
             AND (cardinality($4::text[]) = 0 OR i.issue_type = ANY($4))
             AND (cardinality($5::text[]) = 0 OR i.labels && $5)
             AND ((cardinality($6::bigint[]) = 0 AND NOT $7)
                  OR parent.number = ANY($6)
                  OR ($7 AND i.parent_id IS NULL))
             AND ($8::text IS NULL OR i.summary ILIKE $8 OR p.key || '-' || i.number ILIKE $8)
             AND ($9::timestamptz IS NULL OR i.updated_at > $9)
             AND (cardinality($10::text[]) = 0 OR s.category = ANY($10))
           ORDER BY i.id
           LIMIT $11"#,
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
        limit
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
