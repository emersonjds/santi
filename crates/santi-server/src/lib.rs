pub mod auth;
pub mod boards;
pub mod error;
pub mod extract;
pub mod imports;
pub mod issues;
pub mod members;
pub mod pagination;
pub mod projects;
pub mod rate_limit;
pub mod seed;
pub mod sprints;

use std::path::Path;
use std::sync::Arc;

use axum::extract::{Request, State};
use axum::http::header::{
    CACHE_CONTROL, CONTENT_SECURITY_POLICY, REFERRER_POLICY, VARY, X_CONTENT_TYPE_OPTIONS,
};
use axum::http::{HeaderValue, Response};
use axum::response::IntoResponse;
use axum::routing::{any, get, get_service};
use axum::{Json, Router, middleware};
use santi_types::{Health, Problem};
use sqlx::PgPool;
use tower::ServiceExt;
use tower_http::compression::CompressionLayer;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::set_header::{SetResponseHeader, SetResponseHeaderLayer};
use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;
use utoipa_swagger_ui::SwaggerUi;

use crate::error::AppError;
use crate::rate_limit::RateLimits;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub limits: Arc<RateLimits>,
}

#[derive(OpenApi)]
#[openapi(
    info(
        title = "santi",
        description = "Agile tracker API. Authenticate with the `__Host-santi_session` cookie or `Authorization: Bearer santi_…`. Errors are RFC 9457 `application/problem+json`."
    ),
    components(schemas(Problem))
)]
struct ApiDoc;

fn api() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(health))
        .merge(auth::handler::router())
        .merge(projects::handler::router())
        .merge(members::handler::router())
        .merge(boards::handler::router())
        .merge(issues::handler::router())
        .merge(sprints::handler::router())
        .merge(imports::handler::router())
}

/// The API contract, built without a database; `web/openapi.json` is its committed snapshot (D38).
pub fn openapi() -> utoipa::openapi::OpenApi {
    api().split_for_parts().1
}

/// `web_dir` holds the SPA build; when it has an `index.html` the server answers every GET it
/// has no route for with that page (client routes, D37), except under `/api`.
pub fn app(state: AppState, web_dir: Option<&Path>) -> Router {
    let (router, api) = api().split_for_parts();
    let router = router.merge(SwaggerUi::new("/docs").url("/openapi.json", api));
    let router = match web_dir.filter(|dir| dir.join("index.html").is_file()) {
        Some(dir) => router.merge(spa(dir)),
        None => router.fallback(not_found),
    };
    router
        .layer(middleware::from_fn(auth::extract::reject_cross_site_writes))
        .layer(SetResponseHeaderLayer::if_not_present(
            X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            REFERRER_POLICY,
            HeaderValue::from_static("strict-origin-when-cross-origin"),
        ))
        .layer(CompressionLayer::new())
        .with_state(state)
}

/// sonner and Radix's scroll lock add `<style>` tags at runtime: styles need `'unsafe-inline'`.
/// Swagger UI under `/docs` runs inline scripts, so the policy covers the SPA only.
const CSP: &str = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

/// Hashed `/assets/*` are cached for good; pages are revalidated so a deploy shows at once.
/// `/` is the landing page without a session cookie and the app with one (D37 amendment);
/// `/about` is always the landing page; `/privacy` and `/terms` are static pages next to it.
fn spa(dir: &Path) -> Router<AppState> {
    let assets = ServeDir::new(dir.join("assets"));
    let index = ServeFile::new(dir.join("index.html"));
    let landing = ServeFile::new(dir.join("landing.html"));
    let home = {
        let (index, landing) = (index.clone(), landing.clone());
        move |request: Request| async move {
            let page = match auth::domain::session_token(request.headers()) {
                Some(_) => index,
                None => landing,
            };
            let Ok(response) = page.oneshot(request).await;
            ([(VARY, "cookie")], response).into_response()
        }
    };
    let pages = Router::new()
        .route("/", get(home))
        .route("/about", get_service(landing))
        .route(
            "/privacy",
            get_service(ServeFile::new(dir.join("privacy.html"))),
        )
        .route(
            "/terms",
            get_service(ServeFile::new(dir.join("terms.html"))),
        )
        .fallback_service(ServeDir::new(dir).fallback(index))
        .layer(SetResponseHeaderLayer::overriding(
            CACHE_CONTROL,
            cache_when_ok("no-cache"),
        ));
    Router::new()
        .nest_service(
            "/assets",
            SetResponseHeader::overriding(assets, CACHE_CONTROL, cache_when_ok(IMMUTABLE)),
        )
        .route("/api", any(not_found))
        .route("/api/", any(not_found))
        .route("/api/{*path}", any(not_found))
        .merge(pages)
        .layer(SetResponseHeaderLayer::overriding(
            CONTENT_SECURITY_POLICY,
            HeaderValue::from_static(CSP),
        ))
}

const IMMUTABLE: &str = "public, max-age=31536000, immutable";

fn cache_when_ok<B>(value: &'static str) -> impl Fn(&Response<B>) -> Option<HeaderValue> + Clone {
    move |response| {
        response
            .status()
            .is_success()
            .then(|| HeaderValue::from_static(value))
    }
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
