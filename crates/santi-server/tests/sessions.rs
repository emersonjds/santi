mod common;

use axum::http::{Method, StatusCode, header};
use common::{PASSWORD, TestApp, body_json, json_request, session_cookie};
use santi_server::auth::service::create_password_reset;
use serde_json::{Value, json};
use sqlx::PgPool;

const NEW_PASSWORD: &str = "a brand new passphrase";
const CHROME_ON_MAC: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const FIREFOX_ON_LINUX: &str =
    "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0";

/// Signs in on a new session from a browser with this user agent; returns its cookie.
async fn sign_in(app: &TestApp, email: &str, user_agent: &str) -> String {
    let body = json!({ "email": email, "password": PASSWORD });
    let mut request = json_request(Method::POST, "/api/auth/login", None, Some(body));
    request
        .headers_mut()
        .insert(header::USER_AGENT, user_agent.parse().unwrap());
    let response = app.send(request).await;
    assert_eq!(response.status(), StatusCode::OK);
    session_cookie(&response)
}

async fn with_cookie(
    app: &TestApp,
    cookie: &str,
    method: Method,
    uri: &str,
    body: Option<Value>,
) -> (StatusCode, Value) {
    let mut request = json_request(method, uri, None, body);
    request
        .headers_mut()
        .insert(header::COOKIE, cookie.parse().unwrap());
    let response = app.send(request).await;
    let status = response.status();
    (status, body_json(response).await)
}

async fn change_password(
    app: &TestApp,
    cookie: &str,
    current: &str,
    new: &str,
) -> (StatusCode, Value) {
    let body = json!({ "current": current, "new": new });
    with_cookie(app, cookie, Method::POST, "/api/me/password", Some(body)).await
}

async fn me(app: &TestApp, cookie: &str) -> StatusCode {
    with_cookie(app, cookie, Method::GET, "/api/me", None)
        .await
        .0
}

#[sqlx::test]
async fn changing_the_password_ends_every_other_session_and_keeps_this_one(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let laptop = sign_in(&ana, "ana@example.com", CHROME_ON_MAC).await;
    let phone = sign_in(&ana, "ana@example.com", FIREFOX_ON_LINUX).await;

    let (status, body) = change_password(&ana, &laptop, PASSWORD, NEW_PASSWORD).await;

    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body, json!({ "signed_out": 2 }));
    assert_eq!(me(&ana, &phone).await, StatusCode::UNAUTHORIZED);
    assert_eq!(me(&ana, &laptop).await, StatusCode::OK);
    assert_eq!(ana.get("/api/me").await.0, StatusCode::OK);
    let old = json!({ "email": "ana@example.com", "password": PASSWORD });
    assert_eq!(
        ana.post("/api/auth/login", old).await.0,
        StatusCode::UNAUTHORIZED
    );
    let new = json!({ "email": "ana@example.com", "password": NEW_PASSWORD });
    assert_eq!(ana.post("/api/auth/login", new).await.0, StatusCode::OK);
}

#[sqlx::test]
async fn an_api_token_caller_changes_the_password_and_ends_every_session(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let laptop = sign_in(&ana, "ana@example.com", CHROME_ON_MAC).await;

    let body = json!({ "current": PASSWORD, "new": NEW_PASSWORD });
    let (status, body) = ana.post("/api/me/password", body).await;

    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body, json!({ "signed_out": 2 }));
    assert_eq!(me(&ana, &laptop).await, StatusCode::UNAUTHORIZED);
    assert_eq!(ana.get("/api/me").await.0, StatusCode::OK);
}

#[sqlx::test]
async fn a_refused_change_says_why_on_the_field_and_changes_nothing(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let laptop = sign_in(&ana, "ana@example.com", CHROME_ON_MAC).await;
    let phone = sign_in(&ana, "ana@example.com", FIREFOX_ON_LINUX).await;

    for (current, new, field, message) in [
        (
            "not the password",
            NEW_PASSWORD,
            "current",
            "The current password is not right.",
        ),
        (PASSWORD, "short", "new", "must have 10 to 128 characters"),
        (
            PASSWORD,
            PASSWORD,
            "new",
            "Choose a password different from the current one.",
        ),
    ] {
        let (status, problem) = change_password(&ana, &laptop, current, new).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
        assert_eq!(problem["errors"][0]["field"], field, "{problem}");
        assert_eq!(problem["errors"][0]["message"], message, "{problem}");
    }
    assert_eq!(me(&ana, &phone).await, StatusCode::OK);
    sign_in(&ana, "ana@example.com", CHROME_ON_MAC).await;
}

