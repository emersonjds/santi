use chrono::{DateTime, Utc};
use santi_types::auth::ExportedComment;
use santi_types::issues::{Issue, IssueType, Priority};
use santi_types::sprints::{Sprint, SprintState};
use sqlx::PgConnection;

use super::domain::key_number;

/// The ids among `ids` of accounts that exist and are not erased.
pub async fn live_users(conn: &mut PgConnection, ids: &[i64]) -> Result<Vec<i64>, sqlx::Error> {
    sqlx::query_scalar!(
        "SELECT id FROM app_user WHERE id = ANY($1) AND deleted_at IS NULL",
        ids
    )
    .fetch_all(&mut *conn)
    .await
}

/// A sprint with the state and instants of the file.
pub async fn insert_sprint(
    conn: &mut PgConnection,
    board_id: i64,
    sprint: &Sprint,
) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!(
        "INSERT INTO sprint (board_id, name, goal, state, starts_at, ends_at, started_at, closed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
        board_id,
        sprint.name,
        sprint.goal,
        sprint.state as SprintState,
        sprint.starts_at,
        sprint.ends_at,
        sprint.started_at,
        sprint.closed_at
    )
    .fetch_one(&mut *conn)
    .await
}

/// Issues of one tier with their numbers, ranks and times; parents, inserted in an earlier tier,
/// joined by number. `status_id` and `sprint_id` must already be this project's.
pub async fn insert_issues(
    conn: &mut PgConnection,
    project_id: i64,
    issues: &[Issue],
) -> Result<(), sqlx::Error> {
    let column = |pick: fn(&Issue) -> String| issues.iter().map(pick).collect::<Vec<_>>();
    let summary = column(|issue| issue.summary.clone());
    let description = column(|issue| issue.description.clone());
    // Labels are single words (normalize_labels), so a space joins them safely.
    let labels = column(|issue| issue.labels.join(" "));
    let rank = column(|issue| issue.rank.clone());
    let number: Vec<i64> = issues.iter().map(|issue| issue.number).collect();
    let issue_type: Vec<IssueType> = issues.iter().map(|issue| issue.issue_type).collect();
    let priority: Vec<Priority> = issues.iter().map(|issue| issue.priority).collect();
    let status_id: Vec<i64> = issues.iter().map(|issue| issue.status_id).collect();
    // Arrays carry no NULLs through the checked macro: 0 and -1 stand for "none".
    let assignee_id: Vec<i64> = issues
        .iter()
        .map(|issue| issue.assignee_id.unwrap_or(0))
        .collect();
    let reporter_id: Vec<i64> = issues.iter().map(|issue| issue.reporter_id).collect();
    let points: Vec<f64> = issues
        .iter()
        .map(|issue| issue.points.unwrap_or(-1.0))
        .collect();
    let parent_number: Vec<i64> = issues
        .iter()
        .map(|issue| issue.parent_key.as_deref().map_or(0, key_number))
        .collect();
    let sprint_id: Vec<i64> = issues
        .iter()
        .map(|issue| issue.sprint_id.unwrap_or(0))
        .collect();
    let done: Vec<bool> = issues.iter().map(|issue| issue.done_at.is_some()).collect();
    let done_at: Vec<DateTime<Utc>> = issues
        .iter()
        .map(|issue| issue.done_at.unwrap_or(issue.created_at))
        .collect();
    let created: Vec<DateTime<Utc>> = issues.iter().map(|issue| issue.created_at).collect();
    let updated: Vec<DateTime<Utc>> = issues.iter().map(|issue| issue.updated_at).collect();
    sqlx::query!(
        r#"INSERT INTO issue (project_id, number, issue_type, summary, description, priority, status_id,
                              assignee_id, reporter_id, points, labels, parent_id, sprint_id, rank, done_at,
                              created_at, updated_at)
           SELECT $1, r.number, r.issue_type, r.summary, r.description, r.priority, r.status_id,
                  nullif(r.assignee_id, 0), r.reporter_id, nullif(r.points, -1),
                  coalesce(string_to_array(nullif(r.labels, ''), ' '), '{}'), parent.id,
                  nullif(r.sprint_id, 0), r.rank, CASE WHEN r.done THEN r.done_at END,
                  r.created_at, r.updated_at
           FROM unnest($2::bigint[], $3::text[], $4::text[], $5::text[], $6::text[], $7::bigint[],
                       $8::bigint[], $9::bigint[], $10::float8[], $11::text[], $12::bigint[], $13::bigint[],
                       $14::text[], $15::bool[], $16::timestamptz[], $17::timestamptz[], $18::timestamptz[])
                AS r(number, issue_type, summary, description, priority, status_id, assignee_id, reporter_id,
                     points, labels, parent_number, sprint_id, rank, done, done_at, created_at, updated_at)
           LEFT JOIN issue parent ON parent.project_id = $1 AND parent.number = nullif(r.parent_number, 0)"#,
        project_id,
        &number[..],
        &issue_type as &[IssueType],
        &summary[..],
        &description[..],
        &priority as &[Priority],
        &status_id[..],
        &assignee_id[..],
        &reporter_id[..],
        &points[..],
        &labels[..],
        &parent_number[..],
        &sprint_id[..],
        &rank[..],
        &done[..],
        &done_at[..],
        &created[..],
        &updated[..]
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

pub async fn insert_comments(
    conn: &mut PgConnection,
    project_id: i64,
    comments: &[ExportedComment],
) -> Result<(), sqlx::Error> {
    let number: Vec<i64> = comments
        .iter()
        .map(|comment| key_number(&comment.issue_key))
        .collect();
    let author_id: Vec<i64> = comments.iter().map(|comment| comment.author_id).collect();
    let body: Vec<String> = comments
        .iter()
        .map(|comment| comment.body.clone())
        .collect();
    let created: Vec<DateTime<Utc>> = comments.iter().map(|comment| comment.created_at).collect();
    // 0 stands for "never edited"; the time is then ignored.
    let edited_by: Vec<i64> = comments
        .iter()
        .map(|comment| comment.edited_by_id.unwrap_or(0))
        .collect();
    let edited_at: Vec<DateTime<Utc>> = comments
        .iter()
        .map(|comment| comment.edited_at.unwrap_or(comment.created_at))
        .collect();
    sqlx::query!(
        "INSERT INTO issue_comment (issue_id, author_id, body, created_at, edited_at, edited_by)
         SELECT i.id, r.author_id, r.body, r.created_at,
                CASE WHEN r.edited_by <> 0 THEN r.edited_at END, nullif(r.edited_by, 0)
         FROM unnest($2::bigint[], $3::bigint[], $4::text[], $5::timestamptz[], $6::bigint[], $7::timestamptz[])
              WITH ORDINALITY AS r(number, author_id, body, created_at, edited_by, edited_at, position)
         JOIN issue i ON i.project_id = $1 AND i.number = r.number
         ORDER BY r.position",
        project_id,
        &number[..],
        &author_id[..],
        &body[..],
        &created[..],
        &edited_by[..],
        &edited_at[..]
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// Puts back the `updated_at` that inserting children and comments bumped.
pub async fn reset_updated_at(
    conn: &mut PgConnection,
    project_id: i64,
    issues: &[Issue],
) -> Result<(), sqlx::Error> {
    let number: Vec<i64> = issues.iter().map(|issue| issue.number).collect();
    let updated: Vec<DateTime<Utc>> = issues.iter().map(|issue| issue.updated_at).collect();
    sqlx::query!(
        "UPDATE issue i SET updated_at = r.updated_at
         FROM unnest($2::bigint[], $3::timestamptz[]) AS r(number, updated_at)
         WHERE i.project_id = $1 AND i.number = r.number",
        project_id,
        &number[..],
        &updated[..]
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// The export holds no sprint facts: a sprint's issues count as there from its start, and a
/// closed sprint's as completed when done, like `sprints::repo::snapshot_scope` and close.
pub async fn record_sprint_facts(
    conn: &mut PgConnection,
    project_id: i64,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "INSERT INTO sprint_issue (sprint_id, issue_id, added_after_start, points_at_start, outcome, points_at_close)
         SELECT s.id, i.id, false, i.points,
                CASE WHEN s.state = 'closed' THEN
                     CASE WHEN i.done_at IS NULL THEN 'not_completed' ELSE 'completed' END END,
                CASE WHEN s.state = 'closed' THEN i.points END
         FROM issue i JOIN sprint s ON s.id = i.sprint_id AND s.state <> 'future'
         WHERE i.project_id = $1",
        project_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}
