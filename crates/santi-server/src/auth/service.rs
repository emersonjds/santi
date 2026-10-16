use chrono::{Duration, Utc};
use santi_types::auth::{ApiToken, CreateToken, CreatedToken, Login, Register, User};
use sqlx::{PgConnection, PgPool};

use super::extract::CurrentUser;
use super::{domain, repo};
use crate::error::AppError;

/// Creates the user and signs them in; returns the user and the session token.
pub async fn register(pool: &PgPool, input: Register) -> Result<(User, String), AppError> {
    let email = domain::normalize_email(&input.email)?;
    let display_name = domain::check_display_name(&input.display_name)?;
    domain::check_password(&input.password)?;
    let password_hash = hash_in_background(input.password).await?;
    let mut tx = pool.begin().await?;
    let user = repo::insert_user(&mut tx, &email, &display_name, &password_hash).await?;
    let session = start_session(&mut tx, user.id).await?;
    tx.commit().await?;
    Ok((user, session))
}

/// Unknown email and wrong password give the same error after the same argon2 work.
pub async fn login(pool: &PgPool, input: Login) -> Result<(User, String), AppError> {
    let email = input.email.trim().to_lowercase();
    let mut conn = pool.acquire().await?;
    let found = repo::find_user_by_email(&mut conn, &email).await?;
    let stored_hash = found
        .as_ref()
        .map_or_else(domain::dummy_password_hash, |user| {
            user.password_hash.clone()
        });
    let password_matches = verify_in_background(input.password, stored_hash).await?;
    let Some(user) = found.filter(|_| password_matches) else {
        return Err(AppError::Unauthorized);
    };
    repo::delete_expired_sessions(&mut conn, user.id).await?;
    let session = start_session(&mut conn, user.id).await?;
    let user = User {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
    };
    Ok((user, session))
}

/// Revokes the session that made the request; other devices stay signed in.
pub async fn logout(pool: &PgPool, user: &CurrentUser) -> Result<(), AppError> {
    let mut conn = pool.acquire().await?;
    repo::delete_session(&mut conn, user.token_id).await?;
    Ok(())
}

pub async fn me(pool: &PgPool, user: &CurrentUser) -> Result<User, AppError> {
    let mut conn = pool.acquire().await?;
    Ok(repo::find_user(&mut conn, user.id).await?)
}

pub async fn create_token(
    pool: &PgPool,
    user: &CurrentUser,
    input: CreateToken,
) -> Result<CreatedToken, AppError> {
    let name = input.name.trim().to_string();
    if name.is_empty() || name.chars().count() > 100 {
        return Err(AppError::invalid("name", "must have 1 to 100 characters"));
    }
    let token = domain::new_api_token();
    let mut conn = pool.acquire().await?;
    let id = repo::insert_api_token(&mut conn, user.id, &name, &domain::hash_token(&token)).await?;
    Ok(CreatedToken { id, name, token })
}

pub async fn list_tokens(pool: &PgPool, user: &CurrentUser) -> Result<Vec<ApiToken>, AppError> {
    let mut conn = pool.acquire().await?;
    Ok(repo::list_api_tokens(&mut conn, user.id).await?)
}

pub async fn delete_token(
    pool: &PgPool,
    user: &CurrentUser,
    token_id: i64,
) -> Result<(), AppError> {
    let mut conn = pool.acquire().await?;
    let deleted = repo::delete_api_token(&mut conn, user.id, token_id).await?;
    if !deleted {
        return Err(AppError::NotFound);
    }
    Ok(())
}

async fn start_session(conn: &mut PgConnection, user_id: i64) -> Result<String, AppError> {
    let token = domain::new_secret();
    let expires_at = Utc::now() + Duration::days(domain::SESSION_DAYS);
    repo::insert_session(conn, user_id, &domain::hash_token(&token), expires_at).await?;
    Ok(token)
}

/// argon2 takes tens of milliseconds of CPU; keep it off the async workers.
async fn hash_in_background(password: String) -> Result<String, AppError> {
    tokio::task::spawn_blocking(move || domain::hash_password(&password))
        .await
        .map_err(|error| AppError::Internal(error.to_string()))?
}

async fn verify_in_background(password: String, stored_hash: String) -> Result<bool, AppError> {
    tokio::task::spawn_blocking(move || domain::verify_password(&password, &stored_hash))
        .await
        .map_err(|error| AppError::Internal(error.to_string()))
}
