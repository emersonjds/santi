mod common;

use axum::http::StatusCode;
use common::TestApp;
use serde_json::{Value, json};
use sqlx::PgPool;

const BACKFILL: &str = include_str!("../migrations/0019_imported_sprint_facts.sql");

async fn scrum(pool: PgPool) -> TestApp {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    ana
}

async fn issue_in(app: &TestApp, sprint: &Value, summary: &str, points: Option<f64>) {
    app.create_issue(
        "SANTI",
        json!({ "summary": summary, "points": points, "sprint_id": sprint["id"] }),
    )
    .await;
}

async fn start(app: &TestApp, sprint: &Value) {
    let (status, started) = app
        .post(
            &format!("/api/projects/SANTI/sprints/{}/start", sprint["id"]),
            json!({}),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{started}");
}

async fn complete(app: &TestApp, sprint: &Value) {
    let (status, closed) = app
        .post(
            &format!("/api/projects/SANTI/sprints/{}/complete", sprint["id"]),
            json!({ "open_issues": { "to": "backlog" } }),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{closed}");
}

async fn move_issue(app: &TestApp, number: i64, body: Value) {
    let (status, moved) = app
        .post(&format!("/api/projects/SANTI/issues/{number}/move"), body)
        .await;
    assert_eq!(status, StatusCode::OK, "{moved}");
}

async fn mark_done(app: &TestApp, number: i64) {
    let done = app.status_id("SANTI", "Done").await;
    move_issue(app, number, json!({ "status_id": done })).await;
}

async fn estimate(app: &TestApp, number: i64, points: f64) {
    let (status, issue) = app
        .patch(
            &format!("/api/projects/SANTI/issues/{number}"),
            json!({ "points": points }),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{issue}");
}

/// A sprint holding one issue of `points`, started; closed with the issue done when `done`.
async fn ran_sprint(app: &TestApp, points: f64, done: Option<bool>) -> Value {
    let sprint = app.create_sprint("SANTI").await;
    let issue = app
        .create_issue(
            "SANTI",
            json!({ "summary": "work", "points": points, "sprint_id": sprint["id"] }),
        )
        .await;
    start(app, &sprint).await;
    if let Some(done) = done {
        if done {
            mark_done(app, issue["number"].as_i64().unwrap()).await;
        }
        complete(app, &sprint).await;
    }
    sprint
}

async fn report(app: &TestApp, sprint: &Value) -> Value {
    let (status, report) = app
        .get(&format!(
            "/api/projects/SANTI/sprints/{}/report",
            sprint["id"]
        ))
        .await;
    assert_eq!(status, StatusCode::OK, "{report}");
    report
}

fn keys(group: &Value) -> Vec<&str> {
    group["issues"]
        .as_array()
        .unwrap()
        .iter()
        .map(|issue| issue["key"].as_str().unwrap())
        .collect()
}

#[sqlx::test]
async fn closed_sprint_report_groups_completed_not_completed_removed(pool: PgPool) {
    let ana = scrum(pool).await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "Checkout", "issue_type": "epic" }),
    )
    .await;
    let sprint = ana.create_sprint("SANTI").await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "done", "points": 3, "parent": "SANTI-1", "sprint_id": sprint["id"] }),
    )
    .await;
    issue_in(&ana, &sprint, "open", Some(2.0)).await;
    issue_in(&ana, &sprint, "dropped", Some(1.0)).await;
    start(&ana, &sprint).await;
    issue_in(&ana, &sprint, "added", Some(5.0)).await;
    estimate(&ana, 2, 8.0).await;
    move_issue(&ana, 4, json!({ "sprint_id": null })).await;
    mark_done(&ana, 2).await;
    mark_done(&ana, 5).await;
    complete(&ana, &sprint).await;

    let report = report(&ana, &sprint).await;

    assert_eq!(report["sprint"]["state"], "closed");
    assert_eq!(report["committed"], 6.0);
    assert_eq!(report["completed"], 13.0);
    let [completed, not_completed, removed] = report["groups"].as_array().unwrap().as_slice()
    else {
        panic!("three groups: {report}");
    };
    assert_eq!(completed["outcome"], "completed");
    assert_eq!(keys(completed), ["SANTI-2", "SANTI-5"]);
    assert_eq!(completed["points_at_start"], 8.0);
    assert_eq!(completed["points_at_end"], 13.0);
    let done = &completed["issues"][0];
    assert_eq!(done["points_at_start"], 3.0);
    assert_eq!(done["points_at_end"], 8.0);
    assert_eq!(done["added_after_start"], false);
    assert_eq!(done["epic_key"], "SANTI-1");
    assert_eq!(done["epic_summary"], "Checkout");
    assert_eq!(done["status_name"], "Done");
    assert_eq!(done["status_category"], "done");
    assert_eq!(done["issue_type"], "story");
    assert_eq!(completed["issues"][1]["added_after_start"], true);
    assert_eq!(not_completed["outcome"], "not_completed");
    assert_eq!(keys(not_completed), ["SANTI-3"]);
    assert_eq!(not_completed["points_at_end"], 2.0);
    assert_eq!(removed["outcome"], "removed");
    assert_eq!(keys(removed), ["SANTI-4"]);
    assert_eq!(removed["issues"][0]["points_at_start"], 1.0);
    assert_eq!(removed["issues"][0]["points_at_end"], Value::Null);
    assert_eq!(removed["points_at_end"], Value::Null);
    assert_eq!(completed["deleted"], Value::Null);
}

