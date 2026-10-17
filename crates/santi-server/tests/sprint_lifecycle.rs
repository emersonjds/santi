mod common;

use axum::http::StatusCode;
use chrono::{DateTime, TimeDelta, Utc};
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

fn instant(value: &Value) -> DateTime<Utc> {
    value.as_str().unwrap().parse().unwrap()
}

#[sqlx::test]
async fn start_defaults_to_now_and_two_weeks(pool: PgPool) {
    let ana = scrum(pool).await;
    let sprint = sprint_with_issues(&ana, &["x"]).await;
    let before = Utc::now();

    let (status, started) = start(&ana, &sprint, json!({})).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(started["state"], "active");
    let starts_at = instant(&started["starts_at"]);
    assert!(before <= starts_at && starts_at <= Utc::now());
    assert_eq!(
        instant(&started["ends_at"]) - starts_at,
        TimeDelta::days(14)
    );
    assert!(started["started_at"].is_string());
}

#[sqlx::test]
async fn start_takes_offsets_and_answers_utc(pool: PgPool) {
    let ana = scrum(pool).await;
    let sprint = sprint_with_issues(&ana, &["x"]).await;

    let (status, started) = start(
        &ana,
        &sprint,
        json!({ "starts_at": "2026-10-16T09:00:00-03:00", "ends_at": "2026-10-16T22:00:00-03:00" }),
    )
    .await;

    assert_eq!(status, StatusCode::OK, "{started}");
    assert_eq!(started["starts_at"], "2026-10-16T12:00:00Z");
    assert_eq!(started["ends_at"], "2026-10-17T01:00:00Z");
}

