mod common;

use std::net::SocketAddr;
use std::sync::Arc;

use axum::Router;
use axum::body::Body;
use axum::extract::ConnectInfo;
use axum::http::{Method, Request, StatusCode, header};
use axum::response::Response;
use common::{PASSWORD, TestApp, body_json, json_request};
use santi_server::AppState;
use santi_server::rate_limit::RateLimits;
use serde_json::json;
use sqlx::PgPool;
use tower::ServiceExt;

fn router(pool: PgPool, trusted_proxies: usize) -> Router {
    let limits = Arc::new(RateLimits::new(trusted_proxies, true));
    santi_server::app(AppState { pool, limits }, None)
}

fn from_peer(mut request: Request<Body>, peer: [u8; 4]) -> Request<Body> {
    request
        .extensions_mut()
        .insert(ConnectInfo(SocketAddr::from((peer, 40000))));
    request
}

fn register_request(email: &str) -> Request<Body> {
    let body = json!({ "email": email, "password": PASSWORD, "display_name": "Ana" });
    json_request(Method::POST, "/api/auth/register", None, Some(body))
}

fn login_request(email: &str, password: &str) -> Request<Body> {
    let body = json!({ "email": email, "password": password });
    json_request(Method::POST, "/api/auth/login", None, Some(body))
}

async fn send(router: &Router, request: Request<Body>) -> Response {
    router.clone().oneshot(request).await.unwrap()
}

fn retry_after(response: &Response) -> u64 {
    response.headers()[header::RETRY_AFTER]
        .to_str()
        .unwrap()
        .parse()
        .unwrap()
}

