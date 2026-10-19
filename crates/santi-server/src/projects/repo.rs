use santi_types::projects::{BoardType, MemberRole, Project, ProjectState};
use sqlx::PgConnection;

use super::domain::TRASH_DAYS;

pub async fn insert_project(
    conn: &mut PgConnection,
    key: &str,
    name: &str,
) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!(
        "INSERT INTO project (key, name) VALUES ($1, $2) RETURNING id",
        key,
        name
    )
    .fetch_one(&mut *conn)
    .await
}

pub async fn insert_board(
    conn: &mut PgConnection,
    project_id: i64,
    board_type: BoardType,
    done_window_days: Option<i32>,
) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!(
        "INSERT INTO board (project_id, board_type, done_window_days) VALUES ($1, $2, $3) RETURNING id",
        project_id,
        board_type as BoardType,
        done_window_days
    )
    .fetch_one(&mut *conn)
    .await
}

pub async fn find_project(
    conn: &mut PgConnection,
    project_id: i64,
    user_id: i64,
) -> Result<Project, sqlx::Error> {
    sqlx::query_as!(
        Project,
        r#"SELECT p.id, p.key, p.name, b.board_type AS "board_type: BoardType", m.role AS "role: MemberRole",
                  s.state AS "state!: ProjectState", p.archived_at, ab.display_name AS "archived_by?",
                  p.trashed_at, tb.display_name AS "trashed_by?",
                  p.trashed_at + make_interval(days => $3) AS purge_at
           FROM project p
           JOIN board b ON b.project_id = p.id
           JOIN member m ON m.project_id = p.id AND m.user_id = $2
           CROSS JOIN LATERAL (SELECT CASE WHEN p.trashed_at IS NOT NULL THEN 'trashed'
                                           WHEN p.archived_at IS NOT NULL THEN 'archived'
                                           ELSE 'active' END AS state) s
           LEFT JOIN app_user ab ON ab.id = p.archived_by
           LEFT JOIN app_user tb ON tb.id = p.trashed_by
           WHERE p.id = $1"#,
        project_id,
        user_id,
        TRASH_DAYS
    )
    .fetch_one(&mut *conn)
    .await
}

/// `None` lists every state (the account export); archived and trashed list only projects the
/// user administers.
pub async fn list_projects(
    conn: &mut PgConnection,
    user_id: i64,
    state: Option<ProjectState>,
) -> Result<Vec<Project>, sqlx::Error> {
    sqlx::query_as!(
        Project,
        r#"SELECT p.id, p.key, p.name, b.board_type AS "board_type: BoardType", m.role AS "role: MemberRole",
                  s.state AS "state!: ProjectState", p.archived_at, ab.display_name AS "archived_by?",
                  p.trashed_at, tb.display_name AS "trashed_by?",
                  p.trashed_at + make_interval(days => $3) AS purge_at
           FROM member m
           JOIN project p ON p.id = m.project_id
           JOIN board b ON b.project_id = p.id
           CROSS JOIN LATERAL (SELECT CASE WHEN p.trashed_at IS NOT NULL THEN 'trashed'
                                           WHEN p.archived_at IS NOT NULL THEN 'archived'
                                           ELSE 'active' END AS state) s
           LEFT JOIN app_user ab ON ab.id = p.archived_by
           LEFT JOIN app_user tb ON tb.id = p.trashed_by
           WHERE m.user_id = $1
             AND ($2::text IS NULL OR s.state = $2 AND (s.state = 'active' OR m.role = 'admin'))
           ORDER BY p.key"#,
        user_id,
        state as Option<ProjectState>,
        TRASH_DAYS
    )
    .fetch_all(&mut *conn)
    .await
}

/// The state of the project holding `key`, if any.
pub async fn find_key_state(
    conn: &mut PgConnection,
    key: &str,
) -> Result<Option<ProjectState>, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT CASE WHEN trashed_at IS NOT NULL THEN 'trashed'
                       WHEN archived_at IS NOT NULL THEN 'archived'
                       ELSE 'active' END AS "state!: ProjectState"
           FROM project WHERE key = $1"#,
        key
    )
    .fetch_optional(&mut *conn)
    .await
}

pub struct Membership {
    pub project_id: i64,
    pub role: MemberRole,
    pub trashed: bool,
}

/// The user's membership in the project with this key, in any state.
pub async fn find_membership(
    conn: &mut PgConnection,
    key: &str,
    user_id: i64,
) -> Result<Option<Membership>, sqlx::Error> {
    sqlx::query_as!(
        Membership,
        r#"SELECT p.id AS project_id, m.role AS "role: MemberRole", p.trashed_at IS NOT NULL AS "trashed!"
           FROM project p JOIN member m ON m.project_id = p.id AND m.user_id = $2
           WHERE p.key = $1"#,
        key,
        user_id
    )
    .fetch_optional(&mut *conn)
    .await
}

