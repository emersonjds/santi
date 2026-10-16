mod common;

use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use common::TestApp;
use sqlx::PgPool;

#[sqlx::test]
async fn unknown_route_returns_not_found_problem(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let response = app
        .send(Request::get("/nope").body(Body::empty()).unwrap())
        .await;

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    assert_eq!(
        response.headers()[header::CONTENT_TYPE],
        "application/problem+json"
    );
    let body = common::body_json(response).await;
    assert_eq!(body["type"], "urn:santi:error:not-found");
    assert_eq!(body["status"], 404);
}

#[sqlx::test]
async fn openapi_document_lists_health_and_problem(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let (status, body) = app.get("/openapi.json").await;

    assert_eq!(status, StatusCode::OK);
    assert!(body["paths"]["/health"]["get"].is_object());
    assert!(body["components"]["schemas"]["Problem"].is_object());
}

#[sqlx::test]
async fn docs_page_is_served(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let response = app
        .send(Request::get("/docs/").body(Body::empty()).unwrap())
        .await;

    assert_eq!(response.status(), StatusCode::OK);
    let content_type = response.headers()[header::CONTENT_TYPE].to_str().unwrap();
    assert!(content_type.starts_with("text/html"));
}

#[sqlx::test]
async fn responses_are_gzip_compressed_when_accepted(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    let request = Request::get("/openapi.json")
        .header(header::ACCEPT_ENCODING, "gzip")
        .body(Body::empty())
        .unwrap();

    let response = app.send(request).await;

    assert_eq!(response.headers()[header::CONTENT_ENCODING], "gzip");
}

#[sqlx::test]
async fn responses_are_brotli_compressed_when_accepted(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    let request = Request::get("/openapi.json")
        .header(header::ACCEPT_ENCODING, "br")
        .body(Body::empty())
        .unwrap();

    let response = app.send(request).await;

    assert_eq!(response.headers()[header::CONTENT_ENCODING], "br");
}

#[sqlx::test(migrations = false)]
async fn migrations_apply_to_an_empty_database(pool: PgPool) {
    santi_server::migrate(&pool).await.unwrap();

    let installed: i64 =
        sqlx::query_scalar("SELECT count(*) FROM pg_extension WHERE extname = 'pg_trgm'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(installed, 1);
}
