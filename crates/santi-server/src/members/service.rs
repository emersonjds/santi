use chrono::{Duration, Utc};
use santi_types::projects::{
    CreateInvite, Invite, InviteInfo, InvitePreview, MemberInfo, Project, ProjectState, SetRole,
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

pub async fn set_role(
    pool: &PgPool,
    member: &Member,
    user_id: i64,
    input: SetRole,
) -> Result<MemberInfo, AppError> {
    domain::require_admin(member)?;
    let mut tx = pool.begin().await?;
    let state = projects::repo::lock_project(&mut tx, member.project_id).await?;
    projects::domain::check_active(state)?;
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

/// Any member may leave; only admins remove others.
pub async fn remove_member(pool: &PgPool, member: &Member, user_id: i64) -> Result<(), AppError> {
    if user_id != member.user_id {
        domain::require_admin(member)?;
    }
    let mut tx = pool.begin().await?;
    let state = projects::repo::lock_project(&mut tx, member.project_id).await?;
    let leaving_archived = user_id == member.user_id && state == ProjectState::Archived;
    if !leaving_archived {
        projects::domain::check_active(state)?;
    }
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
    let max_uses = input.max_uses.unwrap_or(1);
    domain::check_max_uses(max_uses, input.role)?;
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
        max_uses,
    )
    .await?;
    Ok(Invite {
        token,
        expires_at,
        max_uses,
    })
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
        domain::check_invite_usable(invite.preview.expires_at, invite.used_at, Utc::now())?;
        return Err(match invite.archived {
            true => projects::domain::archived(),
            false => AppError::NotFound,
        });
    };
    repo::insert_member(&mut tx, grant.project_id, user.id, grant.role).await?;
    // A former member reopening the link: their earlier use is still recorded.
    repo::record_invite_use(&mut tx, grant.id, user.id)
        .await
        .map_err(|error| match error.as_database_error() {
            Some(database_error) if database_error.is_unique_violation() => AppError::conflict(
                "invite-already-used-by-you",
                "You already joined with this link. Ask an admin for a new invite.",
            ),
            _ => error.into(),
        })?;
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
    if invite.archived {
        return Err(projects::domain::archived());
    }
    Ok(invite.preview)
}

pub async fn list_invites(pool: &PgPool, member: &Member) -> Result<Vec<InviteInfo>, AppError> {
    domain::require_admin(member)?;
    let mut conn = pool.acquire().await?;
    Ok(repo::list_live_invites(&mut conn, member.project_id).await?)
}

/// The link then answers like an expired one; who joined with it stays.
pub async fn revoke_invite(pool: &PgPool, member: &Member, invite_id: i64) -> Result<(), AppError> {
    domain::require_admin(member)?;
    let mut conn = pool.acquire().await?;
    match repo::revoke_invite(&mut conn, member.project_id, invite_id).await? {
        true => Ok(()),
        false => Err(AppError::NotFound),
    }
}
