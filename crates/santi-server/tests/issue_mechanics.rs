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

/// Pushes every issue's `updated_at` back to 2000 so the next write shows up.
async fn backdate(pool: &PgPool) {
    sqlx::query("UPDATE issue SET updated_at = '2000-01-01T00:00:00Z'")
        .execute(pool)
        .await
        .unwrap();
}

async fn updated_at(app: &TestApp, number: i64) -> String {
    let (_, issue) = app
        .get(&format!("/api/projects/SANTI/issues/{number}"))
        .await;
    issue["updated_at"].as_str().unwrap().to_string()
}

async fn assert_bumped(app: &TestApp, number: i64, write: &str) {
    let stamp = updated_at(app, number).await;
    assert!(
        !stamp.starts_with("2000"),
        "{write} left SANTI-{number} at {stamp}"
    );
}

async fn patch(app: &TestApp, number: i64, body: Value) -> (StatusCode, Value) {
    app.patch(&format!("/api/projects/SANTI/issues/{number}"), body)
        .await
}

#[sqlx::test]
async fn new_issues_start_with_updated_at_equal_to_created_at(pool: PgPool) {
    let ana = scrum(pool).await;

    let issue = ana
        .create_issue("SANTI", json!({ "summary": "fresh" }))
        .await;

    assert_eq!(issue["updated_at"], issue["created_at"]);
}

#[sqlx::test]
async fn edits_moves_planning_and_comments_bump_updated_at(pool: PgPool) {
    let ana = scrum(pool.clone()).await;
    ana.create_issue("SANTI", json!({ "summary": "one" })).await;
    let sprint = ana.create_sprint("SANTI").await;
    let doing = ana.status_id("SANTI", "In Progress").await;

    backdate(&pool).await;
    patch(&ana, 1, json!({ "summary": "renamed" })).await;
    assert_bumped(&ana, 1, "edit").await;

    backdate(&pool).await;
    ana.post(
        "/api/projects/SANTI/issues/1/move",
        json!({ "status_id": doing }),
    )
    .await;
    assert_bumped(&ana, 1, "move").await;

    backdate(&pool).await;
    patch(&ana, 1, json!({ "sprint_id": sprint["id"] })).await;
    assert_bumped(&ana, 1, "sprint planning").await;

    backdate(&pool).await;
    ana.post(
        "/api/projects/SANTI/issues/1/comments",
        json!({ "body": "looks good" }),
    )
    .await;
    assert_bumped(&ana, 1, "comment").await;
}

#[sqlx::test]
async fn a_write_that_changes_nothing_keeps_updated_at(pool: PgPool) {
    let ana = scrum(pool.clone()).await;
    ana.create_issue("SANTI", json!({ "summary": "one" })).await;
    backdate(&pool).await;

    patch(&ana, 1, json!({ "summary": "one" })).await;

    assert!(updated_at(&ana, 1).await.starts_with("2000"));
}

#[sqlx::test]
async fn children_added_or_reparented_bump_their_parent(pool: PgPool) {
    let ana = scrum(pool.clone()).await;
    ana.create_issue("SANTI", json!({ "summary": "story" }))
        .await;
    ana.create_issue("SANTI", json!({ "summary": "epic", "issue_type": "epic" }))
        .await;

    backdate(&pool).await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "sub", "issue_type": "subtask", "parent": "SANTI-1" }),
    )
    .await;
    assert_bumped(&ana, 1, "subtask added").await;

    backdate(&pool).await;
    patch(&ana, 1, json!({ "parent": "SANTI-2" })).await;
    assert_bumped(&ana, 2, "child reparented").await;
}

#[sqlx::test]
async fn board_cards_and_backlog_rows_carry_updated_at(pool: PgPool) {
    let ana = scrum(pool).await;
    let sprint = ana.create_sprint("SANTI").await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "planned", "sprint_id": sprint["id"] }),
    )
    .await;
    ana.post(
        &format!("/api/projects/SANTI/sprints/{}/start", sprint["id"]),
        json!({}),
    )
    .await;

    let (_, board) = ana.get("/api/projects/SANTI/board").await;
    let (_, backlog) = ana.get("/api/projects/SANTI/backlog").await;

    assert!(board["columns"][0]["cards"][0]["updated_at"].is_string());
    assert!(backlog["sections"][0]["cards"][0]["updated_at"].is_string());
}

fn card_keys(cards: &Value) -> Vec<String> {
    cards
        .as_array()
        .unwrap()
        .iter()
        .map(|card| card["key"].as_str().unwrap().to_string())
        .collect()
}

#[sqlx::test]
async fn recently_updated_filter_keeps_issues_touched_in_the_last_day(pool: PgPool) {
    let ana = scrum(pool.clone()).await;
    ana.create_project("FLOW", "kanban").await;
    for key in ["SANTI", "FLOW"] {
        ana.create_issue(key, json!({ "summary": "stale" })).await;
        ana.create_issue(key, json!({ "summary": "fresh" })).await;
    }
    sqlx::query("UPDATE issue SET updated_at = now() - interval '25 hours' WHERE number = 1")
        .execute(&pool)
        .await
        .unwrap();

    let (_, backlog) = ana
        .get("/api/projects/SANTI/backlog?recently_updated=true")
        .await;
    let (_, board) = ana
        .get("/api/projects/FLOW/board?recently_updated=true")
        .await;
    let (_, search) = ana
        .get("/api/projects/SANTI/issues?recently_updated=true")
        .await;
    let (_, unfiltered) = ana.get("/api/projects/SANTI/backlog").await;

    let backlog_section = &backlog["sections"][0];
    assert_eq!(card_keys(&backlog_section["cards"]), ["SANTI-2"]);
    assert_eq!(backlog_section["issue_count"], 2);
    assert_eq!(card_keys(&board["columns"][0]["cards"]), ["FLOW-2"]);
    assert_eq!(board["columns"][0]["issue_count"], 2);
    assert_eq!(card_keys(&search["items"]), ["SANTI-2"]);
    assert_eq!(card_keys(&unfiltered["sections"][0]["cards"]).len(), 2);
}

