use chrono::{DateTime, Utc};
use santi_types::sprints::{Sprint, SprintLength, SprintState};
use sqlx::PgConnection;

/// D12: the board counter behind `Sprint N`; never reused.
pub async fn take_sprint_number(
    conn: &mut PgConnection,
    board_id: i64,
) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!(
        r#"UPDATE board SET next_sprint_number = next_sprint_number + 1
           WHERE id = $1 RETURNING next_sprint_number - 1 AS "number!""#,
        board_id
    )
    .fetch_one(&mut *conn)
    .await
}

pub async fn insert_sprint(
    conn: &mut PgConnection,
    board_id: i64,
    name: &str,
    goal: &str,
) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!(
        "INSERT INTO sprint (board_id, name, goal) VALUES ($1, $2, $3) RETURNING id",
        board_id,
        name,
        goal
    )
    .fetch_one(&mut *conn)
    .await
}

pub async fn find_sprint(
    conn: &mut PgConnection,
    board_id: i64,
    sprint_id: i64,
) -> Result<Option<Sprint>, sqlx::Error> {
    sqlx::query_as!(
        Sprint,
        r#"SELECT id, name, goal, state AS "state: SprintState", starts_at, ends_at, started_at, closed_at,
                  (state = 'active' AND ends_at <= now()) AS "overdue!"
           FROM sprint WHERE board_id = $1 AND id = $2"#,
        board_id,
        sprint_id
    )
    .fetch_optional(&mut *conn)
    .await
}

pub async fn find_sprint_for_update(
    conn: &mut PgConnection,
    board_id: i64,
    sprint_id: i64,
) -> Result<Option<Sprint>, sqlx::Error> {
    sqlx::query_as!(
        Sprint,
        r#"SELECT id, name, goal, state AS "state: SprintState", starts_at, ends_at, started_at, closed_at,
                  (state = 'active' AND ends_at <= now()) AS "overdue!"
           FROM sprint WHERE board_id = $1 AND id = $2
           FOR UPDATE"#,
        board_id,
        sprint_id
    )
    .fetch_optional(&mut *conn)
    .await
}

pub async fn list_sprints(
    conn: &mut PgConnection,
    board_id: i64,
) -> Result<Vec<Sprint>, sqlx::Error> {
    sqlx::query_as!(
        Sprint,
        r#"SELECT id, name, goal, state AS "state: SprintState", starts_at, ends_at, started_at, closed_at,
                  (state = 'active' AND ends_at <= now()) AS "overdue!"
           FROM sprint WHERE board_id = $1 ORDER BY id"#,
        board_id
    )
    .fetch_all(&mut *conn)
    .await
}

/// BL-1: the active sprint first, then future sprints in creation order.
pub async fn list_open(conn: &mut PgConnection, board_id: i64) -> Result<Vec<Sprint>, sqlx::Error> {
    sqlx::query_as!(
        Sprint,
        r#"SELECT id, name, goal, state AS "state: SprintState", starts_at, ends_at, started_at, closed_at,
                  (state = 'active' AND ends_at <= now()) AS "overdue!"
           FROM sprint WHERE board_id = $1 AND state <> 'closed'
           ORDER BY state = 'future', id"#,
        board_id
    )
    .fetch_all(&mut *conn)
    .await
}

pub async fn find_active(
    conn: &mut PgConnection,
    board_id: i64,
) -> Result<Option<Sprint>, sqlx::Error> {
    sqlx::query_as!(
        Sprint,
        r#"SELECT id, name, goal, state AS "state: SprintState", starts_at, ends_at, started_at, closed_at,
                  (state = 'active' AND ends_at <= now()) AS "overdue!"
           FROM sprint WHERE board_id = $1 AND state = 'active'"#,
        board_id
    )
    .fetch_optional(&mut *conn)
    .await
}

pub async fn update_sprint(
    conn: &mut PgConnection,
    sprint_id: i64,
    name: &str,
    goal: &str,
    starts_at: Option<DateTime<Utc>>,
    ends_at: Option<DateTime<Utc>>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE sprint SET name = $2, goal = $3, starts_at = $4, ends_at = $5 WHERE id = $1",
        sprint_id,
        name,
        goal,
        starts_at,
        ends_at
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// D32: the guard is in the statement; false means nothing was deleted.
pub async fn delete_future_sprint(
    conn: &mut PgConnection,
    board_id: i64,
    sprint_id: i64,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!(
        "DELETE FROM sprint WHERE board_id = $1 AND id = $2 AND state = 'future'",
        board_id,
        sprint_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(result.rows_affected() == 1)
}

pub async fn count_issues(conn: &mut PgConnection, sprint_id: i64) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT count(*) AS "count!" FROM issue WHERE sprint_id = $1"#,
        sprint_id
    )
    .fetch_one(&mut *conn)
    .await
}

