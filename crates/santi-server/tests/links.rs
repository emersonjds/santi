mod common;

use axum::http::StatusCode;
use common::TestApp;
use serde_json::{Value, json};
use sqlx::PgPool;

async fn project_with_issues(app: &TestApp, key: &str, board: &str, count: usize) {
    app.create_project(key, board).await;
    for number in 1..=count {
        app.create_issue(key, json!({ "summary": format!("issue {number}") }))
            .await;
    }
}

async fn link(app: &TestApp, from: &str, relation: &str, to: &str) -> (StatusCode, Value) {
    let (project, number) = from.split_once('-').unwrap();
    app.post(
        &format!("/api/projects/{project}/issues/{number}/links"),
        json!({ "relation": relation, "issue": to }),
    )
    .await
}

async fn links(app: &TestApp, of: &str) -> Vec<(String, String)> {
    let (project, number) = of.split_once('-').unwrap();
    let (status, body) = app
        .get(&format!("/api/projects/{project}/issues/{number}/links"))
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    body.as_array()
        .unwrap()
        .iter()
        .map(|link| {
            (
                link["relation"].as_str().unwrap().to_string(),
                link["issue"]["key"].as_str().unwrap().to_string(),
            )
        })
        .collect()
}

async fn unlink(app: &TestApp, from: &str, id: &Value) -> StatusCode {
    let (project, number) = from.split_once('-').unwrap();
    app.delete(&format!(
        "/api/projects/{project}/issues/{number}/links/{id}"
    ))
    .await
    .0
}

fn pair(relation: &str, key: &str) -> (String, String) {
    (relation.to_string(), key.to_string())
}

fn refused_field(body: &Value) -> &str {
    body["errors"][0]["field"].as_str().unwrap_or_default()
}

