use axum::Json;
use axum::extract::State;
use axum::http::header::{SET_COOKIE, USER_AGENT};
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use santi_types::Problem;
use santi_types::auth::{
    AcceptLegal, AccountExport, ApiToken, ChangePassword, CreateToken, CreatedToken, DeleteAccount,
    LegalDocuments, LegalStatus, Login, PasswordResetPreview, Register, ResetPassword, Session,
    SignedOut, UpdateMe, User,
};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::extract::CurrentUser;
use super::{domain, service};
use crate::AppState;
use crate::error::AppError;
use crate::extract::{JsonBody, PathParams};
use crate::rate_limit::{Action, ClientIp};

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(register))
        .routes(routes!(login))
        .routes(routes!(logout))
        .routes(routes!(me, update_me, delete_account))
        .routes(routes!(export_account))
        .routes(routes!(legal_documents))
        .routes(routes!(legal_status, accept_legal))
        .routes(routes!(create_token, list_tokens))
        .routes(routes!(delete_token))
        .routes(routes!(preview_password_reset, reset_password))
        .routes(routes!(change_password))
        .routes(routes!(list_sessions, delete_other_sessions))
        .routes(routes!(delete_session))
}

fn user_agent(headers: &HeaderMap) -> Option<&str> {
    headers.get(USER_AGENT)?.to_str().ok()
}

#[utoipa::path(post, path = "/api/auth/register", tag = "auth", request_body = Register,
    responses(
        (status = 201, body = User, description = "Signed up and signed in; sets the session cookie"),
        (status = 409, body = Problem, content_type = "application/problem+json"),
        (status = 422, body = Problem, content_type = "application/problem+json"),
        (status = 429, body = Problem, content_type = "application/problem+json", description = "Rate limited (D44); wait `Retry-After` seconds")))]
pub async fn register(
    State(state): State<AppState>,
    ClientIp(address): ClientIp,
    headers: HeaderMap,
    JsonBody(input): JsonBody<Register>,
) -> Result<impl IntoResponse, AppError> {
    state.limits.check(Action::Register, address, None)?;
    let (user, session) =
        service::register(&state.pool, &state.legal, input, user_agent(&headers)).await?;
    Ok((
        StatusCode::CREATED,
        [(SET_COOKIE, domain::session_cookie(&session))],
        Json(user),
    ))
}

#[utoipa::path(post, path = "/api/auth/login", tag = "auth", request_body = Login,
    responses(
        (status = 200, body = User, description = "Signed in; sets the session cookie"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 422, body = Problem, content_type = "application/problem+json"),
        (status = 429, body = Problem, content_type = "application/problem+json", description = "Rate limited (D44); wait `Retry-After` seconds")))]
pub async fn login(
    State(state): State<AppState>,
    ClientIp(address): ClientIp,
    headers: HeaderMap,
    JsonBody(input): JsonBody<Login>,
) -> Result<impl IntoResponse, AppError> {
    state.limits.check(Action::Login, address, None)?;
    let key = state.limits.login_attempt(&input.email, address)?;
    let (user, session) = service::login(&state.pool, input, user_agent(&headers)).await?;
    state.limits.login_succeeded(&key);
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

#[utoipa::path(patch, path = "/api/me", tag = "auth", request_body = UpdateMe,
    responses(
        (status = 200, body = User, description = "The account after the change; absent fields stay as they are"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "Blank or over 100 characters (`display_name`), unknown theme (`theme`) or a zone outside the IANA database (`time_zone`)")))]
pub async fn update_me(
    State(state): State<AppState>,
    user: CurrentUser,
    JsonBody(input): JsonBody<UpdateMe>,
) -> Result<Json<User>, AppError> {
    Ok(Json(service::update_me(&state.pool, &user, input).await?))
}

#[utoipa::path(get, path = "/api/legal", tag = "auth",
    responses((status = 200, body = LegalDocuments, description = "Current versions of the Terms of Use and Privacy Policy, and whether sign-up must accept them (D45)")))]
pub async fn legal_documents(State(state): State<AppState>) -> Json<LegalDocuments> {
    Json(service::legal_documents(&state.legal))
}

