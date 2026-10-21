use chrono::{DateTime, Utc};
use santi_types::auth::{
    ApiToken, InviteUse, LegalAcceptance, PasswordResetPreview, Session, Theme, User,
};
use sqlx::PgConnection;

use super::domain::{AGE_DECLARATION, PRIVACY_VERSION, TERMS_VERSION};
use super::extract::CurrentUser;

pub struct UserWithHash {
    pub id: i64,
    pub email: String,
    pub display_name: String,
    pub theme: Theme,
    pub time_zone: Option<String>,
    pub password_hash: String,
}

pub async fn insert_user(
    conn: &mut PgConnection,
    email: &str,
    display_name: &str,
    password_hash: &str,
) -> Result<User, sqlx::Error> {
    sqlx::query_as!(
        User,
        r#"INSERT INTO app_user (email, display_name, password_hash) VALUES ($1, $2, $3)
           RETURNING id, email, display_name, theme AS "theme: Theme", time_zone"#,
        email,
        display_name,
        password_hash
    )
    .fetch_one(&mut *conn)
    .await
}

pub async fn find_user_by_email(
    conn: &mut PgConnection,
    email: &str,
) -> Result<Option<UserWithHash>, sqlx::Error> {
    sqlx::query_as!(
        UserWithHash,
        r#"SELECT id, email, display_name, theme AS "theme: Theme", time_zone, password_hash
           FROM app_user WHERE email = $1 AND deleted_at IS NULL"#,
        email
    )
    .fetch_optional(&mut *conn)
    .await
}

pub async fn find_user(conn: &mut PgConnection, user_id: i64) -> Result<User, sqlx::Error> {
    sqlx::query_as!(
        User,
        r#"SELECT id, email, display_name, theme AS "theme: Theme", time_zone
           FROM app_user WHERE id = $1"#,
        user_id
    )
    .fetch_one(&mut *conn)
    .await
}

/// `None` leaves a field as it is; `Some(None)` clears the zone. An erased user gets `Ok(None)`.
pub async fn update_user(
    conn: &mut PgConnection,
    user_id: i64,
    display_name: Option<&str>,
    theme: Option<Theme>,
    time_zone: Option<Option<&str>>,
) -> Result<Option<User>, sqlx::Error> {
    sqlx::query_as!(
        User,
        r#"UPDATE app_user
           SET display_name = COALESCE($2, display_name), theme = COALESCE($3, theme),
               time_zone = CASE WHEN $4 THEN $5 ELSE time_zone END
           WHERE id = $1 AND deleted_at IS NULL
           RETURNING id, email, display_name, theme AS "theme: Theme", time_zone"#,
        user_id,
        display_name,
        theme as Option<Theme>,
        time_zone.is_some(),
        time_zone.flatten()
    )
    .fetch_optional(&mut *conn)
    .await
}

