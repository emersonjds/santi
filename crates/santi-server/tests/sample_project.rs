mod common;

use axum::http::StatusCode;
use common::TestApp;
use serde_json::{Value, json};
use sqlx::PgPool;

fn cards(section: &Value) -> Vec<&Value> {
    section["cards"].as_array().unwrap().iter().collect()
}

#[sqlx::test]
async fn the_sample_is_a_ready_scrum_project_for_the_caller(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;

    let (status, project) = ana.post("/api/sample-project", json!(null)).await;

    assert_eq!(status, StatusCode::CREATED, "{project}");
    assert_eq!(project["name"], "Sample: Mobile app");
    assert_eq!(project["board_type"], "scrum");
    assert_eq!(project["role"], "admin");
    let key = project["key"].as_str().unwrap();
    assert!(key.starts_with("MOB"), "{key}");

    let (_, board) = ana.get(&format!("/api/projects/{key}/board")).await;
    assert_eq!(board["sprint"]["state"], "active");
    let columns = board["columns"].as_array().unwrap();
    assert_eq!(columns.len(), 3);
    assert!(
        columns.iter().all(|column| !cards(column).is_empty()),
        "{board}"
    );

    let (_, backlog) = ana.get(&format!("/api/projects/{key}/backlog")).await;
    let sections = backlog["sections"].as_array().unwrap();
    assert_eq!(sections.len(), 3, "active sprint, future sprint, backlog");
    assert_eq!(sections[1]["sprint"]["state"], "future");
    assert!(sections[2]["sprint"].is_null());
    assert!(sections.iter().all(|section| !cards(section).is_empty()));
    assert_eq!(backlog["epics"].as_array().unwrap().len(), 2);

    let (_, issues) = ana
        .get(&format!("/api/projects/{key}/issues?limit=200"))
        .await;
    let issues = issues["items"].as_array().unwrap();
    let of_type = |kind: &str| {
        issues
            .iter()
            .filter(|issue| issue["issue_type"] == kind)
            .count()
    };
    assert!(of_type("subtask") >= 2);
    assert!(of_type("bug") >= 1);
    let epic_children = issues
        .iter()
        .filter(|issue| {
            issue["parent_key"]
                .as_str()
                .is_some_and(|parent| parent.starts_with(key))
        })
        .filter(|issue| issue["issue_type"] != "subtask")
        .count();
    assert!(epic_children >= 4);
    let assigned = issues
        .iter()
        .filter(|issue| issue["assignee_id"] == ana.user_id)
        .count();
    assert!(assigned >= 2);
    assert!(
        issues
            .iter()
            .any(|issue| issue["points"].as_f64().is_some())
    );

    let (_, labels) = ana.get(&format!("/api/projects/{key}/labels")).await;
    assert!(labels.as_array().unwrap().len() >= 3);
    let commented = issues.iter().filter(|issue| issue["issue_type"] == "story");
    let mut comments = 0;
    for issue in commented {
        let number = issue["number"].as_i64().unwrap();
        let (_, page) = ana
            .get(&format!("/api/projects/{key}/issues/{number}/comments"))
            .await;
        comments += page["items"].as_array().unwrap().len();
    }
    assert!(comments >= 2);
}

#[sqlx::test]
async fn a_second_click_opens_the_existing_sample(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let (_, first) = ana.post("/api/sample-project", json!(null)).await;

    let (status, second) = ana.post("/api/sample-project", json!(null)).await;
    let (_, projects) = ana.get("/api/projects").await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(second, first);
    assert_eq!(projects.as_array().unwrap().len(), 1);
}

#[sqlx::test]
async fn every_user_gets_their_own_sample(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;

    let (_, ana_sample) = ana.post("/api/sample-project", json!(null)).await;
    let (status, bob_sample) = bob.post("/api/sample-project", json!(null)).await;

    assert_eq!(status, StatusCode::CREATED);
    assert_ne!(ana_sample["key"], bob_sample["key"]);
}

#[sqlx::test]
async fn the_sample_needs_a_signed_in_caller(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let (status, _) = app.post("/api/sample-project", json!(null)).await;
    let (_, api) = app.get("/openapi.json").await;

    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert!(api["paths"]["/api/sample-project"]["post"].is_object());
}