#[utoipa::path(get, path = "/api/me/legal", tag = "auth",
    responses(
        (status = 200, body = LegalStatus, description = "`accepted` is false until the caller accepts the current versions"),
        (status = 401, body = Problem, content_type = "application/problem+json")))]
pub async fn legal_status(
    State(state): State<AppState>,
    user: CurrentUser,
) -> Result<Json<LegalStatus>, AppError> {
    Ok(Json(
        service::legal_status(&state.pool, &state.legal, &user).await?,
    ))
}

#[utoipa::path(post, path = "/api/me/legal", tag = "auth", request_body = AcceptLegal,
    responses(
        (status = 200, body = LegalStatus, description = "Accepted; recorded in the append-only acceptance log unless the current versions were already accepted or are not required"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "`accept_terms` or `confirm_age` not true"),
        (status = 429, body = Problem, content_type = "application/problem+json", description = "Rate limited per account (D44); wait `Retry-After` seconds")))]
pub async fn accept_legal(
    State(state): State<AppState>,
    user: CurrentUser,
    JsonBody(input): JsonBody<AcceptLegal>,
) -> Result<Json<LegalStatus>, AppError> {
    state
        .limits
        .check(Action::AcceptLegal, None, Some(user.id))?;
    Ok(Json(
        service::accept_legal(&state.pool, &state.legal, &user, input).await?,
    ))
}

#[utoipa::path(get, path = "/api/me/export", tag = "auth",
    responses(
        (status = 200, body = AccountExport, description = "The account, its token names and every project the caller administers, in full (D45)"),
        (status = 401, body = Problem, content_type = "application/problem+json")))]
pub async fn export_account(
    State(state): State<AppState>,
    user: CurrentUser,
) -> Result<Json<AccountExport>, AppError> {
    Ok(Json(service::export_account(&state.pool, &user).await?))
}

#[utoipa::path(delete, path = "/api/me", tag = "auth", request_body = DeleteAccount,
    responses(
        (status = 204, description = "Account deleted and signed out everywhere. Projects only the caller used are deleted; where the caller was the last admin, the member with the oldest account becomes admin; issues and comments in shared projects stay under \"Deleted user\" (D45)"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "Wrong password (`password`)"),
        (status = 429, body = Problem, content_type = "application/problem+json", description = "Too many password attempts for this account (D44); wait `Retry-After` seconds")))]
pub async fn delete_account(
    State(state): State<AppState>,
    user: CurrentUser,
    JsonBody(input): JsonBody<DeleteAccount>,
) -> Result<impl IntoResponse, AppError> {
    state
        .limits
        .check(Action::Reauthenticate, None, Some(user.id))?;
    service::delete_account(&state.pool, &state.storage, &user, input).await?;
    Ok((
        StatusCode::NO_CONTENT,
        [(SET_COOKIE, domain::expired_session_cookie())],
    ))
}

#[utoipa::path(post, path = "/api/tokens", tag = "auth", request_body = CreateToken,
    responses(
        (status = 201, body = CreatedToken, description = "The token is shown only in this response"),
        (status = 409, body = Problem, content_type = "application/problem+json", description = "`terms-not-accepted`: accept the current Terms of Use and Privacy Policy first (`POST /api/me/legal`). Tokens created before keep working (D45)"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 422, body = Problem, content_type = "application/problem+json"),
        (status = 429, body = Problem, content_type = "application/problem+json", description = "Rate limited (D44); wait `Retry-After` seconds")))]
pub async fn create_token(
    State(state): State<AppState>,
    ClientIp(address): ClientIp,
    user: CurrentUser,
    JsonBody(input): JsonBody<CreateToken>,
) -> Result<(StatusCode, Json<CreatedToken>), AppError> {
    state.limits.check(Action::Token, address, Some(user.id))?;
    service::require_current_acceptance(&state.pool, &state.legal, &user).await?;
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

#[utoipa::path(get, path = "/api/password-resets/{token}", tag = "auth",
    params(("token" = String, Path, description = "Reset token from the link the server operator generated")),
    responses(
        (status = 200, body = PasswordResetPreview, description = "The account a live link resets"),
        (status = 404, body = Problem, content_type = "application/problem+json", description = "Unknown, used or expired link"),
        (status = 429, body = Problem, content_type = "application/problem+json", description = "Rate limited (D44); wait `Retry-After` seconds")))]
