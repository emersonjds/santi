use chrono::Utc;
use santi_types::boards::{
    Backlog, BoardSettings, BoardView, CreateColumn, CreateStatus, DeleteColumnParams,
    ReorderColumns, Status, UpdateBoardSettings, UpdateColumn, UpdateStatus,
};
use santi_types::issues::IssueFilter;
use sqlx::{PgConnection, PgPool, Postgres, Transaction};

use super::{domain, repo};
use crate::error::AppError;
use crate::members::Member;
use crate::members::domain::require_admin;
use crate::sprints;

pub async fn seed_default_layout(
    conn: &mut PgConnection,
    project_id: i64,
    board_id: i64,
) -> Result<(), sqlx::Error> {
    for (position, (name, category)) in (0..).zip(domain::DEFAULT_LAYOUT) {
        let column_id = repo::insert_column(conn, board_id, name, position).await?;
        repo::insert_status(conn, project_id, name, category, Some(column_id)).await?;
    }
    Ok(())
}

pub async fn get_settings(pool: &PgPool, member: &Member) -> Result<BoardSettings, AppError> {
    let mut conn = pool.acquire().await?;
    read_settings(&mut conn, member).await
}

/// On the caller's connection: a second one from the pool deadlocks it under load.
async fn read_settings(
    conn: &mut PgConnection,
    member: &Member,
) -> Result<BoardSettings, AppError> {
    let done_window = repo::find_done_window(conn, member.board_id).await?;
    let columns = repo::list_columns(conn, member.board_id).await?;
    let statuses = repo::list_statuses(conn, member.project_id).await?;
    Ok(domain::assemble_settings(
        member.board_type,
        done_window,
        columns,
        statuses,
    ))
}

pub async fn board_view(
    pool: &PgPool,
    member: &Member,
    filter: &IssueFilter,
) -> Result<BoardView, AppError> {
    let mut conn = pool.acquire().await?;
    let sprint = sprints::repo::find_active(&mut conn, member.board_id).await?;
    let columns = repo::list_columns(&mut conn, member.board_id).await?;
    let sprint_id = sprint.as_ref().map(|sprint| sprint.id);
    let cards = repo::board_cards(&mut conn, member.project_id, sprint_id, member.user_id).await?;
    Ok(BoardView {
        board_type: member.board_type,
        sprint,
        columns: domain::build_board_columns(columns, cards, filter, Utc::now()),
    })
}

pub async fn backlog(
    pool: &PgPool,
    member: &Member,
    filter: &IssueFilter,
) -> Result<Backlog, AppError> {
    domain::require_backlog(member.board_type)?;
    let mut conn = pool.acquire().await?;
    let sprints = sprints::repo::list_open(&mut conn, member.board_id).await?;
    let cards = repo::backlog_cards(&mut conn, member.project_id, member.user_id).await?;
    let epics = repo::epic_summaries(&mut conn, member.project_id).await?;
    let sprint_length = sprints::repo::sprint_length(&mut conn, member.board_id).await?;
    Ok(Backlog {
        sections: domain::build_backlog_sections(sprints, cards, filter, Utc::now()),
        epics,
        sprint_length,
    })
}

pub async fn update_settings(
    pool: &PgPool,
    member: &Member,
    input: UpdateBoardSettings,
) -> Result<BoardSettings, AppError> {
    require_admin(member)?;
    domain::check_done_window(member.board_type, input.done_window_days)?;
    let mut conn = pool.acquire().await?;
    repo::set_done_window(&mut conn, member.board_id, input.done_window_days).await?;
    read_settings(&mut conn, member).await
}

pub async fn create_column(
    pool: &PgPool,
    member: &Member,
    input: CreateColumn,
) -> Result<BoardSettings, AppError> {
    require_admin(member)?;
    let name = domain::check_name("name", &input.name)?;
    let mut tx = pool.begin().await?;
    repo::lock_board(&mut tx, member.board_id).await?;
    let position = repo::make_room_before_last_column(&mut tx, member.board_id).await?;
    let column_id = repo::insert_column(&mut tx, member.board_id, &name, position).await?;
    if let Some(category) = input.new_status {
        repo::insert_status(&mut tx, member.project_id, &name, category, Some(column_id)).await?;
    }
    commit_if_layout_valid(tx, member.board_id).await?;
    get_settings(pool, member).await
}