#[sqlx::test]
async fn a_blocks_link_shows_its_inverse_on_the_other_issue_and_goes_from_both_sides(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    project_with_issues(&ana, "SANTI", "scrum", 2).await;

    let (created, link_body) = link(&ana, "SANTI-1", "blocks", "SANTI-2").await;
    let (duplicate, problem) = link(&ana, "SANTI-2", "is_blocked_by", "SANTI-1").await;

    assert_eq!(created, StatusCode::CREATED, "{link_body}");
    assert_eq!(link_body["relation"], "blocks");
    assert_eq!(link_body["issue"]["key"], "SANTI-2");
    assert_eq!(link_body["issue"]["summary"], "issue 2");
    assert_eq!(link_body["issue"]["status_name"], "To Do");
    assert_eq!(link_body["issue"]["status_category"], "todo");
    assert_eq!(link_body["issue"]["priority"], "medium");
    assert_eq!(link_body["issue"]["issue_type"], "story");
    assert_eq!(links(&ana, "SANTI-1").await, [pair("blocks", "SANTI-2")]);
    assert_eq!(
        links(&ana, "SANTI-2").await,
        [pair("is_blocked_by", "SANTI-1")]
    );
    assert_eq!(duplicate, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(refused_field(&problem), "issue");

    assert_eq!(
        unlink(&ana, "SANTI-2", &link_body["id"]).await,
        StatusCode::NO_CONTENT
    );
    assert!(links(&ana, "SANTI-1").await.is_empty());
    assert!(links(&ana, "SANTI-2").await.is_empty());
    assert_eq!(
        unlink(&ana, "SANTI-1", &link_body["id"]).await,
        StatusCode::NOT_FOUND
    );
}

#[sqlx::test]
async fn relates_is_one_row_read_the_same_from_both_sides(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    project_with_issues(&ana, "SANTI", "scrum", 2).await;

    let (created, _) = link(&ana, "SANTI-1", "relates", "SANTI-2").await;
    let (duplicate, problem) = link(&ana, "SANTI-2", "relates", "SANTI-1").await;

    assert_eq!(created, StatusCode::CREATED);
    assert_eq!(links(&ana, "SANTI-1").await, [pair("relates", "SANTI-2")]);
    assert_eq!(links(&ana, "SANTI-2").await, [pair("relates", "SANTI-1")]);
    assert_eq!(duplicate, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(refused_field(&problem), "issue");
}

#[sqlx::test]
async fn links_list_by_relation_then_key(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    project_with_issues(&ana, "SANTI", "scrum", 10).await;

    for (relation, other) in [
        ("relates", "SANTI-10"),
        ("is_cloned_by", "SANTI-5"),
        ("relates", "SANTI-2"),
        ("is_blocked_by", "SANTI-3"),
        ("blocks", "SANTI-4"),
    ] {
        assert_eq!(
            link(&ana, "SANTI-1", relation, other).await.0,
            StatusCode::CREATED
        );
    }

    assert_eq!(
        links(&ana, "SANTI-1").await,
        [
            pair("blocks", "SANTI-4"),
            pair("is_blocked_by", "SANTI-3"),
            pair("relates", "SANTI-2"),
            pair("relates", "SANTI-10"),
            pair("is_cloned_by", "SANTI-5"),
        ]
    );
    assert_eq!(links(&ana, "SANTI-5").await, [pair("clones", "SANTI-1")]);
}

#[sqlx::test]
async fn self_links_bad_keys_and_unknown_issues_are_refused(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    project_with_issues(&ana, "SANTI", "scrum", 2).await;

    let (itself, self_problem) = link(&ana, "SANTI-1", "blocks", "SANTI-1").await;
    let (malformed, malformed_problem) = link(&ana, "SANTI-1", "blocks", "nonsense").await;
    let (unknown, _) = link(&ana, "SANTI-1", "blocks", "SANTI-99").await;
    let (no_project, _) = link(&ana, "SANTI-1", "blocks", "NOPE-1").await;
    let (bad_relation, relation_problem) = link(&ana, "SANTI-1", "causes", "SANTI-2").await;

    assert_eq!(itself, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(refused_field(&self_problem), "issue");
    assert_eq!(malformed, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(refused_field(&malformed_problem), "issue");
    assert_eq!(unknown, StatusCode::NOT_FOUND);
    assert_eq!(no_project, StatusCode::NOT_FOUND);
    assert_eq!(bad_relation, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(refused_field(&relation_problem), "relation");
}

#[sqlx::test]
async fn a_pair_carries_each_directed_type_once_in_either_direction(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    project_with_issues(&ana, "SANTI", "scrum", 2).await;
    link(&ana, "SANTI-1", "blocks", "SANTI-2").await;
    link(&ana, "SANTI-1", "duplicates", "SANTI-2").await;

    let (blocks_back, blocks_problem) = link(&ana, "SANTI-2", "blocks", "SANTI-1").await;
    let (duplicates_back, duplicates_problem) =
        link(&ana, "SANTI-2", "duplicates", "SANTI-1").await;

    assert_eq!(blocks_back, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(refused_field(&blocks_problem), "issue");
    assert_eq!(duplicates_back, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(refused_field(&duplicates_problem), "issue");
    assert_eq!(
        links(&ana, "SANTI-1").await,
        [pair("blocks", "SANTI-2"), pair("duplicates", "SANTI-2")]
    );
}

#[sqlx::test]
async fn cross_project_links_show_only_to_members_of_both_projects(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    project_with_issues(&ana, "SANTI", "scrum", 1).await;
    project_with_issues(&ana, "OPS", "scrum", 1).await;
    ana.add_member("SANTI", &bob, "member").await;

    let (created, body) = link(&ana, "SANTI-1", "blocks", "OPS-1").await;
    let (bob_creates, _) = link(&bob, "SANTI-1", "relates", "OPS-1").await;

    assert_eq!(created, StatusCode::CREATED);
    assert_eq!(links(&ana, "SANTI-1").await, [pair("blocks", "OPS-1")]);
    assert_eq!(
        links(&ana, "OPS-1").await,
        [pair("is_blocked_by", "SANTI-1")]
    );
    assert!(links(&bob, "SANTI-1").await.is_empty());
    assert_eq!(bob_creates, StatusCode::NOT_FOUND);
    assert_eq!(
        unlink(&bob, "SANTI-1", &body["id"]).await,
        StatusCode::NOT_FOUND
    );
    assert_eq!(links(&ana, "SANTI-1").await, [pair("blocks", "OPS-1")]);
}

#[sqlx::test]
async fn deleting_an_issue_removes_its_links(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    project_with_issues(&ana, "SANTI", "scrum", 2).await;
    link(&ana, "SANTI-1", "duplicates", "SANTI-2").await;

    let (deleted, _) = ana.delete("/api/projects/SANTI/issues/2").await;

    assert_eq!(deleted, StatusCode::NO_CONTENT);
    assert!(links(&ana, "SANTI-1").await.is_empty());
}

#[sqlx::test]
async fn an_archived_project_keeps_its_links_read_only(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    project_with_issues(&ana, "SANTI", "scrum", 3).await;
    project_with_issues(&ana, "OPS", "scrum", 1).await;
    let (_, body) = link(&ana, "SANTI-1", "blocks", "SANTI-2").await;
    ana.post("/api/projects/OPS/archive", json!(null)).await;
    ana.post("/api/projects/SANTI/archive", json!(null)).await;

    let (created, problem) = link(&ana, "SANTI-1", "relates", "SANTI-3").await;
    let removed = unlink(&ana, "SANTI-1", &body["id"]).await;

    assert_eq!(created, StatusCode::CONFLICT);
    assert_eq!(problem["type"], "urn:santi:error:project-archived");
    assert_eq!(removed, StatusCode::CONFLICT);
    assert_eq!(links(&ana, "SANTI-1").await, [pair("blocks", "SANTI-2")]);

    ana.post("/api/projects/SANTI/unarchive", json!(null)).await;
    let (into_archived, problem) = link(&ana, "SANTI-1", "relates", "OPS-1").await;
    assert_eq!(into_archived, StatusCode::CONFLICT);
    assert_eq!(problem["type"], "urn:santi:error:project-archived");
}

#[sqlx::test]
async fn a_link_into_an_archived_project_cannot_be_removed(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    project_with_issues(&ana, "SANTI", "scrum", 1).await;
    project_with_issues(&ana, "OPS", "scrum", 1).await;
    let (_, body) = link(&ana, "SANTI-1", "relates", "OPS-1").await;
    ana.post("/api/projects/OPS/archive", json!(null)).await;

    let (status, problem) = ana
        .delete(&format!(
            "/api/projects/SANTI/issues/1/links/{}",
            body["id"]
        ))
        .await;

    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(problem["type"], "urn:santi:error:project-archived");
    assert_eq!(links(&ana, "SANTI-1").await, [pair("relates", "OPS-1")]);
}

#[sqlx::test]
async fn a_trashed_project_hides_its_links_and_blockers(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    project_with_issues(&ana, "SANTI", "kanban", 1).await;
    project_with_issues(&ana, "OPS", "scrum", 1).await;
    let (_, body) = link(&ana, "SANTI-1", "is_blocked_by", "OPS-1").await;
    ana.post("/api/projects/OPS/trash", json!(null)).await;

    assert!(links(&ana, "SANTI-1").await.is_empty());
    assert!(board_blocked_by(&ana, "SANTI", "SANTI-1").await.is_empty());
    assert_eq!(
        unlink(&ana, "SANTI-1", &body["id"]).await,
        StatusCode::NOT_FOUND
    );
}

fn blocked_by<'a>(cards: impl Iterator<Item = &'a Value>, key: &str) -> Vec<String> {
    let card = cards
        .into_iter()
        .find(|card| card["key"] == key)
        .unwrap_or_else(|| panic!("no card {key}"));
    serde_json::from_value(card["blocked_by"].clone()).unwrap()
}

async fn board_blocked_by(app: &TestApp, project: &str, key: &str) -> Vec<String> {
    let (status, board) = app.get(&format!("/api/projects/{project}/board")).await;
    assert_eq!(status, StatusCode::OK, "{board}");
    let columns = board["columns"].as_array().unwrap();
    blocked_by(
        columns
            .iter()
            .flat_map(|column| column["cards"].as_array().unwrap()),
        key,
    )
}

async fn backlog_blocked_by(app: &TestApp, project: &str, key: &str) -> Vec<String> {
    let (status, backlog) = app.get(&format!("/api/projects/{project}/backlog")).await;
    assert_eq!(status, StatusCode::OK, "{backlog}");
    let sections = backlog["sections"].as_array().unwrap();
    blocked_by(
        sections
            .iter()
            .flat_map(|section| section["cards"].as_array().unwrap()),
        key,
    )
}

#[sqlx::test]
async fn cards_carry_the_open_blockers_the_viewer_can_see(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    project_with_issues(&ana, "FLOW", "kanban", 2).await;
    project_with_issues(&ana, "SANTI", "scrum", 2).await;
    project_with_issues(&ana, "OPS", "scrum", 1).await;
    ana.add_member("FLOW", &bob, "member").await;
    link(&ana, "FLOW-1", "blocks", "FLOW-2").await;
    link(&ana, "FLOW-2", "is_blocked_by", "OPS-1").await;
    link(&ana, "FLOW-2", "relates", "SANTI-2").await;
    link(&ana, "SANTI-1", "blocks", "SANTI-2").await;

    assert_eq!(
        board_blocked_by(&ana, "FLOW", "FLOW-2").await,
        ["FLOW-1", "OPS-1"]
    );
    assert_eq!(board_blocked_by(&bob, "FLOW", "FLOW-2").await, ["FLOW-1"]);
    assert!(board_blocked_by(&ana, "FLOW", "FLOW-1").await.is_empty());
    assert_eq!(
        backlog_blocked_by(&ana, "SANTI", "SANTI-2").await,
        ["SANTI-1"]
    );

    let flow_done = ana.status_id("FLOW", "Done").await;
    let santi_done = ana.status_id("SANTI", "Done").await;
    ana.post(
        "/api/projects/FLOW/issues/1/move",
        json!({ "status_id": flow_done }),
    )
    .await;
    ana.post(
        "/api/projects/SANTI/issues/1/move",
        json!({ "status_id": santi_done }),
    )
    .await;

    assert_eq!(board_blocked_by(&ana, "FLOW", "FLOW-2").await, ["OPS-1"]);
    assert!(board_blocked_by(&bob, "FLOW", "FLOW-2").await.is_empty());
    assert!(
        backlog_blocked_by(&ana, "SANTI", "SANTI-2")
            .await
            .is_empty()
    );
}
