mod common;

use axum::http::StatusCode;
use common::TestApp;
use serde_json::{Value, json};
use sqlx::PgPool;

fn column_names(settings: &Value) -> Vec<String> {
    settings["columns"]
        .as_array()
        .unwrap()
        .iter()
        .map(|column| column["name"].as_str().unwrap().to_string())
        .collect()
}

async fn admin_with_project(pool: PgPool, board_type: &str) -> TestApp {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("SANTI", board_type).await;
    ana
}

#[sqlx::test]
async fn new_scrum_project_has_three_default_columns(pool: PgPool) {
    let ana = admin_with_project(pool, "scrum").await;

    let settings = ana.settings("SANTI").await;

    assert_eq!(column_names(&settings), ["To Do", "In Progress", "Done"]);
    assert_eq!(settings["columns"][2]["statuses"][0]["category"], "done");
    assert_eq!(settings["unmapped"], json!([]));
    assert_eq!(settings["done_window_days"], Value::Null);
}

#[sqlx::test]
async fn new_kanban_project_hides_done_after_14_days(pool: PgPool) {
    let ana = admin_with_project(pool, "kanban").await;

    assert_eq!(ana.settings("SANTI").await["done_window_days"], 14);
}

#[sqlx::test]
async fn new_column_lands_left_of_done_with_its_status(pool: PgPool) {
    let ana = admin_with_project(pool, "scrum").await;

    let (status, settings) = ana
        .post(
            "/api/projects/SANTI/board/columns",
            json!({ "name": "Review", "new_status": "in_progress" }),
        )
        .await;

    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(
        column_names(&settings),
        ["To Do", "In Progress", "Review", "Done"]
    );
    assert_eq!(settings["columns"][2]["statuses"][0]["name"], "Review");
}

#[sqlx::test]
async fn new_column_with_a_done_status_is_refused_and_rolled_back(pool: PgPool) {
    let ana = admin_with_project(pool, "scrum").await;

    let (status, problem) = ana
        .post(
            "/api/projects/SANTI/board/columns",
            json!({ "name": "Shipped", "new_status": "done" }),
        )
        .await;

    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(problem["type"], "urn:santi:error:done-column");
    assert_eq!(
        column_names(&ana.settings("SANTI").await),
        ["To Do", "In Progress", "Done"]
    );
}

#[sqlx::test]
async fn members_cannot_change_the_layout(pool: PgPool) {
    let ana = admin_with_project(pool, "scrum").await;
    let bob = ana.another_user("bob@example.com").await;
    ana.add_member("SANTI", &bob, "member").await;

    let (status, _) = bob
        .post(
            "/api/projects/SANTI/board/columns",
            json!({ "name": "Review" }),
        )
        .await;

    assert_eq!(status, StatusCode::FORBIDDEN);
    assert_eq!(
        bob.get("/api/projects/SANTI/board/settings").await.0,
        StatusCode::OK
    );
}

#[sqlx::test]
async fn reorder_keeps_done_rightmost(pool: PgPool) {
    let ana = admin_with_project(pool, "scrum").await;
    let todo = ana.column_id("SANTI", "To Do").await;
    let doing = ana.column_id("SANTI", "In Progress").await;
    let done = ana.column_id("SANTI", "Done").await;
    let order = "/api/projects/SANTI/board/columns/order";

    let (swapped, settings) = ana
        .put(order, json!({ "column_ids": [doing, todo, done] }))
        .await;
    let (done_left, _) = ana
        .put(order, json!({ "column_ids": [done, todo, doing] }))
        .await;
    let (missing, _) = ana.put(order, json!({ "column_ids": [todo, done] })).await;

    assert_eq!(swapped, StatusCode::OK);
    assert_eq!(column_names(&settings), ["In Progress", "To Do", "Done"]);
    assert_eq!(done_left, StatusCode::CONFLICT);
    assert_eq!(missing, StatusCode::UNPROCESSABLE_ENTITY);
}

#[sqlx::test]
async fn kanban_columns_take_a_wip_limit_and_scrum_columns_do_not(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("FLOW", "kanban").await;
    ana.create_project("SPRINT", "scrum").await;
    let flow = ana.column_id("FLOW", "In Progress").await;
    let sprint = ana.column_id("SPRINT", "In Progress").await;

    let (_, settings) = ana
        .put(
            &format!("/api/projects/FLOW/board/columns/{flow}"),
            json!({ "name": "Doing", "wip_limit": 3 }),
        )
        .await;
    let (refused, problem) = ana
        .put(
            &format!("/api/projects/SPRINT/board/columns/{sprint}"),
            json!({ "name": "Doing", "wip_limit": 3 }),
        )
        .await;

    assert_eq!(settings["columns"][1]["name"], "Doing");
    assert_eq!(settings["columns"][1]["wip_limit"], 3);
    assert_eq!(refused, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "wip_limit");
}

