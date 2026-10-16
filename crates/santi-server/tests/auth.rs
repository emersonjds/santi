mod common;

use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use axum::response::Response;
use common::{PASSWORD, TestApp, body_json, json_request, session_cookie};
use serde_json::json;
use sqlx::PgPool;

async fn register(app: &TestApp, email: &str, password: &str) -> Response {
    let body = json!({ "email": email, "password": password, "display_name": "Ana" });
    app.send(json_request(
        Method::POST,
        "/api/auth/register",
        None,
        Some(body),
    ))
    .await
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

fn with_cookie(method: Method, uri: &str, cookie: &str) -> Request<Body> {
    let mut request = json_request(method, uri, None, None);
    request
        .headers_mut()
        .insert(header::COOKIE, cookie.parse().unwrap());
    request
}

#[sqlx::test]
async fn register_returns_user_and_session_cookie(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let response = register(&app, "  Ana@Example.com ", PASSWORD).await;

    assert_eq!(response.status(), StatusCode::CREATED);
    let set_cookie = response.headers()[header::SET_COOKIE]
        .to_str()
        .unwrap()
        .to_string();
    assert!(set_cookie.starts_with("santi_session="));
    assert!(set_cookie.contains("HttpOnly"));
    let user = body_json(response).await;
    assert_eq!(user["email"], "ana@example.com");
    assert!(user.get("password_hash").is_none());
}

#[sqlx::test]
async fn register_refuses_a_taken_email_in_any_case(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    register(&app, "ana@example.com", PASSWORD).await;

    let response = register(&app, " ANA@example.com", PASSWORD).await;

    assert_eq!(response.status(), StatusCode::CONFLICT);
    assert_eq!(
        body_json(response).await["type"],
        "urn:santi:error:already-exists"
    );
}

#[sqlx::test]
async fn register_validates_password_email_and_name(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    let blank_name =
        json!({ "email": "ana@example.com", "password": PASSWORD, "display_name": " " });

    let short = body_json(register(&app, "ana@example.com", "short").await).await;
    let bad_email = body_json(register(&app, "not-an-email", PASSWORD).await).await;
    let no_name = body_json(
        app.send(json_request(
            Method::POST,
            "/api/auth/register",
            None,
            Some(blank_name),
        ))
        .await,
    )
    .await;

    assert_eq!(short["errors"][0]["field"], "password");
    assert_eq!(bad_email["errors"][0]["field"], "email");
    assert_eq!(no_name["errors"][0]["field"], "display_name");
}

#[sqlx::test]
async fn malformed_json_is_a_bad_request_problem(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    let request = Request::post("/api/auth/login")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from("{"))
        .unwrap();

    let response = app.send(request).await;

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert_eq!(
        body_json(response).await["type"],
        "urn:santi:error:bad-request"
    );
}

#[sqlx::test]
async fn login_cookie_authenticates_me(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    register(&app, "ana@example.com", PASSWORD).await;

    let response = login(&app, " ANA@example.com", PASSWORD).await;
    assert_eq!(response.status(), StatusCode::OK);
    let cookie = session_cookie(&response);
    let me = app.send(with_cookie(Method::GET, "/api/me", &cookie)).await;

    assert_eq!(me.status(), StatusCode::OK);
    assert_eq!(body_json(me).await["email"], "ana@example.com");
}

