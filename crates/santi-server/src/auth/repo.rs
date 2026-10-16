use chrono::{DateTime, Utc};
use santi_types::auth::{ApiToken, User};
use sqlx::PgConnection;

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
        "SELECT id, email, display_name, password_hash FROM app_user WHERE email = $1",
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
