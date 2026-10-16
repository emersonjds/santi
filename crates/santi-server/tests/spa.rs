use std::path::{Path, PathBuf};

use axum::Router;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use axum::response::Response;
use http_body_util::BodyExt;
use sqlx::PgPool;
use tower::ServiceExt;

const INDEX: &str = "<!doctype html><title>santi spa</title>";
const IMMUTABLE: &str = "public, max-age=31536000, immutable";

fn app(web_dir: Option<&Path>) -> Router {
    let pool = PgPool::connect_lazy("postgres://localhost/unused").unwrap();
    santi_server::app(santi_server::AppState { pool }, web_dir)
}

fn built_spa(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("santi-spa-{name}-{}", std::process::id()));
    std::fs::create_dir_all(dir.join("assets")).unwrap();
    std::fs::write(dir.join("index.html"), INDEX).unwrap();
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

    for uri in [
        "/",
        "/login",
        "/p/SAN/board",
        "/p/SAN/search?q=x",
        "/account",
    ] {
        let response = send(&app, Method::GET, uri).await;
        assert_eq!(response.status(), StatusCode::OK, "{uri}");
        assert_eq!(cache_control(&response), Some("no-cache"), "{uri}");
        assert_eq!(body(response).await, INDEX, "{uri}");
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
