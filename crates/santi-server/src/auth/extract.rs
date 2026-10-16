use axum::extract::{FromRequestParts, Request};
use axum::http::request::Parts;
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

use super::{domain, repo};
use crate::AppState;
use crate::error::AppError;

/// The signed-in caller, from a Bearer API token or the session cookie (D22, D23).
#[derive(Debug, Clone)]
pub struct CurrentUser {
    pub id: i64,
    pub token_id: i64,
}

impl FromRequestParts<AppState> for CurrentUser {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, AppError> {
        let token = domain::token_from_headers(&parts.headers).ok_or(AppError::Unauthorized)?;
        let mut conn = state.pool.acquire().await?;
        let user = repo::find_by_token(&mut conn, &domain::hash_token(token)).await?;
        user.ok_or(AppError::Unauthorized)
    }
}

/// Middleware: answers 403 to cross-site browser writes before any handler runs (D22).
pub async fn reject_cross_site_writes(request: Request, next: Next) -> Response {
    if domain::is_cross_site_write(request.method(), request.headers()) {
        return AppError::Forbidden.into_response();
    }
    next.run(request).await
}
