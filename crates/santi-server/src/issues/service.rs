use chrono::{DateTime, Utc};
use santi_types::issues::{
    Comment, CreateComment, CreateIssue, Issue, IssueFilter, IssueType, MoveIssue, Page,
    PageParams, StatusFilter, UpdateIssue,
};
use sqlx::{PgConnection, PgPool};

use super::domain::Anchor;
use super::repo::{IssueKind, NewIssue, Position};
use super::{domain, repo};
use crate::boards::repo::StatusRef;
use crate::error::{AppError, not_found_if_parent_gone};
use crate::members::Member;
use crate::{boards, members, pagination, projects, sprints};

pub async fn create_issue(
    pool: &PgPool,
    member: &Member,
    input: CreateIssue,
) -> Result<Issue, AppError> {
    let summary = domain::check_summary(&input.summary)?;
    let description = domain::check_description(&input.description)?;
    let labels = domain::normalize_labels(input.labels)?;
    domain::check_points(input.issue_type, input.points)?;
    let mut tx = pool.begin().await?;
    let (number, state) = projects::repo::take_issue_number(&mut tx, member.project_id).await?;
    projects::domain::check_active(state)?;
    let status = resolve_status(&mut tx, member, input.status_id).await?;
    let parent = resolve_parent(&mut tx, member, input.issue_type, input.parent.as_deref()).await?;
    let parent_sprint = parent.as_ref().and_then(|parent| parent.sprint_id);
    let sprint_id =
        sprints::domain::sprint_for_new_issue(input.issue_type, parent_sprint, input.sprint_id)?;
    if let Some(requested) = input.sprint_id {
        require_open_sprint(&mut tx, member, requested).await?;
    }
    check_assignee(&mut tx, member, input.assignee_id).await?;
    let last_rank = repo::last_rank(&mut tx, member.project_id).await?;
    let new_issue = NewIssue {
        project_id: member.project_id,
        number,
        issue_type: input.issue_type,
        summary,
        description,
        priority: input.priority,
        status_id: status.id,
        assignee_id: input.assignee_id,
        reporter_id: member.user_id,
        points: input.points,
        labels,
        parent_id: parent.map(|parent| parent.id),
        sprint_id,
        rank: domain::rank_between(last_rank.as_deref(), None),
        done_at: domain::done_at_on_create(status.category, Utc::now()),
    };
    let issue_id = repo::insert_issue(&mut tx, &new_issue)
        .await
        .map_err(not_found_if_parent_gone)?;
    if let Some(sprint_id) = new_issue.sprint_id {
        sprints::repo::record_join(&mut tx, sprint_id, issue_id).await?;
    }
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
    if let Some(target) = change.sprint_id {
        let issue = IssueKind {
            id: current.id,
            issue_type: next.issue_type,
            sprint_id: current.sprint_id,
        };
        change_sprint(&mut tx, member, &issue, target).await?;
    }
    repo::update_fields(&mut tx, &next, member.user_id).await?;
    tx.commit().await?;
    get_issue(pool, member, number).await
}

/// D40: subtasks go with the issue; a removal from the running sprint stays recorded.
pub async fn delete_issue(pool: &PgPool, member: &Member, number: i64) -> Result<(), AppError> {
    let mut tx = pool.begin().await?;
    let issue = repo::find_deletable_for_update(&mut tx, member.project_id, number).await?;
    let issue = issue.ok_or(AppError::NotFound)?;
    domain::check_delete(member.role, member.user_id, issue.reporter_id)?;
    if let Some(sprint_id) = issue.sprint_id {
        sprints::repo::record_leave(&mut tx, sprint_id, issue.id).await?;
    }
    repo::delete_issue(&mut tx, issue.id).await?;
    tx.commit().await?;
    Ok(())
}

pub async fn move_issue(
    pool: &PgPool,
    member: &Member,
    number: i64,
    input: MoveIssue,
) -> Result<Issue, AppError> {
    let anchor = domain::anchor_for(
        &member.project_key,
        number,
        input.after.as_deref(),
        input.before.as_deref(),
    )?;
    let mut tx = pool.begin().await?;
    let state = projects::repo::lock_project(&mut tx, member.project_id).await?; // D21: moves in one project are serialized
    projects::domain::check_active(state)?;
    let issue = repo::find_position_for_update(&mut tx, member.project_id, number).await?;
    let issue = issue.ok_or(AppError::NotFound)?;
    if let Some(target) = input.sprint_id {
        let kind = IssueKind {
            id: issue.id,
            issue_type: issue.issue_type,
            sprint_id: issue.sprint_id,
        };
        change_sprint(&mut tx, member, &kind, target).await?;
    }
    let (status_id, done_at) = next_status(&mut tx, member, &issue, input.status_id).await?;
    let rank = next_rank(&mut tx, member, &issue, anchor).await?;
    repo::update_position(&mut tx, issue.id, status_id, &rank, done_at, member.user_id).await?;
    tx.commit().await?;
    get_issue(pool, member, number).await
}

