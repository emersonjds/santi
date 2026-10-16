mod common;

use axum::http::StatusCode;
use common::TestApp;
use serde_json::{Value, json};
use sqlx::PgPool;

async fn scrum(pool: PgPool) -> TestApp {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    ana
}

async fn issue(app: &TestApp, number: i64) -> Value {
    app.get(&format!("/api/projects/SANTI/issues/{number}"))
        .await
        .1
}

async fn move_to_sprint(app: &TestApp, number: i64, sprint_id: Value) -> (StatusCode, Value) {
    app.post(
        &format!("/api/projects/SANTI/issues/{number}/move"),
        json!({ "sprint_id": sprint_id }),
    )
    .await
}

#[sqlx::test]
async fn default_names_count_every_sprint_ever_created(pool: PgPool) {
    let ana = scrum(pool).await;
    ana.create_sprint("SANTI").await;
    let second = ana.create_sprint("SANTI").await;
    ana.delete(&format!("/api/projects/SANTI/sprints/{}", second["id"]))
        .await;

    let next = ana.create_sprint("SANTI").await;
    let (_, sprints) = ana.get("/api/projects/SANTI/sprints").await;

    assert_eq!(next["name"], "Sprint 3");
    assert_eq!(next["state"], "future");
    let names: Vec<&str> = sprints
        .as_array()
        .unwrap()
        .iter()
        .map(|sprint| sprint["name"].as_str().unwrap())
        .collect();
    assert_eq!(names, ["Sprint 1", "Sprint 3"]);
}

#[sqlx::test]
async fn custom_name_and_goal(pool: PgPool) {
    let ana = scrum(pool).await;

    let (_, sprint) = ana
        .post(
            "/api/projects/SANTI/sprints",
            json!({ "name": "Launch", "goal": "Ship v1" }),
        )
        .await;

    assert_eq!(sprint["name"], "Launch");
    assert_eq!(sprint["goal"], "Ship v1");
    assert_eq!(sprint["overdue"], false);
}

#[sqlx::test]
async fn kanban_projects_have_no_sprints(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("FLOW", "kanban").await;

    let (status, problem) = ana.post("/api/projects/FLOW/sprints", json!({})).await;

    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(problem["type"], "urn:santi:error:kanban-has-no-sprints");
}

