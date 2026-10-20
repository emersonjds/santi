mod common;

use axum::http::{Method, StatusCode};
use common::{PASSWORD, TestApp, json_request};
use serde_json::{Value, json};
use sqlx::PgPool;

const COMMENTS: &str = "/api/projects/SANTI/issues/1/comments";

/// Ana owns SANTI with issue 1; Bo and Cy are members.
async fn team(pool: PgPool) -> (TestApp, TestApp, TestApp) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bo = ana.another_user("bo@example.com").await;
    let cy = ana.another_user("cy@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    for email in ["bo@example.com", "cy@example.com"] {
        let body = json!({ "email": email, "role": "member" });
        let (status, _) = ana.post("/api/projects/SANTI/members", body).await;
        assert_eq!(status, StatusCode::CREATED);
    }
    ana.create_issue(
        "SANTI",
        json!({ "summary": "Ship it", "description": "The plan" }),
    )
    .await;
    (ana, bo, cy)
}

fn mention(app: &TestApp, name: &str) -> String {
    format!("[@{name}](mention:{})", app.user_id)
}

async fn unread(app: &TestApp) -> i64 {
    let (status, body) = app.get("/api/notifications/unread-count").await;
    assert_eq!(status, StatusCode::OK, "{body}");
    body["count"].as_i64().unwrap()
}

async fn items(app: &TestApp) -> Vec<Value> {
    let (status, page) = app.get("/api/notifications").await;
    assert_eq!(status, StatusCode::OK, "{page}");
    page["items"].as_array().unwrap().clone()
}

fn kinds(items: &[Value]) -> Vec<&str> {
    items
        .iter()
        .map(|item| item["kind"].as_str().unwrap())
        .collect()
}

#[sqlx::test]
async fn a_mention_in_a_comment_reaches_the_person_and_can_be_read(pool: PgPool) {
    let (ana, bo, _) = team(pool).await;
    let body = format!("{} please look {}", mention(&bo, "Bo"), "x".repeat(200));

    let (_, comment) = ana.post(COMMENTS, json!({ "body": body })).await;

    assert_eq!(unread(&bo).await, 1);
    assert_eq!(unread(&ana).await, 0);
    let list = items(&bo).await;
    let item = &list[0];
    assert_eq!(item["kind"], "mention");
    assert_eq!(item["actor_id"], ana.user_id);
    assert_eq!(item["actor_name"], "ana@example.com");
    assert_eq!(item["project_key"], "SANTI");
    assert_eq!(item["issue_key"], "SANTI-1");
    assert_eq!(item["issue_summary"], "Ship it");
    assert_eq!(item["comment_id"], comment["id"]);
    assert_eq!(item["excerpt"].as_str().unwrap().chars().count(), 140);
    assert!(
        item["excerpt"]
            .as_str()
            .unwrap()
            .starts_with("@Bo please look x")
    );
    assert_eq!(item["read_at"], Value::Null);

    let read = format!("/api/notifications/{}/read", item["id"]);
    assert_eq!(ana.post(&read, json!(null)).await.0, StatusCode::NOT_FOUND);
    assert_eq!(bo.post(&read, json!(null)).await.0, StatusCode::NO_CONTENT);
    assert_eq!(bo.post(&read, json!(null)).await.0, StatusCode::NO_CONTENT);
    let missing = "/api/notifications/999999/read";
    assert_eq!(bo.post(missing, json!(null)).await.0, StatusCode::NOT_FOUND);
    assert_eq!(unread(&bo).await, 0);
    assert!(items(&bo).await[0]["read_at"].is_string());
}

#[sqlx::test]
async fn read_all_clears_the_count(pool: PgPool) {
    let (ana, bo, _) = team(pool).await;
    ana.patch(
        "/api/projects/SANTI/issues/1",
        json!({ "assignee_id": bo.user_id }),
    )
    .await;
    ana.post(COMMENTS, json!({ "body": mention(&bo, "Bo") }))
        .await;
    assert_eq!(unread(&bo).await, 2);

    let (status, _) = bo.post("/api/notifications/read-all", json!(null)).await;

    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(unread(&bo).await, 0);
    assert_eq!(items(&bo).await.len(), 2);
}

