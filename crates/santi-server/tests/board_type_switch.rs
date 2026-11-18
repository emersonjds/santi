mod common;

use axum::http::StatusCode;
use common::TestApp;
use santi_server::boards;
use santi_server::error::AppError;
use santi_server::members::Member;
use santi_types::boards::{UpdateBoardSettings, UpdateColumn};
use santi_types::projects::{BoardType, MemberRole};
use serde_json::{Value, json};
use sqlx::PgPool;
use std::time::Duration;

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
    assert_eq!(settings["done_window_days"], 14);
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

#[sqlx::test]
async fn kanban_refuses_editing_and_deleting_sprints(pool: PgPool) {
    let (ana, _, future) = scrum_with_sprints(pool).await;
    switch(&ana, "FLOW", json!({ "board_type": "kanban" })).await;
    let uri = format!("/api/projects/FLOW/sprints/{}", future["id"]);

    let (edited, edit_problem) = ana.put(&uri, json!({ "name": "Renamed" })).await;
    let (deleted, delete_problem) = ana.delete(&uri).await;

    assert_eq!(edited, StatusCode::CONFLICT, "{edit_problem}");
    assert_eq!(
        edit_problem["type"],
        "urn:santi:error:kanban-has-no-sprints"
    );
    assert_eq!(deleted, StatusCode::CONFLICT, "{delete_problem}");
    assert_eq!(
        delete_problem["type"],
        "urn:santi:error:kanban-has-no-sprints"
    );
}

#[sqlx::test]
async fn kanban_keeps_each_issue_in_its_sprint(pool: PgPool) {
    let (ana, active, _) = scrum_with_sprints(pool).await;
    switch(&ana, "FLOW", json!({ "board_type": "kanban" })).await;

    let patched = ana
        .patch("/api/projects/FLOW/issues/1", json!({ "sprint_id": null }))
        .await;
    let moved = ana
        .post(
            "/api/projects/FLOW/issues/1/move",
            json!({ "sprint_id": null }),
        )
        .await;
    let loose = ana
        .patch("/api/projects/FLOW/issues/3", json!({ "sprint_id": null }))
        .await;

    for (status, problem) in [patched, moved, loose] {
        assert_eq!(status, StatusCode::CONFLICT, "{problem}");
        assert_eq!(problem["type"], "urn:santi:error:kanban-has-no-sprints");
    }
    let issue = ana.get("/api/projects/FLOW/issues/1").await.1;
    assert_eq!(issue["sprint_id"], active["id"]);
}

/// The caller as the extractor saw it before a switch to scrum committed.
async fn caller_seeing_kanban(pool: &PgPool, app: &TestApp, key: &str) -> Member {
    let (project_id, board_id): (i64, i64) = sqlx::query_as(
        "SELECT p.id, b.id FROM project p JOIN board b ON b.project_id = p.id WHERE p.key = $1",
    )
    .bind(key)
    .fetch_one(pool)
    .await
    .unwrap();
    Member {
        user_id: app.user_id,
        project_id,
        project_key: key.to_string(),
        board_id,
        board_type: BoardType::Kanban,
        role: MemberRole::Admin,
        archived: false,
    }
}

#[sqlx::test]
async fn a_scrum_board_takes_no_kanban_settings_from_a_stale_caller(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    ana.create_project("FLOW", "scrum").await;
    let doing = ana.column_id("FLOW", "In Progress").await;
    let stale = caller_seeing_kanban(&pool, &ana, "FLOW").await;

    let window = boards::service::update_settings(
        &pool,
        &stale,
        UpdateBoardSettings {
            done_window_days: Some(14),
        },
    )
    .await;
    let limit = boards::service::update_column(
        &pool,
        &stale,
        doing,
        UpdateColumn {
            name: "In Progress".to_string(),
            wip_limit: Some(3),
        },
    )
    .await;
    let renamed = boards::service::update_column(
        &pool,
        &stale,
        doing,
        UpdateColumn {
            name: "Doing".to_string(),
            wip_limit: None,
        },
    )
    .await;

    assert!(matches!(window, Err(AppError::Validation(_))), "{window:?}");
    assert!(matches!(limit, Err(AppError::Validation(_))), "{limit:?}");
    assert!(renamed.is_ok(), "{renamed:?}");
    let settings = ana.settings("FLOW").await;
    assert_eq!(settings["done_window_days"], Value::Null);
    for column in settings["columns"].as_array().unwrap() {
        assert_eq!(column["wip_limit"], Value::Null, "{column}");
    }
}

const LOCK_FLOW_BOARD: &str = "SELECT b.id FROM board b JOIN project p ON p.id = b.project_id WHERE p.key = 'FLOW' FOR UPDATE OF b";

#[sqlx::test]
async fn a_rename_does_not_wait_for_a_board_edit(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    ana.create_project("FLOW", "scrum").await;
    let mut editing = pool.begin().await.unwrap();
    sqlx::query(LOCK_FLOW_BOARD)
        .execute(&mut *editing)
        .await
        .unwrap();

    let renamed = tokio::time::timeout(
        Duration::from_secs(3),
        switch(&ana, "FLOW", json!({ "name": "Flow" })),
    )
    .await;
    editing.rollback().await.unwrap();

    let (status, project) = renamed.expect("the rename waited for the board");
    assert_eq!(status, StatusCode::OK, "{project}");
}

/// A column edit holds the board, then its new status row needs the project: the switch must not
/// hold the project while it waits for the board.
#[sqlx::test]
async fn a_switch_during_a_column_edit_does_not_deadlock(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    ana.create_project("FLOW", "scrum").await;
    let mut editing = pool.begin().await.unwrap();
    sqlx::query(LOCK_FLOW_BOARD)
        .execute(&mut *editing)
        .await
        .unwrap();

    let switching = tokio::spawn({
        let ana = ana.clone();
        async move { switch(&ana, "FLOW", json!({ "board_type": "kanban" })).await }
    });
    tokio::time::sleep(Duration::from_millis(300)).await;
    let key_share = sqlx::query("SELECT id FROM project WHERE key = 'FLOW' FOR KEY SHARE")
        .execute(&mut *editing)
        .await;
    let committed = editing.commit().await;
    let (status, project) = switching.await.unwrap();

    assert!(key_share.is_ok(), "{key_share:?}");
    assert!(committed.is_ok(), "{committed:?}");
    assert_eq!(status, StatusCode::OK, "{project}");
}
