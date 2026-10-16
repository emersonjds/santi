use santi_types::projects::{CreateProject, MemberRole, Project};
use sqlx::PgPool;

use super::{domain, repo};
use crate::auth::extract::CurrentUser;
use crate::boards;
use crate::error::AppError;
use crate::members::{self, Member};

pub async fn create_project(
    pool: &PgPool,
    user: &CurrentUser,
    input: CreateProject,
) -> Result<Project, AppError> {
    let key = domain::check_project_key(&input.key)?;
    let name = domain::check_project_name(&input.name)?;
    let mut tx = pool.begin().await?;
    let project_id = repo::insert_project(&mut tx, &key, &name).await?;
    let done_window = domain::default_done_window(input.board_type);
    let board_id = repo::insert_board(&mut tx, project_id, input.board_type, done_window).await?;
    boards::service::seed_default_layout(&mut tx, project_id, board_id).await?;
    members::repo::insert_member(&mut tx, project_id, user.id, MemberRole::Admin).await?;
    let project = repo::find_project(&mut tx, project_id, user.id).await?;
    tx.commit().await?;
    Ok(project)
}

pub async fn list_projects(pool: &PgPool, user: &CurrentUser) -> Result<Vec<Project>, AppError> {
    let mut conn = pool.acquire().await?;
    Ok(repo::list_projects(&mut conn, user.id).await?)
}

pub async fn get_project(pool: &PgPool, member: &Member) -> Result<Project, AppError> {
    let mut conn = pool.acquire().await?;
    Ok(repo::find_project(&mut conn, member.project_id, member.user_id).await?)
}
