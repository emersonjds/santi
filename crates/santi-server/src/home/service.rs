use santi_types::home::{
    HomeExport, HomeIssue, HomeView, IssueSearchQuery, ItemKind, MyItem, MyProject,
};
use santi_types::issues::{Page, PageParams};
use santi_types::links::LinkedIssue;
use sqlx::PgPool;

use super::domain::{self, StarTarget};
use super::repo;
use crate::auth::extract::CurrentUser;
use crate::error::{AppError, reject_nul};
use crate::issues::domain::{like_pattern, search_key};
use crate::members::Member;
use crate::pagination;

pub async fn my_projects(pool: &PgPool, user: &CurrentUser) -> Result<Vec<MyProject>, AppError> {
    let mut conn = pool.acquire().await?;
    Ok(repo::my_projects(&mut conn, user.id).await?)
}

pub async fn my_issues(
    pool: &PgPool,
    user: &CurrentUser,
    view: HomeView,
    page: PageParams,
) -> Result<Page<HomeIssue>, AppError> {
    let (offset, limit) = offset_limit(&page)?;
    let view = match view {
        HomeView::Recommended => "recommended",
        HomeView::Assigned => "assigned",
        HomeView::Starred => "starred",
        HomeView::Worked => "worked",
        HomeView::Viewed => "viewed",
    };
    let mut conn = pool.acquire().await?;
    let items = repo::my_issues(&mut conn, user.id, view, offset, limit + 1).await?;
    Ok(offset_page(items, offset, limit))
}

pub async fn search_issues(
    pool: &PgPool,
    user: &CurrentUser,
    query: IssueSearchQuery,
) -> Result<Vec<LinkedIssue>, AppError> {
    let limit = domain::search_limit(query.limit)?;
    let q = query.q.as_deref();
    reject_nul("q", q.unwrap_or_default())?;
    let (project_key, number) = search_key(q).unzip();
    let mut conn = pool.acquire().await?;
    Ok(repo::search_issues(
        &mut conn,
        user.id,
        like_pattern(q).as_deref(),
        project_key.flatten().as_deref(),
        number,
        query.include_archived,
        limit,
    )
    .await?)
}

pub async fn my_recent(
    pool: &PgPool,
    user: &CurrentUser,
    q: Option<&str>,
    page: PageParams,
) -> Result<Page<MyItem>, AppError> {
    let (offset, limit) = offset_limit(&page)?;
    let pattern = like_pattern(q);
    let mut conn = pool.acquire().await?;
    let items = repo::my_recent(&mut conn, user.id, pattern.as_deref(), offset, limit + 1).await?;
    Ok(offset_page(items, offset, limit))
}

pub async fn my_starred(
    pool: &PgPool,
    user: &CurrentUser,
    kind: Option<ItemKind>,
    q: Option<&str>,
    page: PageParams,
) -> Result<Page<MyItem>, AppError> {
    let (offset, limit) = offset_limit(&page)?;
    let kind = kind.map(|kind| match kind {
        ItemKind::Project => "project",
        ItemKind::Issue => "issue",
    });
    let pattern = like_pattern(q);
    let mut conn = pool.acquire().await?;
    let items = repo::my_starred(
        &mut conn,
        user.id,
        kind,
        pattern.as_deref(),
        offset,
        limit + 1,
    )
    .await?;
    Ok(offset_page(items, offset, limit))
}

fn offset_limit(page: &PageParams) -> Result<(i64, i64), AppError> {
    let limit = pagination::page_limit(page.limit)?;
    Ok((page.cursor.unwrap_or(0).max(0), limit))
}

/// `items` holds up to `limit + 1` rows; `cursor` is the offset of the next page.
fn offset_page<T>(mut items: Vec<T>, offset: i64, limit: i64) -> Page<T> {
    let has_more = items.len() > limit as usize;
    items.truncate(limit as usize);
    let next_cursor = has_more.then_some(offset + limit);
    Page { items, next_cursor }
}

pub async fn set_star(
    pool: &PgPool,
    user: &CurrentUser,
    key: &str,
    starred: bool,
) -> Result<(), AppError> {
    let target = domain::parse_star_key(key)?;
    let mut conn = pool.acquire().await?;
    let found = match (target, starred) {
        (StarTarget::Project(key), _) => {
            repo::star_project(&mut conn, user.id, &key, starred).await?
        }
        (StarTarget::Issue(key, number), true) => {
            repo::star_issue(&mut conn, user.id, &key, number).await?
        }
        (StarTarget::Issue(key, number), false) => {
            repo::unstar_issue(&mut conn, user.id, &key, number).await?
        }
    };
    found.then_some(()).ok_or(AppError::NotFound)
}

pub async fn view_issue(pool: &PgPool, member: &Member, number: i64) -> Result<(), AppError> {
    let mut conn = pool.acquire().await?;
    let found = repo::record_view(&mut conn, member.user_id, member.project_id, number).await?;
    found.then_some(()).ok_or(AppError::NotFound)
}

pub async fn visit_project(pool: &PgPool, member: &Member) -> Result<(), AppError> {
    let mut conn = pool.acquire().await?;
    Ok(repo::record_visit(&mut conn, member.user_id, member.project_id).await?)
}

/// D45: the caller's stars, visits, views and work, with their times.
pub async fn export(pool: &PgPool, user_id: i64) -> Result<HomeExport, AppError> {
    let mut conn = pool.acquire().await?;
    Ok(HomeExport {
        projects: repo::export_projects(&mut conn, user_id).await?,
        issues: repo::export_issues(&mut conn, user_id).await?,
    })
}