#[sqlx::test]
async fn old_date_fields_are_refused(pool: PgPool) {
    let ana = scrum(pool).await;
    let sprint = sprint_with_issues(&ana, &["x"]).await;
    let url = format!("/api/projects/SANTI/sprints/{}", sprint["id"]);

    let (start_status, _) = start(&ana, &sprint, json!({ "start_date": "2026-10-16" })).await;
    let (edit_status, _) = ana
        .put(&url, json!({ "name": "x", "end_date": "2026-10-16" }))
        .await;

    assert_eq!(start_status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(edit_status, StatusCode::UNPROCESSABLE_ENTITY);
}

#[sqlx::test]
async fn overdue_flips_at_the_minute(pool: PgPool) {
    let ana = scrum(pool.clone()).await;
    let sprint = sprint_with_issues(&ana, &["x"]).await;
    let url = format!("/api/projects/SANTI/sprints/{}", sprint["id"]);
    let overdue = || async {
        let (_, sprints) = ana.get("/api/projects/SANTI/sprints").await;
        sprints[0]["overdue"].clone()
    };

    let (_, started) = start(
        &ana,
        &sprint,
        json!({ "starts_at": Utc::now() - TimeDelta::hours(1), "ends_at": Utc::now() + TimeDelta::hours(1) }),
    )
    .await;
    let ahead = overdue().await;
    sqlx::query("UPDATE sprint SET ends_at = now() - interval '1 second'")
        .execute(&pool)
        .await
        .unwrap();
    let passed = overdue().await;
    let (_, edited) = ana
        .put(
            &url,
            json!({ "name": "x", "starts_at": started["starts_at"], "ends_at": Utc::now() + TimeDelta::minutes(2) }),
        )
        .await;

    assert_eq!(started["overdue"], false);
    assert_eq!(ahead, false);
    assert_eq!(passed, true);
    assert_eq!(edited["overdue"], false, "{edited}");
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
        json!({ "starts_at": "2026-11-10T00:00:00Z", "ends_at": "2026-11-01T00:00:00Z" }),
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
        json!({ "starts_at": "2026-01-01T00:00:00Z", "ends_at": "2026-01-15T23:59:00Z" }),
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
    assert_eq!(bad_body, StatusCode::UNPROCESSABLE_ENTITY);
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
            json!({ "name": "x", "starts_at": "2026-01-01T00:00:00Z", "ends_at": "2026-01-02T00:00:00Z" }),
        )
        .await;
    let (_, renamed) = ana.put(&url, json!({ "name": "Renamed", "starts_at": started["starts_at"], "ends_at": started["ends_at"] })).await;
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

type SprintRow = (String, Option<DateTime<Utc>>, Option<DateTime<Utc>>);

/// Migrates up to 0019, adds a closed sprint of Oct 1–14 and a future one, sets the database zone, then runs 0020.
async fn sprint_rows_after_0020(pool: &PgPool, zone: Option<&str>) -> Vec<SprintRow> {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("migrations");
    let mut files: Vec<_> = std::fs::read_dir(&dir)
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .collect();
    files.sort();
    let run = |name: &std::path::Path| std::fs::read_to_string(name).unwrap();
    let (before, after): (Vec<_>, Vec<_>) = files
        .iter()
        .partition(|path| path.file_name().unwrap().to_str().unwrap() < "0020");
    for file in before {
        sqlx::raw_sql(sqlx::AssertSqlSafe(run(file)))
            .execute(pool)
            .await
            .unwrap();
    }
    sqlx::raw_sql(
        "INSERT INTO project (key, name) VALUES ('MIG', 'm');
         INSERT INTO board (project_id, board_type) SELECT id, 'scrum' FROM project;
         INSERT INTO sprint (board_id, name, state, start_date, end_date, started_at, closed_at)
         SELECT id, 'Old', 'closed', '2026-10-01', '2026-10-14', '2026-10-01', '2026-10-14' FROM board;
         INSERT INTO sprint (board_id, name) SELECT id, 'Later' FROM board;",
    )
    .execute(pool)
    .await
    .unwrap();
    if let Some(zone) = zone {
        let database: String = sqlx::query_scalar("SELECT current_database()")
            .fetch_one(pool)
            .await
            .unwrap();
        sqlx::raw_sql(sqlx::AssertSqlSafe(format!(
            r#"ALTER DATABASE "{database}" SET timezone TO '{zone}'"#
        )))
        .execute(pool)
        .await
        .unwrap();
    }

    sqlx::raw_sql(sqlx::AssertSqlSafe(run(after[0])))
        .execute(pool)
        .await
        .unwrap();

    sqlx::query_as("SELECT name, starts_at, ends_at FROM sprint ORDER BY id")
        .fetch_all(pool)
        .await
        .unwrap()
}

fn at(text: &str) -> Option<DateTime<Utc>> {
    Some(text.parse().unwrap())
}

#[sqlx::test(migrations = false)]
async fn migration_0020_anchors_days_in_the_database_time_zone(pool: PgPool) {
    let rows = sprint_rows_after_0020(&pool, Some("America/Sao_Paulo")).await;

    assert_eq!(
        rows,
        [
            (
                "Old".to_string(),
                at("2026-10-01T03:00:00Z"),
                at("2026-10-15T02:59:00Z")
            ),
            ("Later".to_string(), None, None),
        ]
    );
    let touching = sqlx::query("UPDATE sprint SET ends_at = starts_at WHERE name = 'Old'")
        .execute(&pool)
        .await;
    assert!(touching.is_err(), "the end must come after the start");
    let unknown = sqlx::query("UPDATE board SET sprint_length = '3w'")
        .execute(&pool)
        .await;
    assert!(unknown.is_err(), "3w is not a length");
    sqlx::query("UPDATE board SET sprint_length = '90'")
        .execute(&pool)
        .await
        .unwrap();
}

#[sqlx::test(migrations = false)]
async fn migration_0020_uses_utc_without_a_database_zone(pool: PgPool) {
    let rows = sprint_rows_after_0020(&pool, None).await;

    assert_eq!(
        rows[0],
        (
            "Old".to_string(),
            at("2026-10-01T00:00:00Z"),
            at("2026-10-14T23:59:00Z")
        )
    );
}