#[sqlx::test]
async fn active_sprint_report_reads_live(pool: PgPool) {
    let ana = scrum(pool).await;
    let sprint = ana.create_sprint("SANTI").await;
    issue_in(&ana, &sprint, "a", Some(2.0)).await;
    issue_in(&ana, &sprint, "b", Some(3.0)).await;
    start(&ana, &sprint).await;
    mark_done(&ana, 1).await;
    estimate(&ana, 1, 4.0).await;

    let report = report(&ana, &sprint).await;

    assert_eq!(report["sprint"]["state"], "active");
    assert_eq!(report["committed"], 5.0);
    assert_eq!(report["completed"], 4.0);
    assert_eq!(keys(&report["groups"][0]), ["SANTI-1"]);
    assert_eq!(report["groups"][0]["issues"][0]["points_at_end"], 4.0);
    assert_eq!(keys(&report["groups"][1]), ["SANTI-2"]);
    assert_eq!(report["groups"][1]["points_at_end"], 3.0);
}

#[sqlx::test]
async fn deleted_issue_shows_in_its_group_as_deleted_points(pool: PgPool) {
    let ana = scrum(pool).await;
    let sprint = ana.create_sprint("SANTI").await;
    issue_in(&ana, &sprint, "kept", Some(1.0)).await;
    issue_in(&ana, &sprint, "deleted", Some(3.0)).await;
    start(&ana, &sprint).await;
    mark_done(&ana, 1).await;
    mark_done(&ana, 2).await;
    complete(&ana, &sprint).await;
    let (status, _) = ana.delete("/api/projects/SANTI/issues/2").await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    let report = report(&ana, &sprint).await;

    let completed = &report["groups"][0];
    assert_eq!(keys(completed), ["SANTI-1"]);
    assert_eq!(
        completed["deleted"],
        json!({ "points_at_start": 3.0, "points_at_end": 3.0 })
    );
    assert_eq!(completed["points_at_end"], 4.0);
    assert_eq!(report["completed"], 4.0);
}

#[sqlx::test]
async fn subtasks_are_not_rows(pool: PgPool) {
    let ana = scrum(pool).await;
    let sprint = ana.create_sprint("SANTI").await;
    issue_in(&ana, &sprint, "story", Some(2.0)).await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "child", "issue_type": "subtask", "parent": "SANTI-1" }),
    )
    .await;
    start(&ana, &sprint).await;

    let report = report(&ana, &sprint).await;

    assert_eq!(keys(&report["groups"][1]), ["SANTI-1"]);
}

#[sqlx::test]
async fn history_lists_active_first_then_closed_newest_first_with_cursor(pool: PgPool) {
    let ana = scrum(pool).await;
    let oldest = ran_sprint(&ana, 2.0, Some(true)).await;
    let newer = ran_sprint(&ana, 4.0, Some(false)).await;
    let active = ran_sprint(&ana, 1.0, None).await;
    ana.create_sprint("SANTI").await;

    let (status, first) = ana.get("/api/projects/SANTI/reports/sprints?limit=2").await;
    let (_, second) = ana
        .get(&format!(
            "/api/projects/SANTI/reports/sprints?limit=2&cursor={}",
            first["next_cursor"]
        ))
        .await;

    assert_eq!(status, StatusCode::OK, "{first}");
    let ids = |page: &Value| -> Vec<Value> {
        page["items"]
            .as_array()
            .unwrap()
            .iter()
            .map(|row| row["sprint"]["id"].clone())
            .collect()
    };
    assert_eq!(ids(&first), [active["id"].clone(), newer["id"].clone()]);
    assert_eq!(first["next_cursor"], newer["id"]);
    assert_eq!(first["items"][0]["completed"], Value::Null);
    assert_eq!(first["items"][1]["committed"], 4.0);
    assert_eq!(first["items"][1]["completed"], Value::Null);
    assert_eq!(ids(&second), [oldest["id"].clone()]);
    assert_eq!(second["items"][0]["completed"], 2.0);
    assert_eq!(second["next_cursor"], Value::Null);
}