#[sqlx::test]
async fn updating_an_unknown_column_is_not_found(pool: PgPool) {
    let ana = admin_with_project(pool, "scrum").await;

    let (status, _) = ana
        .put(
            "/api/projects/SANTI/board/columns/999999",
            json!({ "name": "X" }),
        )
        .await;

    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn deleting_a_column_moves_its_statuses_to_the_target(pool: PgPool) {
    let ana = admin_with_project(pool, "scrum").await;
    let todo = ana.column_id("SANTI", "To Do").await;
    let doing = ana.column_id("SANTI", "In Progress").await;

    let (status, settings) = ana
        .delete(&format!(
            "/api/projects/SANTI/board/columns/{doing}?move_statuses_to={todo}"
        ))
        .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(column_names(&settings), ["To Do", "Done"]);
    assert_eq!(
        settings["columns"][0]["statuses"].as_array().unwrap().len(),
        2
    );
}

#[sqlx::test]
async fn column_deletion_guards(pool: PgPool) {
    let ana = admin_with_project(pool, "scrum").await;
    let todo = ana.column_id("SANTI", "To Do").await;
    let done = ana.column_id("SANTI", "Done").await;

    let (rightmost, problem) = ana
        .delete(&format!(
            "/api/projects/SANTI/board/columns/{done}?move_statuses_to={todo}"
        ))
        .await;
    let (no_target, _) = ana
        .delete(&format!("/api/projects/SANTI/board/columns/{todo}"))
        .await;
    let (into_done, _) = ana
        .delete(&format!(
            "/api/projects/SANTI/board/columns/{todo}?move_statuses_to={done}"
        ))
        .await;
    let (garbage, bad) = ana
        .delete(&format!(
            "/api/projects/SANTI/board/columns/{todo}?move_statuses_to=abc"
        ))
        .await;

    assert_eq!(rightmost, StatusCode::CONFLICT);
    assert_eq!(problem["type"], "urn:santi:error:rightmost-column");
    assert_eq!(no_target, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(into_done, StatusCode::CONFLICT);
    assert_eq!(garbage, StatusCode::BAD_REQUEST);
    assert_eq!(bad["type"], "urn:santi:error:bad-request");
    assert_eq!(
        column_names(&ana.settings("SANTI").await),
        ["To Do", "In Progress", "Done"]
    );
}

#[sqlx::test]
async fn deleting_an_empty_column_needs_no_target(pool: PgPool) {
    let ana = admin_with_project(pool, "scrum").await;
    ana.post(
        "/api/projects/SANTI/board/columns",
        json!({ "name": "Spare" }),
    )
    .await;
    let spare = ana.column_id("SANTI", "Spare").await;

    let (status, settings) = ana
        .delete(&format!("/api/projects/SANTI/board/columns/{spare}"))
        .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(column_names(&settings), ["To Do", "In Progress", "Done"]);
}

#[sqlx::test]
async fn statuses_start_unmapped_and_can_be_mapped(pool: PgPool) {
    let ana = admin_with_project(pool, "scrum").await;
    let doing = ana.column_id("SANTI", "In Progress").await;

    let (created, status) = ana
        .post(
            "/api/projects/SANTI/statuses",
            json!({ "name": "Blocked", "category": "in_progress" }),
        )
        .await;
    let url = format!("/api/projects/SANTI/statuses/{}", status["id"]);
    let (_, mapped) = ana
        .put(&url, json!({ "name": "Blocked", "column_id": doing }))
        .await;
    let (_, renamed) = ana.put(&url, json!({ "name": "On hold" })).await;

    assert_eq!(created, StatusCode::CREATED);
    assert_eq!(status["column_id"], Value::Null);
    assert_eq!(mapped["column_id"], doing);
    assert_eq!(renamed["name"], "On hold");
    assert_eq!(renamed["column_id"], Value::Null);
}

#[sqlx::test]
async fn mapping_a_done_status_to_a_middle_column_is_refused(pool: PgPool) {
    let ana = admin_with_project(pool, "scrum").await;
    let doing = ana.column_id("SANTI", "In Progress").await;
    let done_status = ana.status_id("SANTI", "Done").await;

    let (status, _) = ana
        .put(
            &format!("/api/projects/SANTI/statuses/{done_status}"),
            json!({ "name": "Done", "column_id": doing }),
        )
        .await;

    assert_eq!(status, StatusCode::CONFLICT);
}

#[sqlx::test]
async fn the_board_keeps_a_done_status_and_a_column_before_it(pool: PgPool) {
    let ana = admin_with_project(pool, "kanban").await;
    let todo = ana.column_id("SANTI", "To Do").await;
    let doing = ana.column_id("SANTI", "In Progress").await;
    let done_url = format!(
        "/api/projects/SANTI/statuses/{}",
        ana.status_id("SANTI", "Done").await
    );
    ana.delete(&format!(
        "/api/projects/SANTI/board/columns/{todo}?move_statuses_to={doing}"
    ))
    .await;
    for name in ["To Do", "In Progress"] {
        let id = ana.status_id("SANTI", name).await;
        ana.put(
            &format!("/api/projects/SANTI/statuses/{id}"),
            json!({ "name": name }),
        )
        .await;
    }

    let (unmapped, problem) = ana.put(&done_url, json!({ "name": "Done" })).await;
    let (deleted, _) = ana.delete(&done_url).await;
    let (single, _) = ana
        .delete(&format!("/api/projects/SANTI/board/columns/{doing}"))
        .await;

    assert_eq!(unmapped, StatusCode::CONFLICT);
    assert_eq!(problem["type"], "urn:santi:error:keep-done-column");
    assert_eq!(deleted, StatusCode::CONFLICT);
    assert_eq!(single, StatusCode::CONFLICT);
    let settings = ana.settings("SANTI").await;
    assert_eq!(column_names(&settings), ["In Progress", "Done"]);
    assert_eq!(settings["columns"][1]["statuses"][0]["name"], "Done");
}

#[sqlx::test]
async fn status_edits_validate_their_inputs(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    ana.create_project("OTHER", "scrum").await;
    let other_column = ana.column_id("OTHER", "To Do").await;
    let todo_status = ana.status_id("SANTI", "To Do").await;

    let (foreign_column, problem) = ana
        .put(
            &format!("/api/projects/SANTI/statuses/{todo_status}"),
            json!({ "name": "To Do", "column_id": other_column }),
        )
        .await;
    let (duplicate, _) = ana
        .post(
            "/api/projects/SANTI/statuses",
            json!({ "name": "Done", "category": "done" }),
        )
        .await;
    let (unknown, _) = ana
        .put(
            "/api/projects/SANTI/statuses/999999",
            json!({ "name": "X" }),
        )
        .await;

    assert_eq!(foreign_column, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "column_id");
    assert_eq!(duplicate, StatusCode::CONFLICT);
    assert_eq!(unknown, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn unused_statuses_can_be_deleted(pool: PgPool) {
    let ana = admin_with_project(pool, "scrum").await;
    let (_, status) = ana
        .post(
            "/api/projects/SANTI/statuses",
            json!({ "name": "Parked", "category": "todo" }),
        )
        .await;
    let url = format!("/api/projects/SANTI/statuses/{}", status["id"]);

    assert_eq!(ana.delete(&url).await.0, StatusCode::NO_CONTENT);
    assert_eq!(ana.delete(&url).await.0, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn done_window_is_validated(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("FLOW", "kanban").await;
    ana.create_project("SPRINT", "scrum").await;

    let (_, settings) = ana
        .put(
            "/api/projects/FLOW/board/settings",
            json!({ "done_window_days": 30 }),
        )
        .await;
    let (odd, _) = ana
        .put(
            "/api/projects/FLOW/board/settings",
            json!({ "done_window_days": 10 }),
        )
        .await;
    let (scrum, _) = ana
        .put(
            "/api/projects/SPRINT/board/settings",
            json!({ "done_window_days": 14 }),
        )
        .await;

    assert_eq!(settings["done_window_days"], 30);
    assert_eq!(odd, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(scrum, StatusCode::UNPROCESSABLE_ENTITY);
}

#[sqlx::test]
async fn openapi_lists_board_settings_routes(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let (_, api) = app.get("/openapi.json").await;

    for path in [
        "/api/projects/{key}/board/settings",
        "/api/projects/{key}/board/columns",
        "/api/projects/{key}/board/columns/order",
        "/api/projects/{key}/board/columns/{id}",
        "/api/projects/{key}/statuses",
        "/api/projects/{key}/statuses/{id}",
    ] {
        assert!(api["paths"][path].is_object(), "{path} missing");
    }
}

/// Each write re-reads the settings; doing that on a second connection while holding the first
/// deadlocks a small pool under concurrency.
#[sqlx::test]
async fn concurrent_settings_writes_finish_on_a_small_pool(pool: PgPool) {
    let small = sqlx::postgres::PgPoolOptions::new()
        .max_connections(2)
        .acquire_timeout(std::time::Duration::from_secs(3))
        .connect_with((*pool.connect_options()).clone())
        .await
        .unwrap();
    let ana = TestApp::signed_in(small, "ana@example.com").await;
    ana.create_project("FLOW", "kanban").await;
    let doing = ana.column_id("FLOW", "In Progress").await;
    let mut writes = tokio::task::JoinSet::new();
    for index in 0..60 {
        let ana = ana.clone();
        writes.spawn(async move {
            match index % 2 {
                0 => {
                    ana.put(
                        "/api/projects/FLOW/board/settings",
                        json!({ "done_window_days": 30 }),
                    )
                    .await
                    .0
                }
                _ => {
                    let url = format!("/api/projects/FLOW/board/columns/{doing}");
                    ana.put(&url, json!({ "name": "Doing", "wip_limit": 3 }))
                        .await
                        .0
                }
            }
        });
    }

    let statuses = tokio::time::timeout(std::time::Duration::from_secs(30), writes.join_all())
        .await
        .expect("the writes finish");

    assert!(
        statuses.iter().all(|status| *status == StatusCode::OK),
        "{statuses:?}"
    );
}