#[sqlx::test]
async fn only_mentions_an_edit_adds_notify(pool: PgPool) {
    let (ana, bo, cy) = team(pool).await;
    let (_, comment) = ana
        .post(COMMENTS, json!({ "body": mention(&bo, "Bo") }))
        .await;
    let edited = format!("{} and {}", mention(&bo, "Bo"), mention(&cy, "Cy"));

    let url = format!("{COMMENTS}/{}", comment["id"]);
    let (status, _) = ana.patch(&url, json!({ "body": edited })).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(unread(&bo).await, 1);
    assert_eq!(unread(&cy).await, 1);
    assert_eq!(items(&cy).await[0]["comment_id"], comment["id"]);

    let issue = "/api/projects/SANTI/issues/1";
    let description = format!("The plan, {}", mention(&cy, "Cy"));
    ana.patch(issue, json!({ "description": description }))
        .await;
    let description = format!("{description} {}", mention(&bo, "Bo"));
    ana.patch(issue, json!({ "description": description }))
        .await;

    assert_eq!(unread(&cy).await, 2);
    assert_eq!(unread(&bo).await, 2);
    let latest = &items(&bo).await[0];
    assert_eq!(latest["kind"], "mention");
    assert_eq!(latest["comment_id"], Value::Null);
}

#[sqlx::test]
async fn assigning_someone_else_notifies_them_and_self_assignment_does_not(pool: PgPool) {
    let (ana, bo, _) = team(pool).await;
    let issue = "/api/projects/SANTI/issues/1";

    ana.patch(issue, json!({ "assignee_id": ana.user_id }))
        .await;
    ana.patch(issue, json!({ "assignee_id": bo.user_id })).await;
    ana.patch(issue, json!({ "assignee_id": bo.user_id })).await;
    let summary = json!({ "summary": "New", "assignee_id": bo.user_id });
    ana.create_issue("SANTI", summary).await;

    assert_eq!(unread(&ana).await, 0);
    let list = items(&bo).await;
    assert_eq!(kinds(&list), ["assigned", "assigned"]);
    assert_eq!(list[0]["issue_key"], "SANTI-2");
    assert_eq!(list[1]["issue_key"], "SANTI-1");
    assert_eq!(list[1]["comment_id"], Value::Null);
    assert_eq!(list[1]["excerpt"], "The plan");
}

#[sqlx::test]
async fn a_mention_in_a_new_description_notifies_and_an_assignment_wins(pool: PgPool) {
    let (ana, bo, cy) = team(pool).await;

    let description = format!("{} {}", mention(&bo, "Bo"), mention(&ana, "Ana"));
    let body = json!({ "summary": "New", "description": description, "assignee_id": bo.user_id });
    ana.create_issue("SANTI", body).await;
    let description = format!("The plan {}", mention(&cy, "Cy"));
    let change = json!({ "description": description, "assignee_id": cy.user_id });
    ana.patch("/api/projects/SANTI/issues/1", change).await;

    assert_eq!(unread(&ana).await, 0);
    assert_eq!(kinds(&items(&bo).await), ["assigned"]);
    assert_eq!(kinds(&items(&cy).await), ["assigned"]);
}

#[sqlx::test]
async fn comments_tell_the_reporter_and_assignee_and_a_mention_wins(pool: PgPool) {
    let (ana, bo, cy) = team(pool).await;
    bo.create_issue(
        "SANTI",
        json!({ "summary": "Bo's", "assignee_id": cy.user_id }),
    )
    .await;
    let comments = "/api/projects/SANTI/issues/2/comments";

    ana.post(comments, json!({ "body": "hello" })).await;
    ana.post(
        comments,
        json!({ "body": format!("hey {}", mention(&bo, "Bo")) }),
    )
    .await;
    cy.post(comments, json!({ "body": "on it" })).await;

    assert_eq!(kinds(&items(&bo).await), ["comment", "mention", "comment"]);
    assert_eq!(kinds(&items(&cy).await), ["comment", "comment", "assigned"]);
    assert_eq!(unread(&ana).await, 0);
}

