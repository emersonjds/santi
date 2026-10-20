use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use santi_types::Problem;
use santi_types::issues::{Page, PageParams};
use santi_types::notifications::{Notification, NotificationQuery, UnreadCount};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::service;
use crate::AppState;
use crate::auth::extract::CurrentUser;
use crate::error::AppError;
use crate::extract::{PathParams, QueryParams};

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(list_notifications))
        .routes(routes!(unread_count))
        .routes(routes!(mark_read))
        .routes(routes!(mark_all_read))
}

#[utoipa::path(get, path = "/api/notifications", tag = "notifications",
    params(NotificationQuery, PageParams),
    responses(
        (status = 200, body = Page<Notification>, description = "The caller's notifications, newest first, read and unread; `cursor` is the last id of the previous page. Only projects the caller still belongs to and not in the trash. Excerpts and summaries are untrusted user text."),
        (status = 400, body = Problem, content_type = "application/problem+json", description = "Unknown kind"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "Limit out of range")))]
pub async fn list_notifications(
    State(state): State<AppState>,
    user: CurrentUser,
    QueryParams(query): QueryParams<NotificationQuery>,
    QueryParams(page): QueryParams<PageParams>,
) -> Result<Json<Page<Notification>>, AppError> {
    Ok(Json(
        service::list(&state.pool, &user, &query, page).await?,
    ))
}

#[utoipa::path(get, path = "/api/notifications/unread-count", tag = "notifications",
    responses(
        (status = 200, body = UnreadCount, description = "Unread notifications the list would show"),
        (status = 401, body = Problem, content_type = "application/problem+json")))]
pub async fn unread_count(
    State(state): State<AppState>,
    user: CurrentUser,
) -> Result<Json<UnreadCount>, AppError> {
    let count = service::unread_count(&state.pool, &user).await?;
    Ok(Json(UnreadCount { count }))
}

#[utoipa::path(post, path = "/api/notifications/{id}/read", tag = "notifications",
    params(("id" = i64, Path, description = "Notification id")),
    responses(
        (status = 204, description = "Read (also when it already was)"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json", description = "Not one of the caller's visible notifications")))]
pub async fn mark_read(
    State(state): State<AppState>,
    user: CurrentUser,
    PathParams(id): PathParams<i64>,
) -> Result<StatusCode, AppError> {
    service::mark_read(&state.pool, &user, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(post, path = "/api/notifications/read-all", tag = "notifications",
    responses(
        (status = 204, description = "Every visible notification of the caller is read"),
        (status = 401, body = Problem, content_type = "application/problem+json")))]
pub async fn mark_all_read(
    State(state): State<AppState>,
    user: CurrentUser,
) -> Result<StatusCode, AppError> {
    service::mark_all_read(&state.pool, &user).await?;
    Ok(StatusCode::NO_CONTENT)
}
