use santi_types::boards::StatusCategory;
use santi_types::issues::{IssueType, Priority};
use santi_types::reports::{ReportIssue, ReportOutcome, SprintTotals};
use santi_types::sprints::{Sprint, SprintState};
use sqlx::PgConnection;

use super::domain::{self, FactRow};

/// D46: started sprints, the active one first, then closed ones by close time, newest first.
pub async fn sprint_totals(
    conn: &mut PgConnection,
    board_id: i64,
    cursor: Option<i64>,
    limit: i64,
) -> Result<Vec<SprintTotals>, sqlx::Error> {
    let rows = sqlx::query!(
        r#"WITH page AS (
               SELECT s.id, s.name, s.goal, s.state, s.starts_at, s.ends_at, s.started_at, s.closed_at
               FROM sprint s
               WHERE s.board_id = $1 AND s.state <> 'future'
                 AND ($2::bigint IS NULL OR (coalesce(s.closed_at, 'infinity'), s.id) <
                      (SELECT coalesce(c.closed_at, 'infinity'), c.id FROM sprint c WHERE c.board_id = $1 AND c.id = $2))
               ORDER BY coalesce(s.closed_at, 'infinity') DESC, s.id DESC
               LIMIT $3
           )
           SELECT page.id AS "id!", page.name AS "name!", page.goal AS "goal!",
                  page.state AS "state!: SprintState", page.starts_at, page.ends_at, page.started_at,
                  page.closed_at,
                  (page.state = 'active' AND page.ends_at <= now()) AS "overdue!",
                  sum(si.points_at_start) FILTER (WHERE NOT si.added_after_start) AS committed,
                  CASE WHEN page.state = 'closed'
                       THEN sum(si.points_at_close) FILTER (WHERE si.outcome = 'completed')
                       ELSE sum(i.points) FILTER (WHERE si.outcome IS NULL AND st.category = 'done')
                  END AS completed
           FROM page
           LEFT JOIN sprint_issue si ON si.sprint_id = page.id
           LEFT JOIN issue i ON i.id = si.issue_id
           LEFT JOIN status st ON st.id = i.status_id
           GROUP BY page.id, page.name, page.goal, page.state, page.starts_at, page.ends_at,
                    page.started_at, page.closed_at
           ORDER BY coalesce(page.closed_at, 'infinity') DESC, page.id DESC"#,
        board_id,
        cursor,
        limit
    )
    .fetch_all(&mut *conn)
    .await?;
    Ok(rows
        .into_iter()
        .map(|row| SprintTotals {
            sprint: Sprint {
                id: row.id,
                name: row.name,
                goal: row.goal,
                state: row.state,
                starts_at: row.starts_at,
                ends_at: row.ends_at,
                started_at: row.started_at,
                closed_at: row.closed_at,
                overdue: row.overdue,
            },
            committed: row.committed.map(domain::round),
            completed: row.completed.map(domain::round),
        })
        .collect())
}

pub struct ReportSprint {
    pub sprint: Sprint,
    pub newer_sprint_id: Option<i64>,
    pub older_sprint_id: Option<i64>,
}

/// Any state; the neighbors are the started sprints next to it in the history order.
pub async fn find_report_sprint(
    conn: &mut PgConnection,
    board_id: i64,
    sprint_id: i64,
) -> Result<Option<ReportSprint>, sqlx::Error> {
    let row = sqlx::query!(
        r#"SELECT s.id, s.name, s.goal, s.state AS "state: SprintState", s.starts_at, s.ends_at,
                  s.started_at, s.closed_at,
                  (s.state = 'active' AND s.ends_at <= now()) AS "overdue!",
                  neighbor.newer_sprint_id AS "newer_sprint_id?", neighbor.older_sprint_id AS "older_sprint_id?"
           FROM sprint s
           LEFT JOIN (
               SELECT id, lag(id) OVER started AS newer_sprint_id, lead(id) OVER started AS older_sprint_id
               FROM sprint
               WHERE board_id = $1 AND state <> 'future'
               WINDOW started AS (ORDER BY coalesce(closed_at, 'infinity') DESC, id DESC)
           ) neighbor ON neighbor.id = s.id
           WHERE s.board_id = $1 AND s.id = $2"#,
        board_id,
        sprint_id
    )
    .fetch_optional(&mut *conn)
    .await?;
    Ok(row.map(|row| ReportSprint {
        sprint: Sprint {
            id: row.id,
            name: row.name,
            goal: row.goal,
            state: row.state,
            starts_at: row.starts_at,
            ends_at: row.ends_at,
            started_at: row.started_at,
            closed_at: row.closed_at,
            overdue: row.overdue,
        },
        newer_sprint_id: row.newer_sprint_id,
        older_sprint_id: row.older_sprint_id,
    }))
}

/// The sprint's facts with each issue as it is now, by number; deleted issues come last and
/// subtasks never (RP-30). The domain fills each issue's points.
pub async fn report_rows(
    conn: &mut PgConnection,
    sprint_id: i64,
) -> Result<Vec<FactRow>, sqlx::Error> {
    let rows = sqlx::query!(
        r#"SELECT si.added_after_start, si.points_at_start, si.outcome AS "outcome: ReportOutcome",
                  si.points_at_close, p.key || '-' || i.number AS "key?", i.summary AS "summary?",
                  i.issue_type AS "issue_type?: IssueType", i.priority AS "priority?: Priority",
                  st.name AS "status_name?", st.category AS "status_category?: StatusCategory",
                  i.points AS points_now, p.key || '-' || epic.number AS "epic_key?",
                  epic.summary AS "epic_summary?"
           FROM sprint_issue si
           LEFT JOIN issue i ON i.id = si.issue_id
           LEFT JOIN project p ON p.id = i.project_id
           LEFT JOIN status st ON st.id = i.status_id
           LEFT JOIN issue epic ON epic.id = i.parent_id AND epic.issue_type = 'epic'
           WHERE si.sprint_id = $1 AND i.issue_type IS DISTINCT FROM 'subtask'
           ORDER BY i.number"#,
        sprint_id
    )
    .fetch_all(&mut *conn)
    .await?;
    Ok(rows
        .into_iter()
        .map(|row| FactRow {
            issue: (|| {
                Some(ReportIssue {
                    key: row.key?,
                    summary: row.summary?,
                    issue_type: row.issue_type?,
                    priority: row.priority?,
                    status_name: row.status_name?,
                    status_category: row.status_category?,
                    epic_key: row.epic_key,
                    epic_summary: row.epic_summary,
                    points_at_start: None,
                    points_at_end: None,
                    added_after_start: false,
                })
            })(),
            points_now: row.points_now,
            added_after_start: row.added_after_start,
            points_at_start: row.points_at_start,
            outcome: row.outcome,
            points_at_close: row.points_at_close,
        })
        .collect())
}