pub async fn mark_started(
    conn: &mut PgConnection,
    sprint_id: i64,
    starts_at: DateTime<Utc>,
    ends_at: DateTime<Utc>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE sprint SET state = 'active', starts_at = $2, ends_at = $3, started_at = now() WHERE id = $1",
        sprint_id,
        starts_at,
        ends_at
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// The scope at start: every issue in the sprint, with its points.
pub async fn snapshot_scope(conn: &mut PgConnection, sprint_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "INSERT INTO sprint_issue (sprint_id, issue_id, added_after_start, points_at_start)
         SELECT $1, id, false, points FROM issue WHERE sprint_id = $1",
        sprint_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// An issue (and its subtasks) that joined the sprint after it started; no-op unless the sprint is active.
pub async fn record_join(
    conn: &mut PgConnection,
    sprint_id: i64,
    issue_id: i64,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "INSERT INTO sprint_issue (sprint_id, issue_id, added_after_start, points_at_start)
         SELECT s.id, i.id, true, i.points
         FROM sprint s JOIN issue i ON i.sprint_id = s.id
         WHERE s.id = $1 AND s.state = 'active'
           AND (i.id = $2 OR (i.parent_id = $2 AND i.issue_type = 'subtask'))
         ON CONFLICT (sprint_id, issue_id) DO UPDATE SET outcome = NULL",
        sprint_id,
        issue_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// An issue (and its subtasks) that left the sprint while it ran; no-op unless the sprint is active.
pub async fn record_leave(
    conn: &mut PgConnection,
    sprint_id: i64,
    issue_id: i64,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE sprint_issue si SET outcome = 'removed'
         FROM sprint s, issue i
         WHERE si.sprint_id = $1 AND s.id = $1 AND s.state = 'active'
           AND si.issue_id = i.id
           AND (i.id = $2 OR (i.parent_id = $2 AND i.issue_type = 'subtask'))",
        sprint_id,
        issue_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// Outcome per issue still in the sprint; a subtask takes its parent's outcome (SP-17 cut).
pub async fn record_outcomes(conn: &mut PgConnection, sprint_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE sprint_issue si
         SET outcome = CASE WHEN owner_status.category = 'done' THEN 'completed' ELSE 'not_completed' END,
             points_at_close = i.points
         FROM issue i
         JOIN issue owner ON owner.id = CASE WHEN i.issue_type = 'subtask' THEN i.parent_id ELSE i.id END
         JOIN status owner_status ON owner_status.id = owner.status_id
         WHERE si.sprint_id = $1 AND si.issue_id = i.id AND i.sprint_id = $1",
        sprint_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// D13: one statement moves every unfinished issue; subtasks go wherever their parent goes.
pub async fn move_open_issues(
    conn: &mut PgConnection,
    sprint_id: i64,
    destination: Option<i64>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE issue i SET sprint_id = $2
         FROM issue owner JOIN status owner_status ON owner_status.id = owner.status_id
         WHERE i.sprint_id = $1
           AND owner.id = CASE WHEN i.issue_type = 'subtask' THEN i.parent_id ELSE i.id END
           AND owner_status.category <> 'done'",
        sprint_id,
        destination
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

pub async fn mark_closed(conn: &mut PgConnection, sprint_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE sprint SET state = 'closed', closed_at = now() WHERE id = $1",
        sprint_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

pub async fn remember_length(
    conn: &mut PgConnection,
    board_id: i64,
    length: SprintLength,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE board SET sprint_length = $2 WHERE id = $1",
        board_id,
        length.to_string()
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// The CHECK in migration 0020 keeps every stored token parseable.
pub async fn sprint_length(
    conn: &mut PgConnection,
    board_id: i64,
) -> Result<Option<SprintLength>, sqlx::Error> {
    let token = sqlx::query_scalar!("SELECT sprint_length FROM board WHERE id = $1", board_id)
        .fetch_one(&mut *conn)
        .await?;
    Ok(token.and_then(|token| token.parse().ok()))
}
