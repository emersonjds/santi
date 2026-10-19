use chrono::{DateTime, Utc};
use santi_types::auth::{ApiToken, LegalAcceptance, PasswordResetPreview, User};
use sqlx::PgConnection;

use super::domain::{AGE_DECLARATION, PRIVACY_VERSION, TERMS_VERSION};
use super::extract::CurrentUser;

pub struct UserWithHash {
    pub id: i64,
    pub email: String,
    pub display_name: String,
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
        "INSERT INTO app_user (email, display_name, password_hash) VALUES ($1, $2, $3)
         RETURNING id, email, display_name",
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
        "SELECT id, email, display_name, password_hash FROM app_user
         WHERE email = $1 AND deleted_at IS NULL",
        email
    )
    .fetch_optional(&mut *conn)
    .await
}

pub async fn find_user(conn: &mut PgConnection, user_id: i64) -> Result<User, sqlx::Error> {
    sqlx::query_as!(
        User,
        "SELECT id, email, display_name FROM app_user WHERE id = $1",
        user_id
    )
    .fetch_one(&mut *conn)
    .await
}

pub async fn insert_session(
    conn: &mut PgConnection,
    user_id: i64,
    token_hash: &[u8],
    expires_at: DateTime<Utc>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "INSERT INTO auth_token (user_id, kind, token_hash, expires_at) VALUES ($1, 'session', $2, $3)",
        user_id,
        token_hash,
        expires_at
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

pub async fn find_by_token(
    conn: &mut PgConnection,
    token_hash: &[u8],
) -> Result<Option<CurrentUser>, sqlx::Error> {
    sqlx::query_as!(
        CurrentUser,
        "SELECT user_id AS id, id AS token_id FROM auth_token
         WHERE token_hash = $1 AND (expires_at IS NULL OR expires_at > now())",
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

/// Projects no other living account belongs to go with the account (issues, sprints and comments cascade).
pub async fn delete_solo_projects(
    conn: &mut PgConnection,
    user_id: i64,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "DELETE FROM project p
         WHERE p.id IN (SELECT project_id FROM member WHERE user_id = $1)
           AND NOT EXISTS (SELECT 1 FROM member o JOIN app_user u ON u.id = o.user_id
                           WHERE o.project_id = p.id AND o.user_id <> $1
                             AND u.deleted_at IS NULL)",
        user_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
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
    // Before auth_token: waits for a reset in flight to commit, then deletes the session it made.
    sqlx::query!("DELETE FROM password_reset WHERE user_id = $1", user_id)
        .execute(&mut *conn)
        .await?;
    sqlx::query!("DELETE FROM auth_token WHERE user_id = $1", user_id)
        .execute(&mut *conn)
        .await?;
    sqlx::query!(
        "UPDATE app_user
         SET email = 'erased:' || id, deleted_at = now(), display_name = 'Deleted user',
             password_hash = '!'
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
