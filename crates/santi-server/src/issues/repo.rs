use chrono::{DateTime, Utc};
use santi_types::boards::StatusCategory;
use santi_types::issues::{Issue, IssueType, Priority};
use sqlx::PgConnection;

use super::domain::EditableIssue;

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
                  p.key || '-' || parent.number AS parent_key, i.sprint_id, i.rank, i.done_at, i.created_at
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
                  assignee_id, points, labels, parent_id
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

/// Where an issue stands, for a status change.
pub struct StatusState {
    pub id: i64,
    pub category: StatusCategory,
    pub done_at: Option<DateTime<Utc>>,
}

pub async fn find_status_state_for_update(
    conn: &mut PgConnection,
    project_id: i64,
    number: i64,
) -> Result<Option<StatusState>, sqlx::Error> {
    sqlx::query_as!(
        StatusState,
        r#"SELECT i.id, s.category AS "category: StatusCategory", i.done_at
           FROM issue i JOIN status s ON s.id = i.status_id
           WHERE i.project_id = $1 AND i.number = $2
           FOR UPDATE OF i"#,
        project_id,
        number
    )
    .fetch_optional(&mut *conn)
    .await
}

pub async fn set_status(
    conn: &mut PgConnection,
    issue_id: i64,
    status_id: i64,
    done_at: Option<DateTime<Utc>>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE issue SET status_id = $2, done_at = $3 WHERE id = $1",
        issue_id,
        status_id,
        done_at
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}
