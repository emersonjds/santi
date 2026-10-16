use axum::extract::{FromRequestParts, RawPathParams};
use axum::http::request::Parts;

use super::{Member, repo};
use crate::AppState;
use crate::auth::domain::{hash_token, token_from_headers};
use crate::error::AppError;

/// D28: loads the caller's membership in the project from `{key}`; strangers get 404.
impl FromRequestParts<AppState> for Member {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, AppError> {
        let token = token_from_headers(&parts.headers).ok_or(AppError::Unauthorized)?;
        let token_hash = hash_token(token);
        let params = RawPathParams::from_request_parts(parts, state)
            .await
            .map_err(|_| AppError::NotFound)?;
        let key = params
            .iter()
            .find(|(name, _)| *name == "key")
            .map(|(_, value)| value.to_string());
        let key = key.ok_or(AppError::NotFound)?;
        let mut conn = state.pool.acquire().await?;
        let found = repo::find_member_by_token(&mut conn, &key, &token_hash).await?;
        found
            .ok_or(AppError::Unauthorized)?
            .ok_or(AppError::NotFound)
    }
}
