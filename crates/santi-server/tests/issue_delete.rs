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

async fn subtask_of(app: &TestApp, parent: &str) -> Value {
    app.create_issue(
        "SANTI",
        json!({ "summary": "sub", "issue_type": "subtask", "parent": parent }),
    )
    .await
}

async fn delete(app: &TestApp, number: i64) -> StatusCode {
    app.delete(&format!("/api/projects/SANTI/issues/{number}"))
        .await
        .0
}

async fn exists(app: &TestApp, number: i64) -> bool {
    let (status, _) = app
        .get(&format!("/api/projects/SANTI/issues/{number}"))
        .await;
    status == StatusCode::OK
}

async fn comment_count(pool: &PgPool) -> i64 {
    sqlx::query_scalar("SELECT count(*) FROM issue_comment")
        .fetch_one(pool)
        .await
        .unwrap()
}

#[sqlx::test]
async fn deleting_an_issue_takes_its_subtasks_and_comments_and_never_reuses_its_number(
    pool: PgPool,
) {
    let ana = scrum(pool.clone()).await;
    ana.create_issue("SANTI", json!({ "summary": "story" }))
        .await;
    subtask_of(&ana, "SANTI-1").await;
    subtask_of(&ana, "SANTI-1").await;
    ana.post(
        "/api/projects/SANTI/issues/1/comments",
        json!({ "body": "dup" }),
    )
    .await;
    ana.post(
        "/api/projects/SANTI/issues/2/comments",
        json!({ "body": "on the subtask" }),
    )
    .await;

    sqlx::query("UPDATE issue SET updated_at = '2000-01-01T00:00:00Z'")
        .execute(&pool)
        .await
        .unwrap();

    let subtask_alone = delete(&ana, 3).await;
    let (parent_kept, parent) = ana.get("/api/projects/SANTI/issues/1").await;
    let story = delete(&ana, 1).await;
    let next = ana
        .create_issue("SANTI", json!({ "summary": "next" }))
        .await;

    assert_eq!(subtask_alone, StatusCode::NO_CONTENT);
    assert_eq!(parent_kept, StatusCode::OK);
    assert!(!parent["updated_at"].as_str().unwrap().starts_with("2000"));
    assert_eq!(story, StatusCode::NO_CONTENT);
    assert!(!exists(&ana, 1).await);
    assert!(!exists(&ana, 2).await);
    assert_eq!(comment_count(&pool).await, 0);
    assert_eq!(next["key"], "SANTI-4");
}

#[sqlx::test]
async fn deleting_an_epic_leaves_its_children_without_one(pool: PgPool) {
    let ana = scrum(pool).await;
    ana.create_issue("SANTI", json!({ "summary": "epic", "issue_type": "epic" }))
        .await;
    ana.create_issue("SANTI", json!({ "summary": "child", "parent": "SANTI-1" }))
        .await;
    subtask_of(&ana, "SANTI-2").await;

    let status = delete(&ana, 1).await;
    let (_, child) = ana.get("/api/projects/SANTI/issues/2").await;
    let (_, subtask) = ana.get("/api/projects/SANTI/issues/3").await;

    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(child["parent_key"], Value::Null);
    assert_eq!(subtask["parent_key"], "SANTI-2");
}

/// Added after start, outcome, whether the issue is gone.
type Fact = (bool, Option<String>, bool);

#[sqlx::test]
async fn deleting_from_the_running_sprint_records_a_removal(pool: PgPool) {
    let ana = scrum(pool.clone()).await;
    let sprint = ana.create_sprint("SANTI").await;
    let planned = json!({ "summary": "planned", "sprint_id": sprint["id"] });
    ana.create_issue("SANTI", planned.clone()).await;
    subtask_of(&ana, "SANTI-1").await;
    ana.create_issue("SANTI", planned).await;
    ana.post(
        &format!("/api/projects/SANTI/sprints/{}/start", sprint["id"]),
        json!({}),
    )
    .await;

    let status = delete(&ana, 1).await;
    let facts: Vec<Fact> = sqlx::query_as(
        "SELECT added_after_start, outcome, issue_id IS NULL FROM sprint_issue
         ORDER BY issue_id NULLS FIRST",
    )
    .fetch_all(&pool)
    .await
    .unwrap();

    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(
        facts,
        [
            (false, Some("removed".into()), true),
            (false, Some("removed".into()), true),
            (false, None, false)
        ]
    );
}

#[sqlx::test]
async fn admins_and_the_reporter_may_delete_other_members_may_not(pool: PgPool) {
    let ana = scrum(pool).await;
    let bob = ana.another_user("bob@example.com").await;
    let eve = ana.another_user("eve@example.com").await;
    ana.post(
        "/api/projects/SANTI/members",
        json!({ "email": "bob@example.com", "role": "member" }),
    )
    .await;
    ana.create_issue("SANTI", json!({ "summary": "ana's" }))
        .await;
    bob.create_issue("SANTI", json!({ "summary": "bob's one" }))
        .await;
    bob.create_issue("SANTI", json!({ "summary": "bob's two" }))
        .await;

    let (forbidden, problem) = bob.delete("/api/projects/SANTI/issues/1").await;
    let own = delete(&bob, 2).await;
    let as_admin = delete(&ana, 3).await;
    let unknown = delete(&ana, 99).await;
    let outsider = delete(&eve, 1).await;

    assert_eq!(forbidden, StatusCode::FORBIDDEN);
    assert_eq!(problem["type"], "urn:santi:error:forbidden");
    assert!(exists(&ana, 1).await);
    assert_eq!(own, StatusCode::NO_CONTENT);
    assert_eq!(as_admin, StatusCode::NO_CONTENT);
    assert_eq!(unknown, StatusCode::NOT_FOUND);
    assert_eq!(outsider, StatusCode::NOT_FOUND);
}

/// A comment or subtask written while its issue is being deleted waits for the delete, then finds
/// nothing to attach to.
#[sqlx::test]
async fn writes_under_an_issue_deleted_meanwhile_are_not_found(pool: PgPool) {
    let ana = scrum(pool.clone()).await;
    ana.create_issue("SANTI", json!({ "summary": "Doomed" }))
        .await;
    let mut deleting = pool.begin().await.unwrap();
    sqlx::query("DELETE FROM issue WHERE number = 1")
        .execute(&mut *deleting)
        .await
        .unwrap();

    let comment = tokio::spawn({
        let ana = ana.clone();
        async move {
            ana.post(
                "/api/projects/SANTI/issues/1/comments",
                json!({ "body": "too late" }),
            )
            .await
        }
    });
    let subtask = tokio::spawn({
        let ana = ana.clone();
        async move {
            ana.post(
                "/api/projects/SANTI/issues",
                json!({ "summary": "sub", "issue_type": "subtask", "parent": "SANTI-1" }),
            )
            .await
        }
    });
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    deleting.commit().await.unwrap();
    let (comment, comment_problem) = comment.await.unwrap();
    let (subtask, subtask_problem) = subtask.await.unwrap();

    assert_eq!(comment, StatusCode::NOT_FOUND, "{comment_problem}");
    assert_eq!(subtask, StatusCode::NOT_FOUND, "{subtask_problem}");
}
