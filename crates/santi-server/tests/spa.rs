use std::path::{Path, PathBuf};

use axum::Router;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use axum::response::Response;
use http_body_util::BodyExt;
use sqlx::PgPool;
use tower::ServiceExt;

const INDEX: &str = "<!doctype html><title>santi spa</title>";
const LANDING: &str = "<!doctype html><title>santi landing</title>";
const PRIVACY: &str = "<!doctype html><title>santi privacy</title>";
const TERMS: &str = "<!doctype html><title>santi terms</title>";
const PRIVACY_PT: &str = "<!doctype html><title>santi privacidade</title>";
const TERMS_PT: &str = "<!doctype html><title>santi termos</title>";
const SESSION: &str = "theme=light; __Host-santi_session=abc";
const IMMUTABLE: &str = "public, max-age=31536000, immutable";

fn app(web_dir: Option<&Path>) -> Router {
    let pool = PgPool::connect_lazy("postgres://localhost/unused").unwrap();
    santi_server::app(santi_server::AppState::new(pool), web_dir)
}

fn built_spa(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("santi-spa-{name}-{}", std::process::id()));
    std::fs::create_dir_all(dir.join("assets")).unwrap();
    std::fs::write(dir.join("index.html"), INDEX).unwrap();
    std::fs::write(dir.join("landing.html"), LANDING).unwrap();
    std::fs::write(dir.join("privacy.html"), PRIVACY).unwrap();
    std::fs::write(dir.join("terms.html"), TERMS).unwrap();
    std::fs::write(dir.join("privacy.pt-BR.html"), PRIVACY_PT).unwrap();
    std::fs::write(dir.join("terms.pt-BR.html"), TERMS_PT).unwrap();
    std::fs::write(dir.join("assets/main-abc123.js"), "console.log('santi')").unwrap();
    dir
}

async fn send(app: &Router, method: Method, uri: &str) -> Response {
    let request = Request::builder()
        .method(method)
        .uri(uri)
        .body(Body::empty())
        .unwrap();
    app.clone().oneshot(request).await.unwrap()
}

async fn get_with_cookie(app: &Router, uri: &str, cookie: &str) -> Response {
    let request = Request::builder()
        .uri(uri)
        .header(header::COOKIE, cookie)
        .body(Body::empty())
        .unwrap();
    app.clone().oneshot(request).await.unwrap()
}

async fn body(response: Response) -> String {
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    String::from_utf8_lossy(&bytes).into_owned()
}

fn cache_control(response: &Response) -> Option<&str> {
    response
        .headers()
        .get(header::CACHE_CONTROL)
        .map(|value| value.to_str().unwrap())
}

#[tokio::test]
async fn every_client_route_gets_index_html_never_cached() {
    let app = app(Some(&built_spa("routes")));

    for uri in ["/login", "/p/SAN/board", "/p/SAN/search?q=x", "/account"] {
        let response = send(&app, Method::GET, uri).await;
        assert_eq!(response.status(), StatusCode::OK, "{uri}");
        assert_eq!(cache_control(&response), Some("no-cache"), "{uri}");
        assert_eq!(body(response).await, INDEX, "{uri}");
    }
}

#[tokio::test]
async fn home_without_a_session_is_the_landing_page() {
    let app = app(Some(&built_spa("landing")));

    for response in [
        send(&app, Method::GET, "/").await,
        get_with_cookie(&app, "/", "theme=light").await,
    ] {
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(cache_control(&response), Some("no-cache"));
        assert_eq!(response.headers()[header::VARY], "cookie");
        assert_eq!(body(response).await, LANDING);
    }
}

#[tokio::test]
async fn home_with_a_session_cookie_is_the_app() {
    let app = app(Some(&built_spa("home-signed-in")));

    let response = get_with_cookie(&app, "/", SESSION).await;

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(cache_control(&response), Some("no-cache"));
    assert_eq!(response.headers()[header::VARY], "cookie");
    assert_eq!(body(response).await, INDEX);
}

#[tokio::test]
async fn privacy_and_terms_are_their_own_pages_signed_in_or_not() {
    let app = app(Some(&built_spa("privacy")));

    for (uri, page) in [
        ("/privacy", PRIVACY),
        ("/terms", TERMS),
        ("/privacy?lang=pt-BR", PRIVACY_PT),
        ("/terms?lang=pt-BR", TERMS_PT),
        ("/terms?lang=en", TERMS),
    ] {
        for response in [
            send(&app, Method::GET, uri).await,
            get_with_cookie(&app, uri, SESSION).await,
        ] {
            assert_eq!(response.status(), StatusCode::OK, "{uri}");
            assert_eq!(cache_control(&response), Some("no-cache"));
            assert_eq!(body(response).await, page);
        }
    }
}

#[tokio::test]
async fn about_is_always_the_landing_page() {
    let app = app(Some(&built_spa("about")));

    for response in [
        send(&app, Method::GET, "/about").await,
        get_with_cookie(&app, "/about", SESSION).await,
    ] {
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(cache_control(&response), Some("no-cache"));
        assert_eq!(body(response).await, LANDING);
    }
}

#[tokio::test]
async fn hashed_assets_are_cached_for_good() {
    let app = app(Some(&built_spa("assets")));

    let response = send(&app, Method::GET, "/assets/main-abc123.js").await;

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(cache_control(&response), Some(IMMUTABLE));
    assert_eq!(body(response).await, "console.log('santi')");
}

