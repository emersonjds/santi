mod common;

use std::net::SocketAddr;
use std::sync::Arc;

use axum::body::Body;
use axum::extract::ConnectInfo;
use axum::http::{Method, Request, StatusCode, header};
use axum::response::Response;
use common::{PASSWORD, TestApp, body_json, json_request, session_cookie};
use santi_server::AppState;
use santi_server::auth::service::{create_password_reset, reset_link_output};
use santi_server::rate_limit::RateLimits;
use serde_json::json;
use sqlx::PgPool;
use tower::ServiceExt;

const NEW_PASSWORD: &str = "a brand new passphrase";

async fn reset_link(pool: &PgPool, email: &str) -> String {
    let (token, _) = create_password_reset(pool, email).await.unwrap().unwrap();
    token
}

async fn login(app: &TestApp, email: &str, password: &str) -> Response {
    let body = json!({ "email": email, "password": password });
    app.send(json_request(
        Method::POST,
        "/api/auth/login",
        None,
        Some(body),
    ))
    .await
}

async fn reset(app: &TestApp, token: &str, password: &str) -> Response {
    let body = json!({ "password": password });
    app.send(json_request(
        Method::POST,
        &format!("/api/password-resets/{token}"),
        None,
        Some(body),
    ))
    .await
}

async fn me_with_cookie(app: &TestApp, cookie: &str) -> StatusCode {
    let mut request = json_request(Method::GET, "/api/me", None, None);
    request
        .headers_mut()
        .insert(header::COOKIE, cookie.parse().unwrap());
    app.send(request).await.status()
}

#[sqlx::test]
async fn a_live_link_shows_the_account_email_and_expiry(pool: PgPool) {
    TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let (token, expires_at) = create_password_reset(&pool, "  ANA@Example.com ")
        .await
        .unwrap()
        .unwrap();

    let (status, preview) = TestApp::anonymous(pool)
        .get(&format!("/api/password-resets/{token}"))
        .await;

    assert_eq!(status, StatusCode::OK, "{preview}");
    assert_eq!(preview["email"], "ana@example.com");
    assert_eq!(
        preview["expires_at"],
        serde_json::to_value(expires_at).unwrap()
    );
    let minutes = (expires_at - chrono::Utc::now()).num_minutes();
    assert!((23 * 60..=24 * 60).contains(&minutes), "{minutes}");
}

#[sqlx::test]
async fn unknown_emails_get_no_link(pool: PgPool) {
    TestApp::signed_in(pool.clone(), "ana@example.com").await;

    let created = create_password_reset(&pool, "bia@example.com")
        .await
        .unwrap();

    assert!(created.is_none());
}

#[sqlx::test]
async fn the_command_prints_a_working_link_and_its_expiry(pool: PgPool) {
    let app = TestApp::signed_in(pool.clone(), "ana@example.com").await;

    let output = reset_link_output(&pool, "Ana@Example.com", "https://santi.dev")
        .await
        .unwrap();

    let (link, expiry) = output.split_once('\n').unwrap();
    let token = link.strip_prefix("https://santi.dev/reset/").unwrap();
    assert!(expiry.starts_with("expires "), "{expiry}");
    assert!(expiry.ends_with(" UTC"), "{expiry}");
    let (preview, _) = app.get(&format!("/api/password-resets/{token}")).await;
    assert_eq!(preview, StatusCode::OK);
}

#[sqlx::test]
async fn the_command_refuses_an_unknown_email(pool: PgPool) {
    let refused = reset_link_output(&pool, "bia@example.com", "https://santi.dev").await;

    assert_eq!(refused, Err("no account with that email".to_string()));
}

#[sqlx::test]
async fn wrong_used_and_expired_links_look_the_same(pool: PgPool) {
    let app = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let used = reset_link(&pool, "ana@example.com").await;
    assert_eq!(
        reset(&app, &used, NEW_PASSWORD).await.status(),
        StatusCode::OK
    );
    let expired = reset_link(&pool, "ana@example.com").await;
    sqlx::query("UPDATE password_reset SET expires_at = now() - interval '1 minute'")
        .execute(&pool)
        .await
        .unwrap();

    for token in ["santi_unknown", used.as_str(), expired.as_str()] {
        let (preview, problem) = app.get(&format!("/api/password-resets/{token}")).await;
        let post = reset(&app, token, "yet another password").await.status();
        assert_eq!(preview, StatusCode::NOT_FOUND, "{token}");
        assert_eq!(problem["status"], 404);
        assert_eq!(post, StatusCode::NOT_FOUND, "{token}");
    }
}

