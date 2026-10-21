use santi_types::boards::StatusCategory;
use sqlx::PgConnection;

use super::domain::{STUCK_DAYS, TallyRow};

/// The board's cards (same scope as `boards::repo::board_cards`) per assignee and status
/// category, in one query.
pub async fn tallies(
    conn: &mut PgConnection,
    project_id: i64,
    active_sprint_id: Option<i64>,
) -> Result<Vec<TallyRow>, sqlx::Error> {
    sqlx::query_as!(
        TallyRow,
        r#"SELECT i.assignee_id AS user_id, assignee.display_name AS "name?",
                  s.category AS "category: StatusCategory", count(*) AS "issues!",
                  coalesce(sum(i.points), 0) AS "points!",
                  count(*) FILTER (WHERE s.category = 'in_progress'
                                     AND i.updated_at < now() - make_interval(days => $3)) AS "stuck!"
           FROM issue i
           JOIN board b ON b.project_id = i.project_id
           JOIN status s ON s.id = i.status_id AND s.column_id IS NOT NULL
           LEFT JOIN app_user assignee ON assignee.id = i.assignee_id
           WHERE i.project_id = $1
             AND i.issue_type <> 'epic'
             AND (b.board_type = 'kanban' OR i.sprint_id = $2)
             AND (b.board_type = 'scrum' OR i.done_at IS NULL OR b.done_window_days IS NULL
                  OR i.done_at > now() - make_interval(days => b.done_window_days))
           GROUP BY i.assignee_id, assignee.display_name, s.category"#,
        project_id,
        active_sprint_id,
        STUCK_DAYS
    )
    .fetch_all(&mut *conn)
    .await
}
