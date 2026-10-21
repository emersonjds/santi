use axum::Json;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use santi_types::Problem;
use santi_types::home::{
    HomeIssue, HomeQuery, IssueSearchQuery, MyItem, MyProject, RecentQuery, Star, StarredQuery,
};
use santi_types::issues::{Page, PageParams};
use santi_types::links::LinkedIssue;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::service;
use crate::AppState;
use crate::auth::domain::bearer_token;
use crate::auth::extract::CurrentUser;
use crate::error::AppError;
use crate::extract::{JsonBody, PathParams, QueryParams};
use crate::members::Member;

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(my_projects))
        .routes(routes!(my_issues))
        .routes(routes!(search_my_issues))
        .routes(routes!(my_recent))
        .routes(routes!(my_starred))
        .routes(routes!(star))
        .routes(routes!(unstar))
        .routes(routes!(view_issue))
        .routes(routes!(visit_project))
}

#[utoipa::path(get, path = "/api/me/projects", tag = "home",
    responses(
        (status = 200, body = Vec<MyProject>, description = "The caller's projects: recently visited or worked first, then starred, then by key"),
        (status = 401, body = Problem, content_type = "application/problem+json")))]
pub async fn my_projects(
    State(state): State<AppState>,
    user: CurrentUser,
) -> Result<Json<Vec<MyProject>>, AppError> {
    Ok(Json(service::my_projects(&state.pool, &user).await?))
}

#[utoipa::path(get, path = "/api/me/issues", tag = "home",
    params(HomeQuery, PageParams),
    responses(
        (status = 200, body = Page<HomeIssue>, description = "Newest first across the caller's projects; `cursor` is an offset"),
        (status = 400, body = Problem, content_type = "application/problem+json", description = "Unknown view"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "Limit out of range")))]
pub async fn my_issues(
    State(state): State<AppState>,
    user: CurrentUser,
    QueryParams(query): QueryParams<HomeQuery>,
    QueryParams(page): QueryParams<PageParams>,
) -> Result<Json<Page<HomeIssue>>, AppError> {
    Ok(Json(
        service::my_issues(&state.pool, &user, query.view, page).await?,
    ))
}

#[utoipa::path(get, path = "/api/me/issues/search", tag = "home",
    params(IssueSearchQuery),
    responses(
        (status = 200, body = Vec<LinkedIssue>, description = "Issues in the caller's projects, never trashed ones and archived ones only on request, whose summary holds `q` or whose key or number `q` names; key matches first, then the most recently updated (SAN-206)"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "Limit out of range, or `q` holds a NUL character")))]
pub async fn search_my_issues(
    State(state): State<AppState>,
    user: CurrentUser,
    QueryParams(query): QueryParams<IssueSearchQuery>,
) -> Result<Json<Vec<LinkedIssue>>, AppError> {
    Ok(Json(
        service::search_my_issues(&state.pool, &user, query).await?,
    ))
}

#[utoipa::path(get, path = "/api/me/recent", tag = "home",
    params(RecentQuery, PageParams),
    responses(
        (status = 200, body = Page<MyItem>, description = "Projects and issues the caller visited, viewed or worked on, newest first; `cursor` is an offset"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "Limit out of range")))]
pub async fn my_recent(
    State(state): State<AppState>,
    user: CurrentUser,
    QueryParams(query): QueryParams<RecentQuery>,
    QueryParams(page): QueryParams<PageParams>,
) -> Result<Json<Page<MyItem>>, AppError> {
    Ok(Json(
        service::my_recent(&state.pool, &user, query.q.as_deref(), page).await?,
    ))
}

#[utoipa::path(get, path = "/api/me/starred", tag = "home",
    params(StarredQuery, PageParams),
    responses(
        (status = 200, body = Page<MyItem>, description = "Projects and issues the caller starred, newest star first; `cursor` is an offset"),
        (status = 400, body = Problem, content_type = "application/problem+json", description = "Unknown kind"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 422, body = Problem, content_type = "application/problem+json", description = "Limit out of range")))]
pub async fn my_starred(
    State(state): State<AppState>,
    user: CurrentUser,
    QueryParams(query): QueryParams<StarredQuery>,
    QueryParams(page): QueryParams<PageParams>,
) -> Result<Json<Page<MyItem>>, AppError> {
    Ok(Json(
        service::my_starred(&state.pool, &user, query.kind, query.q.as_deref(), page).await?,
    ))
}

#[utoipa::path(post, path = "/api/me/stars", tag = "home", request_body = Star,
    responses(
        (status = 204, description = "Starred; starring again keeps the first time"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json", description = "No such project or issue among the caller's projects"),
        (status = 422, body = Problem, content_type = "application/problem+json")))]
pub async fn star(
    State(state): State<AppState>,
    user: CurrentUser,
    JsonBody(input): JsonBody<Star>,
) -> Result<StatusCode, AppError> {
    service::set_star(&state.pool, &user, &input.key, true).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(delete, path = "/api/me/stars/{key}", tag = "home",
    params(("key" = String, Path, description = "Project key (`WEB`) or issue key (`WEB-12`)")),
    responses(
        (status = 204, description = "Not starred any more (also when it was not)"),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json", description = "No such project or issue among the caller's projects"),
        (status = 422, body = Problem, content_type = "application/problem+json")))]
pub async fn unstar(
    State(state): State<AppState>,
    user: CurrentUser,
    PathParams(key): PathParams<String>,
) -> Result<StatusCode, AppError> {
    service::set_star(&state.pool, &user, &key, false).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(post, path = "/api/projects/{key}/issues/{number}/view", tag = "home",
    params(
        ("key" = String, Path, description = "Project key"),
        ("number" = i64, Path, description = "Issue number, the N of KEY-N")),
    responses(
        (status = 204, description = "The browser session opened the issue: it joins the caller's Viewed list (at most once a minute). API tokens are ignored."),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json")))]
pub async fn view_issue(
    State(state): State<AppState>,
    member: Member,
    headers: HeaderMap,
    PathParams((_key, number)): PathParams<(String, i64)>,
) -> Result<StatusCode, AppError> {
    if bearer_token(&headers).is_none() {
        service::view_issue(&state.pool, &member, number).await?;
    }
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(post, path = "/api/projects/{key}/visit", tag = "home",
    params(("key" = String, Path, description = "Project key")),
    responses(
        (status = 204, description = "The browser session opened the project: it moves up the caller's home (at most once a minute). API tokens are ignored."),
        (status = 401, body = Problem, content_type = "application/problem+json"),
        (status = 404, body = Problem, content_type = "application/problem+json")))]
pub async fn visit_project(
    State(state): State<AppState>,
    member: Member,
    headers: HeaderMap,
) -> Result<StatusCode, AppError> {
    if bearer_token(&headers).is_none() {
        service::visit_project(&state.pool, &member).await?;
    }
    Ok(StatusCode::NO_CONTENT)
}
