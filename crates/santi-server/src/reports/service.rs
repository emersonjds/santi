use santi_types::issues::{Page, PageParams};
use santi_types::reports::{SprintReport, SprintTotals, Velocity};
use santi_types::sprints::SprintState;
use sqlx::PgPool;

use super::{domain, repo};
use crate::error::AppError;
use crate::members::Member;
use crate::{pagination, sprints};

pub async fn sprint_history(
    pool: &PgPool,
    member: &Member,
    page: PageParams,
) -> Result<Page<SprintTotals>, AppError> {
    sprints::domain::require_scrum(member.board_type)?;
    let limit = pagination::page_limit(page.limit)?;
    let mut conn = pool.acquire().await?;
    let rows = repo::sprint_totals(&mut conn, member.board_id, page.cursor, limit + 1).await?;
    Ok(pagination::into_page(rows, limit, |row| row.sprint.id))
}

/// The active sprint can lead the history, so one row more than the chart shows.
pub async fn velocity(pool: &PgPool, member: &Member) -> Result<Velocity, AppError> {
    sprints::domain::require_scrum(member.board_type)?;
    let mut conn = pool.acquire().await?;
    let limit = domain::VELOCITY_SPRINTS as i64 + 1;
    let history = repo::sprint_totals(&mut conn, member.board_id, None, limit).await?;
    Ok(domain::velocity(history))
}

pub async fn sprint_report(
    pool: &PgPool,
    member: &Member,
    sprint_id: i64,
) -> Result<SprintReport, AppError> {
    sprints::domain::require_scrum(member.board_type)?;
    let mut conn = pool.acquire().await?;
    let found = repo::find_report_sprint(&mut conn, member.board_id, sprint_id)
        .await?
        .ok_or(AppError::NotFound)?;
    if found.sprint.state == SprintState::Future {
        return Err(AppError::conflict(
            "sprint-not-started",
            "This sprint has not started, so it has no report yet.",
        ));
    }
    let rows = repo::report_rows(&mut conn, sprint_id).await?;
    Ok(domain::report(
        found.sprint,
        found.newer_sprint_id,
        found.older_sprint_id,
        rows,
    ))
}
