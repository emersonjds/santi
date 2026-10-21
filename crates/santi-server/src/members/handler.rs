use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use santi_types::Problem;
use santi_types::projects::{
    CreateInvite, Invite, InviteInfo, InvitePreview, MemberInfo, Project, SetRole,
};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::{Member, service};
use crate::AppState;
use crate::auth::extract::CurrentUser;
use crate::error::AppError;
use crate::extract::{JsonBody, PathParams};
use crate::rate_limit::{Action, ClientIp};

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(list_members))
        .routes(routes!(set_role, remove_member))
        .routes(routes!(list_invites, create_invite))
        .routes(routes!(revoke_invite))
        .routes(routes!(preview_invite))
        .routes(routes!(accept_invite))
}

#[utoipa::path(get, path = "/api/projects/{key}/members", tag = "members",
    params(("key" = String, Path, description = "Project key")),
    responses(
        (status = 200, body = Vec<MemberInfo>),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json")))]
pub async fn list_members(
    State(state): State<AppState>,
    member: Member,
) -> Result<Json<Vec<MemberInfo>>, AppError> {
    Ok(Json(service::list_members(&state.pool, &member).await?))
}

#[utoipa::path(put, path = "/api/projects/{key}/members/{user_id}", tag = "members", request_body = SetRole,
    params(
        ("key" = String, Path, description = "Project key"),
        ("user_id" = i64, Path, description = "Member's user id")),
    responses(
        (status = 200, body = MemberInfo),
        (status = 403, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json"),
        (status = 409, body = Problem, content_type = "application/problem+json", description = "`last-admin`"),
        (status = 422, body = Problem, content_type = "application/problem+json")))]
pub async fn set_role(
    State(state): State<AppState>,
    member: Member,
    PathParams((_key, user_id)): PathParams<(String, i64)>,
    JsonBody(input): JsonBody<SetRole>,
) -> Result<Json<MemberInfo>, AppError> {
    Ok(Json(
        service::set_role(&state.pool, &member, user_id, input).await?,
    ))
}

#[utoipa::path(delete, path = "/api/projects/{key}/members/{user_id}", tag = "members",
    params(
        ("key" = String, Path, description = "Project key"),
        ("user_id" = i64, Path, description = "Member's user id")),
    responses(
        (status = 204, description = "Removed"),
        (status = 403, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json"),
        (status = 409, body = Problem, content_type = "application/problem+json", description = "`last-admin`")))]
pub async fn remove_member(
    State(state): State<AppState>,
    member: Member,
    PathParams((_key, user_id)): PathParams<(String, i64)>,
) -> Result<StatusCode, AppError> {
    service::remove_member(&state.pool, &member, user_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(post, path = "/api/projects/{key}/invites", tag = "members", request_body = CreateInvite,
    params(("key" = String, Path, description = "Project key")),
    responses(
        (status = 201, body = Invite, description = "The token is shown only in this response; valid 7 days"),
        (status = 403, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "`max_uses` outside 1 to 50")))]
pub async fn create_invite(
    State(state): State<AppState>,
    member: Member,
    JsonBody(input): JsonBody<CreateInvite>,
) -> Result<(StatusCode, Json<Invite>), AppError> {
    let invite = service::create_invite(&state.pool, &member, input).await?;
    Ok((StatusCode::CREATED, Json(invite)))
}

#[utoipa::path(get, path = "/api/projects/{key}/invites", tag = "members",
    params(("key" = String, Path, description = "Project key")),
    responses(
        (status = 200, body = Vec<InviteInfo>, description = "Live invites (not full, not expired), newest first; admins only"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 403, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json")))]
pub async fn list_invites(
    State(state): State<AppState>,
    member: Member,
) -> Result<Json<Vec<InviteInfo>>, AppError> {
    Ok(Json(service::list_invites(&state.pool, &member).await?))
}

#[utoipa::path(delete, path = "/api/projects/{key}/invites/{id}", tag = "members",
    params(
        ("key" = String, Path, description = "Project key"),
        ("id" = i64, Path, description = "Invite id")),
    responses(
        (status = 204, description = "Revoked: the link answers `invite-expired`; who joined with it stays"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 403, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json", description = "No live invite with this id in the project"),
        (status = 409, body = Problem, content_type = "application/problem+json", description = "`project-archived`")))]
pub async fn revoke_invite(
    State(state): State<AppState>,
    member: Member,
    PathParams((_key, id)): PathParams<(String, i64)>,
) -> Result<StatusCode, AppError> {
    service::revoke_invite(&state.pool, &member, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(post, path = "/api/invites/{token}/accept", tag = "members",
    params(("token" = String, Path, description = "Invite token")),
    responses(
        (status = 200, body = Project, description = "Joined; takes one of the invite's spots, the last one uses it up"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json", description = "Unknown token"),
        (status = 409, body = Problem, content_type = "application/problem+json", description = "Already a member, `invite-already-used-by-you`: a former member reopened a link they joined with, or `terms-not-accepted` (D45)"),
        (status = 410, body = Problem, content_type = "application/problem+json", description = "`invite-used` or `invite-expired`"),
        (status = 429, body = Problem, content_type = "application/problem+json", description = "Rate limited (D44); wait `Retry-After` seconds")))]
pub async fn accept_invite(
    State(state): State<AppState>,
    ClientIp(address): ClientIp,
    user: CurrentUser,
    PathParams(token): PathParams<String>,
) -> Result<Json<Project>, AppError> {
    state
        .limits
        .check(Action::InviteAccept, address, Some(user.id))?;
    crate::auth::service::require_current_acceptance(&state.pool, &state.legal, &user).await?;
    Ok(Json(
        service::accept_invite(&state.pool, &user, &token).await?,
    ))
}

#[utoipa::path(get, path = "/api/invites/{token}", tag = "members",
    params(("token" = String, Path, description = "Invite token")),
    responses(
        (status = 200, body = InvitePreview, description = "What accepting the invite grants"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json", description = "Unknown token"),
        (status = 409, body = Problem, content_type = "application/problem+json", description = "`project-archived`: the project is archived"),
        (status = 410, body = Problem, content_type = "application/problem+json", description = "`invite-used` or `invite-expired`")))]
pub async fn preview_invite(
    State(state): State<AppState>,
    _user: CurrentUser,
    PathParams(token): PathParams<String>,
) -> Result<Json<InvitePreview>, AppError> {
    Ok(Json(service::preview_invite(&state.pool, &token).await?))
}