pub async fn preview_password_reset(
    State(state): State<AppState>,
    ClientIp(address): ClientIp,
    PathParams(token): PathParams<String>,
) -> Result<Json<PasswordResetPreview>, AppError> {
    state.limits.check(Action::PasswordReset, address, None)?;
    Ok(Json(
        service::preview_password_reset(&state.pool, &token).await?,
    ))
}

#[utoipa::path(post, path = "/api/password-resets/{token}", tag = "auth", request_body = ResetPassword,
    params(("token" = String, Path, description = "Reset token from the link the server operator generated")),
    responses(
        (status = 200, body = User, description = "Password replaced; every other session ended; signed in and sets the session cookie. API tokens stay"),
        (status = 404, body = Problem, content_type = "application/problem+json", description = "Unknown, used or expired link"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "Password breaks the rules (`password`)"),
        (status = 429, body = Problem, content_type = "application/problem+json", description = "Rate limited (D44); wait `Retry-After` seconds")))]
pub async fn reset_password(
    State(state): State<AppState>,
    ClientIp(address): ClientIp,
    PathParams(token): PathParams<String>,
    headers: HeaderMap,
    JsonBody(input): JsonBody<ResetPassword>,
) -> Result<impl IntoResponse, AppError> {
    state.limits.check(Action::PasswordReset, address, None)?;
    let (user, session) =
        service::reset_password(&state.pool, &token, input, user_agent(&headers)).await?;
    Ok(([(SET_COOKIE, domain::session_cookie(&session))], Json(user)))
}

#[utoipa::path(post, path = "/api/me/password", tag = "auth", request_body = ChangePassword,
    responses(
        (status = 200, body = SignedOut, description = "Password changed; every other session ended (all of them for an API token caller). API tokens stay (D60)"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "Wrong current password (`current`); new one breaks the rules or equals the current one (`new`)"),
        (status = 429, body = Problem, content_type = "application/problem+json", description = "Too many password attempts for this account or address (D44); wait `Retry-After` seconds")))]
pub async fn change_password(
    State(state): State<AppState>,
    ClientIp(address): ClientIp,
    user: CurrentUser,
    JsonBody(input): JsonBody<ChangePassword>,
) -> Result<Json<SignedOut>, AppError> {
    state
        .limits
        .check(Action::Reauthenticate, address, Some(user.id))?;
    Ok(Json(
        service::change_password(&state.pool, &user, input).await?,
    ))
}

#[utoipa::path(get, path = "/api/me/sessions", tag = "auth",
    responses(
        (status = 200, body = Vec<Session>, description = "Live sessions, most recent activity first; `current` marks the caller's (D60)"),
        (status = 401, body = Problem, content_type = "application/problem+json")))]
pub async fn list_sessions(
    State(state): State<AppState>,
    user: CurrentUser,
) -> Result<Json<Vec<Session>>, AppError> {
    Ok(Json(service::list_sessions(&state.pool, &user).await?))
}

#[utoipa::path(delete, path = "/api/me/sessions", tag = "auth",
    responses(
        (status = 200, body = SignedOut, description = "Every session but the caller's ended; API tokens stay"),
        (status = 401, body = Problem, content_type = "application/problem+json")))]
pub async fn delete_other_sessions(
    State(state): State<AppState>,
    user: CurrentUser,
) -> Result<Json<SignedOut>, AppError> {
    Ok(Json(
        service::delete_other_sessions(&state.pool, &user).await?,
    ))
}

#[utoipa::path(delete, path = "/api/me/sessions/{id}", tag = "auth",
    params(("id" = i64, Path, description = "Session id")),
    responses(
        (status = 204, description = "Session ended"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json", description = "No session of the caller with this id"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "The caller's own session (`id`): sign out with `POST /api/auth/logout`")))]
pub async fn delete_session(
    State(state): State<AppState>,
    user: CurrentUser,
    PathParams(session_id): PathParams<i64>,
) -> Result<StatusCode, AppError> {
    service::delete_session(&state.pool, &user, session_id).await?;
    Ok(StatusCode::NO_CONTENT)
}
