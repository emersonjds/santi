mod common;

use axum::http::StatusCode;
use common::TestApp;
use serde_json::{Value, json};
use sqlx::PgPool;

async fn project(pool: PgPool) -> TestApp {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    ana
}

fn keys(page: &Value) -> Vec<String> {
    page["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|issue| issue["key"].as_str().unwrap().to_string())
        .collect()
}

#[sqlx::test]
async fn comments_are_added_and_listed_in_order(pool: PgPool) {
    let ana = project(pool).await;
    ana.create_issue("SANTI", json!({ "summary": "x" })).await;
    let url = "/api/projects/SANTI/issues/1/comments";

    let (created, comment) = ana.post(url, json!({ "body": "\n first \n" })).await;
    ana.post(url, json!({ "body": "second" })).await;
    let (_, page) = ana.get(url).await;

    assert_eq!(created, StatusCode::CREATED);
    assert_eq!(comment["body"], " first");
    assert_eq!(comment["author_id"], ana.user_id);
    assert_eq!(comment["author_name"], "ana@example.com");
    assert_eq!(page["items"][0]["author_name"], "ana@example.com");
    assert_eq!(page["items"][1]["body"], "second");
    assert_eq!(page["next_cursor"], Value::Null);
}

#[sqlx::test]
async fn comment_rules(pool: PgPool) {
    let ana = project(pool).await;
    ana.create_issue("SANTI", json!({ "summary": "x" })).await;

    let (empty, _) = ana
        .post(
            "/api/projects/SANTI/issues/1/comments",
            json!({ "body": "  " }),
        )
        .await;
    let (missing, _) = ana
        .post(
            "/api/projects/SANTI/issues/9/comments",
            json!({ "body": "hi" }),
        )
        .await;
    let (listing_missing, _) = ana.get("/api/projects/SANTI/issues/9/comments").await;

    assert_eq!(empty, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(missing, StatusCode::NOT_FOUND);
    assert_eq!(listing_missing, StatusCode::NOT_FOUND);
}

/// Pushes every issue's `updated_at` back to 2000 so the next write shows up.
async fn backdate(pool: &PgPool) {
    sqlx::query("UPDATE issue SET updated_at = '2000-01-01T00:00:00Z'")
        .execute(pool)
        .await
        .unwrap();
}

async fn bumped(app: &TestApp) -> bool {
    let (_, issue) = app.get("/api/projects/SANTI/issues/1").await;
    !issue["updated_at"].as_str().unwrap().starts_with("2000")
}

#[sqlx::test]
async fn edits_mark_the_comment_and_deletes_remove_it(pool: PgPool) {
    let ana = project(pool.clone()).await;
    ana.create_issue("SANTI", json!({ "summary": "x" })).await;
    let url = "/api/projects/SANTI/issues/1/comments";
    let (_, comment) = ana.post(url, json!({ "body": "first" })).await;
    let one = format!("{url}/{}", comment["id"]);

    backdate(&pool).await;
    let (same, unchanged) = ana.patch(&one, json!({ "body": "\nfirst \n" })).await;
    let same_bumped = bumped(&ana).await;
    let (edited, changed) = ana.patch(&one, json!({ "body": "second" })).await;
    let edit_bumped = bumped(&ana).await;
    let (_, page) = ana.get(url).await;
    backdate(&pool).await;
    let (deleted, _) = ana.delete(&one).await;
    let delete_bumped = bumped(&ana).await;
    let (_, after) = ana.get(url).await;
    let (again, _) = ana.delete(&one).await;

    assert_eq!(same, StatusCode::OK);
    assert_eq!(unchanged, comment);
    assert!(comment["edited_at"].is_null() && comment["edited_by_id"].is_null());
    assert!(!same_bumped);
    assert_eq!(edited, StatusCode::OK);
    assert_eq!(changed["body"], "second");
    assert!(changed["edited_at"].is_string());
    assert_eq!(changed["edited_by_id"], ana.user_id);
    assert_eq!(changed["edited_by_name"], "ana@example.com");
    assert!(edit_bumped);
    assert_eq!(page["items"][0], changed);
    assert_eq!(deleted, StatusCode::NO_CONTENT);
    assert!(delete_bumped);
    assert_eq!(after["items"], json!([]));
    assert_eq!(again, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn admins_and_the_author_may_edit_or_delete_a_comment_other_members_may_not(pool: PgPool) {
    let ana = project(pool).await;
    let bob = ana.another_user("bob@example.com").await;
    let cy = ana.another_user("cy@example.com").await;
    for member in [&bob, &cy] {
        ana.add_member("SANTI", member, "member").await;
    }
    bob.create_issue("SANTI", json!({ "summary": "bob's" }))
        .await;
    let url = "/api/projects/SANTI/issues/1/comments";
    let (_, bobs) = bob.post(url, json!({ "body": "bob's" })).await;
    let (_, cys) = cy.post(url, json!({ "body": "cy's" })).await;
    let bobs = format!("{url}/{}", bobs["id"]);
    let cys = format!("{url}/{}", cys["id"]);

    let (forbidden, problem) = cy.patch(&bobs, json!({ "body": "  " })).await;
    let (forbidden_delete, _) = cy.delete(&bobs).await;
    let (own, _) = cy.patch(&cys, json!({ "body": "cy's, fixed" })).await;
    let (as_admin, edited) = ana.patch(&bobs, json!({ "body": "fixed by ana" })).await;
    let (_, worked) = ana.get("/api/me/issues?view=worked").await;
    let (own_delete, _) = cy.delete(&cys).await;
    let (admin_delete, _) = ana.delete(&bobs).await;

    assert_eq!(forbidden, StatusCode::FORBIDDEN);
    assert_eq!(problem["type"], "urn:santi:error:forbidden");
    assert_eq!(forbidden_delete, StatusCode::FORBIDDEN);
    assert_eq!(own, StatusCode::OK);
    assert_eq!(as_admin, StatusCode::OK);
    assert_eq!(edited["author_name"], "bob@example.com");
    assert_eq!(edited["edited_by_name"], "ana@example.com");
    assert_eq!(worked["items"][0]["key"], "SANTI-1");
    assert_eq!(own_delete, StatusCode::NO_CONTENT);
    assert_eq!(admin_delete, StatusCode::NO_CONTENT);
}

#[sqlx::test]
async fn comment_edit_and_delete_rules(pool: PgPool) {
    let ana = project(pool).await;
    let eve = ana.another_user("eve@example.com").await;
    ana.create_project("WEB", "scrum").await;
    for key in ["SANTI", "SANTI", "WEB"] {
        ana.create_issue(key, json!({ "summary": "x" })).await;
    }
    let hi = json!({ "body": "hi" });
    let (_, first) = ana
        .post("/api/projects/SANTI/issues/1/comments", hi.clone())
        .await;
    let (_, second) = ana
        .post("/api/projects/SANTI/issues/2/comments", hi.clone())
        .await;
    let (_, elsewhere) = ana
        .post("/api/projects/WEB/issues/1/comments", hi.clone())
        .await;
    let on_one = |id: &Value| format!("/api/projects/SANTI/issues/1/comments/{id}");
    let mine = on_one(&first["id"]);
    let blank = json!({ "body": "  " });

    let (empty, _) = ana.patch(&mine, blank.clone()).await;
    let (over_cap, error) = ana
        .patch(&mine, json!({ "body": "x".repeat(65_537) }))
        .await;
    let (no_issue, _) = ana
        .patch(
            &format!("/api/projects/SANTI/issues/9/comments/{}", first["id"]),
            blank.clone(),
        )
        .await;
    let (unknown, _) = ana.patch(&on_one(&json!(999_999)), blank.clone()).await;
    let (other_issue, _) = ana.patch(&on_one(&second["id"]), hi.clone()).await;
    let (other_issue_delete, _) = ana.delete(&on_one(&second["id"])).await;
    let (other_project, _) = ana.patch(&on_one(&elsewhere["id"]), hi.clone()).await;
    let (other_project_delete, _) = ana.delete(&on_one(&elsewhere["id"])).await;
    let (outsider, _) = eve.patch(&mine, hi.clone()).await;
    let (outsider_delete, _) = eve.delete(&mine).await;
    ana.post("/api/projects/SANTI/archive", json!(null)).await;
    let (archived, problem) = ana.patch(&mine, blank.clone()).await;
    let (archived_missing, _) = ana
        .patch("/api/projects/SANTI/issues/9/comments/1", hi.clone())
        .await;
    let (archived_delete, _) = ana.delete(&mine).await;

    assert_eq!(empty, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(over_cap, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(error["errors"][0]["field"], "body");
    assert_eq!(no_issue, StatusCode::NOT_FOUND);
    assert_eq!(unknown, StatusCode::NOT_FOUND);
    assert_eq!(other_issue, StatusCode::NOT_FOUND);
    assert_eq!(other_issue_delete, StatusCode::NOT_FOUND);
    assert_eq!(other_project, StatusCode::NOT_FOUND);
    assert_eq!(other_project_delete, StatusCode::NOT_FOUND);
    assert_eq!(outsider, StatusCode::NOT_FOUND);
    assert_eq!(outsider_delete, StatusCode::NOT_FOUND);
    assert_eq!(archived, StatusCode::CONFLICT);
    assert_eq!(problem["type"], "urn:santi:error:project-archived");
    assert_eq!(archived_missing, StatusCode::CONFLICT);
    assert_eq!(archived_delete, StatusCode::CONFLICT);
}

#[sqlx::test]
async fn comment_body_is_capped_at_65536_characters(pool: PgPool) {
    let ana = project(pool).await;
    ana.create_issue("SANTI", json!({ "summary": "x" })).await;
    let url = "/api/projects/SANTI/issues/1/comments";

    let (at_cap, _) = ana.post(url, json!({ "body": "x".repeat(65_536) })).await;
    let (over_cap, error) = ana.post(url, json!({ "body": "x".repeat(65_537) })).await;

    assert_eq!(at_cap, StatusCode::CREATED);
    assert_eq!(over_cap, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(error["errors"][0]["field"], "body");
}

#[sqlx::test]
async fn markdown_bodies_round_trip_byte_for_byte(pool: PgPool) {
    let ana = project(pool).await;
    let markdown = "    let x = 1\n\n**hi** <script>alert(1)</script>\n[x](javascript:alert(1)) [@Ana \\[QA\\]](mention:1)";
    ana.create_issue("SANTI", json!({ "summary": "x", "description": markdown }))
        .await;
    let url = "/api/projects/SANTI/issues/1/comments";

    ana.post(url, json!({ "body": markdown })).await;
    let (_, issue) = ana.get("/api/projects/SANTI/issues/1").await;
    let (_, page) = ana.get(url).await;

    assert_eq!(issue["description"], markdown);
    assert_eq!(page["items"][0]["body"], markdown);
}

#[sqlx::test]
async fn comment_pages_follow_the_cursor(pool: PgPool) {
    let ana = project(pool).await;
    ana.create_issue("SANTI", json!({ "summary": "x" })).await;
    for body in ["a", "b", "c"] {
        ana.post(
            "/api/projects/SANTI/issues/1/comments",
            json!({ "body": body }),
        )
        .await;
    }

    let (_, first) = ana
        .get("/api/projects/SANTI/issues/1/comments?limit=2")
        .await;
    let cursor = first["next_cursor"].as_i64().unwrap();
    let (_, second) = ana
        .get(&format!(
            "/api/projects/SANTI/issues/1/comments?limit=2&cursor={cursor}"
        ))
        .await;

    assert_eq!(first["items"].as_array().unwrap().len(), 2);
    assert_eq!(second["items"][0]["body"], "c");
    assert_eq!(second["next_cursor"], Value::Null);
}

#[sqlx::test]
async fn search_combines_filters_and_within_or_across_and(pool: PgPool) {
    let ana = project(pool).await;
    ana.create_issue("SANTI", json!({ "summary": "Login fails", "issue_type": "bug", "labels": ["ui"], "assignee_id": ana.user_id })).await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "Write docs", "issue_type": "task", "labels": ["docs"] }),
    )
    .await;
    ana.create_issue("SANTI", json!({ "summary": "Big story", "labels": ["ui"] }))
        .await;

    let (_, either_type) = ana
        .get("/api/projects/SANTI/issues?type=bug&type=task")
        .await;
    let (_, type_and_label) = ana
        .get("/api/projects/SANTI/issues?type=bug&type=task&label=ui")
        .await;
    let (_, mine) = ana
        .get(&format!(
            "/api/projects/SANTI/issues?assignee={}",
            ana.user_id
        ))
        .await;
    let (_, unassigned) = ana.get("/api/projects/SANTI/issues?unassigned=true").await;
    let (_, mine_or_unassigned) = ana
        .get(&format!(
            "/api/projects/SANTI/issues?assignee={}&unassigned=true&label=ui",
            ana.user_id
        ))
        .await;
    let (_, text) = ana.get("/api/projects/SANTI/issues?q=LOGIN").await;
    let (_, literal_percent) = ana.get("/api/projects/SANTI/issues?q=50%25").await;

    assert_eq!(keys(&either_type), ["SANTI-1", "SANTI-2"]);
    assert_eq!(keys(&type_and_label), ["SANTI-1"]);
    assert_eq!(keys(&mine), ["SANTI-1"]);
    assert_eq!(keys(&unassigned), ["SANTI-2", "SANTI-3"]);
    assert_eq!(keys(&mine_or_unassigned), ["SANTI-1", "SANTI-3"]);
    assert_eq!(keys(&text), ["SANTI-1"]);
    assert_eq!(keys(&literal_percent), Vec::<String>::new());
}

#[sqlx::test]
async fn search_filters_by_parent_and_pages(pool: PgPool) {
    let ana = project(pool).await;
    ana.create_issue("SANTI", json!({ "summary": "Epic", "issue_type": "epic" }))
        .await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "Child one", "parent": "SANTI-1" }),
    )
    .await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "Child two", "parent": "SANTI-1" }),
    )
    .await;

    let (_, children) = ana.get("/api/projects/SANTI/issues?parent=SANTI-1").await;
    let (_, first) = ana.get("/api/projects/SANTI/issues?limit=2").await;
    let cursor = first["next_cursor"].as_i64().unwrap();
    let (_, second) = ana
        .get(&format!(
            "/api/projects/SANTI/issues?limit=2&cursor={cursor}"
        ))
        .await;

    assert_eq!(keys(&children), ["SANTI-2", "SANTI-3"]);
    assert_eq!(keys(&first), ["SANTI-1", "SANTI-2"]);
    assert_eq!(keys(&second), ["SANTI-3"]);
}

