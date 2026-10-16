mod common;

use axum::http::{Method, StatusCode, header};
use common::{PASSWORD, TestApp, body_json, json_request};
use serde_json::{Value, json};
use sqlx::PgPool;

async fn delete_account(app: &TestApp, password: &str) -> (StatusCode, Value, Option<String>) {
    let request = json_request(
        Method::DELETE,
        "/api/me",
        app.token.as_deref(),
        Some(json!({ "password": password })),
    );
    let response = app.send(request).await;
    let status = response.status();
    let cookie = response
        .headers()
        .get(header::SET_COOKIE)
        .map(|value| value.to_str().unwrap().to_string());
    (status, body_json(response).await, cookie)
}

async fn join(admin: &TestApp, key: &str, email: &str, role: &str) {
    let body = json!({ "email": email, "role": role });
    let (status, member) = admin
        .post(&format!("/api/projects/{key}/members"), body)
        .await;
    assert_eq!(status, StatusCode::CREATED, "{member}");
}

#[sqlx::test]
async fn the_export_holds_the_account_and_every_project_it_admins(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    ana.create_sprint("SANTI").await;
    ana.create_issue("SANTI", json!({ "summary": "Ship it" }))
        .await;
    ana.post(
        "/api/projects/SANTI/issues/1/comments",
        json!({ "body": "On it" }),
    )
    .await;
    bob.create_project("BOB", "kanban").await;
    bob.create_issue("BOB", json!({ "summary": "Bob's secret plan" }))
        .await;
    join(&bob, "BOB", "ana@example.com", "member").await;

    let response = ana
        .send(json_request(
            Method::GET,
            "/api/me/export",
            ana.token.as_deref(),
            None,
        ))
        .await;

    assert_eq!(response.status(), StatusCode::OK);
    let export = body_json(response).await;
    let text = export.to_string();
    assert_eq!(export["user"]["email"], "ana@example.com");
    assert_eq!(export["api_tokens"][0]["name"], "tests");
    assert!(
        !text.contains("password") && !text.contains("$argon2") && !text.contains("token_hash")
    );
    let santi = &export["projects"][0];
    assert_eq!(santi["project"]["key"], "SANTI");
    assert_eq!(santi["members"][0]["email"], "ana@example.com");
    assert_eq!(santi["board"]["columns"].as_array().unwrap().len(), 3);
    assert_eq!(santi["sprints"].as_array().unwrap().len(), 1);
    assert_eq!(santi["issues"][0]["summary"], "Ship it");
    assert_eq!(santi["comments"][0]["issue_key"], "SANTI-1");
    assert_eq!(santi["comments"][0]["body"], "On it");
    assert_eq!(export["projects"].as_array().unwrap().len(), 1);
    assert_eq!(export["other_projects"][0]["key"], "BOB");
    assert!(!text.contains("Bob's secret plan"));
}

#[sqlx::test]
async fn export_and_delete_need_a_signed_in_caller(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let (export, _) = app.get("/api/me/export").await;
    let (delete, _, _) = delete_account(&app, PASSWORD).await;
    let (_, api) = app.get("/openapi.json").await;

    assert_eq!(export, StatusCode::UNAUTHORIZED);
    assert_eq!(delete, StatusCode::UNAUTHORIZED);
    assert!(api["paths"]["/api/me/export"]["get"].is_object());
    assert!(api["paths"]["/api/me"]["delete"].is_object());
}

#[sqlx::test]
async fn deleting_needs_the_password_and_locks_after_repeated_misses(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;

    let (status, problem, _) = delete_account(&ana, "not the password").await;

    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "password");
    assert_eq!(ana.get("/api/me").await.0, StatusCode::OK);
    for _ in 0..4 {
        delete_account(&ana, "not the password").await;
    }
    let (locked, _, _) = delete_account(&ana, PASSWORD).await;
    assert_eq!(locked, StatusCode::TOO_MANY_REQUESTS);
}

#[sqlx::test]
async fn a_locked_login_does_not_block_deleting_the_account(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    for _ in 0..6 {
        let body = json!({ "email": "ana@example.com", "password": "wrong" });
        ana.post("/api/auth/login", body).await;
    }
    let body = json!({ "email": "ana@example.com", "password": PASSWORD });
    assert_eq!(
        ana.post("/api/auth/login", body).await.0,
        StatusCode::TOO_MANY_REQUESTS
    );

    let (status, _, _) = delete_account(&ana, PASSWORD).await;

    assert_eq!(status, StatusCode::NO_CONTENT);
}

#[sqlx::test]
async fn deleting_signs_out_everywhere_and_frees_the_email(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;

    let (status, _, cookie) = delete_account(&ana, PASSWORD).await;

    assert_eq!(status, StatusCode::NO_CONTENT);
    assert!(cookie.unwrap().contains("Max-Age=0"));
    assert_eq!(ana.get("/api/me").await.0, StatusCode::UNAUTHORIZED);
    let again = ana.another_user("ana@example.com").await;
    let (_, projects) = again.get("/api/projects").await;
    assert_eq!(projects, json!([]));
}

#[sqlx::test]
async fn projects_outlive_the_account_only_when_others_use_them(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    let carol = ana.another_user("carol@example.com").await;
    ana.create_project("SOLO", "scrum").await;
    ana.create_project("TEAM", "scrum").await;
    join(&ana, "TEAM", "bob@example.com", "member").await;
    join(&ana, "TEAM", "carol@example.com", "member").await;
    ana.create_project("DUO", "kanban").await;
    join(&ana, "DUO", "carol@example.com", "admin").await;
    join(&ana, "DUO", "bob@example.com", "member").await;
    let body = json!({ "summary": "Ana's task", "assignee_id": ana.user_id });
    ana.create_issue("TEAM", body).await;
    ana.post(
        "/api/projects/TEAM/issues/1/comments",
        json!({ "body": "Started" }),
    )
    .await;

    let (status, _, _) = delete_account(&ana, PASSWORD).await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    let (_, team) = bob.get("/api/projects/TEAM").await;
    assert_eq!(
        team["role"], "admin",
        "the oldest remaining member steps up"
    );
    let (_, team_for_carol) = carol.get("/api/projects/TEAM").await;
    assert_eq!(team_for_carol["role"], "member");
    let (_, duo) = bob.get("/api/projects/DUO").await;
    assert_eq!(duo["role"], "member", "another admin was left");
    let (_, members) = bob.get("/api/projects/TEAM/members").await;
    assert_eq!(members.as_array().unwrap().len(), 2);
    let (_, issue) = bob.get("/api/projects/TEAM/issues/1").await;
    assert_eq!(issue["summary"], "Ana's task");
    assert_eq!(issue["assignee_id"], Value::Null);
    let (_, comments) = bob.get("/api/projects/TEAM/issues/1/comments").await;
    assert_eq!(comments["items"][0]["body"], "Started");
    let (_, board) = bob.get("/api/projects/TEAM/board").await;
    assert!(!board.to_string().contains("ana@example.com"));
    bob.create_project("SOLO", "scrum").await;
}
