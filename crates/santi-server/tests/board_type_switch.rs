mod common;

use axum::http::StatusCode;
use common::TestApp;
use serde_json::{Value, json};
use sqlx::PgPool;

async fn switch(app: &TestApp, key: &str, body: Value) -> (StatusCode, Value) {
    app.patch(&format!("/api/projects/{key}"), body).await
}

fn card_keys(board: &Value) -> Vec<String> {
    let mut keys: Vec<String> = board["columns"]
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|column| column["cards"].as_array().unwrap())
        .map(|card| card["key"].as_str().unwrap().to_string())
        .collect();
    keys.sort();
    keys
}

/// FLOW: an active sprint with FLOW-1, a future sprint with FLOW-2, FLOW-3 in the backlog.
async fn scrum_with_sprints(pool: PgPool) -> (TestApp, Value, Value) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("FLOW", "scrum").await;
    let active = ana.create_sprint("FLOW").await;
    let future = ana.create_sprint("FLOW").await;
    ana.create_issue(
        "FLOW",
        json!({ "summary": "Running", "sprint_id": active["id"] }),
    )
    .await;
    ana.create_issue(
        "FLOW",
        json!({ "summary": "Planned", "sprint_id": future["id"] }),
    )
    .await;
    ana.create_issue("FLOW", json!({ "summary": "Loose" }))
        .await;
    let (status, started) = ana
        .post(
            &format!("/api/projects/FLOW/sprints/{}/start", active["id"]),
            json!({}),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{started}");
    (ana, active, future)
}

#[sqlx::test]
async fn scrum_to_kanban_keeps_sprints_and_shows_every_open_issue(pool: PgPool) {
    let (ana, active, future) = scrum_with_sprints(pool).await;

    let (status, project) = switch(&ana, "FLOW", json!({ "board_type": "kanban" })).await;

    assert_eq!(status, StatusCode::OK, "{project}");
    assert_eq!(project["board_type"], "kanban");
    let (status, board) = ana.get("/api/projects/FLOW/board").await;
    assert_eq!(status, StatusCode::OK, "{board}");
    assert_eq!(board["board_type"], "kanban");
    assert_eq!(board["sprint"], Value::Null);
    assert_eq!(card_keys(&board), ["FLOW-1", "FLOW-2", "FLOW-3"]);
    let settings = ana.settings("FLOW").await;
    assert_eq!(settings["board_type"], "kanban");
    assert_eq!(settings["done_window_days"], Value::Null);
    for uri in [
        "/api/projects/FLOW/backlog",
        "/api/projects/FLOW/reports/sprints",
        "/api/projects/FLOW/reports/velocity",
    ] {
        assert_eq!(ana.get(uri).await.0, StatusCode::CONFLICT, "{uri}");
    }
    let (status, sprints) = ana.get("/api/projects/FLOW/sprints").await;
    assert_eq!(status, StatusCode::OK, "{sprints}");
    assert_eq!(sprints.as_array().unwrap().len(), 2);
    let (status, problem) = ana
        .post(
            &format!("/api/projects/FLOW/sprints/{}/start", future["id"]),
            json!({}),
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT, "{problem}");
    assert_eq!(problem["type"], "urn:santi:error:kanban-has-no-sprints");
    let (status, _) = ana
        .post(
            &format!("/api/projects/FLOW/sprints/{}/complete", active["id"]),
            json!({ "open_issues": { "to": "backlog" } }),
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT);
    for uri in ["/api/me/issues?view=recommended", "/api/me/projects"] {
        let (status, page) = ana.get(uri).await;
        assert_eq!(status, StatusCode::OK, "{page}");
    }
    let issue = ana.get("/api/projects/FLOW/issues/1").await.1;
    assert_eq!(issue["sprint_id"], active["id"]);
}