/// False when the project is already archived or trashed.
pub async fn archive(
    conn: &mut PgConnection,
    project_id: i64,
    user_id: i64,
) -> Result<bool, sqlx::Error> {
    let updated = sqlx::query!(
        "UPDATE project SET archived_at = now(), archived_by = $2
         WHERE id = $1 AND archived_at IS NULL AND trashed_at IS NULL",
        project_id,
        user_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(updated.rows_affected() == 1)
}

/// False when the project is not archived.
pub async fn unarchive(conn: &mut PgConnection, project_id: i64) -> Result<bool, sqlx::Error> {
    let updated = sqlx::query!(
        "UPDATE project SET archived_at = NULL, archived_by = NULL
         WHERE id = $1 AND archived_at IS NOT NULL",
        project_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(updated.rows_affected() == 1)
}

/// Trashing an archived project unarchives it. False when the project is already trashed.
pub async fn trash(
    conn: &mut PgConnection,
    project_id: i64,
    user_id: i64,
) -> Result<bool, sqlx::Error> {
    let updated = sqlx::query!(
        "UPDATE project SET trashed_at = now(), trashed_by = $2, archived_at = NULL, archived_by = NULL
         WHERE id = $1 AND trashed_at IS NULL",
        project_id,
        user_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(updated.rows_affected() == 1)
}

/// False when the project is not in the trash.
pub async fn restore(conn: &mut PgConnection, project_id: i64) -> Result<bool, sqlx::Error> {
    let updated = sqlx::query!(
        "UPDATE project SET trashed_at = NULL, trashed_by = NULL
         WHERE id = $1 AND trashed_at IS NOT NULL",
        project_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(updated.rows_affected() == 1)
}

/// Deletes a trashed project; everything it owns goes with it by `ON DELETE CASCADE`. Returns the
/// storage keys of its attachments (D53), or `None` when the project is not in the trash.
pub async fn purge(
    conn: &mut PgConnection,
    project_id: i64,
) -> Result<Option<Vec<String>>, sqlx::Error> {
    sqlx::query_scalar!(
        r#"WITH gone AS (DELETE FROM project WHERE id = $1 AND trashed_at IS NOT NULL RETURNING id)
           SELECT array(SELECT a.storage_key FROM attachment a JOIN issue i ON i.id = a.issue_id
                        WHERE i.project_id = gone.id) AS "keys!"
           FROM gone"#,
        project_id
    )
    .fetch_optional(&mut *conn)
    .await
}

pub struct ExpiredTrash {
    pub id: i64,
    pub key: String,
}

/// OR-58: up to `limit` projects trashed `TRASH_DAYS` ago or earlier, oldest first.
pub async fn list_expired_trash(
    conn: &mut PgConnection,
    limit: i64,
) -> Result<Vec<ExpiredTrash>, sqlx::Error> {
    sqlx::query_as!(
        ExpiredTrash,
        "SELECT id, key FROM project WHERE trashed_at <= now() - make_interval(days => $1)
         ORDER BY trashed_at LIMIT $2",
        TRASH_DAYS,
        limit
    )
    .fetch_all(&mut *conn)
    .await
}

/// Serializes writes that must not interleave inside one project (D20, D21); returns the
/// project's state as of the lock, which may have changed since the request was authorized.
pub async fn lock_project(
    conn: &mut PgConnection,
    project_id: i64,
) -> Result<ProjectState, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT CASE WHEN trashed_at IS NOT NULL THEN 'trashed'
                       WHEN archived_at IS NOT NULL THEN 'archived'
                       ELSE 'active' END AS "state!: ProjectState"
           FROM project WHERE id = $1 FOR UPDATE"#,
        project_id
    )
    .fetch_one(&mut *conn)
    .await
}

/// D20: hands out KEY-N numbers that are never reused; the UPDATE also locks the project row,
/// and the project's state as of that lock comes back with the number.
pub async fn take_issue_number(
    conn: &mut PgConnection,
    project_id: i64,
) -> Result<(i64, ProjectState), sqlx::Error> {
    let row = sqlx::query!(
        r#"UPDATE project SET next_issue_number = next_issue_number + 1
           WHERE id = $1
           RETURNING next_issue_number - 1 AS "number!",
                     CASE WHEN trashed_at IS NOT NULL THEN 'trashed'
                          WHEN archived_at IS NOT NULL THEN 'archived'
                          ELSE 'active' END AS "state!: ProjectState""#,
        project_id
    )
    .fetch_one(&mut *conn)
    .await?;
    Ok((row.number, row.state))
}
