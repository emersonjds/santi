use santi_types::boards::StatusCategory;
use santi_types::home::{HomeIssue, IssueActivity, MyProject, ProjectActivity};
use santi_types::issues::IssueType;
use santi_types::projects::{BoardType, MemberRole};
use sqlx::PgConnection;

/// One query: the lead, the star and the open-assigned count come from subqueries per project.
pub async fn my_projects(
    conn: &mut PgConnection,
    user_id: i64,
) -> Result<Vec<MyProject>, sqlx::Error> {
    sqlx::query_as!(
        MyProject,
        r#"WITH recent AS (
             SELECT i.project_id, max(greatest(a.viewed_at, a.worked_at)) AS at
             FROM issue_activity a JOIN issue i ON i.id = a.issue_id
             WHERE a.user_id = $1
             GROUP BY i.project_id)
           SELECT p.key, p.name, b.board_type AS "board_type: BoardType", m.role AS "role: MemberRole",
                  (SELECT u.display_name FROM member l JOIN app_user u ON u.id = l.user_id
                   WHERE l.project_id = p.id AND l.role = 'admin'
                   ORDER BY l.user_id LIMIT 1) AS "lead_name?",
                  m.starred_at IS NOT NULL AS "starred!",
                  (SELECT count(*) FROM issue i JOIN status s ON s.id = i.status_id
                   WHERE i.project_id = p.id AND i.assignee_id = $1 AND s.category <> 'done') AS "open_assigned!"
           FROM member m
           JOIN project p ON p.id = m.project_id
           JOIN board b ON b.project_id = p.id
           LEFT JOIN recent r ON r.project_id = p.id
           WHERE m.user_id = $1
           ORDER BY greatest(m.visited_at, r.at) DESC NULLS LAST, m.starred_at IS NULL, p.key"#,
        user_id
    )
    .fetch_all(&mut *conn)
    .await
}

/// One query for every list: branches the view does not use are skipped by a one-time filter.
/// Only issues of projects the caller still belongs to come back.
// ponytail: OFFSET paging over the caller's own history; keyset on (at, id) if lists grow past a few thousand rows.
pub async fn my_issues(
    conn: &mut PgConnection,
    user_id: i64,
    view: &str,
    offset: i64,
    limit: i64,
) -> Result<Vec<HomeIssue>, sqlx::Error> {
    sqlx::query_as!(
        HomeIssue,
        r#"SELECT p.key || '-' || i.number AS "key!", i.summary, i.issue_type AS "issue_type: IssueType",
                  s.category AS "status_category: StatusCategory", p.key AS project_key,
                  p.name AS project_name, a.display_name AS "assignee_name?",
                  st.user_id IS NOT NULL AS "starred!", mine.at AS "at!"
           FROM (SELECT issue_id, max(at) AS at FROM (
                   SELECT issue_id, worked_at AS at FROM issue_activity
                   WHERE user_id = $1 AND worked_at IS NOT NULL AND $2::text IN ('worked', 'recommended')
                   UNION ALL
                   SELECT issue_id, viewed_at FROM issue_activity
                   WHERE user_id = $1 AND viewed_at IS NOT NULL AND $2::text IN ('viewed', 'recommended')
                   UNION ALL
                   SELECT issue_id, created_at FROM issue_star
                   WHERE user_id = $1 AND $2::text IN ('starred', 'recommended')
                   UNION ALL
                   SELECT o.id, o.updated_at FROM issue o JOIN status os ON os.id = o.status_id
                   WHERE o.assignee_id = $1 AND os.category <> 'done' AND $2::text IN ('assigned', 'recommended')
                 ) touched GROUP BY issue_id) mine
           JOIN issue i ON i.id = mine.issue_id
           JOIN member m ON m.project_id = i.project_id AND m.user_id = $1
           JOIN project p ON p.id = i.project_id
           JOIN status s ON s.id = i.status_id
           LEFT JOIN app_user a ON a.id = i.assignee_id
           LEFT JOIN issue_star st ON st.issue_id = i.id AND st.user_id = $1
           ORDER BY mine.at DESC, i.id DESC
           LIMIT $4 OFFSET $3"#,
        user_id,
        view,
        offset,
        limit
    )
    .fetch_all(&mut *conn)
    .await
}

/// Stars or unstars a project the caller belongs to; false when they do not.
pub async fn star_project(
    conn: &mut PgConnection,
    user_id: i64,
    key: &str,
    starred: bool,
) -> Result<bool, sqlx::Error> {
    let updated = sqlx::query!(
        "UPDATE member SET starred_at = CASE WHEN $3 THEN coalesce(starred_at, now()) END
         FROM project p
         WHERE p.id = member.project_id AND p.key = $2 AND member.user_id = $1",
        user_id,
        key,
        starred
    )
    .execute(&mut *conn)
    .await?;
    Ok(updated.rows_affected() == 1)
}

