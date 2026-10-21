mod common;

use std::sync::Arc;

use axum::Router;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use common::{PASSWORD, TestApp, body_json, json_request, session_cookie};
use santi_server::auth::domain::{PRIVACY_VERSION, TERMS_VERSION};
use santi_server::{AppState, Legal};
use serde_json::{Value, json};
use sqlx::PgPool;
use tower::ServiceExt;

fn router(pool: PgPool, required: bool) -> Router {
    let legal = Arc::new(Legal {
        required,
        terms_hash: Some("terms-sha".into()),
        privacy_hash: Some("privacy-sha".into()),
    });
    santi_server::app(
        AppState {
            legal,
            ..AppState::new(pool)
        },
        None,
    )
}

async fn call(
    router: &Router,
    method: Method,
    uri: &str,
    cookie: &str,
    body: Option<Value>,
) -> (StatusCode, Value) {
    let mut request = json_request(method, uri, None, body);
    request
        .headers_mut()
        .insert(header::COOKIE, cookie.parse().unwrap());
    let response = router.clone().oneshot(request).await.unwrap();
    let status = response.status();
    (status, body_json(response).await)
}

async fn register(router: &Router, email: &str, body: Value) -> (StatusCode, String) {
    let mut body = body;
    body["email"] = email.into();
    body["password"] = PASSWORD.into();
    body["display_name"] = "Bob".into();
    let request: Request<Body> = json_request(Method::POST, "/api/auth/register", None, Some(body));
    let response = router.clone().oneshot(request).await.unwrap();
    let status = response.status();
    let cookie = if status == StatusCode::CREATED {
        session_cookie(&response)
    } else {
        String::new()
    };
    (status, cookie)
}

#[sqlx::test]
async fn the_documents_say_their_versions_and_whether_they_are_required(pool: PgPool) {
    let on = TestApp::anonymous(pool.clone());
    let off = router(pool, false);

    let (_, documents) = on.get("/api/legal").await;
    let response = off
        .clone()
        .oneshot(json_request(Method::GET, "/api/legal", None, None))
        .await
        .unwrap();
    let (created, _) = register(&off, "bob@example.com", json!({})).await;

    assert_eq!(
        documents,
        json!({ "required": true, "terms_version": TERMS_VERSION, "privacy_version": PRIVACY_VERSION })
    );
    assert_eq!(body_json(response).await["required"], false);
    assert_eq!(
        created,
        StatusCode::CREATED,
        "a self-hoster can turn the documents off"
    );
}

#[sqlx::test]
async fn acceptances_record_the_text_hash_append_only_and_outlive_the_account(pool: PgPool) {
    let on = router(pool.clone(), true);
    let (created, cookie) = register(
        &on,
        "bob@example.com",
        json!({ "accept_terms": true, "confirm_age": true }),
    )
    .await;
    assert_eq!(created, StatusCode::CREATED);

    let rows: Vec<(String, Option<String>)> =
        sqlx::query_as("SELECT document, text_hash FROM legal_acceptance ORDER BY id")
            .fetch_all(&pool)
            .await
            .unwrap();
    assert_eq!(
        rows,
        [
            ("terms".into(), Some("terms-sha".into())),
            ("privacy".into(), Some("privacy-sha".into())),
            ("age".into(), None)
        ]
    );
    for statement in [
        "UPDATE legal_acceptance SET version = 'x'",
        "DELETE FROM legal_acceptance",
        "TRUNCATE legal_acceptance",
    ] {
        let refused = sqlx::query(statement).execute(&pool).await.unwrap_err();
        assert!(
            refused
                .to_string()
                .contains("legal_acceptance is append only"),
            "{statement}: {refused}"
        );
    }

    let (deleted, _) = call(
        &on,
        Method::DELETE,
        "/api/me",
        &cookie,
        Some(json!({ "password": PASSWORD })),
    )
    .await;
    assert_eq!(deleted, StatusCode::NO_CONTENT);
    let kept: i64 = sqlx::query_scalar("SELECT count(*) FROM legal_acceptance")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(kept, 3);
}

