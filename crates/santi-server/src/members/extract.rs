use axum::extract::{FromRequestParts, RawPathParams};
use axum::http::request::Parts;

use super::{Member, repo};
use crate::AppState;
use crate::auth::extract::CurrentUser;
use crate::error::AppError;

/// D28: loads the project from `{key}` and the caller's membership in one query; strangers get 404.
impl FromRequestParts<AppState> for Member {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, AppError> {
        let user = CurrentUser::from_request_parts(parts, state).await?;
        let params = RawPathParams::from_request_parts(parts, state)
            .await
            .map_err(|_| AppError::NotFound)?;
        let key = params
            .iter()
            .find(|(name, _)| *name == "key")
            .map(|(_, value)| value.to_string());
        let key = key.ok_or(AppError::NotFound)?;
        let mut conn = state.pool.acquire().await?;
        let member = repo::find_member(&mut conn, &key, user.id).await?;
        member.ok_or(AppError::NotFound)
    }
}