#[tokio::test]
async fn a_missing_asset_is_a_plain_404_not_the_page() {
    let app = app(Some(&built_spa("missing-asset")));

    let response = send(&app, Method::GET, "/assets/gone-123.js").await;

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    assert_eq!(cache_control(&response), None);
}

#[tokio::test]
async fn unknown_api_paths_stay_problem_json() {
    let app = app(Some(&built_spa("api")));

    for uri in [
        "/api",
        "/api/",
        "/api/nope",
        "/api/projects/SAN/nope",
        "/api/tokens/1/nope",
    ] {
        let response = send(&app, Method::GET, uri).await;
        assert_eq!(response.status(), StatusCode::NOT_FOUND, "{uri}");
        assert_eq!(
            response.headers()[header::CONTENT_TYPE],
            "application/problem+json",
            "{uri}"
        );
    }
}

#[tokio::test]
async fn server_routes_win_over_the_spa() {
    let app = app(Some(&built_spa("server")));

    let spec = body(send(&app, Method::GET, "/openapi.json").await).await;
    assert!(spec.contains("\"openapi\""));
    let docs = body(send(&app, Method::GET, "/docs/").await).await;
    assert!(!docs.contains("santi spa"));
}

#[tokio::test]
async fn only_reads_fall_back_to_the_page() {
    let app = app(Some(&built_spa("writes")));

    let response = send(&app, Method::POST, "/login").await;

    assert_ne!(response.status(), StatusCode::OK);
    assert!(!body(response).await.contains("santi spa"));
}

#[tokio::test]
async fn without_a_build_every_page_is_a_problem_404() {
    let missing = std::env::temp_dir().join("santi-spa-never-built");

    for app in [app(Some(&missing)), app(None)] {
        let response = send(&app, Method::GET, "/login").await;
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        assert_eq!(
            response.headers()[header::CONTENT_TYPE],
            "application/problem+json"
        );
    }
}

#[tokio::test]
async fn images_may_load_from_the_s3_endpoint_when_it_is_configured() {
    let pool = PgPool::connect_lazy("postgres://localhost/unused").unwrap();
    let config = santi_server::storage::StorageConfig::S3(santi_server::storage::S3Config {
        bucket: "santi-files".into(),
        endpoint: "https://storage.example.test".into(),
        region: "auto".into(),
        access_key_id: "key-id".into(),
        secret_access_key: "secret".into(),
    });
    let state = santi_server::AppState {
        storage: santi_server::storage::Storage::new(&config).unwrap(),
        ..santi_server::AppState::new(pool)
    };
    let app = santi_server::app(state, Some(&built_spa("csp-s3")));

    let response = send(&app, Method::GET, "/p/SAN/board").await;

    assert_eq!(
        header(&response, "content-security-policy"),
        Some(&*CSP.replace(
            "img-src 'self' data:;",
            "img-src 'self' data: https://storage.example.test;"
        ))
    );
}

const CSP: &str = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

fn header<'a>(response: &'a Response, name: &str) -> Option<&'a str> {
    response
        .headers()
        .get(name)
        .map(|value| value.to_str().unwrap())
}

#[tokio::test]
async fn pages_and_assets_carry_the_security_headers() {
    let app = app(Some(&built_spa("headers")));

    for uri in [
        "/",
        "/about",
        "/privacy",
        "/terms",
        "/p/SAN/board",
        "/assets/main-abc123.js",
    ] {
        let response = send(&app, Method::GET, uri).await;
        assert_eq!(
            header(&response, "content-security-policy"),
            Some(CSP),
            "{uri}"
        );
        assert_eq!(
            header(&response, "x-content-type-options"),
            Some("nosniff"),
            "{uri}"
        );
        assert_eq!(
            header(&response, "referrer-policy"),
            Some("strict-origin-when-cross-origin"),
            "{uri}"
        );
    }
}

#[tokio::test]
async fn api_answers_are_never_sniffed_or_leak_the_referrer() {
    for app in [app(Some(&built_spa("api-headers"))), app(None)] {
        let response = send(&app, Method::GET, "/api/nope").await;
        assert_eq!(header(&response, "x-content-type-options"), Some("nosniff"));
        assert_eq!(
            header(&response, "referrer-policy"),
            Some("strict-origin-when-cross-origin")
        );
    }
}

#[tokio::test]
async fn a_self_hoster_can_turn_the_legal_pages_off() {
    let pool = PgPool::connect_lazy("postgres://localhost/unused").unwrap();
    let legal = std::sync::Arc::new(santi_server::Legal {
        required: false,
        terms_hash: None,
        privacy_hash: None,
    });
    let state = santi_server::AppState {
        legal,
        ..santi_server::AppState::new(pool)
    };
    let app = santi_server::app(state, Some(&built_spa("legal-off")));

    for uri in [
        "/privacy",
        "/terms",
        "/privacy.html",
        "/terms.pt-BR.html",
        "//privacy.html",
        "/%70rivacy.html",
        "/./terms.html",
        "/%2e/terms.html",
        "/terms%2Ehtml",
        "/PRIVACY.html",
        "/Terms.PT-BR.html",
        "/privacy.html/",
        "/assets/../privacy.html",
    ] {
        let response = send(&app, Method::GET, uri).await;
        assert_eq!(response.status(), StatusCode::NOT_FOUND, "{uri}");
        let page = body(response).await;
        for text in [PRIVACY, TERMS, PRIVACY_PT, TERMS_PT] {
            assert!(!page.contains(text), "{uri} served {text}");
        }
    }
    let home = send(&app, Method::GET, "/projects/TERMS/board").await;
    assert_eq!(home.status(), StatusCode::OK);
}