#[sqlx::test]
async fn a_weak_password_is_refused_and_the_link_stays_live(pool: PgPool) {
    let app = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let token = reset_link(&pool, "ana@example.com").await;

    let refused = reset(&app, &token, "short").await;

    assert_eq!(refused.status(), StatusCode::UNPROCESSABLE_ENTITY);
    let (preview, _) = app.get(&format!("/api/password-resets/{token}")).await;
    assert_eq!(preview, StatusCode::OK);
    assert_eq!(
        login(&app, "ana@example.com", PASSWORD).await.status(),
        StatusCode::OK
    );
}

#[sqlx::test]
async fn resetting_sets_the_password_signs_in_and_ends_every_other_session(pool: PgPool) {
    let app = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let old_session = session_cookie(&login(&app, "ana@example.com", PASSWORD).await);
    let token = reset_link(&pool, "ana@example.com").await;

    let response = reset(&app, &token, NEW_PASSWORD).await;

    assert_eq!(response.status(), StatusCode::OK);
    let new_session = session_cookie(&response);
    assert!(new_session.starts_with("__Host-santi_session="));
    let user = body_json(response).await;
    assert_eq!(user["email"], "ana@example.com");
    assert_eq!(user["id"], app.user_id);
    assert_eq!(me_with_cookie(&app, &new_session).await, StatusCode::OK);
    assert_eq!(
        me_with_cookie(&app, &old_session).await,
        StatusCode::UNAUTHORIZED
    );
    let (api_token, _) = app.get("/api/me").await;
    assert_eq!(api_token, StatusCode::OK);
    assert_eq!(
        login(&app, "ana@example.com", PASSWORD).await.status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        login(&app, "ana@example.com", NEW_PASSWORD).await.status(),
        StatusCode::OK
    );
}

#[sqlx::test]
async fn a_new_link_replaces_the_previous_one(pool: PgPool) {
    let app = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let first = reset_link(&pool, "ana@example.com").await;
    let second = reset_link(&pool, "ana@example.com").await;

    let (old, _) = app.get(&format!("/api/password-resets/{first}")).await;
    let (new, _) = app.get(&format!("/api/password-resets/{second}")).await;

    assert_eq!(old, StatusCode::NOT_FOUND);
    assert_eq!(new, StatusCode::OK);
    let rows: i64 = sqlx::query_scalar("SELECT count(*) FROM password_reset")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(rows, 1);
}

#[sqlx::test]
async fn a_link_for_a_deleted_account_is_dead(pool: PgPool) {
    let app = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let token = reset_link(&pool, "ana@example.com").await;
    let body = json!({ "password": PASSWORD });
    let request = json_request(Method::DELETE, "/api/me", app.token.as_deref(), Some(body));
    assert_eq!(app.send(request).await.status(), StatusCode::NO_CONTENT);

    let (preview, _) = app.get(&format!("/api/password-resets/{token}")).await;

    assert_eq!(preview, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn reset_attempts_are_limited_per_address(pool: PgPool) {
    let router = santi_server::app(
        AppState {
            limits: Arc::new(RateLimits::new(0, true)),
            ..AppState::new(pool)
        },
        None,
    );
    let from = |request: Request<Body>, peer: [u8; 4]| {
        let mut request = request;
        request
            .extensions_mut()
            .insert(ConnectInfo(SocketAddr::from((peer, 40000))));
        request
    };
    let attempt = || {
        json_request(
            Method::POST,
            "/api/password-resets/santi_unknown",
            None,
            Some(json!({ "password": NEW_PASSWORD })),
        )
    };
    let preview = || {
        json_request(
            Method::GET,
            "/api/password-resets/santi_unknown",
            None,
            None,
        )
    };
    for _ in 0..10 {
        let response = router
            .clone()
            .oneshot(from(attempt(), [203, 0, 113, 7]))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    let refused = router
        .clone()
        .oneshot(from(preview(), [203, 0, 113, 7]))
        .await
        .unwrap();
    let elsewhere = router
        .clone()
        .oneshot(from(attempt(), [203, 0, 113, 8]))
        .await
        .unwrap();

    assert_eq!(refused.status(), StatusCode::TOO_MANY_REQUESTS);
    assert!(refused.headers().contains_key(header::RETRY_AFTER));
    assert_eq!(elsewhere.status(), StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn openapi_documents_the_reset_routes(pool: PgPool) {
    let (_, api) = TestApp::anonymous(pool).get("/openapi.json").await;

    let path = &api["paths"]["/api/password-resets/{token}"];
    assert!(path["get"]["responses"]["404"].is_object(), "{path}");
    assert!(path["post"]["responses"]["422"].is_object(), "{path}");
    assert!(path["post"]["responses"]["429"].is_object(), "{path}");
}