pub async fn insert_session(
    conn: &mut PgConnection,
    user_id: i64,
    token_hash: &[u8],
    expires_at: DateTime<Utc>,
    client: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "INSERT INTO auth_token (user_id, kind, token_hash, expires_at, client)
         VALUES ($1, 'session', $2, $3, $4)",
        user_id,
        token_hash,
        expires_at,
        client
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

pub async fn delete_expired_sessions(
    conn: &mut PgConnection,
    user_id: i64,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "DELETE FROM auth_token WHERE user_id = $1 AND expires_at < now()",
        user_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

pub async fn delete_session(conn: &mut PgConnection, token_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "DELETE FROM auth_token WHERE id = $1 AND kind = 'session'",
        token_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// D60: a session's last activity is refreshed in the same statement, at most every 10 minutes.
pub async fn find_by_token(
    conn: &mut PgConnection,
    token_hash: &[u8],
) -> Result<Option<CurrentUser>, sqlx::Error> {
    sqlx::query_as!(
        CurrentUser,
        r#"WITH found AS (
             SELECT id, user_id FROM auth_token
             WHERE token_hash = $1 AND (expires_at IS NULL OR expires_at > now())),
           touched AS (
             UPDATE auth_token t SET last_used_at = now() FROM found
             WHERE t.id = found.id AND t.kind = 'session'
               AND t.last_used_at < now() - interval '10 minutes')
           SELECT user_id AS "id!", id AS "token_id!" FROM found"#,
        token_hash
    )
    .fetch_optional(&mut *conn)
    .await
}

pub async fn insert_api_token(
    conn: &mut PgConnection,
    user_id: i64,
    name: &str,
    token_hash: &[u8],
) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!(
        "INSERT INTO auth_token (user_id, kind, name, token_hash) VALUES ($1, 'api', $2, $3) RETURNING id",
        user_id,
        name,
        token_hash
    )
    .fetch_one(&mut *conn)
    .await
}

pub async fn list_api_tokens(
    conn: &mut PgConnection,
    user_id: i64,
) -> Result<Vec<ApiToken>, sqlx::Error> {
    sqlx::query_as!(
        ApiToken,
        r#"SELECT id, name AS "name!", created_at FROM auth_token
           WHERE user_id = $1 AND kind = 'api' ORDER BY id"#,
        user_id
    )
    .fetch_all(&mut *conn)
    .await
}

/// Returns false when no API token with this id belongs to the user.
pub async fn delete_api_token(
    conn: &mut PgConnection,
    user_id: i64,
    token_id: i64,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!(
        "DELETE FROM auth_token WHERE id = $1 AND user_id = $2 AND kind = 'api'",
        token_id,
        user_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(result.rows_affected() == 1)
}

/// Replaces the account's previous reset link, if any.
pub async fn upsert_password_reset(
    conn: &mut PgConnection,
    user_id: i64,
    token_hash: &[u8],
    expires_at: DateTime<Utc>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "INSERT INTO password_reset (user_id, token_hash, expires_at) VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE
         SET token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at, created_at = now()",
        user_id,
        token_hash,
        expires_at
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

pub async fn find_password_reset(
    conn: &mut PgConnection,
    token_hash: &[u8],
) -> Result<Option<PasswordResetPreview>, sqlx::Error> {
    sqlx::query_as!(
        PasswordResetPreview,
        "SELECT u.email, r.expires_at FROM password_reset r
         JOIN app_user u ON u.id = r.user_id
         WHERE r.token_hash = $1 AND r.expires_at > now() AND u.deleted_at IS NULL",
        token_hash
    )
    .fetch_optional(&mut *conn)
    .await
}

/// Single use: deletes a live link and returns its account.
pub async fn take_password_reset(
    conn: &mut PgConnection,
    token_hash: &[u8],
) -> Result<Option<i64>, sqlx::Error> {
    sqlx::query_scalar!(
        "DELETE FROM password_reset r USING app_user u
         WHERE u.id = r.user_id AND r.token_hash = $1 AND r.expires_at > now()
           AND u.deleted_at IS NULL
         RETURNING r.user_id",
        token_hash
    )
    .fetch_optional(&mut *conn)
    .await
}

pub async fn set_password_hash(
    conn: &mut PgConnection,
    user_id: i64,
    password_hash: &str,
) -> Result<(), sqlx::Error> {
    let updated = sqlx::query!(
        "UPDATE app_user SET password_hash = $2 WHERE id = $1 AND deleted_at IS NULL",
        user_id,
        password_hash
    )
    .execute(&mut *conn)
    .await?;
    if updated.rows_affected() == 0 {
        return Err(sqlx::Error::RowNotFound);
    }
    Ok(())
}

/// Live sessions of the user, most recent activity first; `current` marks `token_id`.
pub async fn list_sessions(
    conn: &mut PgConnection,
    user_id: i64,
    token_id: i64,
) -> Result<Vec<Session>, sqlx::Error> {
    sqlx::query_as!(
        Session,
        r#"SELECT id, COALESCE(client, 'Unknown device') AS "client!", created_at, last_used_at,
                  id = $2 AS "current!"
           FROM auth_token
           WHERE user_id = $1 AND kind = 'session' AND expires_at > now()
           ORDER BY last_used_at DESC, id DESC"#,
        user_id,
        token_id
    )
    .fetch_all(&mut *conn)
    .await
}

/// Returns false when no session with this id belongs to the user.
pub async fn delete_user_session(
    conn: &mut PgConnection,
    user_id: i64,
    session_id: i64,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!(
        "DELETE FROM auth_token WHERE id = $1 AND user_id = $2 AND kind = 'session'",
        session_id,
        user_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(result.rows_affected() == 1)
}

/// Ends every session of the user but `keep`; returns how many live ones it ended. API tokens stay.
pub async fn delete_other_sessions(
    conn: &mut PgConnection,
    user_id: i64,
    keep: i64,
) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!(
        r#"WITH gone AS (
             DELETE FROM auth_token WHERE user_id = $1 AND kind = 'session' AND id <> $2
             RETURNING expires_at)
           SELECT count(*) FILTER (WHERE expires_at > now()) AS "count!" FROM gone"#,
        user_id,
        keep
    )
    .fetch_one(&mut *conn)
    .await
}

/// Signs the account out everywhere; API tokens stay.
pub async fn delete_sessions(conn: &mut PgConnection, user_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "DELETE FROM auth_token WHERE user_id = $1 AND kind = 'session'",
        user_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

pub async fn find_password_hash(
    conn: &mut PgConnection,
    user_id: i64,
) -> Result<String, sqlx::Error> {
    sqlx::query_scalar!("SELECT password_hash FROM app_user WHERE id = $1", user_id)
        .fetch_one(&mut *conn)
        .await
}

/// D60: false when the stored hash is no longer `old` (changed meanwhile).
pub async fn replace_password_hash(
    conn: &mut PgConnection,
    user_id: i64,
    old: &str,
    new: &str,
) -> Result<bool, sqlx::Error> {
    let updated = sqlx::query!(
        "UPDATE app_user SET password_hash = $3 WHERE id = $1 AND password_hash = $2",
        user_id,
        old,
        new
    )
    .execute(&mut *conn)
    .await?;
    Ok(updated.rows_affected() == 1)
}

pub async fn delete_password_resets(
    conn: &mut PgConnection,
    user_id: i64,
) -> Result<(), sqlx::Error> {
    sqlx::query!("DELETE FROM password_reset WHERE user_id = $1", user_id)
        .execute(&mut *conn)
        .await?;
    Ok(())
}

/// D45: the projects the user belongs to, locked so roles cannot change underneath the departure.
pub async fn lock_memberships(conn: &mut PgConnection, user_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "SELECT p.id FROM project p JOIN member m ON m.project_id = p.id AND m.user_id = $1
         ORDER BY p.id FOR UPDATE OF p",
        user_id
    )
    .fetch_all(&mut *conn)
    .await?;
    Ok(())
}

/// Projects no other living account belongs to go with the account (issues, sprints, comments
/// and attachments cascade); returns the storage keys of their attachments (D53).
pub async fn delete_solo_projects(
    conn: &mut PgConnection,
    user_id: i64,
) -> Result<Vec<String>, sqlx::Error> {
    sqlx::query_scalar!(
        "WITH solo AS (
           DELETE FROM project p
           WHERE p.id IN (SELECT project_id FROM member WHERE user_id = $1)
             AND NOT EXISTS (SELECT 1 FROM member o JOIN app_user u ON u.id = o.user_id
                             WHERE o.project_id = p.id AND o.user_id <> $1
                               AND u.deleted_at IS NULL)
           RETURNING p.id)
         SELECT a.storage_key FROM attachment a JOIN issue i ON i.id = a.issue_id
         WHERE i.project_id IN (SELECT id FROM solo)",
        user_id
    )
    .fetch_all(&mut *conn)
    .await
}

/// Where the user is the last living admin, the remaining living member with the oldest account
/// becomes admin.
pub async fn hand_over_admin(conn: &mut PgConnection, user_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE member m SET role = 'admin'
         FROM (SELECT DISTINCT ON (o.project_id) o.project_id, o.user_id
               FROM member mine
               JOIN member o ON o.project_id = mine.project_id AND o.user_id <> $1
               JOIN app_user living ON living.id = o.user_id AND living.deleted_at IS NULL
               WHERE mine.user_id = $1 AND mine.role = 'admin'
                 AND NOT EXISTS (SELECT 1 FROM member a JOIN app_user u ON u.id = a.user_id
                                 WHERE a.project_id = mine.project_id AND a.user_id <> $1
                                   AND a.role = 'admin' AND u.deleted_at IS NULL)
               ORDER BY o.project_id, o.user_id) heir
         WHERE m.project_id = heir.project_id AND m.user_id = heir.user_id",
        user_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// Removes the person, keeps the row: issues and comments they wrote in shared projects still
/// point at it, now named "Deleted user" with an address sign-up can never produce (no `@`).
pub async fn erase_user(conn: &mut PgConnection, user_id: i64) -> Result<(), sqlx::Error> {
    crate::notifications::repo::delete_for_user(conn, user_id).await?;
    sqlx::query!("DELETE FROM member WHERE user_id = $1", user_id)
        .execute(&mut *conn)
        .await?;
    sqlx::query!(
        "UPDATE issue SET assignee_id = NULL WHERE assignee_id = $1",
        user_id
    )
    .execute(&mut *conn)
    .await?;
    sqlx::query!(
        "WITH stars AS (DELETE FROM issue_star WHERE user_id = $1)
         DELETE FROM issue_activity WHERE user_id = $1",
        user_id
    )
    .execute(&mut *conn)
    .await?;
    sqlx::query!("DELETE FROM invite WHERE created_by = $1", user_id)
        .execute(&mut *conn)
        .await?;
    sqlx::query!("DELETE FROM invite_use WHERE user_id = $1", user_id)
        .execute(&mut *conn)
        .await?;
    // Before auth_token: waits for a reset in flight to commit, then deletes the session it made.
    delete_password_resets(conn, user_id).await?;
    sqlx::query!("DELETE FROM auth_token WHERE user_id = $1", user_id)
        .execute(&mut *conn)
        .await?;
    sqlx::query!(
        "UPDATE app_user
         SET email = 'erased:' || id, deleted_at = now(), display_name = 'Deleted user',
             password_hash = '!', time_zone = NULL, theme = 'system'
         WHERE id = $1",
        user_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// D45: records the current Terms of Use, Privacy Policy and the age declaration in one statement.
pub async fn insert_acceptances(
    conn: &mut PgConnection,
    user_id: i64,
    terms_hash: Option<&str>,
    privacy_hash: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "INSERT INTO legal_acceptance (user_id, document, version, text_hash)
         VALUES ($1, 'terms', $2, $3), ($1, 'privacy', $4, $5), ($1, 'age', $6, NULL)",
        user_id,
        TERMS_VERSION,
        terms_hash,
        PRIVACY_VERSION,
        privacy_hash,
        AGE_DECLARATION
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

pub async fn has_current_acceptance(
    conn: &mut PgConnection,
    user_id: i64,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT count(DISTINCT document) = 2 AS "current!" FROM legal_acceptance
           WHERE user_id = $1
             AND ((document = 'terms' AND version = $2) OR (document = 'privacy' AND version = $3))"#,
        user_id,
        TERMS_VERSION,
        PRIVACY_VERSION
    )
    .fetch_one(&mut *conn)
    .await
}

pub async fn list_invite_uses(
    conn: &mut PgConnection,
    user_id: i64,
) -> Result<Vec<InviteUse>, sqlx::Error> {
    sqlx::query_as!(
        InviteUse,
        "SELECT p.key AS project_key, u.used_at AS joined_at
         FROM invite_use u
         JOIN invite i ON i.id = u.invite_id
         JOIN project p ON p.id = i.project_id
         WHERE u.user_id = $1 ORDER BY u.used_at",
        user_id
    )
    .fetch_all(&mut *conn)
    .await
}

pub async fn list_acceptances(
    conn: &mut PgConnection,
    user_id: i64,
) -> Result<Vec<LegalAcceptance>, sqlx::Error> {
    sqlx::query_as!(
        LegalAcceptance,
        "SELECT document, version, text_hash, accepted_at FROM legal_acceptance
         WHERE user_id = $1 ORDER BY id",
        user_id
    )
    .fetch_all(&mut *conn)
    .await
}
