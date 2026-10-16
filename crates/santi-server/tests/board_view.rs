mod common;

use axum::http::StatusCode;
use common::TestApp;
use serde_json::{Value, json};
use sqlx::PgPool;

async fn project(pool: PgPool, board_type: &str) -> TestApp {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("SANTI", board_type).await;
    ana
}

fn column_keys(board: &Value, column: usize) -> Vec<String> {
    board["columns"][column]["cards"]
        .as_array()
        .unwrap()
        .iter()
        .map(|card| card["key"].as_str().unwrap().to_string())
        .collect()
}

#[sqlx::test]
async fn board_lists_cards_by_column_in_rank_order(pool: PgPool) {
    let ana = project(pool, "scrum").await;
    let done = ana.status_id("SANTI", "Done").await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "first", "assignee_id": ana.user_id }),
    )
    .await;
    ana.create_issue("SANTI", json!({ "summary": "finished", "status_id": done }))
        .await;
    ana.create_issue("SANTI", json!({ "summary": "second" }))
        .await;

    let (status, board) = ana.get("/api/projects/SANTI/board").await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(board["board_type"], "scrum");
    assert_eq!(board["columns"].as_array().unwrap().len(), 3);
    assert_eq!(column_keys(&board, 0), ["SANTI-1", "SANTI-3"]);
    assert_eq!(column_keys(&board, 2), ["SANTI-2"]);
    assert_eq!(board["columns"][0]["issue_count"], 2);
    assert_eq!(
        board["columns"][0]["cards"][0]["assignee_name"],
        "ana@example.com"
    );
}

#[sqlx::test]
async fn unmapped_statuses_and_epics_stay_off_the_board(pool: PgPool) {
    let ana = project(pool, "kanban").await;
    let doing = ana.status_id("SANTI", "In Progress").await;
    ana.create_issue("SANTI", json!({ "summary": "Epic", "issue_type": "epic" }))
        .await;
    ana.create_issue("SANTI", json!({ "summary": "Hidden", "status_id": doing }))
        .await;
    ana.create_issue("SANTI", json!({ "summary": "Visible" }))
        .await;
    ana.put(
        &format!("/api/projects/SANTI/statuses/{doing}"),
        json!({ "name": "In Progress" }),
    )
    .await;

    let (_, board) = ana.get("/api/projects/SANTI/board").await;

    assert_eq!(column_keys(&board, 0), ["SANTI-3"]);
    assert!(column_keys(&board, 1).is_empty());
}

#[sqlx::test]
async fn kanban_hides_done_work_past_the_window(pool: PgPool) {
    let ana = project(pool.clone(), "kanban").await;
    let done = ana.status_id("SANTI", "Done").await;
    ana.create_issue("SANTI", json!({ "summary": "old", "status_id": done }))
        .await;
    sqlx::query("UPDATE issue SET done_at = now() - interval '20 days'")
        .execute(&pool)
        .await
        .unwrap();

    let (_, windowed) = ana.get("/api/projects/SANTI/board").await;
    ana.put(
        "/api/projects/SANTI/board/settings",
        json!({ "done_window_days": null }),
    )
    .await;
    let (_, never) = ana.get("/api/projects/SANTI/board").await;

    assert!(column_keys(&windowed, 2).is_empty());
    assert_eq!(column_keys(&never, 2), ["SANTI-1"]);
}

#[sqlx::test]
async fn wip_limit_flags_a_full_column(pool: PgPool) {
    let ana = project(pool, "kanban").await;
    let doing_column = ana.column_id("SANTI", "In Progress").await;
    let doing = ana.status_id("SANTI", "In Progress").await;
    ana.put(
        &format!("/api/projects/SANTI/board/columns/{doing_column}"),
        json!({ "name": "In Progress", "wip_limit": 1 }),
    )
    .await;
    ana.create_issue("SANTI", json!({ "summary": "a", "status_id": doing }))
        .await;
    ana.create_issue("SANTI", json!({ "summary": "b", "status_id": doing }))
        .await;

    let (_, board) = ana.get("/api/projects/SANTI/board").await;

    assert_eq!(board["columns"][1]["over_limit"], true);
    assert_eq!(board["columns"][0]["over_limit"], false);
}

#[sqlx::test]
async fn strangers_cannot_read_the_board(pool: PgPool) {
    let ana = project(pool, "scrum").await;
    let bob = ana.another_user("bob@example.com").await;

    assert_eq!(
        bob.get("/api/projects/SANTI/board").await.0,
        StatusCode::NOT_FOUND
    );
}

#[sqlx::test]
async fn openapi_lists_the_board_route(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let (_, api) = app.get("/openapi.json").await;

    assert!(api["paths"]["/api/projects/{key}/board"]["get"].is_object());
}
