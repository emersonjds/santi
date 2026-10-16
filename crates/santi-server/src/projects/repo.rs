use santi_types::projects::{BoardType, MemberRole, Project};
use sqlx::PgConnection;

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

/// The project as the caller sees it; also records the visit that orders the home's projects.
pub async fn find_project(
    conn: &mut PgConnection,
    project_id: i64,
    user_id: i64,
) -> Result<Project, sqlx::Error> {
    sqlx::query_as!(
        Project,
        r#"WITH visit AS (UPDATE member SET visited_at = now() WHERE project_id = $1 AND user_id = $2)
           SELECT p.id, p.key, p.name, b.board_type AS "board_type: BoardType", m.role AS "role: MemberRole"
           FROM project p
           JOIN board b ON b.project_id = p.id
           JOIN member m ON m.project_id = p.id AND m.user_id = $2
           WHERE p.id = $1"#,
        project_id,
        user_id
    )
    .fetch_one(&mut *conn)
    .await
}

pub async fn list_projects(
    conn: &mut PgConnection,
    user_id: i64,
) -> Result<Vec<Project>, sqlx::Error> {
    sqlx::query_as!(
        Project,
        r#"SELECT p.id, p.key, p.name, b.board_type AS "board_type: BoardType", m.role AS "role: MemberRole"
           FROM member m
           JOIN project p ON p.id = m.project_id
           JOIN board b ON b.project_id = p.id
           WHERE m.user_id = $1
           ORDER BY p.key"#,
        user_id
    )
    .fetch_all(&mut *conn)
    .await
}

/// Serializes writes that must not interleave inside one project (D20, D21).
pub async fn lock_project(conn: &mut PgConnection, project_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "SELECT id FROM project WHERE id = $1 FOR UPDATE",
        project_id
    )
    .fetch_one(&mut *conn)
    .await?;
    Ok(())
}

/// D20: hands out KEY-N numbers that are never reused; the UPDATE also locks the project row.
pub async fn take_issue_number(
    conn: &mut PgConnection,
    project_id: i64,
) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!(
        r#"UPDATE project SET next_issue_number = next_issue_number + 1
           WHERE id = $1 RETURNING next_issue_number - 1 AS "number!""#,
        project_id
    )
    .fetch_one(&mut *conn)
    .await
}
