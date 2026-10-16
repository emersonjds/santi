mod common;

use axum::http::StatusCode;
use common::TestApp;
use serde_json::{Value, json};
use sqlx::PgPool;

async fn project_with_issues(pool: PgPool, count: usize) -> TestApp {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    for index in 1..=count {
        ana.create_issue("SANTI", json!({ "summary": format!("issue {index}") }))
            .await;
    }
    ana
}

async fn keys_by_rank(app: &TestApp, numbers: &[i64]) -> Vec<String> {
    let mut issues = Vec::new();
    for number in numbers {
        issues.push(
            app.get(&format!("/api/projects/SANTI/issues/{number}"))
                .await
                .1,
        );
    }
    issues.sort_by(|left, right| {
        left["rank"]
            .as_str()
            .unwrap()
            .cmp(right["rank"].as_str().unwrap())
    });
    issues
        .iter()
        .map(|issue| issue["key"].as_str().unwrap().to_string())
        .collect()
}

async fn move_issue(app: &TestApp, number: i64, body: Value) -> (StatusCode, Value) {
    app.post(&format!("/api/projects/SANTI/issues/{number}/move"), body)
        .await
}

#[sqlx::test]
async fn status_move_keeps_the_rank(pool: PgPool) {
    let ana = project_with_issues(pool, 1).await;
    let doing = ana.status_id("SANTI", "In Progress").await;
    let before = ana.get("/api/projects/SANTI/issues/1").await.1;

    let (status, moved) = move_issue(&ana, 1, json!({ "status_id": doing })).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(moved["status_id"], doing);
    assert_eq!(moved["rank"], before["rank"]);
}

#[sqlx::test]
async fn done_timer_follows_the_status_category(pool: PgPool) {
    let ana = project_with_issues(pool, 1).await;
    let done = ana.status_id("SANTI", "Done").await;
    let todo = ana.status_id("SANTI", "To Do").await;

    let (_, finished) = move_issue(&ana, 1, json!({ "status_id": done })).await;
    let (_, reopened) = move_issue(&ana, 1, json!({ "status_id": todo })).await;

    assert!(finished["done_at"].is_string());
    assert_eq!(reopened["done_at"], Value::Null);
}

#[sqlx::test]
async fn moving_between_done_statuses_keeps_the_timer(pool: PgPool) {
    let ana = project_with_issues(pool, 1).await;
    let done_column = ana.column_id("SANTI", "Done").await;
    let (_, shipped) = ana
        .post(
            "/api/projects/SANTI/statuses",
            json!({ "name": "Shipped", "category": "done" }),
        )
        .await;
    ana.put(
        &format!("/api/projects/SANTI/statuses/{}", shipped["id"]),
        json!({ "name": "Shipped", "column_id": done_column }),
    )
    .await;
    let done = ana.status_id("SANTI", "Done").await;

    let (_, first) = move_issue(&ana, 1, json!({ "status_id": done })).await;
    let (_, second) = move_issue(&ana, 1, json!({ "status_id": shipped["id"] })).await;

    assert_eq!(first["done_at"], second["done_at"]);
}

#[sqlx::test]
async fn moving_to_an_unmapped_status_is_refused(pool: PgPool) {
    let ana = project_with_issues(pool, 1).await;
    let (_, parked) = ana
        .post(
            "/api/projects/SANTI/statuses",
            json!({ "name": "Parked", "category": "todo" }),
        )
        .await;

    let (status, problem) = move_issue(&ana, 1, json!({ "status_id": parked["id"] })).await;

    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(problem["type"], "urn:santi:error:status-unmapped");
}

#[sqlx::test]
async fn after_anchor_places_the_issue_right_after_it(pool: PgPool) {
    let ana = project_with_issues(pool, 3).await;

    move_issue(&ana, 1, json!({ "after": "SANTI-2" })).await;

    assert_eq!(
        keys_by_rank(&ana, &[1, 2, 3]).await,
        ["SANTI-2", "SANTI-1", "SANTI-3"]
    );
}

#[sqlx::test]
async fn before_anchor_places_the_issue_right_before_it(pool: PgPool) {
    let ana = project_with_issues(pool, 3).await;

    move_issue(&ana, 3, json!({ "before": "SANTI-1" })).await;
    move_issue(&ana, 2, json!({ "after": "SANTI-1" })).await;

    assert_eq!(
        keys_by_rank(&ana, &[1, 2, 3]).await,
        ["SANTI-3", "SANTI-1", "SANTI-2"]
    );
}

#[sqlx::test]
async fn anchors_at_both_ends(pool: PgPool) {
    let ana = project_with_issues(pool, 3).await;

    move_issue(&ana, 1, json!({ "after": "SANTI-3" })).await;
    move_issue(&ana, 3, json!({ "before": "SANTI-2" })).await;

    assert_eq!(
        keys_by_rank(&ana, &[1, 2, 3]).await,
        ["SANTI-3", "SANTI-2", "SANTI-1"]
    );
}

#[sqlx::test]
async fn invalid_anchors_are_refused(pool: PgPool) {
    let ana = project_with_issues(pool, 2).await;

    let (both, _) = move_issue(&ana, 1, json!({ "after": "SANTI-2", "before": "SANTI-2" })).await;
    let (itself, _) = move_issue(&ana, 1, json!({ "after": "SANTI-1" })).await;
    let (unknown, problem) = move_issue(&ana, 1, json!({ "after": "SANTI-99" })).await;
    let (missing_issue, _) = move_issue(&ana, 99, json!({ "after": "SANTI-1" })).await;

    assert_eq!(both, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(itself, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(unknown, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "after");
    assert_eq!(missing_issue, StatusCode::NOT_FOUND);
}
