mod common;

use axum::http::{Method, StatusCode};
use common::TestApp;
use serde_json::{Value, json};
use sqlx::PgPool;

async fn project(pool: PgPool) -> TestApp {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    ana
}

#[sqlx::test]
async fn new_issue_gets_defaults(pool: PgPool) {
    let ana = project(pool).await;
    let todo = ana.status_id("SANTI", "To Do").await;

    let issue = ana
        .create_issue("SANTI", json!({ "summary": "Fix login" }))
        .await;

    assert_eq!(issue["key"], "SANTI-1");
    assert_eq!(issue["issue_type"], "story");
    assert_eq!(issue["priority"], "medium");
    assert_eq!(issue["status_id"], todo);
    assert_eq!(issue["reporter_id"], ana.user_id);
    assert_eq!(issue["done_at"], Value::Null);
    assert_eq!(issue["sprint_id"], Value::Null);
}

#[sqlx::test]
async fn numbers_increase_and_new_issues_rank_last(pool: PgPool) {
    let ana = project(pool).await;

    let first = ana.create_issue("SANTI", json!({ "summary": "one" })).await;
    let second = ana.create_issue("SANTI", json!({ "summary": "two" })).await;

    assert_eq!(second["number"], 2);
    assert!(first["rank"].as_str().unwrap() < second["rank"].as_str().unwrap());
}

#[sqlx::test]
async fn concurrent_creates_get_distinct_numbers_and_ranks(pool: PgPool) {
    let ana = project(pool).await;
    let mut creates = tokio::task::JoinSet::new();
    for index in 0..10 {
        let app = ana.clone();
        creates.spawn(async move {
            app.create_issue("SANTI", json!({ "summary": format!("issue {index}") }))
                .await
        });
    }

    let issues = creates.join_all().await;

    let mut numbers: Vec<i64> = issues
        .iter()
        .map(|issue| issue["number"].as_i64().unwrap())
        .collect();
    let mut ranks: Vec<&str> = issues
        .iter()
        .map(|issue| issue["rank"].as_str().unwrap())
        .collect();
    numbers.sort_unstable();
    ranks.sort_unstable();
    ranks.dedup();
    assert_eq!(numbers, (1..=10).collect::<Vec<i64>>());
    assert_eq!(ranks.len(), 10);
}

#[sqlx::test]
async fn creating_in_a_done_status_stamps_done_at(pool: PgPool) {
    let ana = project(pool).await;
    let done = ana.status_id("SANTI", "Done").await;

    let issue = ana
        .create_issue(
            "SANTI",
            json!({ "summary": "Already shipped", "status_id": done }),
        )
        .await;

    assert!(issue["done_at"].is_string());
}

#[sqlx::test]
async fn status_must_be_mapped_and_belong_to_the_project(pool: PgPool) {
    let ana = project(pool).await;
    ana.create_project("OTHER", "scrum").await;
    let (_, parked) = ana
        .post(
            "/api/projects/SANTI/statuses",
            json!({ "name": "Parked", "category": "todo" }),
        )
        .await;
    let foreign = ana.status_id("OTHER", "To Do").await;

    let (unmapped, problem) = ana
        .post(
            "/api/projects/SANTI/issues",
            json!({ "summary": "x", "status_id": parked["id"] }),
        )
        .await;
    let (other, _) = ana
        .post(
            "/api/projects/SANTI/issues",
            json!({ "summary": "x", "status_id": foreign }),
        )
        .await;

    assert_eq!(unmapped, StatusCode::CONFLICT);
    assert_eq!(problem["type"], "urn:santi:error:status-unmapped");
    assert_eq!(other, StatusCode::UNPROCESSABLE_ENTITY);
}

#[sqlx::test]
async fn a_board_without_todo_status_cannot_take_default_issues(pool: PgPool) {
    let ana = project(pool).await;
    let todo = ana.status_id("SANTI", "To Do").await;
    ana.put(
        &format!("/api/projects/SANTI/statuses/{todo}"),
        json!({ "name": "To Do" }),
    )
    .await;

    let (status, problem) = ana
        .post("/api/projects/SANTI/issues", json!({ "summary": "x" }))
        .await;

    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(problem["type"], "urn:santi:error:no-todo-status");
}

