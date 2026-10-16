use chrono::{Duration, Utc};
use santi_types::projects::{
    AddMember, CreateInvite, Invite, InvitePreview, MemberInfo, Project, SetRole,
};
use sqlx::PgPool;

use super::{Member, domain, repo};
use crate::auth::{self, extract::CurrentUser};
use crate::error::AppError;
use crate::projects;

pub async fn list_members(pool: &PgPool, member: &Member) -> Result<Vec<MemberInfo>, AppError> {
    let mut conn = pool.acquire().await?;
    Ok(repo::list_members(&mut conn, member.project_id).await?)
}

pub async fn add_member(
    pool: &PgPool,
    member: &Member,
    input: AddMember,
) -> Result<MemberInfo, AppError> {
    domain::require_admin(member)?;
    let email = auth::domain::normalize_email(&input.email)?;
    let mut conn = pool.acquire().await?;
    let user_id = repo::find_user_id_by_email(&mut conn, &email).await?;
    let user_id = user_id.ok_or_else(|| {
        AppError::invalid("email", "no account uses this email; send an invite link")
    })?;
    repo::insert_member(&mut conn, member.project_id, user_id, input.role).await?;
    repo::find_member_info(&mut conn, member.project_id, user_id)
        .await?
        .ok_or(AppError::NotFound)
}

pub async fn set_role(
    pool: &PgPool,
    member: &Member,
    user_id: i64,
    input: SetRole,
) -> Result<MemberInfo, AppError> {
    domain::require_admin(member)?;
    let mut tx = pool.begin().await?;
    projects::repo::lock_project(&mut tx, member.project_id).await?;
    let target = repo::find_member_info(&mut tx, member.project_id, user_id)
        .await?
        .ok_or(AppError::NotFound)?;
    let admin_count = repo::count_admins(&mut tx, member.project_id).await?;
    domain::check_admin_remains(admin_count, target.role, Some(input.role))?;
    repo::set_role(&mut tx, member.project_id, user_id, input.role).await?;
    tx.commit().await?;
    Ok(MemberInfo {
        role: input.role,
        ..target
    })
}

pub async fn remove_member(pool: &PgPool, member: &Member, user_id: i64) -> Result<(), AppError> {
    domain::require_admin(member)?;
    let mut tx = pool.begin().await?;
    projects::repo::lock_project(&mut tx, member.project_id).await?;
    let target = repo::find_member_info(&mut tx, member.project_id, user_id)
        .await?
        .ok_or(AppError::NotFound)?;
    let admin_count = repo::count_admins(&mut tx, member.project_id).await?;
    domain::check_admin_remains(admin_count, target.role, None)?;
    repo::delete_member(&mut tx, member.project_id, user_id).await?;
    tx.commit().await?;
    Ok(())
}

pub async fn create_invite(
    pool: &PgPool,
    member: &Member,
    input: CreateInvite,
) -> Result<Invite, AppError> {
    domain::require_admin(member)?;
    let token = auth::domain::new_secret();
    let expires_at = Utc::now() + Duration::days(domain::INVITE_DAYS);
    let mut conn = pool.acquire().await?;
    repo::insert_invite(
        &mut conn,
        member.project_id,
        input.role,
        &auth::domain::hash_token(&token),
        member.user_id,
        expires_at,
    )
    .await?;
    Ok(Invite { token, expires_at })
}

pub async fn accept_invite(
    pool: &PgPool,
    user: &CurrentUser,
    token: &str,
) -> Result<Project, AppError> {
    let token_hash = auth::domain::hash_token(token);
    let mut tx = pool.begin().await?;
    let Some(grant) = repo::take_invite(&mut tx, &token_hash).await? else {
        let invite = repo::find_invite(&mut tx, &token_hash)
            .await?
            .ok_or(AppError::NotFound)?;
        // Same answer as the preview: 410 for a used or expired link.
        return domain::check_invite_usable(invite.preview.expires_at, invite.used_at, Utc::now())
            .and(Err(AppError::NotFound));
    };
    repo::insert_member(&mut tx, grant.project_id, user.id, grant.role).await?;
    let project = projects::repo::find_project(&mut tx, grant.project_id, user.id).await?;
    tx.commit().await?;
    Ok(project)
}

/// Any signed-in user holding the token may see what it grants; nothing else about the project.
pub async fn preview_invite(pool: &PgPool, token: &str) -> Result<InvitePreview, AppError> {
    let mut conn = pool.acquire().await?;
    let invite = repo::find_invite(&mut conn, &auth::domain::hash_token(token))
        .await?
        .ok_or(AppError::NotFound)?;
    domain::check_invite_usable(invite.preview.expires_at, invite.used_at, Utc::now())?;
    Ok(invite.preview)
}