#[sqlx::test]
async fn sign_ups_are_limited_per_address_with_a_problem_and_retry_after(pool: PgPool) {
    let router = router(pool, 0);
    for user in 0..10 {
        let request = from_peer(
            register_request(&format!("u{user}@example.com")),
            [203, 0, 113, 7],
        );
        assert_eq!(send(&router, request).await.status(), StatusCode::CREATED);
    }

    let refused = send(
        &router,
        from_peer(register_request("late@example.com"), [203, 0, 113, 7]),
    )
    .await;
    let elsewhere = send(
        &router,
        from_peer(register_request("other@example.com"), [203, 0, 113, 8]),
    )
    .await;

    assert_eq!(refused.status(), StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(
        refused.headers()[header::CONTENT_TYPE],
        "application/problem+json"
    );
    assert_eq!(retry_after(&refused), 360);
    let problem = body_json(refused).await;
    assert_eq!(problem["type"], "urn:santi:error:rate-limited");
    assert_eq!(problem["status"], 429);
    assert_eq!(elsewhere.status(), StatusCode::CREATED);
}

#[sqlx::test]
async fn a_spoofed_forwarded_for_does_not_reset_the_limit_without_a_trusted_proxy(pool: PgPool) {
    let router = router(pool, 0);
    let mut statuses = Vec::new();
    for attempt in 0..11 {
        let mut request = from_peer(
            login_request(&format!("u{attempt}@example.com"), PASSWORD),
            [203, 0, 113, 7],
        );
        let spoofed = format!("198.51.100.{attempt}");
        request
            .headers_mut()
            .insert("x-forwarded-for", spoofed.parse().unwrap());
        statuses.push(send(&router, request).await.status());
    }

    assert_eq!(statuses[..10], [StatusCode::UNAUTHORIZED; 10]);
    assert_eq!(statuses[10], StatusCode::TOO_MANY_REQUESTS);
}

#[sqlx::test]
async fn behind_one_proxy_the_address_it_appended_is_limited(pool: PgPool) {
    let router = router(pool, 1);
    let proxied = |attempt: usize, client: &str| {
        let mut request = from_peer(
            login_request(&format!("u{attempt}@example.com"), PASSWORD),
            [10, 0, 0, 1],
        );
        let chain = format!("198.51.100.{attempt}, {client}");
        request
            .headers_mut()
            .insert("x-forwarded-for", chain.parse().unwrap());
        request
    };
    for attempt in 0..10 {
        let response = send(&router, proxied(attempt, "192.0.2.9")).await;
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    let spoofed_first_hop = send(&router, proxied(10, "192.0.2.9")).await;
    let another_client = send(&router, proxied(11, "192.0.2.10")).await;

    assert_eq!(spoofed_first_hop.status(), StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(another_client.status(), StatusCode::UNAUTHORIZED);
}

#[sqlx::test]
async fn repeated_failures_lock_an_email_whether_or_not_it_has_an_account(pool: PgPool) {
    let router = router(pool, 0);
    let created = send(&router, register_request("ana@example.com")).await;
    assert_eq!(created.status(), StatusCode::CREATED);
    for email in ["ana@example.com", "ghost@example.com"] {
        for _ in 0..5 {
            let response = send(&router, login_request(email, "wrong password")).await;
            assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        }
    }

    let account = send(&router, login_request("ana@example.com", PASSWORD)).await;
    let ghost = send(
        &router,
        login_request("GHOST@example.com ", "wrong password"),
    )
    .await;
    let other = send(&router, login_request("bob@example.com", "wrong password")).await;

    assert_eq!(account.status(), StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(ghost.status(), StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(retry_after(&account), retry_after(&ghost));
    assert!(account.headers().get(header::SET_COOKIE).is_none());
    assert_eq!(body_json(account).await, body_json(ghost).await);
    assert_eq!(other.status(), StatusCode::UNAUTHORIZED);
}

#[sqlx::test]
async fn a_correct_password_before_the_lock_clears_the_failures(pool: PgPool) {
    let router = router(pool, 0);
    send(&router, register_request("ana@example.com")).await;
    for _ in 0..4 {
        send(&router, login_request("ana@example.com", "wrong password")).await;
    }
    let signed_in = send(&router, login_request("ana@example.com", PASSWORD)).await;
    assert_eq!(signed_in.status(), StatusCode::OK);

    for _ in 0..4 {
        let response = send(&router, login_request("ana@example.com", "wrong password")).await;
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }
}

#[sqlx::test]
async fn token_creation_is_limited_per_account(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    for _ in 0..9 {
        let (status, _) = ana.post("/api/tokens", json!({ "name": "laptop" })).await;
        assert_eq!(status, StatusCode::CREATED);
    }

    let (refused, problem) = ana.post("/api/tokens", json!({ "name": "laptop" })).await;
    let bob = ana.another_user("bob@example.com").await;
    let (other, _) = bob.post("/api/tokens", json!({ "name": "laptop" })).await;

    assert_eq!(refused, StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(problem["type"], "urn:santi:error:rate-limited");
    assert_eq!(other, StatusCode::CREATED);
}

#[sqlx::test]
async fn invite_accepts_and_imports_are_limited_per_account(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    for _ in 0..10 {
        let (status, _) = ana
            .post("/api/invites/santi_unknown/accept", json!(null))
            .await;
        assert_eq!(status, StatusCode::NOT_FOUND);
    }
    for _ in 0..20 {
        let (status, _) = ana
            .post("/api/projects/SANTI/imports/preview", json!({}))
            .await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    }

    let (accept, _) = ana
        .post("/api/invites/santi_unknown/accept", json!(null))
        .await;
    let (preview, _) = ana
        .post("/api/projects/SANTI/imports/preview", json!({}))
        .await;
    let (import, _) = ana.post("/api/projects/SANTI/imports", json!({})).await;

    assert_eq!(accept, StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(preview, StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(import, StatusCode::TOO_MANY_REQUESTS);
}

#[sqlx::test]
async fn openapi_documents_the_429(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let (_, api) = app.get("/openapi.json").await;

    for (path, method) in [
        ("/api/auth/login", "post"),
        ("/api/auth/register", "post"),
        ("/api/tokens", "post"),
        ("/api/invites/{token}/accept", "post"),
        ("/api/projects/{key}/imports/preview", "post"),
        ("/api/projects/{key}/imports", "post"),
    ] {
        assert!(
            api["paths"][path][method]["responses"]["429"].is_object(),
            "{path}"
        );
    }
}
