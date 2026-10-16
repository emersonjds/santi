use chrono::Utc;
use santi_types::issues::{CreateIssue, Issue, IssueType, UpdateIssue};
use sqlx::{PgConnection, PgPool};

use super::repo::{IssueKind, NewIssue};
use super::{domain, repo};
use crate::boards::repo::StatusRef;
use crate::error::AppError;
use crate::members::Member;
use crate::{boards, members, projects};

pub async fn create_issue(
    pool: &PgPool,
    member: &Member,
    input: CreateIssue,
) -> Result<Issue, AppError> {
    let summary = domain::check_summary(&input.summary)?;
    let labels = domain::normalize_labels(input.labels)?;
    domain::check_points(input.issue_type, input.points)?;
    let mut tx = pool.begin().await?;
    let number = projects::repo::take_issue_number(&mut tx, member.project_id).await?;
    let status = resolve_status(&mut tx, member, input.status_id).await?;
    let parent = resolve_parent(&mut tx, member, input.issue_type, input.parent.as_deref()).await?;
    check_assignee(&mut tx, member, input.assignee_id).await?;
    let last_rank = repo::last_rank(&mut tx, member.project_id).await?;
    let new_issue = NewIssue {
        project_id: member.project_id,
        number,
        issue_type: input.issue_type,
        summary,
        description: input.description,
        priority: input.priority,
        status_id: status.id,
        assignee_id: input.assignee_id,
        reporter_id: member.user_id,
        points: input.points,
        labels,
        parent_id: parent.map(|parent| parent.id),
        sprint_id: None,
        rank: domain::rank_between(last_rank.as_deref(), None),
        done_at: domain::done_at_on_create(status.category, Utc::now()),
    };
    repo::insert_issue(&mut tx, &new_issue).await?;
    tx.commit().await?;
    get_issue(pool, member, number).await
}

pub async fn get_issue(pool: &PgPool, member: &Member, number: i64) -> Result<Issue, AppError> {
    let mut conn = pool.acquire().await?;
    repo::find_issue(&mut conn, member.project_id, number)
        .await?
        .ok_or(AppError::NotFound)
}

pub async fn update_issue(
    pool: &PgPool,
    member: &Member,
    number: i64,
    change: UpdateIssue,
) -> Result<Issue, AppError> {
    let mut tx = pool.begin().await?;
    let current = repo::find_editable_for_update(&mut tx, member.project_id, number).await?;
    let current = current.ok_or(AppError::NotFound)?;
    let mut next = domain::apply_field_changes(&current, &change)?;
    if let Some(assignee_id) = change.assignee_id {
        check_assignee(&mut tx, member, assignee_id).await?;
        next.assignee_id = assignee_id;
    }
    if let Some(parent) = &change.parent {
        domain::check_parent_change(current.issue_type)?;
        let parent = resolve_parent(&mut tx, member, next.issue_type, parent.as_deref()).await?;
        next.parent_id = parent.map(|parent| parent.id);
    }
    repo::update_fields(&mut tx, &next).await?;
    tx.commit().await?;
    get_issue(pool, member, number).await
}

/// D1 keyboard fallback: moves an issue to another status, keeping its rank.
// ponytail: status only; Task 6 move_issue adds rank anchors and replaces this.
pub async fn change_status(
    pool: &PgPool,
    member: &Member,
    number: i64,
    status_id: i64,
) -> Result<Issue, AppError> {
    let mut tx = pool.begin().await?;
    let issue = repo::find_status_state_for_update(&mut tx, member.project_id, number).await?;
    let issue = issue.ok_or(AppError::NotFound)?;
    let status = resolve_status(&mut tx, member, Some(status_id)).await?;
    let done_at = domain::next_done_at(issue.category, status.category, issue.done_at, Utc::now());
    repo::set_status(&mut tx, issue.id, status.id, done_at).await?;
    tx.commit().await?;
    get_issue(pool, member, number).await
}

/// The status a write may use: the given one (mapped, of this project) or the default to-do status.
pub async fn resolve_status(
    conn: &mut PgConnection,
    member: &Member,
    status_id: Option<i64>,
) -> Result<StatusRef, AppError> {
    let Some(status_id) = status_id else {
        let status = boards::repo::first_todo_status(conn, member.project_id).await?;
        return status.ok_or_else(|| {
            AppError::conflict(
                "no-todo-status",
                "Map a to-do status to a board column first.",
            )
        });
    };
    let status = boards::repo::find_status_ref(conn, member.project_id, status_id).await?;
    let status =
        status.ok_or_else(|| AppError::invalid("status_id", "no such status in this project"))?;
    if status.column_id.is_none() {
        return Err(AppError::conflict(
            "status-unmapped",
            "Map this status to a board column before using it.",
        ));
    }
    Ok(status)
}

async fn resolve_parent(
    conn: &mut PgConnection,
    member: &Member,
    child_type: IssueType,
    parent_key: Option<&str>,
) -> Result<Option<IssueKind>, AppError> {
    let Some(parent_key) = parent_key else {
        domain::check_parent(child_type, None)?;
        return Ok(None);
    };
    let number = domain::parse_issue_key("parent", &member.project_key, parent_key)?;
    let parent = repo::find_kind(conn, member.project_id, number).await?;
    let parent =
        parent.ok_or_else(|| AppError::invalid("parent", "no such issue in this project"))?;
    domain::check_parent(child_type, Some(parent.issue_type))?;
    Ok(Some(parent))
}

async fn check_assignee(
    conn: &mut PgConnection,
    member: &Member,
    assignee_id: Option<i64>,
) -> Result<(), AppError> {
    let Some(assignee_id) = assignee_id else {
        return Ok(());
    };
    if !members::repo::is_member(conn, member.project_id, assignee_id).await? {
        return Err(AppError::invalid(
            "assignee_id",
            "must be a member of the project",
        ));
    }
    Ok(())
}
