use santi_types::boards::{Card, EpicSummary, Status, StatusCategory};
use santi_types::issues::{IssueType, Priority};
use sqlx::PgConnection;

use super::domain::{ColumnRow, LayoutColumn};

/// Serializes layout edits on one board so the D2 check sees a stable layout.
pub async fn lock_board(conn: &mut PgConnection, board_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query!("SELECT id FROM board WHERE id = $1 FOR UPDATE", board_id)
        .fetch_one(&mut *conn)
        .await?;
    Ok(())
}

pub async fn find_done_window(
    conn: &mut PgConnection,
    board_id: i64,
) -> Result<Option<i32>, sqlx::Error> {
    sqlx::query_scalar!("SELECT done_window_days FROM board WHERE id = $1", board_id)
        .fetch_one(&mut *conn)
        .await
}

pub async fn set_done_window(
    conn: &mut PgConnection,
    board_id: i64,
    days: Option<i32>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE board SET done_window_days = $2 WHERE id = $1",
        board_id,
        days
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

pub async fn list_columns(
    conn: &mut PgConnection,
    board_id: i64,
) -> Result<Vec<ColumnRow>, sqlx::Error> {
    sqlx::query_as!(
        ColumnRow,
        "SELECT id, name, position, wip_limit FROM board_column WHERE board_id = $1 ORDER BY position",
        board_id
    )
    .fetch_all(&mut *conn)
    .await
}

pub async fn list_statuses(
    conn: &mut PgConnection,
    project_id: i64,
) -> Result<Vec<Status>, sqlx::Error> {
    sqlx::query_as!(
        Status,
        r#"SELECT id, name, category AS "category: StatusCategory", column_id
           FROM status WHERE project_id = $1 ORDER BY id"#,
        project_id
    )
    .fetch_all(&mut *conn)
    .await
}

pub async fn load_layout(
    conn: &mut PgConnection,
    board_id: i64,
) -> Result<Vec<LayoutColumn>, sqlx::Error> {
    sqlx::query_as!(
        LayoutColumn,
        r#"SELECT c.id,
                  COALESCE(array_agg(s.category ORDER BY s.id) FILTER (WHERE s.id IS NOT NULL), '{}')
                      AS "categories!: Vec<StatusCategory>"
           FROM board_column c
           LEFT JOIN status s ON s.column_id = c.id
           WHERE c.board_id = $1
           GROUP BY c.id
           ORDER BY c.position"#,
        board_id
    )
    .fetch_all(&mut *conn)
    .await
}

pub async fn insert_column(
    conn: &mut PgConnection,
    board_id: i64,
    name: &str,
    position: i32,
) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!(
        "INSERT INTO board_column (board_id, name, position) VALUES ($1, $2, $3) RETURNING id",
        board_id,
        name,
        position
    )
    .fetch_one(&mut *conn)
    .await
}

/// Shifts the rightmost column one step right and returns the position it left free.
pub async fn make_room_before_last_column(
    conn: &mut PgConnection,
    board_id: i64,
) -> Result<i32, sqlx::Error> {
    sqlx::query_scalar!(
        r#"UPDATE board_column SET position = position + 1
           WHERE board_id = $1
             AND position = (SELECT max(position) FROM board_column WHERE board_id = $1)
           RETURNING position - 1 AS "position!""#,
        board_id
    )
    .fetch_one(&mut *conn)
    .await
}

/// Returns false when the column is not on this board.
pub async fn update_column(
    conn: &mut PgConnection,
    board_id: i64,
    column_id: i64,
    name: &str,
    wip_limit: Option<i32>,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!(
        "UPDATE board_column SET name = $3, wip_limit = $4 WHERE board_id = $1 AND id = $2",
        board_id,
        column_id,
        name,
        wip_limit
    )
    .execute(&mut *conn)
    .await?;
    Ok(result.rows_affected() == 1)
}

