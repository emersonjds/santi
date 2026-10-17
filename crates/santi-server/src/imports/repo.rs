use chrono::{DateTime, NaiveDate, Utc};
use santi_types::imports::ImportSource;
use santi_types::issues::{IssueType, Priority};
use santi_types::projects::ProjectState;
use sqlx::PgConnection;

/// Keys from `keys` already imported from `source` into the project.
pub async fn existing_keys(
    conn: &mut PgConnection,
    project_id: i64,
    source: ImportSource,
    keys: &[String],
) -> Result<Vec<(String, IssueType)>, sqlx::Error> {
    let rows = sqlx::query!(
        r#"SELECT external_key AS "key!", issue_type AS "issue_type: IssueType"
           FROM issue
           WHERE project_id = $1 AND external_source = $2 AND external_key = ANY($3)"#,
        project_id,
        source as ImportSource,
        keys
    )
    .fetch_all(&mut *conn)
    .await?;
    Ok(rows
        .into_iter()
        .map(|row| (row.key, row.issue_type))
        .collect())
}

/// D20 for many issues at once: the first of `count` numbers that are never reused, and the
/// project's state as of the row lock the UPDATE takes.
pub async fn take_issue_numbers(
    conn: &mut PgConnection,
    project_id: i64,
    count: i64,
) -> Result<(i64, ProjectState), sqlx::Error> {
    let row = sqlx::query!(
        r#"UPDATE project SET next_issue_number = next_issue_number + $2
           WHERE id = $1
           RETURNING next_issue_number - $2 AS "first!",
                     CASE WHEN trashed_at IS NOT NULL THEN 'trashed'
                          WHEN archived_at IS NOT NULL THEN 'archived'
                          ELSE 'active' END AS "state!: ProjectState""#,
        project_id,
        count
    )
    .fetch_one(&mut *conn)
    .await?;
    Ok((row.first, row.state))
}

pub async fn insert_closed_sprint(
    conn: &mut PgConnection,
    board_id: i64,
    name: &str,
    start: NaiveDate,
    end: NaiveDate,
) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!(
        "INSERT INTO sprint (board_id, name, state, start_date, end_date, started_at, closed_at)
         VALUES ($1, $2, 'closed', $3, $4, $3::date, $4::date)
         RETURNING id",
        board_id,
        name,
        start,
        end
    )
    .fetch_one(&mut *conn)
    .await
}

pub struct ImportedIssue {
    pub key: String,
    pub number: i64,
    pub issue_type: IssueType,
    pub summary: String,
    pub description: String,
    pub priority: Priority,
    pub status_id: i64,
    pub done: bool,
    pub assignee_id: Option<i64>,
    pub reporter_id: i64,
    pub points: Option<f64>,
    pub labels: Vec<String>,
    pub parent_key: Option<String>,
    pub sprint_id: Option<i64>,
    pub rank: String,
    pub created: DateTime<Utc>,
    pub updated: DateTime<Utc>,
}

/// One statement per tier, parents joined by original key (D41); subtasks take their parent's
/// sprint (D6). Returns the keys inserted.
pub async fn insert_issues(
    conn: &mut PgConnection,
    project_id: i64,
    source: ImportSource,
    issues: &[ImportedIssue],
) -> Result<Vec<String>, sqlx::Error> {
    let column = |pick: fn(&ImportedIssue) -> String| issues.iter().map(pick).collect::<Vec<_>>();
    let key = column(|issue| issue.key.clone());
    let summary = column(|issue| issue.summary.clone());
    let description = column(|issue| issue.description.clone());
    let labels = column(|issue| issue.labels.join(","));
    let parent_key = column(|issue| issue.parent_key.clone().unwrap_or_default());
    let rank = column(|issue| issue.rank.clone());
    let number: Vec<i64> = issues.iter().map(|issue| issue.number).collect();
    let issue_type: Vec<IssueType> = issues.iter().map(|issue| issue.issue_type).collect();
    let priority: Vec<Priority> = issues.iter().map(|issue| issue.priority).collect();
    let status_id: Vec<i64> = issues.iter().map(|issue| issue.status_id).collect();
    let done: Vec<bool> = issues.iter().map(|issue| issue.done).collect();
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
    let sprint_id: Vec<i64> = issues
        .iter()
        .map(|issue| issue.sprint_id.unwrap_or(0))
        .collect();
    let created: Vec<DateTime<Utc>> = issues.iter().map(|issue| issue.created).collect();
    let updated: Vec<DateTime<Utc>> = issues.iter().map(|issue| issue.updated).collect();
    sqlx::query_scalar!(
        r#"INSERT INTO issue (project_id, number, issue_type, summary, description, priority, status_id,
                              assignee_id, reporter_id, points, labels, parent_id, sprint_id, rank, done_at,
                              created_at, updated_at, external_source, external_key)
           SELECT $1, r.number, r.issue_type, r.summary, r.description, r.priority, r.status_id,
                  nullif(r.assignee_id, 0), r.reporter_id, nullif(r.points, -1),
                  coalesce(string_to_array(nullif(r.labels, ''), ','), '{}'), parent.id,
                  CASE WHEN r.issue_type = 'subtask' THEN parent.sprint_id ELSE nullif(r.sprint_id, 0) END,
                  r.rank, CASE WHEN r.done THEN r.updated_at END, r.created_at, r.updated_at, $2, r.key
           FROM unnest($3::text[], $4::bigint[], $5::text[], $6::text[], $7::text[], $8::text[], $9::bigint[],
                       $10::bool[], $11::bigint[], $12::bigint[], $13::float8[], $14::text[], $15::text[],
                       $16::bigint[], $17::text[], $18::timestamptz[], $19::timestamptz[])
                AS r(key, number, issue_type, summary, description, priority, status_id, done, assignee_id,
                     reporter_id, points, labels, parent_key, sprint_id, rank, created_at, updated_at)
           LEFT JOIN issue parent ON parent.project_id = $1 AND parent.external_source = $2
                                 AND parent.external_key = nullif(r.parent_key, '')
           ON CONFLICT (project_id, external_source, external_key) WHERE external_key IS NOT NULL DO NOTHING
           RETURNING external_key AS "key!""#,
        project_id,
        source as ImportSource,
        &key[..],
        &number[..],
        &issue_type as &[IssueType],
        &summary[..],
        &description[..],
        &priority as &[Priority],
        &status_id[..],
        &done[..],
        &assignee_id[..],
        &reporter_id[..],
        &points[..],
        &labels[..],
        &parent_key[..],
        &sprint_id[..],
        &rank[..],
        &created[..],
        &updated[..]
    )
    .fetch_all(&mut *conn)
    .await
}