#[sqlx::test]
async fn wrong_password_and_unknown_email_get_the_same_problem(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    register(&app, "ana@example.com", PASSWORD).await;

    let wrong_password = login(&app, "ana@example.com", "wrong password").await;
    let unknown_email = login(&app, "bob@example.com", PASSWORD).await;

    assert_eq!(wrong_password.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(unknown_email.status(), StatusCode::UNAUTHORIZED);
    assert!(wrong_password.headers().get(header::SET_COOKIE).is_none());
    assert_eq!(
        body_json(wrong_password).await,
        body_json(unknown_email).await
    );
}

#[sqlx::test]
async fn me_without_credentials_is_unauthorized(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let (status, body) = app.get("/api/me").await;

    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(body["type"], "urn:santi:error:unauthorized");
}

#[sqlx::test]
async fn logout_revokes_only_the_current_session(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    let laptop = session_cookie(&register(&app, "ana@example.com", PASSWORD).await);
    let phone = session_cookie(&login(&app, "ana@example.com", PASSWORD).await);

    let logout = app
        .send(with_cookie(Method::POST, "/api/auth/logout", &laptop))
        .await;
    assert_eq!(logout.status(), StatusCode::NO_CONTENT);
    assert!(
        logout.headers()[header::SET_COOKIE]
            .to_str()
            .unwrap()
            .contains("Max-Age=0")
    );

    let laptop_me = app.send(with_cookie(Method::GET, "/api/me", &laptop)).await;
    let phone_me = app.send(with_cookie(Method::GET, "/api/me", &phone)).await;
    assert_eq!(laptop_me.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(phone_me.status(), StatusCode::OK);
}

#[sqlx::test]
async fn expired_session_is_rejected_and_cleared_on_next_login(pool: PgPool) {
    let app = TestApp::anonymous(pool.clone());
    let cookie = session_cookie(&register(&app, "ana@example.com", PASSWORD).await);
    sqlx::query(
        "UPDATE auth_token SET expires_at = now() - interval '1 minute' WHERE kind = 'session'",
    )
    .execute(&pool)
    .await
    .unwrap();

    let me = app.send(with_cookie(Method::GET, "/api/me", &cookie)).await;
    login(&app, "ana@example.com", PASSWORD).await;

    assert_eq!(me.status(), StatusCode::UNAUTHORIZED);
    let expired: i64 =
        sqlx::query_scalar("SELECT count(*) FROM auth_token WHERE expires_at < now()")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(expired, 0);
}

#[sqlx::test]
async fn api_token_authenticates_with_bearer(pool: PgPool) {
    let app = TestApp::signed_in(pool, "ana@example.com").await;

    let (status, me) = app.get("/api/me").await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(me["id"], app.user_id);
}

#[sqlx::test]
async fn bearer_wins_over_the_session_cookie(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bob_cookie = session_cookie(&register(&ana, "bob@example.com", PASSWORD).await);
    let both = |bearer: &str| {
        let mut request = json_request(Method::GET, "/api/me", Some(bearer), None);
        request
            .headers_mut()
            .insert(header::COOKIE, bob_cookie.parse().unwrap());
        request
    };

    let valid_bearer = ana.send(both(ana.token.as_deref().unwrap())).await;
    let revoked_bearer = ana.send(both("santi_not-a-real-token")).await;

    assert_eq!(body_json(valid_bearer).await["id"], ana.user_id);
    assert_eq!(revoked_bearer.status(), StatusCode::UNAUTHORIZED);
}

#[sqlx::test]
async fn created_token_is_shown_once(pool: PgPool) {
    let app = TestApp::signed_in(pool, "ana@example.com").await;

    let (status, created) = app.post("/api/tokens", json!({ "name": " laptop " })).await;
    let (_, listed) = app.get("/api/tokens").await;

    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(created["name"], "laptop");
    assert!(created["token"].as_str().unwrap().starts_with("santi_"));
    let laptop = listed
        .as_array()
        .unwrap()
        .iter()
        .find(|token| token["name"] == "laptop")
        .unwrap();
    let mut fields: Vec<&String> = laptop.as_object().unwrap().keys().collect();
    fields.sort();
    assert_eq!(fields, ["created_at", "id", "name"]);
}

#[sqlx::test]
async fn token_name_is_required(pool: PgPool) {
    let app = TestApp::signed_in(pool, "ana@example.com").await;

    let (status, problem) = app.post("/api/tokens", json!({ "name": "  " })).await;

    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "name");
}

#[sqlx::test]
async fn deleting_a_token_revokes_it(pool: PgPool) {
    let app = TestApp::signed_in(pool, "ana@example.com").await;
    let (_, created) = app.post("/api/tokens", json!({ "name": "laptop" })).await;
    let laptop = TestApp {
        token: Some(created["token"].as_str().unwrap().into()),
        ..app.clone()
    };

    let (status, _) = app.delete(&format!("/api/tokens/{}", created["id"])).await;

    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(laptop.get("/api/me").await.0, StatusCode::UNAUTHORIZED);
    assert_eq!(app.get("/api/me").await.0, StatusCode::OK);
}

#[sqlx::test]
async fn deleting_someone_elses_token_is_not_found(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    let (_, created) = ana.post("/api/tokens", json!({ "name": "laptop" })).await;

    let (status, _) = bob.delete(&format!("/api/tokens/{}", created["id"])).await;

    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn cross_site_writes_with_a_cookie_are_forbidden(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    let cookie = session_cookie(&register(&app, "ana@example.com", PASSWORD).await);
    let mut request = with_cookie(Method::POST, "/api/auth/logout", &cookie);
    request
        .headers_mut()
        .insert("sec-fetch-site", "cross-site".parse().unwrap());

    let response = app.send(request).await;
    let me = app.send(with_cookie(Method::GET, "/api/me", &cookie)).await;

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    assert_eq!(
        response.headers()[header::CONTENT_TYPE],
        "application/problem+json"
    );
    assert_eq!(
        body_json(response).await["type"],
        "urn:santi:error:forbidden"
    );
    assert_eq!(me.status(), StatusCode::OK);
}

#[sqlx::test]
async fn cross_site_writes_with_a_bearer_token_pass(pool: PgPool) {
    let app = TestApp::signed_in(pool, "ana@example.com").await;
    let mut request = json_request(
        Method::POST,
        "/api/tokens",
        app.token.as_deref(),
        Some(json!({ "name": "ci" })),
    );
    request
        .headers_mut()
        .insert("sec-fetch-site", "cross-site".parse().unwrap());

    let response = app.send(request).await;

    assert_eq!(response.status(), StatusCode::CREATED);
}

#[sqlx::test]
async fn openapi_lists_auth_routes(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let (_, api) = app.get("/openapi.json").await;

    for path in [
        "/api/auth/register",
        "/api/auth/login",
        "/api/auth/logout",
        "/api/me",
        "/api/tokens",
        "/api/tokens/{id}",
    ] {
        assert!(api["paths"][path].is_object(), "{path} missing");
    }
}
