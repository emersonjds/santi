use santi_types::projects::{CreateProject, MemberRole, Project, ProjectState, UpdateProject};
use sqlx::{PgConnection, PgPool};

use super::{domain, repo};
use crate::attachments;
use crate::auth::extract::CurrentUser;
use crate::boards;
use crate::error::AppError;
use crate::members::{self, Member};
use crate::storage::Storage;

pub async fn create_project(
    pool: &PgPool,
    user: &CurrentUser,
    input: CreateProject,
) -> Result<Project, AppError> {
    let key = domain::check_project_key(&input.key)?;
    let name = domain::check_project_name(&input.name)?;
    let mut tx = pool.begin().await?;
    let held = repo::find_key_state(&mut tx, &key).await?;
    domain::check_key_free(&key, held)?;
    take_key(&mut tx, &key, None, user.id).await?;
    let project_id = repo::insert_project(&mut tx, &key, &name).await?;
    let done_window = domain::default_done_window(input.board_type);
    let board_id = repo::insert_board(&mut tx, project_id, input.board_type, done_window).await?;
    boards::service::seed_default_layout(&mut tx, project_id, board_id).await?;
    members::repo::insert_member(&mut tx, project_id, user.id, MemberRole::Admin).await?;
    let project = repo::find_project(&mut tx, project_id, user.id).await?;
    tx.commit().await?;
    Ok(project)
}

pub async fn list_projects(
    pool: &PgPool,
    user: &CurrentUser,
    state: ProjectState,
) -> Result<Vec<Project>, AppError> {
    let mut conn = pool.acquire().await?;
    Ok(repo::list_projects(&mut conn, user.id, Some(state)).await?)
}

pub async fn get_project(pool: &PgPool, member: &Member) -> Result<Project, AppError> {
    let mut conn = pool.acquire().await?;
    Ok(repo::find_project(&mut conn, member.project_id, member.user_id).await?)
}

/// SAN-225: under the key's lock until the transaction ends; true when `key` is one of
/// `taker`'s own previous keys. `user_id` is the caller, who sees the holder's name only as one
/// of its members.
pub async fn take_key(
    conn: &mut PgConnection,
    key: &str,
    taker: Option<i64>,
    user_id: i64,
) -> Result<bool, AppError> {
    repo::lock_key(conn, key).await?;
    let holder = repo::find_key_holder(conn, key, user_id).await?;
    let holder = holder.as_ref().map(|holder| domain::Holder {
        project_id: holder.project_id,
        name: &holder.name,
        alias: holder.alias,
        member: holder.member,
        trashed: holder.trashed,
    });
    domain::check_key_taker(key, taker, holder)
}

/// OR-38: a new key keeps the current one as a previous key; going back to a previous key
/// swaps the two.
pub async fn update(
    pool: &PgPool,
    member: &Member,
    input: UpdateProject,
) -> Result<Project, AppError> {
    members::domain::require_admin(member)?;
    let name = input
        .name
        .as_deref()
        .map(domain::check_project_name)
        .transpose()?;
    let key = input
        .key
        .as_deref()
        .map(domain::check_new_project_key)
        .transpose()?;
    let mut tx = pool.begin().await?;
    // The board before the project: a column edit holds the board, then its status row needs the
    // project.
    let board_type = match input.board_type.or(input.expected_board_type) {
        Some(_) => Some(repo::lock_board_type(&mut tx, member.board_id).await?),
        None => None,
    };
    if let Some(key) = &key
        && take_key(&mut tx, key, Some(member.project_id), member.user_id).await?
    {
        repo::delete_alias(&mut tx, member.project_id, key).await?;
    }
    domain::check_active(repo::lock_project(&mut tx, member.project_id).await?)?;
    if let Some(current) = board_type {
        domain::check_expected_board_type(current, input.expected_board_type)?;
        if let Some(target) = input.board_type
            && target != current
        {
            repo::switch_board(&mut tx, member.board_id, target).await?;
        }
    }
    if let Some(name) = &name {
        repo::rename(&mut tx, member.project_id, name).await?;
    }
    if let Some(key) = &key {
        repo::change_key(&mut tx, member.project_id, key).await?;
    }
    let project = repo::find_project(&mut tx, member.project_id, member.user_id).await?;
    tx.commit().await?;
    Ok(project)
}

/// Frees a previous key for any project to take.
pub async fn remove_alias(pool: &PgPool, member: &Member, alias: &str) -> Result<(), AppError> {
    members::domain::require_admin(member)?;
    let mut conn = pool.acquire().await?;
    let removed = repo::delete_alias(&mut conn, member.project_id, alias).await?;
    removed.then_some(()).ok_or(AppError::NotFound)
}

pub async fn archive(pool: &PgPool, member: &Member) -> Result<(), AppError> {
    members::domain::require_admin(member)?;
    let mut conn = pool.acquire().await?;
    let archived = repo::archive(&mut conn, member.project_id, member.user_id).await?;
    archived.then_some(()).ok_or_else(domain::archived)
}

pub async fn unarchive(pool: &PgPool, member: &Member) -> Result<(), AppError> {
    members::domain::require_admin(member)?;
    let mut conn = pool.acquire().await?;
    let unarchived = repo::unarchive(&mut conn, member.project_id).await?;
    unarchived
        .then_some(())
        .ok_or_else(|| AppError::conflict("project-not-archived", "This project is not archived."))
}

pub async fn trash(pool: &PgPool, member: &Member) -> Result<(), AppError> {
    members::domain::require_admin(member)?;
    let mut conn = pool.acquire().await?;
    let trashed = repo::trash(&mut conn, member.project_id, member.user_id).await?;
    trashed.then_some(()).ok_or(AppError::NotFound)
}

/// Restore and purge reach trashed projects, which the `Member` extractor hides (OR-54).
pub async fn restore(pool: &PgPool, user: &CurrentUser, key: &str) -> Result<(), AppError> {
    let mut conn = pool.acquire().await?;
    let project_id = trashed_project(&mut conn, user, key).await?;
    let restored = repo::restore(&mut conn, project_id).await?;
    restored.then_some(()).ok_or_else(domain::not_trashed)
}

/// D53: the stored attachments go once the project is deleted.
pub async fn purge(
    pool: &PgPool,
    storage: &Storage,
    user: &CurrentUser,
    key: &str,
) -> Result<(), AppError> {
    let mut conn = pool.acquire().await?;
    let project_id = trashed_project(&mut conn, user, key).await?;
    let keys = repo::purge(&mut conn, project_id)
        .await?
        .ok_or_else(domain::not_trashed)?;
    attachments::service::delete_objects(storage, &keys).await;
    Ok(())
}

async fn trashed_project(
    conn: &mut PgConnection,
    user: &CurrentUser,
    key: &str,
) -> Result<i64, AppError> {
    let membership = repo::find_membership(conn, key, user.id)
        .await?
        .ok_or(AppError::NotFound)?;
    match (membership.role, membership.trashed) {
        (MemberRole::Admin, true) => {}
        (MemberRole::Admin, false) => return Err(domain::not_trashed()),
        // OR-54: a trashed project is hidden from everyone but its admins.
        (_, true) => return Err(AppError::NotFound),
        (_, false) => return Err(AppError::Forbidden),
    }
    Ok(membership.project_id)
}