#[sqlx::test]
async fn sprint_edits_validate_dates(pool: PgPool) {
    let ana = scrum(pool).await;
    let sprint = ana.create_sprint("SANTI").await;
    let url = format!("/api/projects/SANTI/sprints/{}", sprint["id"]);

    let (_, edited) = ana.put(&url, json!({ "name": "Renamed", "goal": "g", "start_date": "2026-11-01", "end_date": "2026-11-14" })).await;
    let (backwards, problem) = ana
        .put(
            &url,
            json!({ "name": "Renamed", "start_date": "2026-11-14", "end_date": "2026-11-01" }),
        )
        .await;
    let (unknown, _) = ana
        .put("/api/projects/SANTI/sprints/999999", json!({ "name": "x" }))
        .await;

    assert_eq!(edited["name"], "Renamed");
    assert_eq!(edited["end_date"], "2026-11-14");
    assert_eq!(backwards, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "end_date");
    assert_eq!(unknown, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn issues_move_into_a_sprint_and_back_keeping_rank(pool: PgPool) {
    let ana = scrum(pool).await;
    let sprint = ana.create_sprint("SANTI").await;
    let created = ana.create_issue("SANTI", json!({ "summary": "x" })).await;

    let (_, planned) = move_to_sprint(&ana, 1, sprint["id"].clone()).await;
    let (_, kept) = ana
        .post("/api/projects/SANTI/issues/1/move", json!({}))
        .await;
    let (_, unplanned) = move_to_sprint(&ana, 1, Value::Null).await;

    assert_eq!(planned["sprint_id"], sprint["id"]);
    assert_eq!(kept["sprint_id"], sprint["id"]);
    assert_eq!(unplanned["sprint_id"], Value::Null);
    assert_eq!(unplanned["rank"], created["rank"]);
}

#[sqlx::test]
async fn deleting_a_future_sprint_returns_its_issues_to_the_backlog(pool: PgPool) {
    let ana = scrum(pool).await;
    let sprint = ana.create_sprint("SANTI").await;
    let created = ana
        .create_issue(
            "SANTI",
            json!({ "summary": "x", "sprint_id": sprint["id"] }),
        )
        .await;

    let (status, _) = ana
        .delete(&format!("/api/projects/SANTI/sprints/{}", sprint["id"]))
        .await;
    let after = issue(&ana, 1).await;

    assert_eq!(created["sprint_id"], sprint["id"]);
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(after["sprint_id"], Value::Null);
    assert_eq!(after["rank"], created["rank"]);
    assert_eq!(
        ana.delete(&format!("/api/projects/SANTI/sprints/{}", sprint["id"]))
            .await
            .0,
        StatusCode::NOT_FOUND
    );
}

#[sqlx::test]
async fn subtasks_always_share_their_parent_sprint(pool: PgPool) {
    let ana = scrum(pool).await;
    let sprint = ana.create_sprint("SANTI").await;
    ana.create_issue("SANTI", json!({ "summary": "Story" }))
        .await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "Early sub", "issue_type": "subtask", "parent": "SANTI-1" }),
    )
    .await;

    move_to_sprint(&ana, 1, sprint["id"].clone()).await;
    let late = ana
        .create_issue(
            "SANTI",
            json!({ "summary": "Late sub", "issue_type": "subtask", "parent": "SANTI-1" }),
        )
        .await;
    let (direct, problem) = move_to_sprint(&ana, 2, Value::Null).await;
    let (explicit, _) = ana.post("/api/projects/SANTI/issues", json!({ "summary": "s", "issue_type": "subtask", "parent": "SANTI-1", "sprint_id": sprint["id"] })).await;

    assert_eq!(issue(&ana, 2).await["sprint_id"], sprint["id"]);
    assert_eq!(late["sprint_id"], sprint["id"]);
    assert_eq!(direct, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "sprint_id");
    assert_eq!(explicit, StatusCode::UNPROCESSABLE_ENTITY);
}

#[sqlx::test]
async fn epics_and_foreign_sprints_are_refused(pool: PgPool) {
    let ana = scrum(pool).await;
    ana.create_project("OTHER", "scrum").await;
    let foreign = ana.create_sprint("OTHER").await;
    ana.create_issue("SANTI", json!({ "summary": "Epic", "issue_type": "epic" }))
        .await;
    ana.create_issue("SANTI", json!({ "summary": "Story" }))
        .await;
    let own = ana.create_sprint("SANTI").await;

    let (epic, _) = move_to_sprint(&ana, 1, own["id"].clone()).await;
    let (other_board, problem) = move_to_sprint(&ana, 2, foreign["id"].clone()).await;
    let (create_foreign, _) = ana
        .post(
            "/api/projects/SANTI/issues",
            json!({ "summary": "x", "sprint_id": foreign["id"] }),
        )
        .await;

    assert_eq!(epic, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(other_board, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "sprint_id");
    assert_eq!(create_foreign, StatusCode::UNPROCESSABLE_ENTITY);
}

#[sqlx::test]
async fn sprint_and_rank_change_in_one_move(pool: PgPool) {
    let ana = scrum(pool).await;
    let sprint = ana.create_sprint("SANTI").await;
    ana.create_issue("SANTI", json!({ "summary": "one" })).await;
    ana.create_issue("SANTI", json!({ "summary": "two" })).await;

    let (_, moved) = ana
        .post(
            "/api/projects/SANTI/issues/2/move",
            json!({ "sprint_id": sprint["id"], "before": "SANTI-1" }),
        )
        .await;

    assert_eq!(moved["sprint_id"], sprint["id"]);
    assert!(moved["rank"].as_str().unwrap() < issue(&ana, 1).await["rank"].as_str().unwrap());
}

#[sqlx::test]
async fn openapi_lists_sprint_routes(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let (_, api) = app.get("/openapi.json").await;

    assert!(api["paths"]["/api/projects/{key}/sprints"]["post"].is_object());
    assert!(api["paths"]["/api/projects/{key}/sprints/{id}"]["delete"].is_object());
}