pub async fn update_column(
    pool: &PgPool,
    member: &Member,
    column_id: i64,
    input: UpdateColumn,
) -> Result<BoardSettings, AppError> {
    require_admin(member)?;
    let name = domain::check_name("name", &input.name)?;
    domain::check_wip_limit(member.board_type, input.wip_limit)?;
    let mut conn = pool.acquire().await?;
    let updated = repo::update_column(
        &mut conn,
        member.board_id,
        column_id,
        &name,
        input.wip_limit,
    )
    .await?;
    if !updated {
        return Err(AppError::NotFound);
    }
    read_settings(&mut conn, member).await
}

pub async fn reorder_columns(
    pool: &PgPool,
    member: &Member,
    input: ReorderColumns,
) -> Result<BoardSettings, AppError> {
    require_admin(member)?;
    let mut tx = pool.begin().await?;
    repo::lock_board(&mut tx, member.board_id).await?;
    let layout = repo::load_layout(&mut tx, member.board_id).await?;
    let current: Vec<i64> = layout.iter().map(|column| column.id).collect();
    domain::check_same_columns(&current, &input.column_ids)?;
    repo::set_positions(&mut tx, member.board_id, &input.column_ids).await?;
    commit_if_layout_valid(tx, member.board_id).await?;
    get_settings(pool, member).await
}

pub async fn delete_column(
    pool: &PgPool,
    member: &Member,
    column_id: i64,
    params: DeleteColumnParams,
) -> Result<BoardSettings, AppError> {
    require_admin(member)?;
    let mut tx = pool.begin().await?;
    repo::lock_board(&mut tx, member.board_id).await?;
    let layout = repo::load_layout(&mut tx, member.board_id).await?;
    let target = domain::check_column_deletion(&layout, column_id, params.move_statuses_to)?;
    if let Some(target) = target {
        repo::move_statuses(&mut tx, column_id, target).await?;
    }
    repo::delete_column(&mut tx, member.board_id, column_id).await?;
    commit_if_layout_valid(tx, member.board_id).await?;
    get_settings(pool, member).await
}

pub async fn create_status(
    pool: &PgPool,
    member: &Member,
    input: CreateStatus,
) -> Result<Status, AppError> {
    require_admin(member)?;
    let name = domain::check_name("name", &input.name)?;
    let mut conn = pool.acquire().await?;
    Ok(repo::insert_status(&mut conn, member.project_id, &name, input.category, None).await?)
}

pub async fn update_status(
    pool: &PgPool,
    member: &Member,
    status_id: i64,
    input: UpdateStatus,
) -> Result<Status, AppError> {
    require_admin(member)?;
    let name = domain::check_name("name", &input.name)?;
    let mut tx = pool.begin().await?;
    repo::lock_board(&mut tx, member.board_id).await?;
    if let Some(column_id) = input.column_id {
        require_column(&mut tx, member, column_id).await?;
    }
    let status = repo::update_status(
        &mut tx,
        member.project_id,
        status_id,
        &name,
        input.column_id,
    )
    .await?;
    let status = status.ok_or(AppError::NotFound)?;
    commit_if_layout_valid(tx, member.board_id).await?;
    Ok(status)
}

pub async fn delete_status(pool: &PgPool, member: &Member, status_id: i64) -> Result<(), AppError> {
    require_admin(member)?;
    let mut tx = pool.begin().await?;
    repo::lock_board(&mut tx, member.board_id).await?;
    let deleted = repo::delete_status(&mut tx, member.project_id, status_id).await?;
    if !deleted {
        return Err(AppError::NotFound);
    }
    commit_if_layout_valid(tx, member.board_id).await
}

async fn require_column(
    conn: &mut PgConnection,
    member: &Member,
    column_id: i64,
) -> Result<(), AppError> {
    let belongs = repo::column_belongs_to_board(conn, member.board_id, column_id).await?;
    if !belongs {
        return Err(AppError::invalid(
            "column_id",
            "no such column on this board",
        ));
    }
    Ok(())
}

/// Every layout edit ends here: re-read the layout, enforce D2, commit; an error rolls the edit back.
async fn commit_if_layout_valid(
    mut tx: Transaction<'_, Postgres>,
    board_id: i64,
) -> Result<(), AppError> {
    let layout = repo::load_layout(&mut tx, board_id).await?;
    domain::check_done_mapping(&layout)?;
    domain::check_board_shape(&layout)?;
    tx.commit().await?;
    Ok(())
}
