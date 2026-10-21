use std::collections::HashMap;

use axum::body::Bytes;
use santi_types::boards::BoardSettings;
use santi_types::projects::{MemberRole, RestoreResult};
use sqlx::{PgConnection, PgPool};

use super::{domain, repo};
use crate::auth::extract::CurrentUser;
use crate::error::AppError;
use crate::imports::domain::tier;
use crate::{boards, imports, members, projects, sprints};

/// SAN-99: a new project from one project of an account export, in one transaction; the caller
/// is its only member, as admin (D58).
pub async fn restore(
    pool: &PgPool,
    user: &CurrentUser,
    body: Bytes,
) -> Result<RestoreResult, AppError> {
    let caller = user.id;
    let (mut export, key, problems) = tokio::task::spawn_blocking(move || {
        let mut export = domain::read(&body)?;
        let key = domain::check(&mut export)?;
        let problems = domain::resolve_people(&mut export, caller);
        Ok::<_, AppError>((export, key, problems))
    })
    .await
    .map_err(|error| AppError::Internal(error.to_string()))??;
    let mut tx = pool.begin().await?;
    // ponytail: two restores of one key racing past this check: the second gets the generic 409.
    if projects::repo::find_key_state(&mut tx, &key)
        .await?
        .is_some()
    {
        return Err(domain::exists(&key));
    }
    let project = &export.project;
    let project_id = projects::repo::insert_project(&mut tx, &key, &project.name).await?;
    let board_id = projects::repo::insert_board(
        &mut tx,
        project_id,
        project.board_type,
        export.board.done_window_days,
    )
    .await?;
    members::repo::insert_member(&mut tx, project_id, user.id, MemberRole::Admin).await?;
    let status_ids = restore_board(&mut tx, project_id, board_id, &export.board).await?;
    let mut sprint_ids = HashMap::with_capacity(export.sprints.len());
    for sprint in &export.sprints {
        sprints::repo::take_sprint_number(&mut tx, board_id).await?; // D12: `Sprint N` counts these
        let id = repo::insert_sprint(&mut tx, board_id, sprint).await?;
        sprint_ids.insert(sprint.id, id);
    }

    for issue in &mut export.issues {
        let unknown = || AppError::invalid(&issue.key, "names a status or sprint the file lacks");
        issue.status_id = *status_ids.get(&issue.status_name).ok_or_else(unknown)?;
        if let Some(id) = issue.sprint_id {
            issue.sprint_id = Some(*sprint_ids.get(&id).ok_or_else(unknown)?);
        }
    }
    export.issues.sort_by_key(|issue| tier(issue.issue_type)); // D41: parents first
    for same_tier in export
        .issues
        .chunk_by(|a, b| tier(a.issue_type) == tier(b.issue_type))
    {
        repo::insert_issues(&mut tx, project_id, same_tier).await?;
    }
    repo::insert_comments(&mut tx, project_id, &export.comments).await?;
    repo::reset_updated_at(&mut tx, project_id, &export.issues).await?;
    repo::record_sprint_facts(&mut tx, project_id).await?;
    let last_number = export.issues.iter().map(|issue| issue.number).max();
    imports::repo::take_issue_numbers(&mut tx, project_id, last_number.unwrap_or(0)).await?;
    let project = projects::repo::find_project(&mut tx, project_id, user.id).await?;
    tx.commit().await?;
    Ok(RestoreResult {
        project,
        issues: export.issues.len() as i64,
        sprints: export.sprints.len() as i64,
        comments: export.comments.len() as i64,
        problems,
        not_restored: domain::NOT_RESTORED.into(),
    })
}

/// Columns in their positions with their limits, then statuses in their original order, mapped
/// to the new columns. Returns each status's new id by name.
async fn restore_board(
    conn: &mut PgConnection,
    project_id: i64,
    board_id: i64,
    board: &BoardSettings,
) -> Result<HashMap<String, i64>, AppError> {
    let mut statuses = board
        .unmapped
        .iter()
        .map(|status| (status, None))
        .collect::<Vec<_>>();
    for column in &board.columns {
        let id = boards::repo::insert_column(conn, board_id, &column.name, column.position).await?;
        if column.wip_limit.is_some() {
            boards::repo::update_column(conn, board_id, id, &column.name, column.wip_limit).await?;
        }
        statuses.extend(column.statuses.iter().map(|status| (status, Some(id))));
    }
    statuses.sort_by_key(|(status, _)| status.id);
    let mut ids = HashMap::with_capacity(statuses.len());
    for (status, column_id) in statuses {
        let created =
            boards::repo::insert_status(conn, project_id, &status.name, status.category, column_id)
                .await?;
        ids.insert(created.name, created.id);
    }
    Ok(ids)
}