#[sqlx::test]
async fn parent_rules_are_enforced(pool: PgPool) {
    let ana = project(pool).await;
    ana.create_issue("SANTI", json!({ "summary": "Epic", "issue_type": "epic" }))
        .await;
    ana.create_issue("SANTI", json!({ "summary": "Story", "parent": "SANTI-1" }))
        .await;

    let subtask = ana
        .create_issue(
            "SANTI",
            json!({ "summary": "Sub", "issue_type": "subtask", "parent": "SANTI-2" }),
        )
        .await;
    let (orphan, problem) = ana
        .post(
            "/api/projects/SANTI/issues",
            json!({ "summary": "Sub", "issue_type": "subtask" }),
        )
        .await;
    let (under_epic, _) = ana
        .post(
            "/api/projects/SANTI/issues",
            json!({ "summary": "Sub", "issue_type": "subtask", "parent": "SANTI-1" }),
        )
        .await;
    let (with_points, _) = ana
        .post(
            "/api/projects/SANTI/issues",
            json!({ "summary": "Sub", "issue_type": "subtask", "parent": "SANTI-2", "points": 2 }),
        )
        .await;
    let (missing, _) = ana
        .post(
            "/api/projects/SANTI/issues",
            json!({ "summary": "Story", "parent": "SANTI-99" }),
        )
        .await;

    assert_eq!(subtask["parent_key"], "SANTI-2");
    assert_eq!(orphan, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "parent");
    assert_eq!(under_epic, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(with_points, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(missing, StatusCode::UNPROCESSABLE_ENTITY);
}

#[sqlx::test]
async fn assignee_must_be_a_member(pool: PgPool) {
    let ana = project(pool).await;
    let bob = ana.another_user("bob@example.com").await;

    let (stranger, problem) = ana
        .post(
            "/api/projects/SANTI/issues",
            json!({ "summary": "x", "assignee_id": bob.user_id }),
        )
        .await;
    let mine = ana
        .create_issue(
            "SANTI",
            json!({ "summary": "x", "assignee_id": ana.user_id }),
        )
        .await;

    assert_eq!(stranger, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "assignee_id");
    assert_eq!(mine["assignee_id"], ana.user_id);
}

#[sqlx::test]
async fn labels_are_normalized(pool: PgPool) {
    let ana = project(pool).await;

    let issue = ana
        .create_issue(
            "SANTI",
            json!({ "summary": "x", "labels": [" ui ", "ui", "api"] }),
        )
        .await;

    assert_eq!(issue["labels"], json!(["ui", "api"]));
}

#[sqlx::test]
async fn unknown_issues_and_strangers_get_not_found(pool: PgPool) {
    let ana = project(pool).await;
    let bob = ana.another_user("bob@example.com").await;
    ana.create_issue("SANTI", json!({ "summary": "x" })).await;

    assert_eq!(
        ana.get("/api/projects/SANTI/issues/99").await.0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        bob.get("/api/projects/SANTI/issues/1").await.0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        ana.get("/api/projects/SANTI/issues/1").await.0,
        StatusCode::OK
    );
}

#[sqlx::test]
async fn patch_changes_only_sent_fields(pool: PgPool) {
    let ana = project(pool).await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "Old", "assignee_id": ana.user_id, "points": 3, "labels": ["ui"] }),
    )
    .await;

    let (status, issue) = ana
        .patch(
            "/api/projects/SANTI/issues/1",
            json!({ "summary": "New", "assignee_id": null, "issue_type": "bug" }),
        )
        .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(issue["summary"], "New");
    assert_eq!(issue["assignee_id"], Value::Null);
    assert_eq!(issue["issue_type"], "bug");
    assert_eq!(issue["points"], 3.0);
    assert_eq!(issue["labels"], json!(["ui"]));
}

