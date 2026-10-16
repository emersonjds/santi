use std::path::{Path, PathBuf};

use axum::Router;
use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use sqlx::PgPool;
use tower::ServiceExt;

const INDEX: &str = "<!doctype html><title>santi spa</title>";

fn app(web_dir: Option<&Path>) -> Router {
    let pool = PgPool::connect_lazy("postgres://localhost/unused").unwrap();
    santi_server::app(santi_server::AppState { pool }, web_dir)
}

fn built_spa(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("santi-spa-{name}-{}", std::process::id()));
    std::fs::create_dir_all(dir.join("assets")).unwrap();
    std::fs::write(dir.join("index.html"), INDEX).unwrap();
    std::fs::write(dir.join("assets/main.js"), "console.log('santi')").unwrap();
    dir
}

async fn get(app: &Router, uri: &str) -> (StatusCode, String) {
    let request = Request::get(uri).body(Body::empty()).unwrap();
    let response = app.clone().oneshot(request).await.unwrap();
    let status = response.status();
    let body = response.into_body().collect().await.unwrap().to_bytes();
    (status, String::from_utf8_lossy(&body).into_owned())
}

#[tokio::test]
async fn built_spa_serves_assets_and_answers_client_routes_with_index() {
    let app = app(Some(&built_spa("served")));

    assert_eq!(get(&app, "/app").await, (StatusCode::OK, INDEX.into()));
    assert_eq!(get(&app, "/app/").await, (StatusCode::OK, INDEX.into()));
    assert_eq!(
        get(&app, "/app/login").await,
        (StatusCode::OK, INDEX.into())
    );
    assert_eq!(
        get(&app, "/app/p/SAN/board").await,
        (StatusCode::OK, INDEX.into())
    );
    assert_eq!(
        get(&app, "/app/assets/main.js").await,
        (StatusCode::OK, "console.log('santi')".into())
    );
}

#[tokio::test]
async fn built_spa_leaves_server_routes_alone() {
    let app = app(Some(&built_spa("routes")));

    let (status, login) = get(&app, "/login").await;
    assert_eq!(status, StatusCode::OK);
    assert!(!login.contains("santi spa"));
    let (status, unknown) = get(&app, "/api/nope").await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert!(unknown.contains("\"status\":404"));
    let (status, spec) = get(&app, "/openapi.json").await;
    assert_eq!(status, StatusCode::OK);
    assert!(spec.contains("\"openapi\""));
}

#[tokio::test]
async fn missing_build_dir_serves_no_spa() {
    let missing = std::env::temp_dir().join("santi-spa-never-built");

    assert_eq!(
        get(&app(Some(&missing)), "/app/login").await.0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(get(&app(None), "/app/login").await.0, StatusCode::NOT_FOUND);
}