/// Issue number, added after start, outcome.
type Fact = (i64, bool, Option<String>);

async fn facts(pool: &PgPool) -> Vec<Fact> {
    sqlx::query_as(
        "SELECT i.number, si.added_after_start, si.outcome
         FROM sprint_issue si JOIN issue i ON i.id = si.issue_id ORDER BY i.number",
    )
    .fetch_all(pool)
    .await
    .unwrap()
}

#[sqlx::test]
async fn editing_the_sprint_moves_subtasks_and_records_scope_change(pool: PgPool) {
    let ana = scrum(pool.clone()).await;
    let sprint = ana.create_sprint("SANTI").await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "kick-off", "sprint_id": sprint["id"] }),
    )
    .await;
    ana.post(
        &format!("/api/projects/SANTI/sprints/{}/start", sprint["id"]),
        json!({}),
    )
    .await;
    ana.create_issue("SANTI", json!({ "summary": "late" }))
        .await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "sub", "issue_type": "subtask", "parent": "SANTI-2" }),
    )
    .await;

    let (joined, story) = patch(&ana, 2, json!({ "sprint_id": sprint["id"] })).await;
    let subtask = ana.get("/api/projects/SANTI/issues/3").await.1;
    let after_join = facts(&pool).await;
    let (left, story_out) = patch(&ana, 2, json!({ "sprint_id": null })).await;
    let subtask_out = ana.get("/api/projects/SANTI/issues/3").await.1;

    assert_eq!(joined, StatusCode::OK, "{story}");
    assert_eq!(story["sprint_id"], sprint["id"]);
    assert_eq!(subtask["sprint_id"], sprint["id"]);
    assert_eq!(
        after_join,
        [(1, false, None), (2, true, None), (3, true, None)]
    );
    assert_eq!(left, StatusCode::OK);
    assert_eq!(story_out["sprint_id"], Value::Null);
    assert_eq!(subtask_out["sprint_id"], Value::Null);
    assert_eq!(
        facts(&pool).await,
        [
            (1, false, None),
            (2, true, Some("removed".into())),
            (3, true, Some("removed".into()))
        ]
    );
}

#[sqlx::test]
async fn type_and_sprint_edits_follow_the_domain_rules(pool: PgPool) {
    let ana = scrum(pool).await;
    let sprint = ana.create_sprint("SANTI").await;
    ana.create_issue("SANTI", json!({ "summary": "story" }))
        .await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "sub", "issue_type": "subtask", "parent": "SANTI-1" }),
    )
    .await;
    ana.create_issue("SANTI", json!({ "summary": "epic", "issue_type": "epic" }))
        .await;

    let (retyped, story) = patch(
        &ana,
        1,
        json!({ "issue_type": "bug", "sprint_id": sprint["id"] }),
    )
    .await;
    let (subtask_sprint, subtask_problem) =
        patch(&ana, 2, json!({ "sprint_id": Value::Null })).await;
    let (subtask_same, _) = patch(&ana, 2, json!({ "sprint_id": sprint["id"] })).await;
    let (subtask_type, type_problem) = patch(&ana, 2, json!({ "issue_type": "task" })).await;
    let (epic_sprint, epic_problem) = patch(&ana, 3, json!({ "sprint_id": sprint["id"] })).await;
    let (unknown, unknown_problem) = patch(&ana, 1, json!({ "sprint_id": 999_999 })).await;

    assert_eq!(retyped, StatusCode::OK, "{story}");
    assert_eq!(story["issue_type"], "bug");
    assert_eq!(story["sprint_id"], sprint["id"]);
    assert_eq!(subtask_sprint, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(subtask_problem["errors"][0]["field"], "sprint_id");
    assert_eq!(subtask_same, StatusCode::OK);
    assert_eq!(subtask_type, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(type_problem["errors"][0]["field"], "issue_type");
    assert_eq!(epic_sprint, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(epic_problem["errors"][0]["field"], "sprint_id");
    assert_eq!(unknown, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(unknown_problem["errors"][0]["field"], "sprint_id");
}

#[sqlx::test]
async fn kanban_issues_take_no_sprint(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("FLOW", "kanban").await;
    ana.create_issue("FLOW", json!({ "summary": "flow" })).await;

    let (planned, problem) = ana
        .patch("/api/projects/FLOW/issues/1", json!({ "sprint_id": 1 }))
        .await;
    let (cleared, _) = ana
        .patch("/api/projects/FLOW/issues/1", json!({ "sprint_id": null }))
        .await;

    assert_eq!(planned, StatusCode::CONFLICT);
    assert_eq!(problem["type"], "urn:santi:error:kanban-has-no-sprints");
    assert_eq!(cleared, StatusCode::OK);
}
