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

async fn sprint_with_issues(app: &TestApp, summaries: &[&str]) -> Value {
    let sprint = app.create_sprint("SANTI").await;
    for summary in summaries {
        app.create_issue(
            "SANTI",
            json!({ "summary": summary, "sprint_id": sprint["id"] }),
        )
        .await;
    }
    sprint
}

async fn start(app: &TestApp, sprint: &Value, body: Value) -> (StatusCode, Value) {
    app.post(
        &format!("/api/projects/SANTI/sprints/{}/start", sprint["id"]),
        body,
    )
    .await
}

async fn complete(app: &TestApp, sprint: &Value, open_issues: Value) -> (StatusCode, Value) {
    app.post(
        &format!("/api/projects/SANTI/sprints/{}/complete", sprint["id"]),
        json!({ "open_issues": open_issues }),
    )
    .await
}

async fn move_issue(app: &TestApp, number: i64, body: Value) {
    let (status, moved) = app
        .post(&format!("/api/projects/SANTI/issues/{number}/move"), body)
        .await;
    assert_eq!(status, StatusCode::OK, "{moved}");
}

/// Issue number, added after start, points at start, outcome, points at close.
type Fact = (i64, bool, Option<f64>, Option<String>, Option<f64>);

async fn sprint_of(app: &TestApp, number: i64) -> Value {
    app.get(&format!("/api/projects/SANTI/issues/{number}"))
        .await
        .1["sprint_id"]
        .clone()
}

#[sqlx::test]
async fn start_defaults_to_today_and_two_weeks(pool: PgPool) {
    let ana = scrum(pool).await;
    let sprint = sprint_with_issues(&ana, &["x"]).await;
    let today = chrono::Utc::now().date_naive();

    let (status, started) = start(&ana, &sprint, json!({})).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(started["state"], "active");
    assert_eq!(started["start_date"], today.to_string());
    assert_eq!(
        started["end_date"],
        (today + chrono::Days::new(14)).to_string()
    );
    assert!(started["started_at"].is_string());
}

#[sqlx::test]
async fn start_guards_are_enforced(pool: PgPool) {
    let ana = scrum(pool).await;
    let empty = ana.create_sprint("SANTI").await;
    let first = sprint_with_issues(&ana, &["a"]).await;
    let second = sprint_with_issues(&ana, &["b"]).await;

    let (_, empty_problem) = start(&ana, &empty, json!({})).await;
    let (backwards, _) = start(
        &ana,
        &first,
        json!({ "start_date": "2026-11-10", "end_date": "2026-11-01" }),
    )
    .await;
    start(&ana, &first, json!({})).await;
    let (_, again) = start(&ana, &first, json!({})).await;
    let (_, second_active) = start(&ana, &second, json!({})).await;
    let (unknown, _) = ana
        .post("/api/projects/SANTI/sprints/999999/start", json!({}))
        .await;

    assert_eq!(empty_problem["type"], "urn:santi:error:sprint-empty");
    assert_eq!(backwards, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(again["type"], "urn:santi:error:sprint-not-future");
    assert_eq!(
        second_active["type"],
        "urn:santi:error:sprint-already-active"
    );
    assert_eq!(unknown, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn an_overdue_sprint_stays_active_and_is_flagged(pool: PgPool) {
    let ana = scrum(pool).await;
    let sprint = sprint_with_issues(&ana, &["x"]).await;

    let (_, started) = start(
        &ana,
        &sprint,
        json!({ "start_date": "2026-01-01", "end_date": "2026-01-15" }),
    )
    .await;

    assert_eq!(started["state"], "active");
    assert_eq!(started["overdue"], true);
}

#[sqlx::test]
async fn completing_sends_open_issues_to_the_backlog(pool: PgPool) {
    let ana = scrum(pool).await;
    let sprint = sprint_with_issues(&ana, &["done", "open"]).await;
    let done = ana.status_id("SANTI", "Done").await;
    move_issue(&ana, 1, json!({ "status_id": done })).await;
    start(&ana, &sprint, json!({})).await;

    let (status, closed) = complete(&ana, &sprint, json!({ "to": "backlog" })).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(closed["state"], "closed");
    assert!(closed["closed_at"].is_string());
    assert_eq!(sprint_of(&ana, 1).await, sprint["id"]);
    assert_eq!(sprint_of(&ana, 2).await, Value::Null);
}

#[sqlx::test]
async fn completing_into_a_future_or_a_new_sprint(pool: PgPool) {
    let ana = scrum(pool).await;
    let first = sprint_with_issues(&ana, &["a"]).await;
    let next = ana.create_sprint("SANTI").await;
    start(&ana, &first, json!({})).await;

    complete(
        &ana,
        &first,
        json!({ "to": "sprint", "sprint_id": next["id"] }),
    )
    .await;
    start(&ana, &next, json!({})).await;
    let (_, closed) = complete(&ana, &next, json!({ "to": "new_sprint" })).await;
    let (_, sprints) = ana.get("/api/projects/SANTI/sprints").await;

    assert_eq!(closed["state"], "closed");
    let newest = sprints.as_array().unwrap().last().unwrap().clone();
    assert_eq!(newest["name"], "Sprint 3");
    assert_eq!(newest["state"], "future");
    assert_eq!(sprint_of(&ana, 1).await, newest["id"]);
}

#[sqlx::test]
async fn completion_guards(pool: PgPool) {
    let ana = scrum(pool).await;
    let active = sprint_with_issues(&ana, &["a"]).await;
    let future = ana.create_sprint("SANTI").await;
    start(&ana, &active, json!({})).await;

    let (itself, _) = complete(
        &ana,
        &active,
        json!({ "to": "sprint", "sprint_id": active["id"] }),
    )
    .await;
    let (unknown_target, _) = complete(
        &ana,
        &active,
        json!({ "to": "sprint", "sprint_id": 999999 }),
    )
    .await;
    let (_, not_active) = complete(&ana, &future, json!({ "to": "backlog" })).await;
    let (bad_body, _) = complete(&ana, &active, json!({ "to": "somewhere" })).await;

    assert_eq!(itself, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(unknown_target, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(not_active["type"], "urn:santi:error:sprint-not-active");
    assert_eq!(bad_body, StatusCode::BAD_REQUEST);
}

#[sqlx::test]
async fn subtasks_follow_their_parent_at_completion(pool: PgPool) {
    let ana = scrum(pool).await;
    let sprint = sprint_with_issues(&ana, &["open parent", "done parent"]).await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "done child", "issue_type": "subtask", "parent": "SANTI-1" }),
    )
    .await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "open child", "issue_type": "subtask", "parent": "SANTI-2" }),
    )
    .await;
    let done = ana.status_id("SANTI", "Done").await;
    move_issue(&ana, 2, json!({ "status_id": done })).await;
    move_issue(&ana, 3, json!({ "status_id": done })).await;
    start(&ana, &sprint, json!({})).await;

    complete(&ana, &sprint, json!({ "to": "backlog" })).await;

    assert_eq!(sprint_of(&ana, 1).await, Value::Null);
    assert_eq!(sprint_of(&ana, 3).await, Value::Null);
    assert_eq!(sprint_of(&ana, 2).await, sprint["id"]);
    assert_eq!(sprint_of(&ana, 4).await, sprint["id"]);
}