#[sqlx::test]
async fn patch_enforces_type_parent_and_points_rules(pool: PgPool) {
    let ana = project(pool).await;
    ana.create_issue("SANTI", json!({ "summary": "Epic", "issue_type": "epic" }))
        .await;
    ana.create_issue("SANTI", json!({ "summary": "Story" }))
        .await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "Sub", "issue_type": "subtask", "parent": "SANTI-2" }),
    )
    .await;

    let (_, linked) = ana
        .patch(
            "/api/projects/SANTI/issues/2",
            json!({ "parent": "SANTI-1" }),
        )
        .await;
    let (_, unlinked) = ana
        .patch("/api/projects/SANTI/issues/2", json!({ "parent": null }))
        .await;
    let (epic_to_story, _) = ana
        .patch(
            "/api/projects/SANTI/issues/1",
            json!({ "issue_type": "story" }),
        )
        .await;
    let (move_subtask, _) = ana
        .patch(
            "/api/projects/SANTI/issues/3",
            json!({ "parent": "SANTI-1" }),
        )
        .await;
    let (subtask_points, _) = ana
        .patch("/api/projects/SANTI/issues/3", json!({ "points": 1 }))
        .await;
    let (empty_summary, _) = ana
        .patch("/api/projects/SANTI/issues/2", json!({ "summary": " " }))
        .await;
    let (unknown_assignee, _) = ana
        .patch(
            "/api/projects/SANTI/issues/2",
            json!({ "assignee_id": 999999 }),
        )
        .await;
    let (missing, _) = ana
        .patch("/api/projects/SANTI/issues/99", json!({ "summary": "x" }))
        .await;

    assert_eq!(linked["parent_key"], "SANTI-1");
    assert_eq!(unlinked["parent_key"], Value::Null);
    assert_eq!(epic_to_story, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(move_subtask, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(subtask_points, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(empty_summary, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(unknown_assignee, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(missing, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn a_status_held_by_an_issue_cannot_be_deleted(pool: PgPool) {
    let ana = project(pool).await;
    let todo = ana.status_id("SANTI", "To Do").await;
    ana.create_issue("SANTI", json!({ "summary": "x" })).await;

    let (status, problem) = ana
        .delete(&format!("/api/projects/SANTI/statuses/{todo}"))
        .await;

    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(problem["type"], "urn:santi:error:in-use");
}

#[sqlx::test]
async fn openapi_lists_issue_routes(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let (_, api) = app.get("/openapi.json").await;

    assert!(api["paths"]["/api/projects/{key}/issues"]["post"].is_object());
    assert!(api["paths"]["/api/projects/{key}/issues/{number}"]["patch"].is_object());
}

/// PostgreSQL text cannot hold U+0000; every text field refuses it as invalid input.
#[sqlx::test]
async fn nul_characters_are_invalid_input(pool: PgPool) {
    let ana = project(pool).await;
    ana.create_issue("SANTI", json!({ "summary": "Fix login" }))
        .await;
    let field = |problem: &Value| problem["errors"][0]["field"].clone();

    let (summary, summary_problem) = ana
        .post(
            "/api/projects/SANTI/issues",
            json!({ "summary": "a\u{0}b" }),
        )
        .await;
    let (description, description_problem) = ana
        .post(
            "/api/projects/SANTI/issues",
            json!({ "summary": "ok", "description": "a\u{0}b" }),
        )
        .await;
    let (edit, _) = ana
        .patch(
            "/api/projects/SANTI/issues/1",
            json!({ "description": "a\u{0}b" }),
        )
        .await;
    let (comment, comment_problem) = ana
        .post(
            "/api/projects/SANTI/issues/1/comments",
            json!({ "body": "a\u{0}b" }),
        )
        .await;
    let (project, project_problem) = ana
        .post(
            "/api/projects",
            json!({ "key": "NUL", "name": "a\u{0}b", "board_type": "scrum" }),
        )
        .await;
    let (search, search_problem) = ana.get("/api/projects/SANTI/issues?q=a%00b").await;
    let (label, _) = ana.get("/api/projects/SANTI/issues?label=a%00b").await;
    let register = json!({ "email": "nul@example.com", "password": common::PASSWORD, "display_name": "a\u{0}b" });
    let response = ana
        .send(common::json_request(
            Method::POST,
            "/api/auth/register",
            None,
            Some(register),
        ))
        .await;
    let register = response.status();
    let register_problem = common::body_json(response).await;

    assert_eq!(summary, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(field(&summary_problem), "summary");
    assert_eq!(description, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(field(&description_problem), "description");
    assert_eq!(edit, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(comment, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(field(&comment_problem), "body");
    assert_eq!(project, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(field(&project_problem), "name");
    assert_eq!(search, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(field(&search_problem), "q");
    assert_eq!(label, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(register, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(field(&register_problem), "display_name");
}

#[sqlx::test]
async fn descriptions_are_capped(pool: PgPool) {
    let ana = project(pool.clone()).await;
    let long = "x".repeat(65_537);

    let (status, problem) = ana
        .post(
            "/api/projects/SANTI/issues",
            json!({ "summary": "Long", "description": long }),
        )
        .await;
    ana.create_issue("SANTI", json!({ "summary": "Short" }))
        .await;
    let stored = sqlx::query("UPDATE issue SET description = repeat('x', 65537)")
        .execute(&pool)
        .await;

    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "description");
    assert!(stored.is_err(), "the database refuses it too");
}

#[sqlx::test]
async fn issue_answers_name_status_people_and_sprint(pool: PgPool) {
    let ana = project(pool).await;
    let sprint = ana.create_sprint("SANTI").await;
    let in_progress = ana.status_id("SANTI", "In Progress").await;

    let created = ana
        .create_issue(
            "SANTI",
            json!({ "summary": "Named", "assignee_id": ana.user_id, "sprint_id": sprint["id"] }),
        )
        .await;
    let (_, fetched) = ana.get("/api/projects/SANTI/issues/1").await;
    let (_, edited) = ana
        .patch(
            "/api/projects/SANTI/issues/1",
            json!({ "assignee_id": null, "sprint_id": null }),
        )
        .await;
    let (_, moved) = ana
        .post(
            "/api/projects/SANTI/issues/1/move",
            json!({ "status_id": in_progress }),
        )
        .await;
    let (_, found) = ana.get("/api/projects/SANTI/issues?q=named").await;

    for issue in [&created, &fetched] {
        assert_eq!(issue["status_name"], "To Do");
        assert_eq!(issue["assignee_name"], "ana@example.com");
        assert_eq!(issue["reporter_name"], "ana@example.com");
        assert_eq!(issue["sprint_name"], sprint["name"]);
    }
    assert_eq!(edited["assignee_name"], Value::Null);
    assert_eq!(edited["sprint_name"], Value::Null);
    assert_eq!(moved["status_name"], "In Progress");
    assert_eq!(found["items"][0]["status_name"], "In Progress");
    assert_eq!(found["items"][0]["reporter_name"], "ana@example.com");
}

#[sqlx::test]
async fn unknown_body_fields_are_refused_by_name(pool: PgPool) {
    let ana = project(pool).await;
    ana.create_issue("SANTI", json!({ "summary": "x" })).await;

    let (edit, problem) = ana
        .patch(
            "/api/projects/SANTI/issues/1",
            json!({ "parent_key": "SANTI-2" }),
        )
        .await;
    let (create, _) = ana
        .post(
            "/api/projects/SANTI/issues",
            json!({ "summary": "y", "status": "todo" }),
        )
        .await;
    let (comment, _) = ana
        .post(
            "/api/projects/SANTI/issues/1/comments",
            json!({ "body": "hi", "author_id": 1 }),
        )
        .await;

    assert_eq!(edit, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["type"], "urn:santi:error:validation");
    assert!(
        problem.to_string().contains("unknown field `parent_key`"),
        "{problem}"
    );
    assert_eq!(create, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(comment, StatusCode::UNPROCESSABLE_ENTITY);
}

#[sqlx::test]
async fn wrong_shape_bodies_say_why_in_the_detail(pool: PgPool) {
    let ana = project(pool).await;
    ana.create_issue("SANTI", json!({ "summary": "x" })).await;

    let (_, unknown) = ana
        .patch(
            "/api/projects/SANTI/issues/1",
            json!({ "parent_key": "SANTI-2" }),
        )
        .await;
    let (_, missing) = ana
        .post("/api/projects/SANTI/issues", json!({ "priority": "low" }))
        .await;
    let (not_object, scalar) = ana.post("/api/projects/SANTI/issues", json!(3)).await;

    let detail = |problem: &Value| problem["detail"].as_str().unwrap().to_string();
    assert!(
        detail(&unknown).contains("unknown field `parent_key`"),
        "{unknown}"
    );
    assert_eq!(unknown["errors"][0]["field"], "parent_key");
    assert!(
        detail(&missing).contains("missing field `summary`"),
        "{missing}"
    );
    assert_eq!(missing["errors"][0]["field"], "summary");
    assert_eq!(not_object, StatusCode::UNPROCESSABLE_ENTITY);
    assert!(
        detail(&scalar).contains("expected a JSON object"),
        "{scalar}"
    );
    assert!(!scalar.to_string().contains("CreateIssue"), "{scalar}");
    assert_eq!(scalar["errors"][0]["field"], "body");
}
