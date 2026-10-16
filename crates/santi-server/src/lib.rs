pub mod auth;
pub mod boards;
pub mod error;
pub mod extract;
pub mod issues;
pub mod members;
pub mod pagination;
pub mod projects;
pub mod sprints;
pub mod web;

use axum::extract::State;
use axum::{Json, Router, middleware};
use santi_types::{Health, Problem};
use sqlx::PgPool;
use tower_http::compression::CompressionLayer;
use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;
use utoipa_swagger_ui::SwaggerUi;

use crate::error::AppError;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
}

#[derive(OpenApi)]
#[openapi(
    info(
        title = "santi",
        description = "Agile tracker API. Authenticate with the `santi_session` cookie or `Authorization: Bearer santi_…`. Errors are RFC 9457 `application/problem+json`."
    ),
    components(schemas(Problem))
)]
struct ApiDoc;

pub fn app(state: AppState) -> Router {
    let (router, api) = OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(health))
        .merge(auth::handler::router())
        .merge(projects::handler::router())
        .merge(members::handler::router())
        .merge(boards::handler::router())
        .merge(issues::handler::router())
        .merge(sprints::handler::router())
        .split_for_parts();
    router
        .merge(SwaggerUi::new("/docs").url("/openapi.json", api))
        .merge(web::router())
        .fallback(not_found)
        .layer(middleware::from_fn(auth::extract::reject_cross_site_writes))
        .layer(CompressionLayer::new())
        .with_state(state)
}

pub async fn migrate(pool: &PgPool) -> Result<(), sqlx::migrate::MigrateError> {
    sqlx::migrate!().run(pool).await
}

#[utoipa::path(get, path = "/health", tag = "health", responses((status = 200, body = Health)))]
async fn health(State(state): State<AppState>) -> Result<Json<Health>, AppError> {
    sqlx::query_scalar!(r#"SELECT 1 AS "one!""#)
        .fetch_one(&state.pool)
        .await?;
    Ok(Json(Health {
        status: "ok".into(),
        version: env!("CARGO_PKG_VERSION").into(),
    }))
}

async fn not_found() -> AppError {
    AppError::NotFound
}
