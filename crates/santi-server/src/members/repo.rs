use std::collections::HashMap;

use chrono::{DateTime, Utc};
use santi_types::projects::{
    BoardType, InviteInfo, InviteJoiner, InvitePreview, MemberInfo, MemberRole,
};
use sqlx::PgConnection;

use super::Member;

pub struct InviteGrant {
    pub id: i64,
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
    max_uses: i32,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "INSERT INTO invite (project_id, role, token_hash, created_by, expires_at, max_uses)
         VALUES ($1, $2, $3, $4, $5, $6)",
        project_id,
        role as MemberRole,
        token_hash,
        created_by,
        expires_at,
        max_uses
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// Locks a live invite into an active project until the transaction ends and returns its grant.
/// Expiry is checked against the clock, not the transaction start, so a revoke that commits
/// while the accept is open still stops it.
pub async fn take_invite(
    conn: &mut PgConnection,
    token_hash: &[u8],
) -> Result<Option<InviteGrant>, sqlx::Error> {
    sqlx::query_as!(
        InviteGrant,
        r#"SELECT i.id, i.project_id, i.role AS "role: MemberRole"
           FROM invite i
           JOIN project p ON p.id = i.project_id
           WHERE p.archived_at IS NULL AND p.trashed_at IS NULL
             AND i.token_hash = $1 AND i.used_at IS NULL AND i.expires_at > clock_timestamp()
           FOR UPDATE OF i"#,
        token_hash
    )
    .fetch_optional(&mut *conn)
    .await
}

/// Records the user's spot and marks the invite used once its last spot is taken.
pub async fn record_invite_use(
    conn: &mut PgConnection,
    invite_id: i64,
    user_id: i64,
) -> Result<(), sqlx::Error> {
    // The count runs on the statement's snapshot, which does not hold the row inserted here.
    sqlx::query!(
        "WITH spot AS (INSERT INTO invite_use (invite_id, user_id) VALUES ($1, $2))
         UPDATE invite SET used_at = now()
         WHERE id = $1 AND max_uses <= 1 + (SELECT count(*) FROM invite_use WHERE invite_id = $1)",
        invite_id,
        user_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
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
                  i.expires_at, u.display_name AS inviter_name, i.used_at, i.max_uses,
                  i.max_uses - (SELECT count(*) FROM invite_use WHERE invite_id = i.id)::int
                      AS "spots_left!",
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
            max_uses: row.max_uses,
            spots_left: row.spots_left,
        },
        used_at: row.used_at,
        archived: row.archived,
    }))
}

/// Live invites (not full, not expired) newest first, each with who joined with it.
pub async fn list_live_invites(
    conn: &mut PgConnection,
    project_id: i64,
) -> Result<Vec<InviteInfo>, sqlx::Error> {
    let rows = sqlx::query!(
        r#"SELECT i.id, i.role AS "role: MemberRole", i.max_uses, i.created_at, i.expires_at,
                  u.display_name AS created_by_name,
                  (SELECT count(*) FROM invite_use WHERE invite_id = i.id)::int AS "uses!"
           FROM invite i JOIN app_user u ON u.id = i.created_by
           WHERE i.project_id = $1 AND i.used_at IS NULL AND i.expires_at > now()
           ORDER BY i.id DESC"#,
        project_id
    )
    .fetch_all(&mut *conn)
    .await?;
    let ids: Vec<i64> = rows.iter().map(|row| row.id).collect();
    let joiners = sqlx::query!(
        r#"SELECT iu.invite_id, u.id AS user_id, u.display_name AS name, u.email,
                  iu.used_at AS joined_at
           FROM invite_use iu JOIN app_user u ON u.id = iu.user_id
           WHERE iu.invite_id = ANY($1)
           ORDER BY iu.invite_id, iu.used_at, u.id"#,
        &ids
    )
    .fetch_all(&mut *conn)
    .await?;
    let mut joined: HashMap<i64, Vec<InviteJoiner>> = HashMap::new();
    for joiner in joiners {
        joined
            .entry(joiner.invite_id)
            .or_default()
            .push(InviteJoiner {
                user_id: joiner.user_id,
                name: joiner.name,
                email: joiner.email,
                joined_at: joiner.joined_at,
            });
    }
    Ok(rows
        .into_iter()
        .map(|row| InviteInfo {
            id: row.id,
            role: row.role,
            max_uses: row.max_uses,
            uses: row.uses,
            created_by_name: row.created_by_name,
            created_at: row.created_at,
            expires_at: row.expires_at,
            joined: joined.remove(&row.id).unwrap_or_default(),
        })
        .collect())
}

/// Ends a live invite of the project now; false when there is none with this id.
pub async fn revoke_invite(
    conn: &mut PgConnection,
    project_id: i64,
    invite_id: i64,
) -> Result<bool, sqlx::Error> {
    let done = sqlx::query!(
        "UPDATE invite SET expires_at = now()
         WHERE id = $1 AND project_id = $2 AND used_at IS NULL AND expires_at > now()",
        invite_id,
        project_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(done.rows_affected() == 1)
}