#[sqlx::test]
async fn velocity_returns_closed_only_with_average(pool: PgPool) {
    let ana = scrum(pool).await;
    let first = ran_sprint(&ana, 2.0, Some(true)).await;
    let second = ran_sprint(&ana, 4.0, Some(false)).await;
    ran_sprint(&ana, 1.0, None).await;

    let (status, velocity) = ana.get("/api/projects/SANTI/reports/velocity").await;

    assert_eq!(status, StatusCode::OK, "{velocity}");
    let sprints = velocity["sprints"].as_array().unwrap();
    assert_eq!(sprints.len(), 2);
    assert_eq!(sprints[0]["sprint"]["id"], first["id"]);
    assert_eq!(sprints[1]["sprint"]["id"], second["id"]);
    assert_eq!(velocity["average_completed"], 1.0);
}

#[sqlx::test]
async fn future_sprint_report_is_409(pool: PgPool) {
    let ana = scrum(pool).await;
    let sprint = ana.create_sprint("SANTI").await;

    let (status, problem) = ana
        .get(&format!(
            "/api/projects/SANTI/sprints/{}/report",
            sprint["id"]
        ))
        .await;

    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(problem["type"], "urn:santi:error:sprint-not-started");
}

#[sqlx::test]
async fn unknown_sprint_and_stranger_get_404(pool: PgPool) {
    let ana = scrum(pool).await;
    let sprint = ran_sprint(&ana, 1.0, Some(true)).await;
    let stranger = ana.another_user("eve@example.com").await;
    let url = format!("/api/projects/SANTI/sprints/{}/report", sprint["id"]);

    let (unknown, _) = ana.get("/api/projects/SANTI/sprints/999999/report").await;
    let (strange_report, _) = stranger.get(&url).await;
    let (strange_history, _) = stranger.get("/api/projects/SANTI/reports/sprints").await;

    assert_eq!(unknown, StatusCode::NOT_FOUND);
    assert_eq!(strange_report, StatusCode::NOT_FOUND);
    assert_eq!(strange_history, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn kanban_gets_409(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("FLOW", "kanban").await;

    for url in [
        "/api/projects/FLOW/reports/sprints",
        "/api/projects/FLOW/reports/velocity",
        "/api/projects/FLOW/sprints/1/report",
    ] {
        let (status, problem) = ana.get(url).await;
        assert_eq!(status, StatusCode::CONFLICT, "{url}");
        assert_eq!(problem["type"], "urn:santi:error:kanban-has-no-sprints");
    }
}

#[sqlx::test]
async fn backfill_writes_facts_only_for_imported_closed_sprints(pool: PgPool) {
    let ana = scrum(pool.clone()).await;
    let native = ran_sprint(&ana, 2.0, Some(true)).await;
    ana.create_issue("SANTI", json!({ "summary": "imported", "points": 5 }))
        .await;
    let imported: i64 = sqlx::query_scalar(
        "INSERT INTO sprint (board_id, name, state, start_date, end_date, started_at, closed_at)
         SELECT b.id, 'Old', 'closed', '2026-01-01', '2026-01-14', '2026-01-01', '2026-01-14'
         FROM board b JOIN project p ON p.id = b.project_id WHERE p.key = 'SANTI'
         RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    sqlx::query("UPDATE issue SET sprint_id = $1 WHERE number = 2")
        .bind(imported)
        .execute(&pool)
        .await
        .unwrap();
    ana.create_issue(
        "SANTI",
        json!({ "summary": "late", "issue_type": "subtask", "parent": "SANTI-1" }),
    )
    .await;
    sqlx::query("UPDATE issue SET sprint_id = $1 WHERE number = 3")
        .bind(native["id"].as_i64().unwrap())
        .execute(&pool)
        .await
        .unwrap();
    let facts = |sprint_id: i64| {
        sqlx::query_as::<_, (String, Option<f64>, Option<f64>, bool)>(
            "SELECT outcome, points_at_start, points_at_close, added_after_start
             FROM sprint_issue WHERE sprint_id = $1",
        )
        .bind(sprint_id)
        .fetch_all(&pool)
    };
    let native_before = facts(native["id"].as_i64().unwrap()).await.unwrap();

    sqlx::raw_sql(BACKFILL).execute(&pool).await.unwrap();
    sqlx::raw_sql(BACKFILL).execute(&pool).await.unwrap();

    assert_eq!(
        facts(imported).await.unwrap(),
        [("completed".to_string(), Some(5.0), Some(5.0), false)]
    );
    assert_eq!(
        facts(native["id"].as_i64().unwrap()).await.unwrap(),
        native_before
    );
}

#[sqlx::test]
async fn history_limit_out_of_range_is_422(pool: PgPool) {
    let ana = scrum(pool).await;

    let (status, problem) = ana.get("/api/projects/SANTI/reports/sprints?limit=0").await;

    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
}

#[sqlx::test]
async fn reports_stay_inside_the_project(pool: PgPool) {
    let ana = scrum(pool).await;
    ran_sprint(&ana, 1.0, Some(true)).await;
    ana.create_project("OTHER", "scrum").await;
    let other = ana.create_sprint("OTHER").await;
    ana.create_issue(
        "OTHER",
        json!({ "summary": "theirs", "sprint_id": other["id"] }),
    )
    .await;
    let (started, _) = ana
        .post(
            &format!("/api/projects/OTHER/sprints/{}/start", other["id"]),
            json!({}),
        )
        .await;
    assert_eq!(started, StatusCode::OK);
    let stranger = ana.another_user("eve@example.com").await;

    let (crossed, _) = ana
        .get(&format!(
            "/api/projects/SANTI/sprints/{}/report",
            other["id"]
        ))
        .await;
    let (status, page) = ana
        .get(&format!(
            "/api/projects/SANTI/reports/sprints?cursor={}",
            other["id"]
        ))
        .await;
    let (strange_velocity, _) = stranger.get("/api/projects/SANTI/reports/velocity").await;

    assert_eq!(crossed, StatusCode::NOT_FOUND);
    assert_eq!(status, StatusCode::OK, "{page}");
    assert_eq!(page["items"], json!([]));
    assert_eq!(page["next_cursor"], Value::Null);
    assert_eq!(strange_velocity, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn archived_projects_keep_reports_and_trashed_ones_hide_them(pool: PgPool) {
    let ana = scrum(pool).await;
    let sprint = ran_sprint(&ana, 1.0, Some(true)).await;
    let urls = [
        "/api/projects/SANTI/reports/sprints".to_string(),
        "/api/projects/SANTI/reports/velocity".to_string(),
        format!("/api/projects/SANTI/sprints/{}/report", sprint["id"]),
    ];

    let (archived, _) = ana.post("/api/projects/SANTI/archive", json!(null)).await;
    assert_eq!(archived, StatusCode::NO_CONTENT);
    for url in &urls {
        let (status, body) = ana.get(url).await;
        assert_eq!(status, StatusCode::OK, "{url} {body}");
    }
    let (trashed, _) = ana.post("/api/projects/SANTI/trash", json!(null)).await;
    assert_eq!(trashed, StatusCode::NO_CONTENT);
    for url in &urls {
        let (status, _) = ana.get(url).await;
        assert_eq!(status, StatusCode::NOT_FOUND, "{url}");
    }
}

#[sqlx::test]
async fn unparsable_sprint_id_or_cursor_is_400(pool: PgPool) {
    let ana = scrum(pool).await;

    for url in [
        "/api/projects/SANTI/sprints/abc/report",
        "/api/projects/SANTI/reports/sprints?cursor=abc",
    ] {
        let (status, _) = ana.get(url).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{url}");
    }
}

#[sqlx::test]
async fn fractional_points_add_up_to_clean_totals(pool: PgPool) {
    let ana = scrum(pool).await;
    let sprint = ana.create_sprint("SANTI").await;
    issue_in(&ana, &sprint, "a", Some(0.1)).await;
    issue_in(&ana, &sprint, "b", Some(0.2)).await;
    start(&ana, &sprint).await;
    mark_done(&ana, 1).await;
    mark_done(&ana, 2).await;
    complete(&ana, &sprint).await;

    let report = report(&ana, &sprint).await;
    let (_, history) = ana.get("/api/projects/SANTI/reports/sprints").await;

    assert_eq!(report["committed"], 0.3);
    assert_eq!(report["completed"], 0.3);
    assert_eq!(history["items"][0]["committed"], 0.3);
    assert_eq!(history["items"][0]["completed"], 0.3);
}
