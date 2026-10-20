use santi_types::issues::{Page, PageParams};
use santi_types::notifications::{Notification, NotificationQuery};
use sqlx::PgPool;

use super::repo;
use crate::auth::extract::CurrentUser;
use crate::error::AppError;
use crate::pagination;

pub async fn list(
    pool: &PgPool,
    user: &CurrentUser,
    query: &NotificationQuery,
    page: PageParams,
) -> Result<Page<Notification>, AppError> {
    let limit = pagination::page_limit(page.limit)?;
    let before_id = page.cursor.unwrap_or(i64::MAX);
    let mut conn = pool.acquire().await?;
    let items = repo::list(&mut conn, user.id, query, before_id, limit + 1).await?;
    Ok(pagination::into_page(
        items,
        limit,
        |item: &Notification| item.id,
    ))
}

pub async fn unread_count(pool: &PgPool, user: &CurrentUser) -> Result<i64, AppError> {
    let mut conn = pool.acquire().await?;
    Ok(repo::unread_count(&mut conn, user.id).await?)
}

pub async fn mark_read(pool: &PgPool, user: &CurrentUser, id: i64) -> Result<(), AppError> {
    let mut conn = pool.acquire().await?;
    let found = repo::mark_read(&mut conn, user.id, id).await?;
    found.then_some(()).ok_or(AppError::NotFound)
}

pub async fn mark_all_read(pool: &PgPool, user: &CurrentUser) -> Result<(), AppError> {
    let mut conn = pool.acquire().await?;
    Ok(repo::mark_all_read(&mut conn, user.id).await?)
}
