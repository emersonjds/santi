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
async fn scrum_board_without_an_active_sprint_shows_empty_columns(pool: PgPool) {
    let ana = project(pool, "scrum").await;
    ana.create_issue("SANTI", json!({ "summary": "backlog item" }))
        .await;

    let (status, board) = ana.get("/api/projects/SANTI/board").await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(board["board_type"], "scrum");
    assert_eq!(board["sprint"], Value::Null);
    assert_eq!(board["columns"].as_array().unwrap().len(), 3);
    assert!(column_keys(&board, 0).is_empty());
}

#[sqlx::test]
async fn scrum_board_shows_the_active_sprint_by_status_and_rank(pool: PgPool) {
    let ana = project(pool, "scrum").await;
    let (_, sprint) = ana
        .post("/api/projects/SANTI/sprints", json!({ "goal": "Ship" }))
        .await;
    let done = ana.status_id("SANTI", "Done").await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "first", "sprint_id": sprint["id"], "assignee_id": ana.user_id }),
    )
    .await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "finished", "sprint_id": sprint["id"], "status_id": done }),
    )
    .await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "second", "sprint_id": sprint["id"] }),
    )
    .await;
    ana.create_issue("SANTI", json!({ "summary": "not planned" }))
        .await;
    ana.post(
        &format!("/api/projects/SANTI/sprints/{}/start", sprint["id"]),
        json!({}),
    )
    .await;
    ana.post(
        "/api/projects/SANTI/issues/3/move",
        json!({ "before": "SANTI-1" }),
    )
    .await;

    let (_, board) = ana.get("/api/projects/SANTI/board").await;

    assert_eq!(board["sprint"]["goal"], "Ship");
    assert_eq!(column_keys(&board, 0), ["SANTI-3", "SANTI-1"]);
    assert_eq!(column_keys(&board, 2), ["SANTI-2"]);
    assert_eq!(board["columns"][0]["issue_count"], 2);
    assert_eq!(
        board["columns"][0]["cards"][1]["assignee_name"],
        "ana@example.com"
    );
    assert_eq!(board["columns"][0]["cards"][1]["reporter_id"], ana.user_id);
}

#[sqlx::test]
async fn subtasks_are_flat_cards_and_parents_count_them(pool: PgPool) {
    let ana = project(pool, "kanban").await;
    let done = ana.status_id("SANTI", "Done").await;
    ana.create_issue("SANTI", json!({ "summary": "Story" }))
        .await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "Open sub", "issue_type": "subtask", "parent": "SANTI-1" }),
    )
    .await;
    ana.create_issue("SANTI", json!({ "summary": "Done sub", "issue_type": "subtask", "parent": "SANTI-1", "status_id": done })).await;

    let (_, board) = ana.get("/api/projects/SANTI/board").await;

    let story = &board["columns"][0]["cards"][0];
    assert_eq!(story["open_subtasks"], 1);
    assert_eq!(story["total_subtasks"], 2);
    assert_eq!(board["columns"][0]["cards"][1]["parent_key"], "SANTI-1");
    assert_eq!(column_keys(&board, 2), ["SANTI-3"]);
}

#[sqlx::test]
async fn wip_counts_ignore_quick_filters(pool: PgPool) {
    let ana = project(pool, "kanban").await;
    let doing_column = ana.column_id("SANTI", "In Progress").await;
    let doing = ana.status_id("SANTI", "In Progress").await;
    ana.put(
        &format!("/api/projects/SANTI/board/columns/{doing_column}"),
        json!({ "name": "In Progress", "wip_limit": 1 }),
    )
    .await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "mine", "status_id": doing, "assignee_id": ana.user_id }),
    )
    .await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "nobody's", "status_id": doing }),
    )
    .await;

    let (_, board) = ana
        .get(&format!(
            "/api/projects/SANTI/board?assignee={}",
            ana.user_id
        ))
        .await;

    let column = &board["columns"][1];
    assert_eq!(column["issue_count"], 2);
    assert_eq!(column["over_limit"], true);
    assert_eq!(column_keys(&board, 1), ["SANTI-1"]);
}

#[sqlx::test]
async fn board_quick_filters_combine(pool: PgPool) {
    let ana = project(pool, "kanban").await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "Login bug", "issue_type": "bug", "labels": ["ui"] }),
    )
    .await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "Docs task", "issue_type": "task", "labels": ["docs"] }),
    )
    .await;
    ana.create_issue("SANTI", json!({ "summary": "UI story", "labels": ["ui"] }))
        .await;

    let (_, either) = ana
        .get("/api/projects/SANTI/board?type=bug&type=task")
        .await;
    let (_, narrowed) = ana
        .get("/api/projects/SANTI/board?type=bug&type=task&label=ui")
        .await;
    let (_, text) = ana.get("/api/projects/SANTI/board?q=login").await;
    let (bad, _) = ana.get("/api/projects/SANTI/board?type=feature").await;

    assert_eq!(column_keys(&either, 0), ["SANTI-1", "SANTI-2"]);
    assert_eq!(column_keys(&narrowed, 0), ["SANTI-1"]);
    assert_eq!(column_keys(&text, 0), ["SANTI-1"]);
    assert_eq!(bad, StatusCode::BAD_REQUEST);
}

#[sqlx::test]
async fn board_filters_unassigned_cards(pool: PgPool) {
    let ana = project(pool, "kanban").await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "mine", "assignee_id": ana.user_id }),
    )
    .await;
    ana.create_issue("SANTI", json!({ "summary": "nobody's" }))
        .await;

    let (_, board) = ana.get("/api/projects/SANTI/board?unassigned=true").await;

    assert_eq!(column_keys(&board, 0), ["SANTI-2"]);
}

#[sqlx::test]
async fn board_filters_by_no_epic_and_matches_text_on_the_key(pool: PgPool) {
    let ana = project(pool, "kanban").await;
    ana.create_issue("SANTI", json!({ "summary": "Epic", "issue_type": "epic" }))
        .await;
    ana.create_issue("SANTI", json!({ "summary": "Child", "parent": "SANTI-1" }))
        .await;
    ana.create_issue("SANTI", json!({ "summary": "Orphan" }))
        .await;

    let (_, no_epic) = ana.get("/api/projects/SANTI/board?parent=none").await;
    let (_, either) = ana
        .get("/api/projects/SANTI/board?parent=none&parent=SANTI-1")
        .await;
    let (_, by_key) = ana.get("/api/projects/SANTI/board?q=santi-3").await;

    assert_eq!(column_keys(&no_epic, 0), ["SANTI-3"]);
    assert_eq!(column_keys(&either, 0), ["SANTI-2", "SANTI-3"]);
    assert_eq!(column_keys(&by_key, 0), ["SANTI-3"]);
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
    assert_eq!(
        bob.get("/api/projects/SANTI/backlog").await.0,
        StatusCode::NOT_FOUND
    );
}

#[sqlx::test]
async fn openapi_lists_the_board_route(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let (_, api) = app.get("/openapi.json").await;

    assert!(api["paths"]["/api/projects/{key}/board"]["get"].is_object());
    assert!(api["paths"]["/api/projects/{key}/backlog"]["get"].is_object());
}
