use chrono::{DateTime, Utc};
use santi_types::projects::{BoardType, InvitePreview, MemberInfo, MemberRole};
use sqlx::PgConnection;

use super::Member;

pub struct InviteGrant {
    pub project_id: i64,
    pub role: MemberRole,
}

/// D28 + D39: the caller's token and membership in one round trip. `None` = unknown or expired
/// token (401); `Some(None)` = signed in but not a member of `project_key`, or it is trashed (404).
pub async fn find_member_by_token(
    conn: &mut PgConnection,
    project_key: &str,
    token_hash: &[u8],
) -> Result<Option<Option<Member>>, sqlx::Error> {
    let row = sqlx::query!(
        r#"SELECT t.user_id, p.id AS "project_id?", p.key AS "project_key?", b.id AS "board_id?",
                  b.board_type AS "board_type?: BoardType", m.role AS "role?: MemberRole",
                  p.archived_at IS NOT NULL AS "archived?"
           FROM auth_token t
           LEFT JOIN project p ON p.key = $2 AND p.trashed_at IS NULL
           LEFT JOIN member m ON m.project_id = p.id AND m.user_id = t.user_id
           LEFT JOIN board b ON b.project_id = m.project_id
           WHERE t.token_hash = $1 AND (t.expires_at IS NULL OR t.expires_at > now())"#,
        token_hash,
        project_key
    )
    .fetch_optional(&mut *conn)
    .await?;
    Ok(row.map(|row| {
        Some(Member {
            user_id: row.user_id,
            project_id: row.project_id?,
            project_key: row.project_key?,
            board_id: row.board_id?,
            board_type: row.board_type?,
            role: row.role?,
            archived: row.archived?,
        })
    }))
}

/// The user's membership in the project with this key, if any, in any state.
pub async fn find_member(
    conn: &mut PgConnection,
    project_key: &str,
    user_id: i64,
) -> Result<Option<Member>, sqlx::Error> {
    sqlx::query_as!(
        Member,
        r#"SELECT m.user_id, p.id AS project_id, p.key AS project_key, b.id AS board_id,
                  b.board_type AS "board_type: BoardType", m.role AS "role: MemberRole",
                  p.archived_at IS NOT NULL AS "archived!"
           FROM project p
           JOIN board b ON b.project_id = p.id
           JOIN member m ON m.project_id = p.id AND m.user_id = $2
           WHERE p.key = $1"#,
        project_key,
        user_id
    )
    .fetch_optional(&mut *conn)
    .await
}

pub async fn insert_member(
    conn: &mut PgConnection,
    project_id: i64,
    user_id: i64,
    role: MemberRole,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "INSERT INTO member (project_id, user_id, role) VALUES ($1, $2, $3)",
        project_id,
        user_id,
        role as MemberRole
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

pub async fn is_member(
    conn: &mut PgConnection,
    project_id: i64,
    user_id: i64,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT EXISTS (SELECT 1 FROM member WHERE project_id = $1 AND user_id = $2) AS "exists!""#,
        project_id,
        user_id
    )
    .fetch_one(&mut *conn)
    .await
}

pub async fn find_member_info(
    conn: &mut PgConnection,
    project_id: i64,
    user_id: i64,
) -> Result<Option<MemberInfo>, sqlx::Error> {
    sqlx::query_as!(
        MemberInfo,
        r#"SELECT u.id AS user_id, u.email, u.display_name, m.role AS "role: MemberRole"
           FROM member m JOIN app_user u ON u.id = m.user_id
           WHERE m.project_id = $1 AND m.user_id = $2"#,
        project_id,
        user_id
    )
    .fetch_optional(&mut *conn)
    .await
}

pub async fn list_members(
    conn: &mut PgConnection,
    project_id: i64,
) -> Result<Vec<MemberInfo>, sqlx::Error> {
    sqlx::query_as!(
        MemberInfo,
        r#"SELECT u.id AS user_id, u.email, u.display_name, m.role AS "role: MemberRole"
           FROM member m JOIN app_user u ON u.id = m.user_id
           WHERE m.project_id = $1
           ORDER BY u.display_name, u.id"#,
        project_id
    )
    .fetch_all(&mut *conn)
    .await
}

