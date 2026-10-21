use santi_types::links::{CreateLink, IssueLink, LinkedIssue};
use sqlx::{PgConnection, PgPool};

use super::repo::LinkRow;
use super::{domain, repo};
use crate::error::AppError;
use crate::members::Member;
use crate::{issues, projects};

fn to_link(row: LinkRow) -> IssueLink {
    IssueLink {
        id: row.id,
        relation: domain::seen_from(&row.link_type, row.is_source),
        issue: LinkedIssue {
            key: row.key,
            summary: row.summary,
            status_id: row.status_id,
            status_name: row.status_name,
            status_category: row.status_category,
            priority: row.priority,
            assignee_id: row.assignee_id,
            assignee_name: row.assignee_name,
            issue_type: row.issue_type,
        },
    }
}

async fn issue_id(conn: &mut PgConnection, member: &Member, number: i64) -> Result<i64, AppError> {
    issues::repo::find_id(conn, member.project_id, number)
        .await?
        .ok_or(AppError::NotFound)
}

/// Grouped by relation in display order, then by the other issue's key.
pub async fn list(pool: &PgPool, member: &Member, number: i64) -> Result<Vec<IssueLink>, AppError> {
    let mut conn = pool.acquire().await?;
    let issue_id = issue_id(&mut conn, member, number).await?;
    let rows = repo::list(&mut conn, member.user_id, issue_id, None).await?;
    let mut links: Vec<IssueLink> = rows.into_iter().map(to_link).collect();
    links.sort_by_key(|link| link.relation);
    Ok(links)
}

/// D59: the other issue must be one the caller can open; one they cannot answers 404 (no leak).
pub async fn create(
    pool: &PgPool,
    member: &Member,
    number: i64,
    input: CreateLink,
) -> Result<IssueLink, AppError> {
    let (project_key, other_number) = domain::parse_issue_key(&input.issue)?;
    let mut conn = pool.acquire().await?;
    let issue_id = issue_id(&mut conn, member, number).await?;
    let other = repo::find_visible(&mut conn, member.user_id, &project_key, other_number)
        .await?
        .ok_or(AppError::NotFound)?;
    if other.archived {
        return Err(projects::domain::archived());
    }
    domain::check_not_self(issue_id, other.id)?;
    let stored = domain::stored(input.relation);
    let (source_id, target_id) = if stored.forward {
        (issue_id, other.id)
    } else {
        (other.id, issue_id)
    };
    let link_id = repo::insert(
        &mut conn,
        source_id,
        target_id,
        stored.link_type,
        member.user_id,
    )
    .await
    .map_err(|error| match error.as_database_error() {
        Some(error) if error.is_unique_violation() => domain::already_linked(),
        Some(error) if error.is_foreign_key_violation() => AppError::NotFound,
        _ => AppError::from(error),
    })?;
    let row = repo::list(&mut conn, member.user_id, issue_id, Some(link_id))
        .await?
        .pop()
        .ok_or(AppError::NotFound)?;
    Ok(to_link(row))
}

pub async fn delete(pool: &PgPool, member: &Member, number: i64, id: i64) -> Result<(), AppError> {
    let mut conn = pool.acquire().await?;
    let issue_id = issue_id(&mut conn, member, number).await?;
    if !repo::delete(&mut conn, member.user_id, issue_id, id).await? {
        return Err(AppError::NotFound);
    }
    Ok(())
}
