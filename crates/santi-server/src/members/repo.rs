use chrono::{DateTime, Utc};
use santi_types::projects::{BoardType, MemberInfo, MemberRole};
use sqlx::PgConnection;

use super::Member;

pub struct InviteGrant {
    pub project_id: i64,
    pub role: MemberRole,
}

pub async fn find_member(
    conn: &mut PgConnection,
    project_key: &str,
    user_id: i64,
) -> Result<Option<Member>, sqlx::Error> {
    sqlx::query_as!(
        Member,
        r#"SELECT m.user_id, p.id AS project_id, p.key AS project_key, b.id AS board_id,
                  b.board_type AS "board_type: BoardType", m.role AS "role: MemberRole"
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
    sqlx::query_scalar!("SELECT id FROM app_user WHERE email = $1", email)
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

pub async fn delete_member(
    conn: &mut PgConnection,
    project_id: i64,
    user_id: i64,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "DELETE FROM member WHERE project_id = $1 AND user_id = $2",
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

/// Invites are single use: a valid one is deleted and its grant returned.
pub async fn take_invite(
    conn: &mut PgConnection,
    token_hash: &[u8],
) -> Result<Option<InviteGrant>, sqlx::Error> {
    sqlx::query_as!(
        InviteGrant,
        r#"DELETE FROM invite WHERE token_hash = $1 AND expires_at > now()
           RETURNING project_id, role AS "role: MemberRole""#,
        token_hash
    )
    .fetch_optional(&mut *conn)
    .await
}