#[sqlx::test]
async fn switching_back_to_scrum_resumes_the_active_sprint(pool: PgPool) {
    let (ana, active, future) = scrum_with_sprints(pool).await;
    switch(&ana, "FLOW", json!({ "board_type": "kanban" })).await;

    let (status, project) = switch(&ana, "FLOW", json!({ "board_type": "scrum" })).await;

    assert_eq!(status, StatusCode::OK, "{project}");
    let (_, board) = ana.get("/api/projects/FLOW/board").await;
    assert_eq!(board["sprint"]["id"], active["id"]);
    assert_eq!(board["sprint"]["state"], "active");
    assert_eq!(card_keys(&board), ["FLOW-1"]);
    let (status, backlog) = ana.get("/api/projects/FLOW/backlog").await;
    assert_eq!(status, StatusCode::OK, "{backlog}");
    let sections = backlog["sections"].as_array().unwrap();
    assert_eq!(sections[0]["sprint"]["id"], active["id"]);
    assert_eq!(sections[1]["sprint"]["id"], future["id"]);
    assert_eq!(sections[1]["cards"][0]["key"], "FLOW-2");
    assert_eq!(sections[2]["cards"][0]["key"], "FLOW-3");
    let (status, _) = ana.get("/api/projects/FLOW/reports/velocity").await;
    assert_eq!(status, StatusCode::OK);
}

#[sqlx::test]
async fn kanban_to_scrum_clears_limits_and_the_done_window(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("FLOW", "kanban").await;
    let doing = ana.column_id("FLOW", "In Progress").await;
    let (status, body) = ana
        .put(
            &format!("/api/projects/FLOW/board/columns/{doing}"),
            json!({ "name": "In Progress", "wip_limit": 3 }),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    ana.create_issue("FLOW", json!({ "summary": "One" })).await;
    ana.create_issue("FLOW", json!({ "summary": "Two" })).await;

    let (status, project) = switch(
        &ana,
        "FLOW",
        json!({ "board_type": "scrum", "expected_board_type": "kanban", "name": "Flow" }),
    )
    .await;

    assert_eq!(status, StatusCode::OK, "{project}");
    assert_eq!(project["board_type"], "scrum");
    assert_eq!(project["name"], "Flow");
    let settings = ana.settings("FLOW").await;
    assert_eq!(settings["board_type"], "scrum");
    assert_eq!(settings["done_window_days"], Value::Null);
    for column in settings["columns"].as_array().unwrap() {
        assert_eq!(column["wip_limit"], Value::Null, "{column}");
    }
    let (status, backlog) = ana.get("/api/projects/FLOW/backlog").await;
    assert_eq!(status, StatusCode::OK, "{backlog}");
    let sections = backlog["sections"].as_array().unwrap();
    assert_eq!(sections.len(), 1);
    assert_eq!(sections[0]["issue_count"], 2);
    let (_, board) = ana.get("/api/projects/FLOW/board").await;
    assert_eq!(board["sprint"], Value::Null);
    ana.create_sprint("FLOW").await;
}

#[sqlx::test]
async fn the_same_type_changes_nothing(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("FLOW", "kanban").await;

    let (status, project) = switch(&ana, "FLOW", json!({ "board_type": "kanban" })).await;

    assert_eq!(status, StatusCode::OK, "{project}");
    assert_eq!(ana.settings("FLOW").await["done_window_days"], 14);
}

#[sqlx::test]
async fn a_stale_expected_type_is_refused(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("FLOW", "kanban").await;

    let (status, problem) = switch(
        &ana,
        "FLOW",
        json!({ "board_type": "kanban", "expected_board_type": "scrum", "name": "Other" }),
    )
    .await;

    assert_eq!(status, StatusCode::CONFLICT, "{problem}");
    assert_eq!(problem["type"], "urn:santi:error:board-type-changed");
    assert_eq!(
        problem["detail"],
        "The board type changed since you loaded this page. Reload to see the current type."
    );
    let (_, project) = ana.get("/api/projects/FLOW").await;
    assert_eq!(project["name"], "Project FLOW");
    assert_eq!(ana.settings("FLOW").await["done_window_days"], 14);
}

#[sqlx::test]
async fn only_admins_of_active_projects_switch(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    ana.create_project("FLOW", "scrum").await;
    ana.add_member("FLOW", &bob, "member").await;

    let (member, _) = switch(&bob, "FLOW", json!({ "board_type": "kanban" })).await;
    ana.post("/api/projects/FLOW/archive", json!(null)).await;
    let (archived, problem) = switch(&ana, "FLOW", json!({ "board_type": "kanban" })).await;

    assert_eq!(member, StatusCode::FORBIDDEN);
    assert_eq!(archived, StatusCode::CONFLICT);
    assert_eq!(problem["type"], "urn:santi:error:project-archived");
    assert_eq!(ana.get("/api/projects/FLOW").await.1["board_type"], "scrum");
}