#[sqlx::test]
async fn search_filters_by_status_category_and_no_epic(pool: PgPool) {
    let ana = project(pool).await;
    let done = ana.status_id("SANTI", "Done").await;
    let doing = ana.status_id("SANTI", "In Progress").await;
    ana.create_issue("SANTI", json!({ "summary": "Epic", "issue_type": "epic" }))
        .await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "Shipped", "status_id": done, "parent": "SANTI-1" }),
    )
    .await;
    ana.create_issue("SANTI", json!({ "summary": "Started", "status_id": doing }))
        .await;

    let (_, finished) = ana.get("/api/projects/SANTI/issues?status=done").await;
    let (_, open) = ana
        .get("/api/projects/SANTI/issues?status=todo&status=in_progress")
        .await;
    let (_, no_epic) = ana.get("/api/projects/SANTI/issues?parent=none").await;
    let (_, open_without_epic) = ana
        .get("/api/projects/SANTI/issues?parent=none&status=in_progress&q=santi-3")
        .await;
    let (bad_status, _) = ana.get("/api/projects/SANTI/issues?status=closed").await;

    assert_eq!(keys(&finished), ["SANTI-2"]);
    assert_eq!(keys(&open), ["SANTI-1", "SANTI-3"]);
    assert_eq!(keys(&no_epic), ["SANTI-1", "SANTI-3"]);
    assert_eq!(keys(&open_without_epic), ["SANTI-3"]);
    assert_eq!(bad_status, StatusCode::BAD_REQUEST);
}

