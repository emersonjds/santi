use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use santi_types::Problem;
use santi_types::projects::{
    AddMember, CreateInvite, Invite, InvitePreview, MemberInfo, Project, SetRole,
};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::{Member, service};
use crate::AppState;
use crate::auth::extract::CurrentUser;
use crate::error::AppError;
use crate::extract::{JsonBody, PathParams};

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(list_members, add_member))
        .routes(routes!(set_role, remove_member))
        .routes(routes!(create_invite))
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

#[utoipa::path(post, path = "/api/projects/{key}/members", tag = "members", request_body = AddMember,
    params(("key" = String, Path, description = "Project key")),
    responses(
        (status = 201, body = MemberInfo),
        (status = 403, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json"),
        (status = 409, body = Problem, content_type = "application/problem+json", description = "Already a member"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "No account uses this email")))]
pub async fn add_member(
    State(state): State<AppState>,
    member: Member,
    JsonBody(input): JsonBody<AddMember>,
) -> Result<(StatusCode, Json<MemberInfo>), AppError> {
    let added = service::add_member(&state.pool, &member, input).await?;
    Ok((StatusCode::CREATED, Json(added)))
}

#[utoipa::path(put, path = "/api/projects/{key}/members/{user_id}", tag = "members", request_body = SetRole,
    params(
        ("key" = String, Path, description = "Project key"),
        ("user_id" = i64, Path, description = "Member's user id")),
    responses(
        (status = 200, body = MemberInfo),
        (status = 403, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json"),
        (status = 409, body = Problem, content_type = "application/problem+json", description = "`last-admin`")))]
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
        (status = 404, body = Problem, content_type = "application/problem+json")))]
pub async fn create_invite(
    State(state): State<AppState>,
    member: Member,
    JsonBody(input): JsonBody<CreateInvite>,
) -> Result<(StatusCode, Json<Invite>), AppError> {
    let invite = service::create_invite(&state.pool, &member, input).await?;
    Ok((StatusCode::CREATED, Json(invite)))
}

#[utoipa::path(post, path = "/api/invites/{token}/accept", tag = "members",
    params(("token" = String, Path, description = "Invite token")),
    responses(
        (status = 200, body = Project, description = "Joined; the invite is used up"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json", description = "Unknown, used or expired")))]
pub async fn accept_invite(
    State(state): State<AppState>,
    user: CurrentUser,
    PathParams(token): PathParams<String>,
) -> Result<Json<Project>, AppError> {
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
        (status = 410, body = Problem, content_type = "application/problem+json", description = "`invite-used` or `invite-expired`")))]
pub async fn preview_invite(
    State(state): State<AppState>,
    _user: CurrentUser,
    PathParams(token): PathParams<String>,
) -> Result<Json<InvitePreview>, AppError> {
    Ok(Json(service::preview_invite(&state.pool, &token).await?))
}
