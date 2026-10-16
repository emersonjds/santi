use santi_types::home::{HomeIssue, HomeView, MyProject};
use santi_types::issues::{Page, PageParams};
use sqlx::PgPool;

use super::domain::{self, StarTarget};
use super::repo;
use crate::auth::extract::CurrentUser;
use crate::error::AppError;
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
    let limit = pagination::page_limit(page.limit)?;
    let offset = page.cursor.unwrap_or(0).max(0);
    let view = match view {
        HomeView::Recommended => "recommended",
        HomeView::Assigned => "assigned",
        HomeView::Starred => "starred",
        HomeView::Worked => "worked",
        HomeView::Viewed => "viewed",
    };
    let mut conn = pool.acquire().await?;
    let mut items = repo::my_issues(&mut conn, user.id, view, offset, limit + 1).await?;
    let has_more = items.len() > limit as usize;
    items.truncate(limit as usize);
    let next_cursor = has_more.then_some(offset + limit);
    Ok(Page { items, next_cursor })
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