#[sqlx::test]
async fn repeated_password_changes_are_rate_limited(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let laptop = sign_in(&ana, "ana@example.com", CHROME_ON_MAC).await;
    for _ in 0..5 {
        change_password(&ana, &laptop, "not the password", NEW_PASSWORD).await;
    }

    let (status, _) = change_password(&ana, &laptop, PASSWORD, NEW_PASSWORD).await;

    assert_eq!(status, StatusCode::TOO_MANY_REQUESTS);
}

#[sqlx::test]
async fn a_new_password_that_breaks_the_rules_spends_no_attempt(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let laptop = sign_in(&ana, "ana@example.com", CHROME_ON_MAC).await;
    for _ in 0..6 {
        let (status, problem) = change_password(&ana, &laptop, "not the password", "short").await;
        assert_eq!(problem["errors"][0]["field"], "new", "{status} {problem}");
    }

    let (status, body) = change_password(&ana, &laptop, PASSWORD, NEW_PASSWORD).await;

    assert_eq!(status, StatusCode::OK, "{body}");
}

#[sqlx::test]
async fn changing_the_password_kills_a_reset_link_issued_before(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let laptop = sign_in(&ana, "ana@example.com", CHROME_ON_MAC).await;
    let (token, _) = create_password_reset(&pool, "ana@example.com")
        .await
        .unwrap()
        .unwrap();

    let (status, body) = change_password(&ana, &laptop, PASSWORD, NEW_PASSWORD).await;

    assert_eq!(status, StatusCode::OK, "{body}");
    let uri = format!("/api/password-resets/{token}");
    assert_eq!(ana.get(&uri).await.0, StatusCode::NOT_FOUND);
    let body = json!({ "password": "a password from the old link" });
    assert_eq!(ana.post(&uri, body).await.0, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn the_list_shows_each_session_newest_activity_first_and_marks_this_one(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let laptop = sign_in(&ana, "ana@example.com", CHROME_ON_MAC).await;
    sign_in(&ana, "ana@example.com", FIREFOX_ON_LINUX).await;
    sqlx::query("UPDATE auth_token SET last_used_at = now() - interval '1 hour'")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query(
        "UPDATE auth_token SET last_used_at = now() - interval '5 minutes', created_at = now() - interval '2 days'
         WHERE client = 'Firefox on Linux'",
    )
    .execute(&pool)
    .await
    .unwrap();

    let (status, sessions) =
        with_cookie(&ana, &laptop, Method::GET, "/api/me/sessions", None).await;

    assert_eq!(status, StatusCode::OK, "{sessions}");
    let rows = sessions.as_array().unwrap();
    let labels: Vec<_> = rows.iter().map(|row| row["client"].clone()).collect();
    assert_eq!(
        labels,
        [
            json!("Chrome on macOS"),
            json!("Firefox on Linux"),
            json!("Unknown device")
        ]
    );
    let current: Vec<_> = rows.iter().map(|row| row["current"].clone()).collect();
    assert_eq!(current, [json!(true), json!(false), json!(false)]);
    let mut keys: Vec<_> = rows[0].as_object().unwrap().keys().cloned().collect();
    keys.sort();
    assert_eq!(
        keys,
        ["client", "created_at", "current", "id", "last_used_at"]
    );
    assert_ne!(rows[1]["created_at"], rows[1]["last_used_at"]);
    let stored: Vec<Option<String>> =
        sqlx::query_scalar("SELECT client FROM auth_token ORDER BY id")
            .fetch_all(&pool)
            .await
            .unwrap();
    assert!(
        stored
            .iter()
            .flatten()
            .all(|client| !client.contains("Mozilla"))
    );
}

#[sqlx::test]
async fn activity_is_refreshed_only_after_ten_minutes(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let laptop = sign_in(&ana, "ana@example.com", CHROME_ON_MAC).await;
    let last_used = || async {
        sqlx::query_scalar::<_, chrono::DateTime<chrono::Utc>>(
            "SELECT last_used_at FROM auth_token WHERE client = 'Chrome on macOS'",
        )
        .fetch_one(&pool)
        .await
        .unwrap()
    };
    sqlx::query("UPDATE auth_token SET last_used_at = now() - interval '9 minutes' WHERE client = 'Chrome on macOS'")
        .execute(&pool)
        .await
        .unwrap();
    let recent = last_used().await;

    me(&ana, &laptop).await;
    assert_eq!(last_used().await, recent);

    sqlx::query("UPDATE auth_token SET last_used_at = now() - interval '11 minutes' WHERE client = 'Chrome on macOS'")
        .execute(&pool)
        .await
        .unwrap();
    with_cookie(&ana, &laptop, Method::GET, "/api/projects/NOPE/board", None).await;
    let refreshed = last_used().await;
    assert!(chrono::Utc::now() - refreshed < chrono::Duration::minutes(1));

    sqlx::query("UPDATE auth_token SET last_used_at = now() - interval '11 minutes'")
        .execute(&pool)
        .await
        .unwrap();
    me(&ana, &laptop).await;
    assert!(chrono::Utc::now() - last_used().await < chrono::Duration::minutes(1));
    let token_last_used = || async {
        sqlx::query_scalar::<_, chrono::DateTime<chrono::Utc>>(
            "SELECT last_used_at FROM auth_token WHERE kind = 'api'",
        )
        .fetch_one(&pool)
        .await
        .unwrap()
    };
    let rewound = token_last_used().await;
    assert_eq!(ana.get("/api/me").await.0, StatusCode::OK);
    assert_eq!(token_last_used().await, rewound);
}

#[sqlx::test]
async fn signing_out_one_session_or_all_others(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let laptop = sign_in(&ana, "ana@example.com", CHROME_ON_MAC).await;
    let phone = sign_in(&ana, "ana@example.com", FIREFOX_ON_LINUX).await;
    let (_, sessions) = with_cookie(&ana, &laptop, Method::GET, "/api/me/sessions", None).await;
    let phone_id = sessions
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["client"] == "Firefox on Linux")
        .unwrap()["id"]
        .clone();

    let uri = format!("/api/me/sessions/{phone_id}");
    let (status, _) = with_cookie(&ana, &laptop, Method::DELETE, &uri, None).await;

    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(me(&ana, &phone).await, StatusCode::UNAUTHORIZED);
    let (status, _) = with_cookie(&ana, &laptop, Method::DELETE, &uri, None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    sign_in(&ana, "ana@example.com", FIREFOX_ON_LINUX).await;
    let (status, body) = with_cookie(&ana, &laptop, Method::DELETE, "/api/me/sessions", None).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body, json!({ "signed_out": 2 }));
    let (_, sessions) = with_cookie(&ana, &laptop, Method::GET, "/api/me/sessions", None).await;
    assert_eq!(sessions.as_array().unwrap().len(), 1);
    assert_eq!(me(&ana, &laptop).await, StatusCode::OK);
    assert_eq!(ana.get("/api/me").await.0, StatusCode::OK);
}

#[sqlx::test]
async fn this_session_and_other_people_sessions_cannot_be_signed_out_here(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    let laptop = sign_in(&ana, "ana@example.com", CHROME_ON_MAC).await;
    let bob_laptop = sign_in(&bob, "bob@example.com", CHROME_ON_MAC).await;
    let (_, mine) = with_cookie(&ana, &laptop, Method::GET, "/api/me/sessions", None).await;
    let (_, theirs) = with_cookie(&bob, &bob_laptop, Method::GET, "/api/me/sessions", None).await;

    let uri = format!("/api/me/sessions/{}", mine[0]["id"]);
    let (status, problem) = with_cookie(&ana, &laptop, Method::DELETE, &uri, None).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
    assert_eq!(
        problem["errors"][0]["message"],
        "Sign out this device from the account menu."
    );

    let uri = format!("/api/me/sessions/{}", theirs[0]["id"]);
    let (status, _) = with_cookie(&ana, &laptop, Method::DELETE, &uri, None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(me(&bob, &bob_laptop).await, StatusCode::OK);
    assert_eq!(me(&ana, &laptop).await, StatusCode::OK);

    let token_id: i64 = sqlx::query_scalar("SELECT id FROM auth_token WHERE kind = 'api' AND user_id = (SELECT id FROM app_user WHERE email = 'ana@example.com')")
        .fetch_one(&pool)
        .await
        .unwrap();
    let uri = format!("/api/me/sessions/{token_id}");
    let (status, _) = with_cookie(&ana, &laptop, Method::DELETE, &uri, None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(ana.get("/api/me").await.0, StatusCode::OK);
}

#[sqlx::test]
async fn sessions_need_a_signed_in_caller(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    assert_eq!(
        app.get("/api/me/sessions").await.0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        app.delete("/api/me/sessions").await.0,
        StatusCode::UNAUTHORIZED
    );
    let body = json!({ "current": PASSWORD, "new": NEW_PASSWORD });
    assert_eq!(
        app.post("/api/me/password", body).await.0,
        StatusCode::UNAUTHORIZED
    );
}