#[sqlx::test]
async fn people_outside_the_project_and_the_author_are_never_mentioned(pool: PgPool) {
    let (ana, _, _) = team(pool).await;
    let dan = ana.another_user("dan@example.com").await;

    let body = format!("{} {}", mention(&dan, "Dan"), mention(&ana, "Ana"));
    let (status, _) = ana.post(COMMENTS, json!({ "body": body })).await;

    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(unread(&dan).await, 0);
    assert_eq!(unread(&ana).await, 0);
}

#[sqlx::test]
async fn notifications_hide_with_membership_and_trash_but_not_archive(pool: PgPool) {
    let (ana, bo, cy) = team(pool).await;
    let body = format!("{} {}", mention(&bo, "Bo"), mention(&cy, "Cy"));
    ana.post(COMMENTS, json!({ "body": body })).await;

    ana.delete(&format!("/api/projects/SANTI/members/{}", bo.user_id))
        .await;
    assert_eq!(unread(&bo).await, 0);
    assert!(items(&bo).await.is_empty());

    ana.post("/api/projects/SANTI/archive", json!(null)).await;
    assert_eq!(unread(&cy).await, 1);
    ana.post("/api/projects/SANTI/unarchive", json!(null)).await;
    ana.post("/api/projects/SANTI/trash", json!(null)).await;
    assert_eq!(unread(&cy).await, 0);
    assert!(items(&cy).await.is_empty());
    let read_all = cy.post("/api/notifications/read-all", json!(null)).await;
    assert_eq!(read_all.0, StatusCode::NO_CONTENT);
    ana.post("/api/projects/SANTI/restore", json!(null)).await;
    assert_eq!(unread(&cy).await, 1);
}

#[sqlx::test]
async fn deleting_the_issue_or_the_comment_deletes_its_notifications(pool: PgPool) {
    let (ana, bo, _) = team(pool).await;
    let (_, comment) = ana
        .post(COMMENTS, json!({ "body": mention(&bo, "Bo") }))
        .await;
    ana.delete(&format!("{COMMENTS}/{}", comment["id"])).await;
    assert_eq!(unread(&bo).await, 0);

    ana.post(COMMENTS, json!({ "body": mention(&bo, "Bo") }))
        .await;
    let (status, _) = ana.delete("/api/projects/SANTI/issues/1").await;

    assert_eq!(status, StatusCode::NO_CONTENT);
    assert!(items(&bo).await.is_empty());
}

