mod common;

use axum::http::StatusCode;
use common::TestApp;
use serde_json::{Value, json};
use sqlx::PgPool;

async fn people(app: &TestApp) -> Value {
    let (status, progress) = app.get("/api/projects/SANTI/people").await;
    assert_eq!(status, StatusCode::OK, "{progress}");
    progress
}

fn tally(issues: i64, points: f64) -> Value {
    json!({ "issues": issues, "points": points })
}

#[sqlx::test]
async fn scrum_counts_the_active_sprint_per_person(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    let bob = ana.another_user("bob@example.com").await;
    ana.add_member("SANTI", &bob, "member").await;
    let todo = ana.status_id("SANTI", "To Do").await;
    let doing = ana.status_id("SANTI", "In Progress").await;
    let done = ana.status_id("SANTI", "Done").await;
    let sprint = ana.create_sprint("SANTI").await;
    for (assignee, status, points) in [
        (Some(ana.user_id), todo, Some(3.0)),
        (Some(ana.user_id), doing, Some(2.0)),
        (Some(ana.user_id), done, Some(5.0)),
        (Some(bob.user_id), doing, Some(1.0)),
        (Some(bob.user_id), doing, None),
        (None, todo, Some(8.0)),
    ] {
        ana.create_issue(
            "SANTI",
            json!({ "summary": "work", "assignee_id": assignee, "status_id": status,
                    "points": points, "sprint_id": sprint["id"] }),
        )
        .await;
    }
    ana.create_issue(
        "SANTI",
        json!({ "summary": "backlog", "assignee_id": bob.user_id, "status_id": doing }),
    )
    .await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "sub", "issue_type": "subtask", "parent": "SANTI-1",
                "assignee_id": bob.user_id, "status_id": doing }),
    )
    .await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "Epic", "issue_type": "epic", "assignee_id": bob.user_id,
                "status_id": doing }),
    )
    .await;
    sqlx::query("UPDATE issue SET sprint_id = $1 WHERE issue_type = 'epic'")
        .bind(sprint["id"].as_i64())
        .execute(&pool)
        .await
        .unwrap();
    let (_, blocked) = ana
        .post(
            "/api/projects/SANTI/statuses",
            json!({ "name": "Blocked", "category": "in_progress" }),
        )
        .await;
    let blocked_url = format!("/api/projects/SANTI/statuses/{}", blocked["id"]);
    let doing_column = ana.column_id("SANTI", "In Progress").await;
    ana.put(
        &blocked_url,
        json!({ "name": "Blocked", "column_id": doing_column }),
    )
    .await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "off the board", "assignee_id": bob.user_id,
                "status_id": blocked["id"], "sprint_id": sprint["id"] }),
    )
    .await;
    ana.put(&blocked_url, json!({ "name": "Blocked" })).await;
    let (status, started) = ana
        .post(
            &format!("/api/projects/SANTI/sprints/{}/start", sprint["id"]),
            json!({}),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{started}");
    sqlx::query("UPDATE issue SET updated_at = now() - interval '4 days' WHERE number = 2")
        .execute(&pool)
        .await
        .unwrap();

    let progress = people(&bob).await;

    assert_eq!(progress["sprint"]["id"], sprint["id"]);
    let rows = progress["people"].as_array().unwrap();
    assert_eq!(rows.len(), 3);
    assert_eq!(rows[0]["user_id"], ana.user_id);
    assert_eq!(rows[0]["name"], "ana@example.com");
    assert_eq!(rows[0]["to_do"], tally(1, 3.0));
    assert_eq!(rows[0]["in_progress"], tally(1, 2.0));
    assert_eq!(rows[0]["done"], tally(1, 5.0));
    assert_eq!(rows[0]["stuck"], 1);
    assert_eq!(rows[1]["user_id"], bob.user_id);
    assert_eq!(rows[1]["in_progress"], tally(3, 1.0));
    assert_eq!(rows[1]["to_do"], tally(0, 0.0));
    assert_eq!(rows[1]["stuck"], 0);
    assert_eq!(rows[2]["user_id"], Value::Null);
    assert_eq!(rows[2]["name"], Value::Null);
    assert_eq!(rows[2]["to_do"], tally(1, 8.0));
}

#[sqlx::test]
async fn scrum_without_an_active_sprint_has_nobody(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    let sprint = ana.create_sprint("SANTI").await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "planned", "assignee_id": ana.user_id, "sprint_id": sprint["id"] }),
    )
    .await;

    assert_eq!(people(&ana).await, json!({ "sprint": null, "people": [] }));
}

#[sqlx::test]
async fn kanban_counts_the_board_inside_the_done_window(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    ana.create_project("SANTI", "kanban").await;
    let done = ana.status_id("SANTI", "Done").await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "old", "assignee_id": ana.user_id, "status_id": done }),
    )
    .await;
    sqlx::query("UPDATE issue SET done_at = now() - interval '20 days'")
        .execute(&pool)
        .await
        .unwrap();
    ana.create_issue(
        "SANTI",
        json!({ "summary": "recent", "assignee_id": ana.user_id, "status_id": done }),
    )
    .await;
    ana.create_issue("SANTI", json!({ "summary": "Epic", "issue_type": "epic" }))
        .await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "new", "assignee_id": ana.user_id, "points": 2 }),
    )
    .await;

    let progress = people(&ana).await;

    assert_eq!(progress["sprint"], Value::Null);
    let rows = progress["people"].as_array().unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0]["done"], tally(1, 0.0));
    assert_eq!(rows[0]["to_do"], tally(1, 2.0));
}

#[sqlx::test]
async fn strangers_cannot_read_team_progress(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    let bob = ana.another_user("bob@example.com").await;

    let (status, _) = bob.get("/api/projects/SANTI/people").await;

    assert_eq!(status, StatusCode::NOT_FOUND);
}
