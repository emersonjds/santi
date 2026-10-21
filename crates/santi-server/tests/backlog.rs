mod common;

use axum::http::StatusCode;
use common::TestApp;
use serde_json::{Value, json};
use sqlx::PgPool;

fn section_keys(backlog: &Value, section: usize) -> Vec<String> {
    backlog["sections"][section]["cards"]
        .as_array()
        .unwrap()
        .iter()
        .map(|card| card["key"].as_str().unwrap().to_string())
        .collect()
}

#[sqlx::test]
async fn backlog_lists_active_then_future_sprints_then_the_rest(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    let future = ana.create_sprint("SANTI").await;
    let active = ana.create_sprint("SANTI").await;
    let done = ana.status_id("SANTI", "Done").await;
    ana.create_issue("SANTI", json!({ "summary": "Epic", "issue_type": "epic" }))
        .await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "a", "points": 3, "sprint_id": active["id"], "parent": "SANTI-1" }),
    )
    .await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "b", "sprint_id": active["id"] }),
    )
    .await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "c", "points": 2, "sprint_id": future["id"] }),
    )
    .await;
    ana.create_issue("SANTI", json!({ "summary": "d", "points": 5 }))
        .await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "shipped", "status_id": done, "parent": "SANTI-1" }),
    )
    .await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "sub", "issue_type": "subtask", "parent": "SANTI-5" }),
    )
    .await;
    ana.post(
        &format!("/api/projects/SANTI/sprints/{}/start", active["id"]),
        json!({}),
    )
    .await;

    let (status, backlog) = ana.get("/api/projects/SANTI/backlog").await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(backlog["sections"][0]["sprint"]["id"], active["id"]);
    assert_eq!(section_keys(&backlog, 0), ["SANTI-2", "SANTI-3"]);
    assert_eq!(backlog["sections"][0]["total_points"], 3.0);
    assert_eq!(backlog["sections"][0]["issue_count"], 2);
    assert_eq!(section_keys(&backlog, 1), ["SANTI-4"]);
    assert_eq!(backlog["sections"][2]["sprint"], Value::Null);
    assert_eq!(section_keys(&backlog, 2), ["SANTI-5"]);
    assert_eq!(backlog["sections"][2]["cards"][0]["total_subtasks"], 1);
    assert_eq!(
        backlog["sections"][2]["cards"][0]["reporter_id"],
        ana.user_id
    );
    let epic = &backlog["epics"][0];
    assert_eq!(epic["key"], "SANTI-1");
    assert_eq!(epic["child_count"], 2);
    assert_eq!(epic["done_child_count"], 1);
    assert_eq!(epic["done"], false);
}

#[sqlx::test]
async fn quick_filters_hide_rows_but_not_totals(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    ana.create_issue("SANTI", json!({ "summary": "story", "points": 5 }))
        .await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "bug", "issue_type": "bug", "points": 1 }),
    )
    .await;

    let (_, backlog) = ana.get("/api/projects/SANTI/backlog?type=bug").await;

    assert_eq!(section_keys(&backlog, 0), ["SANTI-2"]);
    assert_eq!(backlog["sections"][0]["total_points"], 6.0);
    assert_eq!(backlog["sections"][0]["issue_count"], 2);
}

#[sqlx::test]
async fn backlog_filters_an_assignee_or_unassigned(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    let bob = ana.another_user("bob@example.com").await;
    ana.add_member("SANTI", &bob, "member").await;
    for assignee in [Some(ana.user_id), Some(bob.user_id), None] {
        ana.create_issue(
            "SANTI",
            json!({ "summary": "work", "assignee_id": assignee }),
        )
        .await;
    }

    let (_, backlog) = ana
        .get(&format!(
            "/api/projects/SANTI/backlog?unassigned=true&assignee={}",
            ana.user_id
        ))
        .await;

    assert_eq!(section_keys(&backlog, 0), ["SANTI-1", "SANTI-3"]);
}

#[sqlx::test]
async fn reopened_issue_of_a_closed_sprint_returns_to_the_backlog(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    let sprint = ana.create_sprint("SANTI").await;
    let done = ana.status_id("SANTI", "Done").await;
    let todo = ana.status_id("SANTI", "To Do").await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "x", "sprint_id": sprint["id"], "status_id": done }),
    )
    .await;
    ana.post(
        &format!("/api/projects/SANTI/sprints/{}/start", sprint["id"]),
        json!({}),
    )
    .await;
    ana.post(
        &format!("/api/projects/SANTI/sprints/{}/complete", sprint["id"]),
        json!({ "open_issues": { "to": "backlog" } }),
    )
    .await;
    ana.post(
        "/api/projects/SANTI/issues/1/move",
        json!({ "status_id": todo }),
    )
    .await;

    let (_, backlog) = ana.get("/api/projects/SANTI/backlog").await;

    assert_eq!(backlog["sections"].as_array().unwrap().len(), 1);
    assert_eq!(section_keys(&backlog, 0), ["SANTI-1"]);
}

#[sqlx::test]
async fn kanban_projects_have_no_backlog(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("FLOW", "kanban").await;

    let (status, problem) = ana.get("/api/projects/FLOW/backlog").await;

    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(problem["type"], "urn:santi:error:kanban-has-no-backlog");
}