#[sqlx::test]
async fn scope_facts_are_recorded(pool: PgPool) {
    let ana = scrum(pool.clone()).await;
    let sprint = ana.create_sprint("SANTI").await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "planned", "points": 3, "sprint_id": sprint["id"] }),
    )
    .await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "dropped", "sprint_id": sprint["id"] }),
    )
    .await;
    start(&ana, &sprint, json!({})).await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "added", "sprint_id": sprint["id"] }),
    )
    .await;
    move_issue(&ana, 2, json!({ "sprint_id": null })).await;
    let done = ana.status_id("SANTI", "Done").await;
    move_issue(&ana, 1, json!({ "status_id": done })).await;

    complete(&ana, &sprint, json!({ "to": "backlog" })).await;

    let facts: Vec<Fact> = sqlx::query_as(
        "SELECT i.number, si.added_after_start, si.points_at_start, si.outcome, si.points_at_close
         FROM sprint_issue si JOIN issue i ON i.id = si.issue_id ORDER BY i.number",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(
        facts,
        [
            (
                1,
                false,
                Some(3.0),
                Some("completed".to_string()),
                Some(3.0)
            ),
            (2, false, None, Some("removed".to_string()), None),
            (3, true, None, Some("not_completed".to_string()), None),
        ]
    );
}

#[sqlx::test]
async fn closed_and_active_sprints_are_protected(pool: PgPool) {
    let ana = scrum(pool).await;
    let sprint = sprint_with_issues(&ana, &["a"]).await;
    ana.create_issue("SANTI", json!({ "summary": "late" }))
        .await;
    let url = format!("/api/projects/SANTI/sprints/{}", sprint["id"]);
    let (_, started) = start(&ana, &sprint, json!({})).await;

    let (_, active_delete) = ana.delete(&url).await;
    complete(&ana, &sprint, json!({ "to": "backlog" })).await;
    let (closed_dates, _) = ana
        .put(
            &url,
            json!({ "name": "x", "start_date": "2026-01-01", "end_date": "2026-01-02" }),
        )
        .await;
    let (_, renamed) = ana.put(&url, json!({ "name": "Renamed", "start_date": started["start_date"], "end_date": started["end_date"] })).await;
    let (into_closed, problem) = ana
        .post(
            "/api/projects/SANTI/issues/2/move",
            json!({ "sprint_id": sprint["id"] }),
        )
        .await;

    assert_eq!(active_delete["type"], "urn:santi:error:sprint-not-future");
    assert_eq!(closed_dates, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(renamed["name"], "Renamed");
    assert_eq!(into_closed, StatusCode::CONFLICT);
    assert_eq!(problem["type"], "urn:santi:error:sprint-closed");
}

#[sqlx::test]
async fn openapi_lists_lifecycle_routes(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let (_, api) = app.get("/openapi.json").await;

    assert!(api["paths"]["/api/projects/{key}/sprints/{id}/start"]["post"].is_object());
    assert!(api["paths"]["/api/projects/{key}/sprints/{id}/complete"]["post"].is_object());
}
