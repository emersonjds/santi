use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::http::header::SET_COOKIE;
use axum::response::IntoResponse;
use santi_types::Problem;
use santi_types::auth::{ApiToken, CreateToken, CreatedToken, Login, Register, User};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::extract::CurrentUser;
use super::{domain, service};
use crate::AppState;
use crate::error::AppError;
use crate::extract::{JsonBody, PathParams};

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(register))
        .routes(routes!(login))
        .routes(routes!(logout))
        .routes(routes!(me))
        .routes(routes!(create_token, list_tokens))
        .routes(routes!(delete_token))
}

#[utoipa::path(post, path = "/api/auth/register", tag = "auth", request_body = Register,
    responses(
        (status = 201, body = User, description = "Signed up and signed in; sets the session cookie"),
        (status = 409, body = Problem, content_type = "application/problem+json"),
        (status = 422, body = Problem, content_type = "application/problem+json")))]
pub async fn register(
    State(state): State<AppState>,
    JsonBody(input): JsonBody<Register>,
) -> Result<impl IntoResponse, AppError> {
    let (user, session) = service::register(&state.pool, input).await?;
    Ok((
        StatusCode::CREATED,
        [(SET_COOKIE, domain::session_cookie(&session))],
        Json(user),
    ))
}

#[utoipa::path(post, path = "/api/auth/login", tag = "auth", request_body = Login,
    responses(
        (status = 200, body = User, description = "Signed in; sets the session cookie"),
        (status = 401, body = Problem, content_type = "application/problem+json")))]
pub async fn login(
    State(state): State<AppState>,
    JsonBody(input): JsonBody<Login>,
) -> Result<impl IntoResponse, AppError> {
    let (user, session) = service::login(&state.pool, input).await?;
    Ok(([(SET_COOKIE, domain::session_cookie(&session))], Json(user)))
}

#[utoipa::path(post, path = "/api/auth/logout", tag = "auth",
    responses(
        (status = 204, description = "Session revoked; cookie cleared"),
        (status = 401, body = Problem, content_type = "application/problem+json")))]
pub async fn logout(
    State(state): State<AppState>,
    user: CurrentUser,
) -> Result<impl IntoResponse, AppError> {
    service::logout(&state.pool, &user).await?;
    Ok((
        StatusCode::NO_CONTENT,
        [(SET_COOKIE, domain::expired_session_cookie())],
    ))
}

#[utoipa::path(get, path = "/api/me", tag = "auth",
    responses(
        (status = 200, body = User),
        (status = 401, body = Problem, content_type = "application/problem+json")))]
pub async fn me(State(state): State<AppState>, user: CurrentUser) -> Result<Json<User>, AppError> {
    Ok(Json(service::me(&state.pool, &user).await?))
}

#[utoipa::path(post, path = "/api/tokens", tag = "auth", request_body = CreateToken,
    responses(
        (status = 201, body = CreatedToken, description = "The token is shown only in this response"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 422, body = Problem, content_type = "application/problem+json")))]
pub async fn create_token(
    State(state): State<AppState>,
    user: CurrentUser,
    JsonBody(input): JsonBody<CreateToken>,
) -> Result<(StatusCode, Json<CreatedToken>), AppError> {
    let created = service::create_token(&state.pool, &user, input).await?;
    Ok((StatusCode::CREATED, Json(created)))
}

#[utoipa::path(get, path = "/api/tokens", tag = "auth",
    responses(
        (status = 200, body = Vec<ApiToken>),
        (status = 401, body = Problem, content_type = "application/problem+json")))]
pub async fn list_tokens(
    State(state): State<AppState>,
    user: CurrentUser,
) -> Result<Json<Vec<ApiToken>>, AppError> {
    Ok(Json(service::list_tokens(&state.pool, &user).await?))
}

#[utoipa::path(delete, path = "/api/tokens/{id}", tag = "auth",
    params(("id" = i64, Path, description = "Token id")),
    responses(
        (status = 204, description = "Token revoked"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json")))]
pub async fn delete_token(
    State(state): State<AppState>,
    user: CurrentUser,
    PathParams(token_id): PathParams<i64>,
) -> Result<StatusCode, AppError> {
    service::delete_token(&state.pool, &user, token_id).await?;
    Ok(StatusCode::NO_CONTENT)
}