pub async fn set_positions(
    conn: &mut PgConnection,
    board_id: i64,
    column_ids: &[i64],
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE board_column c SET position = ordered.position::integer
         FROM unnest($2::bigint[]) WITH ORDINALITY AS ordered(id, position)
         WHERE c.id = ordered.id AND c.board_id = $1",
        board_id,
        column_ids
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

pub async fn move_statuses(
    conn: &mut PgConnection,
    from_column: i64,
    to_column: i64,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE status SET column_id = $2 WHERE column_id = $1",
        from_column,
        to_column
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

pub async fn delete_column(
    conn: &mut PgConnection,
    board_id: i64,
    column_id: i64,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "DELETE FROM board_column WHERE board_id = $1 AND id = $2",
        board_id,
        column_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

pub async fn column_belongs_to_board(
    conn: &mut PgConnection,
    board_id: i64,
    column_id: i64,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT EXISTS (SELECT 1 FROM board_column WHERE board_id = $1 AND id = $2) AS "exists!""#,
        board_id,
        column_id
    )
    .fetch_one(&mut *conn)
    .await
}

pub async fn insert_status(
    conn: &mut PgConnection,
    project_id: i64,
    name: &str,
    category: StatusCategory,
    column_id: Option<i64>,
) -> Result<Status, sqlx::Error> {
    sqlx::query_as!(
        Status,
        r#"INSERT INTO status (project_id, name, category, column_id) VALUES ($1, $2, $3, $4)
           RETURNING id, name, category AS "category: StatusCategory", column_id"#,
        project_id,
        name,
        category as StatusCategory,
        column_id
    )
    .fetch_one(&mut *conn)
    .await
}

pub async fn update_status(
    conn: &mut PgConnection,
    project_id: i64,
    status_id: i64,
    name: &str,
    column_id: Option<i64>,
) -> Result<Option<Status>, sqlx::Error> {
    sqlx::query_as!(
        Status,
        r#"UPDATE status SET name = $3, column_id = $4 WHERE project_id = $1 AND id = $2
           RETURNING id, name, category AS "category: StatusCategory", column_id"#,
        project_id,
        status_id,
        name,
        column_id
    )
    .fetch_optional(&mut *conn)
    .await
}

/// Returns false when no such status exists in the project.
pub async fn delete_status(
    conn: &mut PgConnection,
    project_id: i64,
    status_id: i64,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!(
        "DELETE FROM status WHERE project_id = $1 AND id = $2",
        project_id,
        status_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(result.rows_affected() == 1)
}

/// What issue writes need to know about a status.
pub struct StatusRef {
    pub id: i64,
    pub category: StatusCategory,
    pub column_id: Option<i64>,
}

pub async fn find_status_ref(
    conn: &mut PgConnection,
    project_id: i64,
    status_id: i64,
) -> Result<Option<StatusRef>, sqlx::Error> {
    sqlx::query_as!(
        StatusRef,
        r#"SELECT id, category AS "category: StatusCategory", column_id FROM status WHERE project_id = $1 AND id = $2"#,
        project_id,
        status_id
    )
    .fetch_optional(&mut *conn)
    .await
}

/// D5: the default status of a new issue is the leftmost mapped to-do status.
pub async fn first_todo_status(
    conn: &mut PgConnection,
    project_id: i64,
) -> Result<Option<StatusRef>, sqlx::Error> {
    sqlx::query_as!(
        StatusRef,
        r#"SELECT s.id, s.category AS "category: StatusCategory", s.column_id
           FROM status s JOIN board_column c ON c.id = s.column_id
           WHERE s.project_id = $1 AND s.category = 'todo'
           ORDER BY c.position, s.id
           LIMIT 1"#,
        project_id
    )
    .fetch_optional(&mut *conn)
    .await
}

/// Every card the board shows, in rank order: one query (SB-9, D30, D10, D33).
/// Scrum boards show the active sprint only; with none, nothing.
pub async fn board_cards(
    conn: &mut PgConnection,
    project_id: i64,
    active_sprint_id: Option<i64>,
) -> Result<Vec<Card>, sqlx::Error> {
    sqlx::query_as!(
        Card,
        r#"SELECT i.id, p.key || '-' || i.number AS "key!", i.summary,
                  i.issue_type AS "issue_type: IssueType", i.priority AS "priority: Priority",
                  i.status_id, s.column_id AS "column_id!", i.assignee_id,
                  assignee.display_name AS "assignee_name?", i.reporter_id, i.points, i.labels,
                  p.key || '-' || parent.number AS parent_key, i.sprint_id,
                  sub.open_count AS "open_subtasks!", sub.total_count AS "total_subtasks!", i.rank,
                  i.updated_at
           FROM issue i
           JOIN project p ON p.id = i.project_id
           JOIN board b ON b.project_id = p.id
           JOIN status s ON s.id = i.status_id AND s.column_id IS NOT NULL
           LEFT JOIN issue parent ON parent.id = i.parent_id
           LEFT JOIN app_user assignee ON assignee.id = i.assignee_id
           CROSS JOIN LATERAL (
               SELECT count(*) AS total_count, count(*) FILTER (WHERE child_status.category <> 'done') AS open_count
               FROM issue child JOIN status child_status ON child_status.id = child.status_id
               WHERE child.parent_id = i.id AND child.issue_type = 'subtask'
           ) sub
           WHERE i.project_id = $1
             AND i.issue_type <> 'epic'
             AND (b.board_type = 'kanban' OR i.sprint_id = $2)
             AND (b.board_type = 'scrum' OR i.done_at IS NULL OR b.done_window_days IS NULL
                  OR i.done_at > now() - make_interval(days => b.done_window_days))
           ORDER BY i.rank"#,
        project_id,
        active_sprint_id
    )
    .fetch_all(&mut *conn)
    .await
}

/// Open parent rows for the backlog, in rank order: one query (BL-2, D6, D10); subtask counts
/// come from one aggregate per project, cheaper than a per-row lookup at backlog size (D39).
/// An issue left in a closed sprint (reopened after close) shows in the no-sprint section.
pub async fn backlog_cards(
    conn: &mut PgConnection,
    project_id: i64,
) -> Result<Vec<Card>, sqlx::Error> {
    sqlx::query_as!(
        Card,
        r#"SELECT i.id, p.key || '-' || i.number AS "key!", i.summary,
                  i.issue_type AS "issue_type: IssueType", i.priority AS "priority: Priority",
                  i.status_id, s.column_id AS "column_id!", i.assignee_id,
                  assignee.display_name AS "assignee_name?", i.reporter_id, i.points, i.labels,
                  p.key || '-' || parent.number AS parent_key,
                  CASE WHEN sprint.state = 'closed' THEN NULL ELSE i.sprint_id END AS sprint_id,
                  coalesce(sub.open_count, 0) AS "open_subtasks!", coalesce(sub.total_count, 0) AS "total_subtasks!", i.rank,
                  i.updated_at
           FROM issue i
           JOIN project p ON p.id = i.project_id
           JOIN status s ON s.id = i.status_id AND s.column_id IS NOT NULL
           LEFT JOIN sprint ON sprint.id = i.sprint_id
           LEFT JOIN issue parent ON parent.id = i.parent_id
           LEFT JOIN app_user assignee ON assignee.id = i.assignee_id
           LEFT JOIN (
               SELECT child.parent_id, count(*) AS total_count,
                      count(*) FILTER (WHERE child_status.category <> 'done') AS open_count
               FROM issue child JOIN status child_status ON child_status.id = child.status_id
               WHERE child.project_id = $1 AND child.issue_type = 'subtask'
               GROUP BY child.parent_id
           ) sub ON sub.parent_id = i.id
           WHERE i.project_id = $1
             AND i.issue_type NOT IN ('epic', 'subtask')
             AND s.category <> 'done'
           ORDER BY i.rank"#,
        project_id
    )
    .fetch_all(&mut *conn)
    .await
}

/// D10: the epic panel in one aggregate query.
pub async fn epic_summaries(
    conn: &mut PgConnection,
    project_id: i64,
) -> Result<Vec<EpicSummary>, sqlx::Error> {
    sqlx::query_as!(
        EpicSummary,
        r#"SELECT p.key || '-' || epic.number AS "key!", epic.summary,
                  count(child.id) AS "child_count!",
                  count(child.id) FILTER (WHERE child_status.category = 'done') AS "done_child_count!",
                  (epic_status.category = 'done') AS "done!"
           FROM issue epic
           JOIN project p ON p.id = epic.project_id
           JOIN status epic_status ON epic_status.id = epic.status_id
           LEFT JOIN issue child ON child.parent_id = epic.id
           LEFT JOIN status child_status ON child_status.id = child.status_id
           WHERE epic.project_id = $1 AND epic.issue_type = 'epic'
           GROUP BY epic.id, p.key, epic_status.category
           ORDER BY epic.rank"#,
        project_id
    )
    .fetch_all(&mut *conn)
    .await
}