#[sqlx::test]
async fn labels_list_each_project_label_once_in_order(pool: PgPool) {
    let ana = project(pool).await;
    ana.create_issue("SANTI", json!({ "summary": "a", "labels": ["ui", "api"] }))
        .await;
    ana.create_issue("SANTI", json!({ "summary": "b", "labels": ["ui"] }))
        .await;
    let bob = ana.another_user("bob@example.com").await;

    let (status, labels) = ana.get("/api/projects/SANTI/labels").await;
    let (outsider, _) = bob.get("/api/projects/SANTI/labels").await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(labels, json!(["api", "ui"]));
    assert_eq!(outsider, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn search_rejects_bad_query_values(pool: PgPool) {
    let ana = project(pool).await;

    let (bad_type, problem) = ana.get("/api/projects/SANTI/issues?type=feature").await;
    let (too_many, _) = ana.get("/api/projects/SANTI/issues?limit=500").await;
    let (bad_parent, _) = ana.get("/api/projects/SANTI/issues?parent=OTHER-1").await;

    assert_eq!(bad_type, StatusCode::BAD_REQUEST);
    assert_eq!(problem["type"], "urn:santi:error:bad-request");
    assert_eq!(too_many, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(bad_parent, StatusCode::UNPROCESSABLE_ENTITY);
}

#[sqlx::test]
async fn openapi_lists_move_search_and_comment_routes(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let (_, api) = app.get("/openapi.json").await;

    assert!(api["paths"]["/api/projects/{key}/issues"]["get"].is_object());
    assert!(api["paths"]["/api/projects/{key}/issues/{number}/move"]["post"].is_object());
    assert!(api["paths"]["/api/projects/{key}/issues/{number}/comments"]["get"].is_object());
    let one = &api["paths"]["/api/projects/{key}/issues/{number}/comments/{id}"];
    assert!(one["patch"].is_object() && one["delete"].is_object());
    let comment = &api["components"]["schemas"]["Comment"]["properties"];
    for field in ["edited_at", "edited_by_id", "edited_by_name"] {
        assert!(comment[field].is_object(), "{field}");
    }
}
