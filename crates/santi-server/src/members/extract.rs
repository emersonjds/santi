use axum::extract::{FromRequestParts, MatchedPath, RawPathParams};
use axum::http::request::Parts;

use super::{Member, domain, repo};
use crate::AppState;
use crate::auth::domain::{hash_token, token_from_headers};
use crate::error::AppError;

/// D28: loads the caller's membership in the project from `{key}`; strangers get 404, and so
/// does everyone for a trashed project. Writes to an archived project get 409 (SAN-70).
impl FromRequestParts<AppState> for Member {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, AppError> {
        let token = token_from_headers(&parts.headers).ok_or(AppError::Unauthorized)?;
        let token_hash = hash_token(token);
        let params = RawPathParams::from_request_parts(parts, state)
            .await
            .map_err(|_| AppError::NotFound)?;
        let param = |wanted: &str| {
            params
                .iter()
                .find(|(name, _)| *name == wanted)
                .map(|(_, value)| value.to_string())
        };
        let key = param("key").ok_or(AppError::NotFound)?;
        let mut conn = state.pool.acquire().await?;
        let found = repo::find_member_by_token(&mut conn, &key, &token_hash).await?;
        let member = found
            .ok_or(AppError::Unauthorized)?
            .ok_or(AppError::NotFound)?;
        let route = parts
            .extensions
            .get::<MatchedPath>()
            .map_or("", MatchedPath::as_str);
        let target_user = param("user_id").and_then(|id| id.parse().ok());
        domain::check_writable(&member, &parts.method, route, target_user)?;
        Ok(member)
    }
}