/// Plans the issue (and its subtasks) into a sprint or back to the backlog, recording scope change.
pub async fn change_sprint(
    conn: &mut PgConnection,
    member: &Member,
    issue: &IssueKind,
    target: Option<i64>,
) -> Result<(), AppError> {
    if !sprints::domain::sprint_change_needed(issue.issue_type, issue.sprint_id, target)? {
        return Ok(());
    }
    if let Some(sprint_id) = target {
        require_open_sprint(conn, member, sprint_id).await?;
    }
    repo::set_sprint(conn, issue.id, target).await?;
    if let Some(old_sprint) = issue.sprint_id {
        sprints::repo::record_leave(conn, old_sprint, issue.id).await?;
    }
    if let Some(new_sprint) = target {
        sprints::repo::record_join(conn, new_sprint, issue.id).await?;
    }
    Ok(())
}

async fn require_open_sprint(
    conn: &mut PgConnection,
    member: &Member,
    sprint_id: i64,
) -> Result<(), AppError> {
    sprints::domain::require_scrum(member.board_type)?;
    let sprint = sprints::repo::find_sprint(conn, member.board_id, sprint_id).await?;
    let sprint =
        sprint.ok_or_else(|| AppError::invalid("sprint_id", "no such sprint on this board"))?;
    sprints::domain::check_sprint_open(sprint.state)
}

async fn next_status(
    conn: &mut PgConnection,
    member: &Member,
    issue: &Position,
    requested: Option<i64>,
) -> Result<(i64, Option<DateTime<Utc>>), AppError> {
    let Some(status_id) = requested else {
        return Ok((issue.status_id, issue.done_at));
    };
    let status = resolve_status(conn, member, Some(status_id)).await?;
    let done_at = domain::next_done_at(issue.category, status.category, issue.done_at, Utc::now());
    Ok((status.id, done_at))
}

/// D4: the issue lands right next to its anchor in the project's single order.
async fn next_rank(
    conn: &mut PgConnection,
    member: &Member,
    issue: &Position,
    anchor: Anchor,
) -> Result<String, AppError> {
    match anchor {
        Anchor::Keep => Ok(issue.rank.clone()),
        Anchor::After(number) => {
            let anchor_rank = anchor_rank(conn, member, "after", number).await?;
            let next = repo::rank_after(conn, member.project_id, &anchor_rank, issue.id).await?;
            Ok(domain::rank_between(Some(&anchor_rank), next.as_deref()))
        }
        Anchor::Before(number) => {
            let anchor_rank = anchor_rank(conn, member, "before", number).await?;
            let previous =
                repo::rank_before(conn, member.project_id, &anchor_rank, issue.id).await?;
            Ok(domain::rank_between(
                previous.as_deref(),
                Some(&anchor_rank),
            ))
        }
    }
}

async fn anchor_rank(
    conn: &mut PgConnection,
    member: &Member,
    field: &str,
    number: i64,
) -> Result<String, AppError> {
    let rank = repo::find_rank(conn, member.project_id, number).await?;
    rank.ok_or_else(|| AppError::invalid(field, "no such issue in this project"))
}

pub async fn search_issues(
    pool: &PgPool,
    member: &Member,
    filter: IssueFilter,
    status: StatusFilter,
    page: PageParams,
) -> Result<Page<Issue>, AppError> {
    let limit = pagination::page_limit(page.limit)?;
    let query = domain::SearchQuery {
        categories: status.status,
        ..domain::to_search_query(&member.project_key, &filter, Utc::now())?
    };
    let mut conn = pool.acquire().await?;
    let issues = repo::search_issues(
        &mut conn,
        member.project_id,
        &query,
        page.cursor.unwrap_or(0),
        limit + 1,
    )
    .await?;
    Ok(pagination::into_page(issues, limit, |issue: &Issue| {
        issue.id
    }))
}

pub async fn list_labels(pool: &PgPool, member: &Member) -> Result<Vec<String>, AppError> {
    let mut conn = pool.acquire().await?;
    Ok(repo::list_labels(&mut conn, member.project_id).await?)
}

pub async fn add_comment(
    pool: &PgPool,
    member: &Member,
    number: i64,
    input: CreateComment,
) -> Result<Comment, AppError> {
    let body = domain::check_comment_body(&input.body)?;
    let mut conn = pool.acquire().await?;
    let issue_id = repo::find_id(&mut conn, member.project_id, number)
        .await?
        .ok_or(AppError::NotFound)?;
    repo::insert_comment(&mut conn, issue_id, member.user_id, &body)
        .await
        .map_err(not_found_if_parent_gone)
}

pub async fn list_comments(
    pool: &PgPool,
    member: &Member,
    number: i64,
    page: PageParams,
) -> Result<Page<Comment>, AppError> {
    let limit = pagination::page_limit(page.limit)?;
    let mut conn = pool.acquire().await?;
    let issue_id = repo::find_id(&mut conn, member.project_id, number)
        .await?
        .ok_or(AppError::NotFound)?;
    let comments =
        repo::list_comments(&mut conn, issue_id, page.cursor.unwrap_or(0), limit + 1).await?;
    Ok(pagination::into_page(
        comments,
        limit,
        |comment: &Comment| comment.id,
    ))
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