/// Stars an issue of a project the caller belongs to (starring twice keeps the first time);
/// false when there is no such issue for them.
pub async fn star_issue(
    conn: &mut PgConnection,
    user_id: i64,
    project_key: &str,
    number: i64,
) -> Result<bool, sqlx::Error> {
    let inserted = sqlx::query!(
        "INSERT INTO issue_star (user_id, issue_id)
         SELECT $1, i.id FROM issue i
         JOIN project p ON p.id = i.project_id
         JOIN member m ON m.project_id = p.id AND m.user_id = $1
         WHERE p.key = $2 AND i.number = $3
         ON CONFLICT (user_id, issue_id) DO UPDATE SET created_at = issue_star.created_at",
        user_id,
        project_key,
        number
    )
    .execute(&mut *conn)
    .await?;
    Ok(inserted.rows_affected() == 1)
}

/// Unstars an issue; false when there is no such issue for the caller.
pub async fn unstar_issue(
    conn: &mut PgConnection,
    user_id: i64,
    project_key: &str,
    number: i64,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar!(
        r#"WITH target AS (
             SELECT i.id FROM issue i
             JOIN project p ON p.id = i.project_id
             JOIN member m ON m.project_id = p.id AND m.user_id = $1
             WHERE p.key = $2 AND i.number = $3),
           gone AS (DELETE FROM issue_star WHERE user_id = $1 AND issue_id IN (SELECT id FROM target))
         SELECT EXISTS (SELECT 1 FROM target) AS "found!""#,
        user_id,
        project_key,
        number
    )
    .fetch_one(&mut *conn)
    .await
}

/// Records the caller's view of an issue, at most once a minute; false when there is no such issue.
pub async fn record_view(
    conn: &mut PgConnection,
    user_id: i64,
    project_id: i64,
    number: i64,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar!(
        r#"WITH target AS (SELECT id FROM issue WHERE project_id = $2 AND number = $3),
           viewed AS (
             INSERT INTO issue_activity (user_id, issue_id, viewed_at)
             SELECT $1, id, now() FROM target
             ON CONFLICT (user_id, issue_id) DO UPDATE SET viewed_at = now()
             WHERE issue_activity.viewed_at IS NULL
                OR issue_activity.viewed_at < now() - interval '1 minute')
         SELECT EXISTS (SELECT 1 FROM target) AS "found!""#,
        user_id,
        project_id,
        number
    )
    .fetch_one(&mut *conn)
    .await
}

/// Records the caller's visit to a project they belong to, at most once a minute.
pub async fn record_visit(
    conn: &mut PgConnection,
    user_id: i64,
    project_id: i64,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE member SET visited_at = now()
         WHERE project_id = $1 AND user_id = $2
           AND (visited_at IS NULL OR visited_at < now() - interval '1 minute')",
        project_id,
        user_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

pub async fn export_projects(
    conn: &mut PgConnection,
    user_id: i64,
) -> Result<Vec<ProjectActivity>, sqlx::Error> {
    sqlx::query_as!(
        ProjectActivity,
        "SELECT p.key, m.starred_at, m.visited_at
         FROM member m JOIN project p ON p.id = m.project_id
         WHERE m.user_id = $1 AND (m.starred_at IS NOT NULL OR m.visited_at IS NOT NULL)
         ORDER BY p.key",
        user_id
    )
    .fetch_all(&mut *conn)
    .await
}

pub async fn export_issues(
    conn: &mut PgConnection,
    user_id: i64,
) -> Result<Vec<IssueActivity>, sqlx::Error> {
    sqlx::query_as!(
        IssueActivity,
        r#"SELECT p.key || '-' || i.number AS "key!", st.created_at AS "starred_at?",
                  a.viewed_at AS "viewed_at?", a.worked_at AS "worked_at?"
           FROM (SELECT issue_id FROM issue_star WHERE user_id = $1
                 UNION
                 SELECT issue_id FROM issue_activity WHERE user_id = $1) mine
           JOIN issue i ON i.id = mine.issue_id
           JOIN project p ON p.id = i.project_id
           LEFT JOIN issue_star st ON st.issue_id = i.id AND st.user_id = $1
           LEFT JOIN issue_activity a ON a.issue_id = i.id AND a.user_id = $1
           ORDER BY p.key, i.number"#,
        user_id
    )
    .fetch_all(&mut *conn)
    .await
}