#[sqlx::test]
async fn an_outdated_acceptance_blocks_new_tokens_and_invites_until_accepted(pool: PgPool) {
    let off = router(pool.clone(), false);
    let on = router(pool.clone(), true);
    let (_, bob) = register(&off, "bob@example.com", json!({})).await;
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    let (_, invite) = ana
        .post("/api/projects/SANTI/invites", json!({ "role": "member" }))
        .await;
    let accept = format!("/api/invites/{}/accept", invite["token"].as_str().unwrap());

    let (_, status) = call(&on, Method::GET, "/api/me/legal", &bob, None).await;
    let (token, problem) = call(
        &on,
        Method::POST,
        "/api/tokens",
        &bob,
        Some(json!({ "name": "cli" })),
    )
    .await;
    let (join, _) = call(&on, Method::POST, &accept, &bob, None).await;
    let (no_age, age_problem) = call(
        &on,
        Method::POST,
        "/api/me/legal",
        &bob,
        Some(json!({ "accept_terms": true })),
    )
    .await;

    assert_eq!(status["accepted"], false);
    assert_eq!(token, StatusCode::CONFLICT);
    assert_eq!(problem["type"], "urn:santi:error:terms-not-accepted");
    assert_eq!(join, StatusCode::CONFLICT);
    assert_eq!(no_age, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(age_problem["errors"][0]["field"], "confirm_age");

    let (accepted, now) = call(
        &on,
        Method::POST,
        "/api/me/legal",
        &bob,
        Some(json!({ "accept_terms": true, "confirm_age": true })),
    )
    .await;
    assert_eq!(accepted, StatusCode::OK);
    assert_eq!(now["accepted"], true);
    assert_eq!(
        call(
            &on,
            Method::POST,
            "/api/tokens",
            &bob,
            Some(json!({ "name": "cli" }))
        )
        .await
        .0,
        StatusCode::CREATED
    );
    assert_eq!(
        call(&on, Method::POST, &accept, &bob, None).await.0,
        StatusCode::OK
    );
}

#[sqlx::test]
async fn the_purge_drops_expired_sessions_and_stale_invites(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    for _ in 0..3 {
        ana.post("/api/projects/SANTI/invites", json!({ "role": "member" }))
            .await;
    }
    sqlx::query("INSERT INTO auth_token (user_id, kind, token_hash, expires_at) VALUES ($1, 'session', 'old', now() - interval '1 day')")
        .bind(ana.user_id)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("UPDATE invite SET used_at = now() - interval '8 days' WHERE id = (SELECT min(id) FROM invite)")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("UPDATE invite SET expires_at = now() - interval '8 days' WHERE id = (SELECT max(id) FROM invite)")
        .execute(&pool)
        .await
        .unwrap();

    let purged = santi_server::purge_expired(&pool).await.unwrap();

    assert_eq!(purged, (1, 2));
    let invites: i64 = sqlx::query_scalar("SELECT count(*) FROM invite")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(invites, 1);
    assert_eq!(ana.get("/api/me").await.0, StatusCode::OK);
}

#[sqlx::test]
async fn openapi_lists_the_legal_routes(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let (_, api) = app.get("/openapi.json").await;

    assert!(api["paths"]["/api/legal"]["get"].is_object());
    assert!(api["paths"]["/api/me/legal"]["get"].is_object());
    assert!(api["paths"]["/api/me/legal"]["post"].is_object());
    assert!(api["paths"]["/api/tokens"]["post"]["responses"]["409"].is_object());
}

#[sqlx::test]
async fn accepting_again_records_nothing_new_and_is_rate_limited(pool: PgPool) {
    let on = router(pool.clone(), true);
    let off = router(pool.clone(), false);
    let (_, ana) = register(
        &on,
        "ana@example.com",
        json!({ "accept_terms": true, "confirm_age": true }),
    )
    .await;
    let (_, bob) = register(&off, "bob@example.com", json!({})).await;
    let accept = json!({ "accept_terms": true, "confirm_age": true });
    let rows = || async {
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM legal_acceptance")
            .fetch_one(&pool)
            .await
            .unwrap()
    };

    let (again, status) = call(
        &on,
        Method::POST,
        "/api/me/legal",
        &ana,
        Some(accept.clone()),
    )
    .await;
    let (not_required, _) = call(
        &off,
        Method::POST,
        "/api/me/legal",
        &bob,
        Some(accept.clone()),
    )
    .await;

    assert_eq!(again, StatusCode::OK);
    assert_eq!(status["accepted"], true);
    assert_eq!(not_required, StatusCode::OK);
    assert_eq!(rows().await, 3);
    let mut answers = Vec::new();
    for _ in 0..10 {
        answers.push(
            call(
                &on,
                Method::POST,
                "/api/me/legal",
                &ana,
                Some(accept.clone()),
            )
            .await
            .0,
        );
    }
    assert_eq!(answers.last(), Some(&StatusCode::TOO_MANY_REQUESTS));
}
