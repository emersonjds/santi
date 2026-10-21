use santi_types::people::TeamProgress;
use santi_types::projects::BoardType;
use sqlx::PgPool;

use super::{domain, repo};
use crate::error::AppError;
use crate::members::Member;
use crate::sprints;

pub async fn team_progress(pool: &PgPool, member: &Member) -> Result<TeamProgress, AppError> {
    let mut conn = pool.acquire().await?;
    let sprint = match member.board_type {
        BoardType::Kanban => None,
        BoardType::Scrum => match sprints::repo::find_active(&mut conn, member.board_id).await? {
            Some(sprint) => Some(sprint),
            None => return Ok(domain::team_progress(None, Vec::new())),
        },
    };
    let sprint_id = sprint.as_ref().map(|sprint| sprint.id);
    let rows = repo::tallies(&mut conn, member.project_id, sprint_id).await?;
    Ok(domain::team_progress(sprint, rows))
}