#[sqlx::test]
async fn the_list_pages_newest_first_and_filters_unread(pool: PgPool) {
    let (ana, bo, _) = team(pool).await;
    for _ in 0..3 {
        ana.post(COMMENTS, json!({ "body": mention(&bo, "Bo") }))
            .await;
    }
    let newest = items(&bo).await[0]["id"].clone();
    bo.post(&format!("/api/notifications/{newest}/read"), json!(null))
        .await;

    let (_, first) = bo.get("/api/notifications?limit=2").await;
    let cursor = first["next_cursor"].as_i64().unwrap();
    let (_, second) = bo
        .get(&format!("/api/notifications?limit=2&cursor={cursor}"))
        .await;
    let (_, unread_only) = bo.get("/api/notifications?unread=true").await;
    let (bad, _) = bo.get("/api/notifications?limit=0").await;
    let (anonymous, _) = TestApp {
        token: None,
        ..bo.clone()
    }
    .get("/api/notifications")
    .await;

    assert_eq!(first["items"][0]["id"], newest);
    assert_eq!(first["items"].as_array().unwrap().len(), 2);
    assert_eq!(second["items"].as_array().unwrap().len(), 1);
    assert_eq!(second["next_cursor"], Value::Null);
    assert!(second["items"][0]["id"].as_i64().unwrap() < cursor);
    assert_eq!(unread_only["items"].as_array().unwrap().len(), 2);
    assert_eq!(bad, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(anonymous, StatusCode::UNAUTHORIZED);
}

#[sqlx::test]
async fn erasing_an_account_deletes_what_it_received_and_caused(pool: PgPool) {
    let (ana, bo, _) = team(pool.clone()).await;
    ana.post(COMMENTS, json!({ "body": mention(&bo, "Bo") }))
        .await;
    bo.post(COMMENTS, json!({ "body": mention(&ana, "Ana") }))
        .await;
    let request = json_request(
        Method::DELETE,
        "/api/me",
        bo.token.as_deref(),
        Some(json!({ "password": PASSWORD })),
    );

    assert_eq!(bo.send(request).await.status(), StatusCode::NO_CONTENT);

    let left: i64 = sqlx::query_scalar("SELECT count(*) FROM notification")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(left, 0);
}

#[sqlx::test]
async fn notifications_older_than_90_days_are_purged(pool: PgPool) {
    let (ana, bo, cy) = team(pool.clone()).await;
    ana.post(COMMENTS, json!({ "body": mention(&bo, "Bo") }))
        .await;
    ana.post(COMMENTS, json!({ "body": mention(&cy, "Cy") }))
        .await;
    sqlx::query(
        "UPDATE notification SET created_at = now() - interval '91 days' WHERE recipient_id = $1",
    )
    .bind(bo.user_id)
    .execute(&pool)
    .await
    .unwrap();

    let purged = santi_server::purge_notifications(&pool).await.unwrap();

    assert_eq!(purged, 1);
    assert_eq!(unread(&bo).await, 0);
    assert_eq!(unread(&cy).await, 1);
}

#[sqlx::test]
async fn cascades_and_the_list_have_an_index(pool: PgPool) {
    let indexed: Vec<String> = sqlx::query_scalar(
        "SELECT substring(indexdef FROM '\\((.*)\\)') FROM pg_indexes WHERE tablename = 'notification'",
    )
    .fetch_all(&pool)
    .await
    .unwrap();

    for columns in ["project_id", "actor_id", "recipient_id, id DESC"] {
        assert!(
            indexed.iter().any(|found| found == columns),
            "{columns}: {indexed:?}"
        );
    }
}

#[sqlx::test]
async fn the_excerpt_shows_mentions_as_names_and_never_cuts_a_token(pool: PgPool) {
    let (ana, bo, _) = team(pool).await;
    let token = format!(r"[@Bo \[QA\]](mention:{})", bo.user_id);
    let body = format!("{}{token} and more", "x".repeat(130));

    ana.post(COMMENTS, json!({ "body": body })).await;

    let excerpt = items(&bo).await[0]["excerpt"].clone();
    assert_eq!(excerpt, format!("{}@Bo [QA] a", "x".repeat(130)));
}

#[sqlx::test]
async fn the_list_filters_by_kind(pool: PgPool) {
    let (ana, bo, _) = team(pool).await;
    ana.patch(
        "/api/projects/SANTI/issues/1",
        json!({ "assignee_id": bo.user_id }),
    )
    .await;
    ana.post(COMMENTS, json!({ "body": "plain" })).await;
    ana.post(COMMENTS, json!({ "body": mention(&bo, "Bo") }))
        .await;

    let (_, mentions) = bo.get("/api/notifications?kind=mention").await;
    let (_, assigned) = bo.get("/api/notifications?kind=assigned&unread=true").await;
    let (bad, _) = bo.get("/api/notifications?kind=everything").await;

    let mentions = mentions["items"].as_array().unwrap();
    assert_eq!(kinds(mentions), ["mention"]);
    assert_eq!(kinds(assigned["items"].as_array().unwrap()), ["assigned"]);
    assert_eq!(bad, StatusCode::BAD_REQUEST);
}