/// Like `sprints::repo::record_join`: new issues that landed in the running sprint (subtasks follow
/// their parent there) count as added after its start; in a closed sprint, as completed work
/// present from the start (D46, like migration 0019).
pub async fn record_sprint_facts(
    conn: &mut PgConnection,
    project_id: i64,
    source: ImportSource,
    keys: &[String],
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "INSERT INTO sprint_issue (sprint_id, issue_id, added_after_start, points_at_start, outcome, points_at_close)
         SELECT s.id, i.id, s.state = 'active', i.points,
                CASE WHEN s.state = 'closed' THEN 'completed' END,
                CASE WHEN s.state = 'closed' THEN i.points END
         FROM issue i JOIN sprint s ON s.id = i.sprint_id AND s.state <> 'future'
         WHERE i.project_id = $1 AND i.external_source = $2 AND i.external_key = ANY($3)
         ON CONFLICT (sprint_id, issue_id) DO NOTHING",
        project_id,
        source as ImportSource,
        keys
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// Comments by the importing admin, at the time the export gives.
pub async fn insert_comments(
    conn: &mut PgConnection,
    project_id: i64,
    source: ImportSource,
    author_id: i64,
    comments: &[(String, String, DateTime<Utc>)],
) -> Result<(), sqlx::Error> {
    let key: Vec<String> = comments.iter().map(|(key, _, _)| key.clone()).collect();
    let body: Vec<String> = comments.iter().map(|(_, body, _)| body.clone()).collect();
    let created: Vec<DateTime<Utc>> = comments.iter().map(|(_, _, created)| *created).collect();
    sqlx::query!(
        "INSERT INTO issue_comment (issue_id, author_id, body, created_at)
         SELECT i.id, $3, r.body, r.created_at
         FROM unnest($4::text[], $5::text[], $6::timestamptz[]) AS r(key, body, created_at)
         JOIN issue i ON i.project_id = $1 AND i.external_source = $2 AND i.external_key = r.key",
        project_id,
        source as ImportSource,
        author_id,
        &key[..],
        &body[..],
        &created[..]
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// Final ranks in file order, then the export's `updated_at`, which children and comments bumped.
/// Two statements: a write that leaves `updated_at` as it was gets `now()` from the trigger (0009).
pub async fn finish(
    conn: &mut PgConnection,
    project_id: i64,
    source: ImportSource,
    issues: &[(String, String, DateTime<Utc>)],
) -> Result<(), sqlx::Error> {
    let key: Vec<String> = issues.iter().map(|(key, _, _)| key.clone()).collect();
    let rank: Vec<String> = issues.iter().map(|(_, rank, _)| rank.clone()).collect();
    let updated: Vec<DateTime<Utc>> = issues.iter().map(|(_, _, updated)| *updated).collect();
    sqlx::query!(
        "UPDATE issue i SET rank = r.rank
         FROM unnest($3::text[], $4::text[]) AS r(key, rank)
         WHERE i.project_id = $1 AND i.external_source = $2 AND i.external_key = r.key",
        project_id,
        source as ImportSource,
        &key[..],
        &rank[..]
    )
    .execute(&mut *conn)
    .await?;
    sqlx::query!(
        "UPDATE issue i SET updated_at = r.updated_at
         FROM unnest($3::text[], $4::timestamptz[]) AS r(key, updated_at)
         WHERE i.project_id = $1 AND i.external_source = $2 AND i.external_key = r.key",
        project_id,
        source as ImportSource,
        &key[..],
        &updated[..]
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}