pub async fn find_user_id_by_email(
    conn: &mut PgConnection,
    email: &str,
) -> Result<Option<i64>, sqlx::Error> {
    sqlx::query_scalar!(
        "SELECT id FROM app_user WHERE email = $1 AND deleted_at IS NULL",
        email
    )
    .fetch_optional(&mut *conn)
    .await
}

pub async fn count_admins(conn: &mut PgConnection, project_id: i64) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT count(*) AS "count!" FROM member WHERE project_id = $1 AND role = 'admin'"#,
        project_id
    )
    .fetch_one(&mut *conn)
    .await
}

pub async fn set_role(
    conn: &mut PgConnection,
    project_id: i64,
    user_id: i64,
    role: MemberRole,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE member SET role = $3 WHERE project_id = $1 AND user_id = $2",
        project_id,
        user_id,
        role as MemberRole
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// Also drops the user's issue stars, views and work in the project (SAN-72).
pub async fn delete_member(
    conn: &mut PgConnection,
    project_id: i64,
    user_id: i64,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "WITH gone AS (DELETE FROM member WHERE project_id = $1 AND user_id = $2),
              stars AS (DELETE FROM issue_star s USING issue i
                        WHERE i.id = s.issue_id AND i.project_id = $1 AND s.user_id = $2)
         DELETE FROM issue_activity a USING issue i
         WHERE i.id = a.issue_id AND i.project_id = $1 AND a.user_id = $2",
        project_id,
        user_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

pub async fn insert_invite(
    conn: &mut PgConnection,
    project_id: i64,
    role: MemberRole,
    token_hash: &[u8],
    created_by: i64,
    expires_at: DateTime<Utc>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "INSERT INTO invite (project_id, role, token_hash, created_by, expires_at) VALUES ($1, $2, $3, $4, $5)",
        project_id,
        role as MemberRole,
        token_hash,
        created_by,
        expires_at
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// Invites are single use: a valid one into an active project is marked used and its grant returned.
pub async fn take_invite(
    conn: &mut PgConnection,
    token_hash: &[u8],
) -> Result<Option<InviteGrant>, sqlx::Error> {
    sqlx::query_as!(
        InviteGrant,
        r#"UPDATE invite i SET used_at = now()
           FROM project p
           WHERE p.id = i.project_id AND p.archived_at IS NULL AND p.trashed_at IS NULL
             AND i.token_hash = $1 AND i.used_at IS NULL AND i.expires_at > now()
           RETURNING i.project_id, i.role AS "role: MemberRole""#,
        token_hash
    )
    .fetch_optional(&mut *conn)
    .await
}

pub struct InviteRow {
    pub preview: InvitePreview,
    pub used_at: Option<DateTime<Utc>>,
    pub archived: bool,
}

/// The invite behind a token with its project and inviter, used or not; none into a trashed project.
pub async fn find_invite(
    conn: &mut PgConnection,
    token_hash: &[u8],
) -> Result<Option<InviteRow>, sqlx::Error> {
    let row = sqlx::query!(
        r#"SELECT p.key AS project_key, p.name AS project_name, i.role AS "role: MemberRole",
                  i.expires_at, u.display_name AS inviter_name, i.used_at,
                  p.archived_at IS NOT NULL AS "archived!"
           FROM invite i
           JOIN project p ON p.id = i.project_id
           JOIN app_user u ON u.id = i.created_by
           WHERE i.token_hash = $1 AND p.trashed_at IS NULL"#,
        token_hash
    )
    .fetch_optional(&mut *conn)
    .await?;
    Ok(row.map(|row| InviteRow {
        preview: InvitePreview {
            project_key: row.project_key,
            project_name: row.project_name,
            role: row.role,
            expires_at: row.expires_at,
            inviter_name: row.inviter_name,
        },
        used_at: row.used_at,
        archived: row.archived,
    }))
}
