use chrono::Utc;
use santi_types::sprints::{
    CompleteSprint, CreateSprint, OpenIssuesDestination, Sprint, StartSprint, UpdateSprint,
};
use sqlx::{PgConnection, PgPool};

use super::{domain, repo};
use crate::error::AppError;
use crate::members::Member;

pub async fn create_sprint(
    pool: &PgPool,
    member: &Member,
    input: CreateSprint,
) -> Result<Sprint, AppError> {
    domain::require_scrum(member.board_type)?;
    let goal = domain::check_goal(input.goal.as_deref().unwrap_or_default())?;
    let mut tx = pool.begin().await?;
    let number = repo::take_sprint_number(&mut tx, member.board_id).await?;
    let name = domain::sprint_name(input.name.as_deref(), number)?;
    let sprint_id = repo::insert_sprint(&mut tx, member.board_id, &name, &goal).await?;
    tx.commit().await?;
    get_sprint(pool, member, sprint_id).await
}

pub async fn get_sprint(
    pool: &PgPool,
    member: &Member,
    sprint_id: i64,
) -> Result<Sprint, AppError> {
    let mut conn = pool.acquire().await?;
    repo::find_sprint(&mut conn, member.board_id, sprint_id)
        .await?
        .ok_or(AppError::NotFound)
}

pub async fn list_sprints(pool: &PgPool, member: &Member) -> Result<Vec<Sprint>, AppError> {
    let mut conn = pool.acquire().await?;
    Ok(repo::list_sprints(&mut conn, member.board_id).await?)
}

pub async fn update_sprint(
    pool: &PgPool,
    member: &Member,
    sprint_id: i64,
    input: UpdateSprint,
) -> Result<Sprint, AppError> {
    let name = domain::check_sprint_name(&input.name)?;
    let goal = domain::check_goal(&input.goal)?;
    let mut tx = pool.begin().await?;
    let current = repo::find_sprint_for_update(&mut tx, member.board_id, sprint_id).await?;
    let current = current.ok_or(AppError::NotFound)?;
    domain::check_sprint_edit(&current, input.start_date, input.end_date)?;
    repo::update_sprint(
        &mut tx,
        sprint_id,
        &name,
        &goal,
        input.start_date,
        input.end_date,
    )
    .await?;
    tx.commit().await?;
    get_sprint(pool, member, sprint_id).await
}

pub async fn delete_sprint(pool: &PgPool, member: &Member, sprint_id: i64) -> Result<(), AppError> {
    let mut conn = pool.acquire().await?;
    if repo::delete_future_sprint(&mut conn, member.board_id, sprint_id).await? {
        return Ok(());
    }
    let exists = repo::find_sprint(&mut conn, member.board_id, sprint_id)
        .await?
        .is_some();
    if !exists {
        return Err(AppError::NotFound);
    }
    Err(AppError::conflict(
        "sprint-not-future",
        "Only future sprints can be deleted; complete an active sprint instead.",
    ))
}

pub async fn start_sprint(
    pool: &PgPool,
    member: &Member,
    sprint_id: i64,
    input: StartSprint,
) -> Result<Sprint, AppError> {
    let (start_date, end_date) =
        domain::start_window(Utc::now().date_naive(), input.start_date, input.end_date)?;
    let mut tx = pool.begin().await?;
    let sprint = repo::find_sprint_for_update(&mut tx, member.board_id, sprint_id)
        .await?
        .ok_or(AppError::NotFound)?;
    let active = repo::find_active(&mut tx, member.board_id).await?;
    let issue_count = repo::count_issues(&mut tx, sprint.id).await?;
    domain::check_can_start(sprint.state, active.is_some(), issue_count)?;
    repo::mark_started(&mut tx, sprint.id, start_date, end_date).await?;
    repo::snapshot_scope(&mut tx, sprint.id).await?;
    tx.commit().await?;
    get_sprint(pool, member, sprint_id).await
}

pub async fn complete_sprint(
    pool: &PgPool,
    member: &Member,
    sprint_id: i64,
    input: CompleteSprint,
) -> Result<Sprint, AppError> {
    let mut tx = pool.begin().await?;
    let sprint = repo::find_sprint_for_update(&mut tx, member.board_id, sprint_id)
        .await?
        .ok_or(AppError::NotFound)?;
    domain::check_can_complete(sprint.state)?;
    let destination = resolve_destination(&mut tx, member, &sprint, input.open_issues).await?;
    repo::record_outcomes(&mut tx, sprint.id).await?;
    repo::move_open_issues(&mut tx, sprint.id, destination).await?;
    repo::mark_closed(&mut tx, sprint.id).await?;
    tx.commit().await?;
    get_sprint(pool, member, sprint_id).await
}

/// None means the backlog.
async fn resolve_destination(
    conn: &mut PgConnection,
    member: &Member,
    closing: &Sprint,
    destination: OpenIssuesDestination,
) -> Result<Option<i64>, AppError> {
    match destination {
        OpenIssuesDestination::Backlog => Ok(None),
        OpenIssuesDestination::Sprint { sprint_id } => {
            let target = repo::find_sprint(conn, member.board_id, sprint_id).await?;
            let target = target.ok_or_else(|| {
                AppError::invalid("open_issues", "pick a future sprint of this board")
            })?;
            domain::check_destination(closing.id, &target)?;
            Ok(Some(target.id))
        }
        OpenIssuesDestination::NewSprint => {
            let number = repo::take_sprint_number(conn, member.board_id).await?;
            let name = domain::sprint_name(None, number)?;
            Ok(Some(
                repo::insert_sprint(conn, member.board_id, &name, "").await?,
            ))
        }
    }
}
