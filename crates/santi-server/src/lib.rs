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
use axum::middleware::Next;
use axum::response::IntoResponse;
use axum::routing::{MethodRouter, any, get, get_service};
use axum::{Json, Router, middleware};
use santi_types::{Health, Problem};
use sha2::Digest;
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
    pub legal: Arc<Legal>,
}

impl AppState {
    /// Default limits (D44) and required legal documents without text hashes (D45).
    pub fn new(pool: PgPool) -> Self {
        AppState {
            pool,
            limits: Arc::default(),
            legal: Arc::default(),
        }
    }
}

/// D45: whether sign-up must accept the Terms of Use and Privacy Policy, and the SHA-256 of the
/// pages served, recorded with each acceptance. A self-hoster turns them off with
/// `SANTI_LEGAL_PAGES=off`; `/terms` and `/privacy` then answer 404.
#[derive(Debug, Clone)]
pub struct Legal {
    pub required: bool,
    pub terms_hash: Option<String>,
    pub privacy_hash: Option<String>,
}

impl Default for Legal {
    fn default() -> Self {
        Legal {
            required: true,
            terms_hash: None,
            privacy_hash: None,
        }
    }
}

impl Legal {
    pub fn from_web_dir(required: bool, web_dir: &Path) -> Self {
        let hash = |page: &str| {
            let text = std::fs::read(web_dir.join(page)).ok()?;
            let digest = sha2::Sha256::digest(&text);
            Some(digest.iter().map(|byte| format!("{byte:02x}")).collect())
        };
        Legal {
            required,
            terms_hash: hash("terms.html"),
            privacy_hash: hash("privacy.html"),
        }
    }
}

/// Removes expired sessions, and invites used or expired more than a week ago (a recent one
/// still answers 410 rather than 404). Returns (sessions, invites) deleted.
pub async fn purge_expired(pool: &PgPool) -> Result<(u64, u64), sqlx::Error> {
    let sessions = sqlx::query!("DELETE FROM auth_token WHERE expires_at < now()")
        .execute(pool)
        .await?;
    let invites = sqlx::query!(
        "DELETE FROM invite
         WHERE used_at < now() - interval '7 days' OR expires_at < now() - interval '7 days'"
    )
    .execute(pool)
    .await?;
    Ok((sessions.rows_affected(), invites.rows_affected()))
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
        Some(dir) => router.merge(spa(dir, state.legal.required)),
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
fn spa(dir: &Path, legal_pages: bool) -> Router<AppState> {
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
    let mut pages = Router::new()
        .route("/", get(home))
        .route("/about", get_service(landing));
    for page in ["privacy", "terms"] {
        pages = match legal_pages {
            true => pages.route(&format!("/{page}"), legal_page(dir, page)),
            false => pages.route(&format!("/{page}"), any(not_found)),
        };
    }
    let pages = pages
        .fallback_service(ServeDir::new(dir).fallback(index))
        .layer(SetResponseHeaderLayer::overriding(
            CACHE_CONTROL,
            cache_when_ok("no-cache"),
        ));
    let router = Router::new()
        .nest_service(
            "/assets",
            SetResponseHeader::overriding(assets, CACHE_CONTROL, cache_when_ok(IMMUTABLE)),
        )
        .route("/api", any(not_found))
        .route("/api/", any(not_found))
        .route("/api/{*path}", any(not_found))
        .merge(pages);
    let router = match legal_pages {
        true => router,
        false => router.layer(middleware::from_fn(hide_legal_files)),
    };
    router.layer(SetResponseHeaderLayer::overriding(
        CONTENT_SECURITY_POLICY,
        HeaderValue::from_static(CSP),
    ))
}

/// D45: with the legal pages off, no spelling of their files (percent-encoded, dotted, other
/// case on a case-insensitive disk) reaches `ServeDir`.
async fn hide_legal_files(request: Request, next: Next) -> Response<axum::body::Body> {
    let path = percent_decoded(request.uri().path()).to_lowercase();
    let file = path
        .rsplit(['/', '\\'])
        .find(|segment| !segment.is_empty() && *segment != ".");
    let legal = file.is_some_and(|file| file.starts_with("privacy.") || file.starts_with("terms."));
    if legal {
        return AppError::NotFound.into_response();
    }
    next.run(request).await
}

fn percent_decoded(path: &str) -> String {
    let bytes = path.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        let escaped = bytes
            .get(index + 1..index + 3)
            .and_then(|hex| std::str::from_utf8(hex).ok())
            .and_then(|hex| u8::from_str_radix(hex, 16).ok());
        match (bytes[index], escaped) {
            (b'%', Some(byte)) => {
                decoded.push(byte);
                index += 3;
            }
            (byte, _) => {
                decoded.push(byte);
                index += 1;
            }
        }
    }
    String::from_utf8_lossy(&decoded).into_owned()
}

/// `/privacy` and `/terms` in English, or in Brazilian Portuguese with `?lang=pt-BR` (D45).
fn legal_page(dir: &Path, page: &str) -> MethodRouter<AppState> {
    let english = ServeFile::new(dir.join(format!("{page}.html")));
    let portuguese = ServeFile::new(dir.join(format!("{page}.pt-BR.html")));
    get(move |request: Request| async move {
        let wants_portuguese = request
            .uri()
            .query()
            .is_some_and(|query| query.split('&').any(|pair| pair.starts_with("lang=pt")));
        let page = if wants_portuguese {
            portuguese
        } else {
            english
        };
        let Ok(response) = page.oneshot(request).await;
        response
    })
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
