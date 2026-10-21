mod common;

use std::fmt::Write as _;
use std::time::{Duration, Instant};

use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use common::{TestApp, body_json};
use serde_json::{Value, json};
use sqlx::PgPool;

const JIRA: &str = include_str!("fixtures/imports/jira.csv");
const LINEAR: &str = include_str!("fixtures/imports/linear.csv");
const BOUNDARY: &str = "santi-import-boundary";

fn multipart(file: &[u8], mapping: Option<&Value>) -> Vec<u8> {
    let mut body = format!(
        "--{BOUNDARY}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"export.csv\"\r\nContent-Type: text/csv\r\n\r\n"
    )
    .into_bytes();
    body.extend_from_slice(file);
    if let Some(mapping) = mapping {
        body.extend_from_slice(
            format!("\r\n--{BOUNDARY}\r\nContent-Disposition: form-data; name=\"mapping\"\r\n\r\n{mapping}")
                .as_bytes(),
        );
    }
    body.extend_from_slice(format!("\r\n--{BOUNDARY}--\r\n").as_bytes());
    body
}

async fn upload(app: &TestApp, uri: &str, body: Vec<u8>) -> (StatusCode, Value) {
    let request = Request::builder()
        .method(Method::POST)
        .uri(uri)
        .header(
            header::AUTHORIZATION,
            format!("Bearer {}", app.token.as_deref().unwrap()),
        )
        .header(
            header::CONTENT_TYPE,
            format!("multipart/form-data; boundary={BOUNDARY}"),
        )
        .body(Body::from(body))
        .unwrap();
    let response = app.send(request).await;
    let status = response.status();
    (status, body_json(response).await)
}

async fn preview(app: &TestApp, csv: &str) -> (StatusCode, Value) {
    upload(
        app,
        "/api/projects/SANTI/imports/preview",
        multipart(csv.as_bytes(), None),
    )
    .await
}

async fn import(app: &TestApp, csv: &str, mapping: &Value) -> (StatusCode, Value) {
    upload(
        app,
        "/api/projects/SANTI/imports",
        multipart(csv.as_bytes(), Some(mapping)),
    )
    .await
}

/// Ana administers SANTI (scrum); Bob is a plain member.
async fn team(pool: PgPool, board_type: &str) -> (TestApp, TestApp) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("SANTI", board_type).await;
    let bob = ana.another_user("bob@example.com").await;
    ana.add_member("SANTI", &bob, "member").await;
    (ana, bob)
}

async fn issue(app: &TestApp, number: i64) -> Value {
    let (status, issue) = app
        .get(&format!("/api/projects/SANTI/issues/{number}"))
        .await;
    assert_eq!(status, StatusCode::OK, "{issue}");
    issue
}

async fn sprints(app: &TestApp) -> Vec<Value> {
    let (status, sprints) = app.get("/api/projects/SANTI/sprints").await;
    assert_eq!(status, StatusCode::OK, "{sprints}");
    sprints.as_array().unwrap().clone()
}

async fn jira_mapping(app: &TestApp, bob: &TestApp) -> Value {
    json!({
        "statuses": {
            "In Progress": app.status_id("SANTI", "In Progress").await,
            "Done": app.status_id("SANTI", "Done").await,
            "Waiting": app.status_id("SANTI", "To Do").await,
        },
        "people": { "bob@example.com": bob.user_id, "Carol Smith": null },
        "sprints": { "Sprint 1": "closed", "Sprint 2": "future" },
        "types": { "Bug": "bug" },
    })
}

#[sqlx::test]
async fn preview_reads_a_jira_export_and_suggests_a_mapping(pool: PgPool) {
    let (ana, bob) = team(pool, "scrum").await;

    let (status, preview) = preview(&ana, JIRA).await;

    assert_eq!(status, StatusCode::OK, "{preview}");
    assert_eq!(preview["source"], "jira");
    assert_eq!(preview["row_count"], 5);
    let to_do = ana.status_id("SANTI", "To Do").await;
    let waiting = &preview["statuses"][2];
    assert_eq!(waiting["name"], "Waiting");
    assert_eq!(waiting["suggested_status_id"], to_do);
    let people = preview["people"].as_array().unwrap();
    let bob_found = people
        .iter()
        .find(|person| person["name"] == "bob@example.com");
    assert_eq!(bob_found.unwrap()["member_id"], bob.user_id);
    assert_eq!(preview["sprints"][0]["closed"], true);
    assert_eq!(preview["issue_types"][2]["suggested"], "subtask");
    assert_eq!(preview["problems"][1]["line"], 7);
}

#[sqlx::test]
async fn preview_refuses_files_that_are_not_exports(pool: PgPool) {
    let (ana, _) = team(pool, "scrum").await;

    let (unknown, problem) = preview(&ana, "name,email\nana,ana@example.com\n").await;
    let binary = upload(
        &ana,
        "/api/projects/SANTI/imports/preview",
        multipart(&[0xff, 0xfe, 0x00, 0x81], None),
    )
    .await
    .0;
    let big = vec![b'a'; 10 * 1024 * 1024 + 10];
    let too_large = upload(
        &ana,
        "/api/projects/SANTI/imports/preview",
        multipart(&big, None),
    )
    .await
    .0;
    let huge = vec![b'a'; 12 * 1024 * 1024];
    let over_limit = upload(
        &ana,
        "/api/projects/SANTI/imports/preview",
        multipart(&huge, None),
    )
    .await
    .0;
    let commas = vec![b','; 10 * 1024 * 1024 - 1];
    let (wide, wide_problem) = upload(
        &ana,
        "/api/projects/SANTI/imports/preview",
        multipart(&commas, None),
    )
    .await;
    let (not_multipart, _) = ana
        .post("/api/projects/SANTI/imports/preview", json!({}))
        .await;

    assert_eq!(unknown, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["type"], "urn:santi:error:validation");
    assert_eq!(problem["errors"][0]["field"], "file");
    assert_eq!(binary, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(too_large, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(over_limit, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(not_multipart, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(wide, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(
        wide_problem["errors"][0]["message"],
        "a row has more than 1000 columns"
    );
}

#[sqlx::test]
async fn only_admins_import(pool: PgPool) {
    let (ana, bob) = team(pool, "scrum").await;
    let mapping = jira_mapping(&ana, &bob).await;
    let stranger = ana.another_user("eve@example.com").await;

    let member_preview = preview(&bob, JIRA).await.0;
    let member_import = import(&bob, JIRA, &mapping).await.0;
    let stranger_preview = preview(&stranger, JIRA).await.0;
    let (member_unread, _) = bob
        .post("/api/projects/SANTI/imports/preview", json!({}))
        .await;
    let (member_unread_import, _) = bob.post("/api/projects/SANTI/imports", json!({})).await;

    assert_eq!(
        member_unread,
        StatusCode::FORBIDDEN,
        "refused before the body is read"
    );
    assert_eq!(member_unread_import, StatusCode::FORBIDDEN);
    assert_eq!(member_preview, StatusCode::FORBIDDEN);
    assert_eq!(member_import, StatusCode::FORBIDDEN);
    assert_eq!(stranger_preview, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn importing_a_jira_export_links_parents_keeps_dates_and_is_idempotent(pool: PgPool) {
    let (ana, bob) = team(pool, "scrum").await;
    let mapping = jira_mapping(&ana, &bob).await;

    let (status, result) = import(&ana, JIRA, &mapping).await;

    assert_eq!(status, StatusCode::OK, "{result}");
    assert_eq!(result["source"], "jira");
    assert_eq!(result["created"], 3);
    assert_eq!(result["skipped"], 0);
    assert_eq!(result["failed"], 2);
    let epic = issue(&ana, 1).await;
    let story = issue(&ana, 2).await;
    let subtask = issue(&ana, 3).await;
    assert_eq!(epic["issue_type"], "epic");
    assert_eq!(epic["summary"], "Checkout flow");
    assert_eq!(epic["priority"], "high");
    assert_eq!(epic["updated_at"], "2026-10-05T14:30:00Z");
    assert_eq!(story["parent_key"], "SANTI-1");
    assert_eq!(story["description"], "Line one\nline two with \"quotes\"");
    assert_eq!(story["labels"], json!(["payments", "web"]));
    assert_eq!(story["points"], 5.0);
    assert_eq!(story["assignee_id"], bob.user_id);
    assert_eq!(story["reporter_id"], ana.user_id);
    assert_eq!(story["created_at"], "2026-10-02T10:15:00Z");
    assert_eq!(story["updated_at"], "2026-10-06T16:45:00Z");
    assert!(story["done_at"].is_string());
    assert_eq!(subtask["issue_type"], "subtask");
    assert_eq!(subtask["parent_key"], "SANTI-2");
    assert_eq!(subtask["sprint_id"], story["sprint_id"]);
    assert!(epic["rank"].as_str() < story["rank"].as_str());
    assert!(story["rank"].as_str() < subtask["rank"].as_str());
    let sprints = sprints(&ana).await;
    let names: Vec<(&str, &str)> = sprints
        .iter()
        .map(|sprint| {
            (
                sprint["name"].as_str().unwrap(),
                sprint["state"].as_str().unwrap(),
            )
        })
        .collect();
    assert_eq!(names, [("Sprint 1", "closed"), ("Sprint 2", "future")]);
    let day_bounds = |field: &str| sprints[0][field].as_str().unwrap()[10..].to_string();
    assert_eq!(
        (day_bounds("starts_at"), day_bounds("ends_at")),
        ("T00:00:00Z".to_string(), "T23:59:00Z".to_string())
    );
    assert_eq!(story["sprint_id"], sprints[1]["id"]);
    let (_, comments) = ana.get("/api/projects/SANTI/issues/2/comments").await;
    assert_eq!(comments["items"][0]["body"], "Looks good");

    let (again, second) = import(&ana, JIRA, &mapping).await;

    assert_eq!(again, StatusCode::OK);
    assert_eq!(second["created"], 0);
    assert_eq!(second["skipped"], 3);
    assert_eq!(second["failed"], 2);
    assert_eq!(self::sprints(&ana).await.len(), 2);
    let next = ana
        .create_issue("SANTI", json!({ "summary": "after the import" }))
        .await;
    assert_eq!(next["number"], 4);
}

#[sqlx::test]
async fn importing_a_linear_export_nests_sub_issues(pool: PgPool) {
    let (ana, _) = team(pool, "scrum").await;
    let mapping = json!({
        "statuses": {
            "In Progress": ana.status_id("SANTI", "In Progress").await,
            "Todo": ana.status_id("SANTI", "To Do").await,
            "Canceled": ana.status_id("SANTI", "Done").await,
        },
        "sprints": { "Cycle 4": "closed", "Cycle Five": "future" },
    });

    let (status, result) = import(&ana, LINEAR, &mapping).await;

    assert_eq!(status, StatusCode::OK, "{result}");
    assert_eq!(result["created"], 3);
    let onboarding = issue(&ana, 1).await;
    let email = issue(&ana, 2).await;
    assert_eq!(onboarding["labels"], json!(["Feature", "Tech-debt"]));
    assert_eq!(onboarding["priority"], "urgent");
    assert_eq!(onboarding["sprint_id"], Value::Null);
    assert_eq!(email["issue_type"], "subtask");
    assert_eq!(email["parent_key"], "SANTI-1");
    assert_eq!(issue(&ana, 3).await["summary"], "Old cleanup");
}

#[sqlx::test]
async fn a_mapping_must_point_at_this_project(pool: PgPool) {
    let (ana, _) = team(pool.clone(), "kanban").await;
    let other = TestApp::signed_in(pool, "zoe@example.com").await;
    other.create_project("OTHER", "scrum").await;
    let foreign_status = other.status_id("OTHER", "Done").await;
    let mapping = json!({
        "statuses": { "Done": foreign_status },
        "people": { "bob@example.com": other.user_id },
        "sprints": { "Sprint 2": "future" },
    });

    let (status, problem) = import(&ana, JIRA, &mapping).await;
    let (malformed, _) = upload(
        &ana,
        "/api/projects/SANTI/imports",
        multipart(JIRA.as_bytes(), Some(&json!("not a mapping"))),
    )
    .await;
    let (missing, _) = upload(
        &ana,
        "/api/projects/SANTI/imports",
        multipart(JIRA.as_bytes(), None),
    )
    .await;

    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    let fields: Vec<&str> = problem["errors"]
        .as_array()
        .unwrap()
        .iter()
        .map(|error| error["field"].as_str().unwrap())
        .collect();
    assert_eq!(
        fields,
        [
            "mapping.statuses.Done",
            "mapping.people.bob@example.com",
            "mapping.sprints.Sprint 2"
        ]
    );
    assert_eq!(malformed, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(missing, StatusCode::UNPROCESSABLE_ENTITY);
}

/// D39: 5k rows (epics, stories under them, subtasks, comments) import in under 10 s.
#[sqlx::test]
async fn five_thousand_rows_import_within_budget(pool: PgPool) {
    let (ana, _) = team(pool, "scrum").await;
    let mut csv = String::from(
        "Issue key,Issue id,Issue Type,Summary,Status,Priority,Created,Updated,Labels,Labels,Sprint,Parent,Custom field (Story Points),Comment\n",
    );
    for number in 1..=5000 {
        let (issue_type, parent) = match number {
            1..=50 => ("Epic", String::new()),
            51..=4000 => ("Story", format!("BIG-{}", number % 50 + 1)),
            _ => ("Sub-task", format!("BIG-{}", number - 1000)),
        };
        let sprint = if number % 3 == 0 { "Sprint 9" } else { "" };
        writeln!(
            csv,
            "BIG-{number},{number},{issue_type},\"Row {number}, generated\",Done,High,01/Oct/26 9:00 AM,02/Oct/26 9:00 AM,alpha,beta,{sprint},{parent},3,02/Oct/26 9:00 AM;x;note {number}"
        )
        .unwrap();
    }
    let mapping = json!({
        "statuses": { "Done": ana.status_id("SANTI", "Done").await },
        "sprints": { "Sprint 9": "future" },
    });

    let started = Instant::now();
    let (status, result) = upload(
        &ana,
        "/api/projects/SANTI/imports",
        multipart(csv.as_bytes(), Some(&mapping)),
    )
    .await;
    let elapsed = started.elapsed();

    println!("imported 5000 rows in {elapsed:?}");
    assert_eq!(status, StatusCode::OK, "{result}");
    assert_eq!(result["created"], 5000);
    assert_eq!(result["failed"], 0);
    assert!(elapsed.as_secs_f64() < 10.0, "import took {elapsed:?}");
    assert_eq!(issue(&ana, 4001).await["parent_key"], "SANTI-3001");
}

/// Rows the schema would refuse fail on their own; the rest of their batch still imports.
#[sqlx::test]
async fn bad_rows_fail_alone(pool: PgPool) {
    let (ana, _) = team(pool, "scrum").await;
    let long_key = "K".repeat(256);
    let long_sprint = "S".repeat(150);
    let csv = format!(
        "Issue key,Summary,Status,Sprint\n\
         GOOD-1,First,Done,\n\
         {long_key},Key too long,Done,\n\
         GOOD-2,Has a \0 inside,Done,\n\
         GOOD-3,Long sprint,Done,{long_sprint}\n"
    );
    let sprint_name: String = long_sprint.chars().take(100).collect();
    let mapping = json!({
        "statuses": { "Done": ana.status_id("SANTI", "Done").await },
        "sprints": { sprint_name: "future" },
    });

    let (status, result) = import(&ana, &csv, &mapping).await;
    let (again, second) = import(&ana, &csv, &mapping).await;

    assert_eq!(status, StatusCode::OK, "{result}");
    assert_eq!(result["created"], 2);
    assert_eq!(result["failed"], 2);
    let messages: Vec<&str> = result["problems"]
        .as_array()
        .unwrap()
        .iter()
        .map(|problem| problem["message"].as_str().unwrap())
        .collect();
    assert!(
        messages.contains(&"issue key is longer than 255 characters; row skipped"),
        "{messages:?}"
    );
    assert!(
        messages.contains(&"the row contains a NUL character; row skipped"),
        "{messages:?}"
    );
    assert_eq!(issue(&ana, 2).await["summary"], "Long sprint");
    assert_eq!(again, StatusCode::OK, "{second}");
    assert_eq!(second["created"], 0);
    assert_eq!(second["skipped"], 2);
}

/// A sprint named `name` holding one issue, started and, when `close`, completed.
async fn ran_sprint(app: &TestApp, name: &str, close: bool) -> Value {
    let (status, sprint) = app
        .post("/api/projects/SANTI/sprints", json!({ "name": name }))
        .await;
    assert_eq!(status, StatusCode::CREATED, "{sprint}");
    app.create_issue(
        "SANTI",
        json!({ "summary": format!("in {name}"), "sprint_id": sprint["id"] }),
    )
    .await;
    let id = &sprint["id"];
    let (started, _) = app
        .post(
            &format!("/api/projects/SANTI/sprints/{id}/start"),
            json!({}),
        )
        .await;
    assert_eq!(started, StatusCode::OK);
    if close {
        let (closed, _) = app
            .post(
                &format!("/api/projects/SANTI/sprints/{id}/complete"),
                json!({ "open_issues": { "to": "backlog" } }),
            )
            .await;
        assert_eq!(closed, StatusCode::OK);
    }
    sprint
}

/// A sprint of the same name is reused only in the state the mapping asks for.
#[sqlx::test]
async fn sprint_names_are_reused_only_in_the_mapped_state(pool: PgPool) {
    let (ana, bob) = team(pool, "scrum").await;
    let old_one = ran_sprint(&ana, "Sprint 1", true).await;
    let old_two = ran_sprint(&ana, "Sprint 2", true).await;
    let running_two = ran_sprint(&ana, "Sprint 2", false).await;
    let mapping = jira_mapping(&ana, &bob).await;

    let (status, result) = import(&ana, JIRA, &mapping).await;

    assert_eq!(status, StatusCode::OK, "{result}");
    let sprints = sprints(&ana).await;
    let states: Vec<(&str, &str)> = sprints
        .iter()
        .map(|sprint| {
            (
                sprint["name"].as_str().unwrap(),
                sprint["state"].as_str().unwrap(),
            )
        })
        .collect();
    assert_eq!(
        states,
        [
            ("Sprint 1", "closed"),
            ("Sprint 2", "closed"),
            ("Sprint 2", "active"),
            ("Sprint 2", "future"),
        ]
    );
    let story = issue(&ana, 5).await;
    assert_eq!(story["summary"], "Pay with card");
    assert_eq!(story["sprint_id"], sprints[3]["id"]);
    assert_ne!(story["sprint_id"], running_two["id"]);
    assert_ne!(story["sprint_id"], old_two["id"]);
    assert_eq!(sprints[0]["id"], old_one["id"]);
}

/// Like planning an issue into a running sprint, an imported subtask that follows its parent into
/// one counts as added after the start.
#[sqlx::test]
async fn issues_imported_into_a_running_sprint_count_as_added(pool: PgPool) {
    let (ana, bob) = team(pool.clone(), "scrum").await;
    let mapping = jira_mapping(&ana, &bob).await;
    import(&ana, JIRA, &mapping).await;
    let story = issue(&ana, 2).await;
    let sprint = &story["sprint_id"];
    let (started, _) = ana
        .post(
            &format!("/api/projects/SANTI/sprints/{sprint}/start"),
            json!({}),
        )
        .await;
    assert_eq!(started, StatusCode::OK);
    let more =
        "Issue key,Issue Type,Summary,Status,Parent\nACME-6,Sub-task,Later subtask,Done,ACME-2\n";

    let (status, result) = import(&ana, more, &mapping).await;

    assert_eq!(status, StatusCode::OK, "{result}");
    let subtask = issue(&ana, 4).await;
    assert_eq!(subtask["sprint_id"], *sprint);
    let joined: Vec<bool> =
        sqlx::query_scalar("SELECT added_after_start FROM sprint_issue WHERE issue_id = $1")
            .bind(subtask["id"].as_i64().unwrap())
            .fetch_all(&pool)
            .await
            .unwrap();
    assert_eq!(joined, [true]);
}

/// `rows` Jira rows with `distinct` different statuses, types, people and sprints.
fn wide_export(rows: usize, distinct: usize) -> String {
    let mut csv = String::from("Issue key,Summary,Issue Type,Status,Assignee,Sprint,Sprint\n");
    for row in 0..rows {
        let value = row % distinct;
        writeln!(
            csv,
            "W-{row},Row {row},Type {value},Status {value},person{value}@example.com,Sprint {value},Sprint {}",
            (value + 1) % distinct
        )
        .unwrap();
    }
    csv
}

/// The preview's work stays off the async workers: `/health` answers while it runs.
async fn preview_beside_health(app: &TestApp, csv: String) -> (StatusCode, Value, Duration) {
    let started = Instant::now();
    let preview = tokio::spawn({
        let app = app.clone();
        async move { preview(&app, &csv).await }
    });
    while !preview.is_finished() {
        let asked = Instant::now();
        tokio::time::sleep(Duration::from_millis(20)).await;
        let (status, _) = app.get("/health").await;
        assert_eq!(status, StatusCode::OK);
        assert!(
            asked.elapsed() < Duration::from_millis(300),
            "/health waited {:?} behind the preview",
            asked.elapsed()
        );
    }
    let (status, body) = preview.await.unwrap();
    (status, body, started.elapsed())
}

#[sqlx::test]
async fn previews_of_large_files_stay_fast_and_off_the_workers(pool: PgPool) {
    let (ana, _) = team(pool, "scrum").await;

    let (status, preview, elapsed) = preview_beside_health(&ana, wide_export(40_000, 400)).await;

    println!("previewed 40k rows (400 of each) in {elapsed:?}");
    assert_eq!(status, StatusCode::OK, "{}", preview["errors"]);
    assert_eq!(preview["statuses"].as_array().unwrap().len(), 400);
    assert_eq!(preview["sprints"][0]["closed"], true);
    assert!(elapsed < Duration::from_secs(2), "preview took {elapsed:?}");
}

#[sqlx::test]
async fn files_with_too_many_different_values_are_refused_quickly(pool: PgPool) {
    let (ana, _) = team(pool, "scrum").await;

    let (status, problem, elapsed) = preview_beside_health(&ana, wide_export(40_000, 40_000)).await;

    assert_eq!(
        status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        problem["errors"]
    );
    assert_eq!(
        problem["errors"][0]["message"],
        "the file has more than 500 different statuses; split it or merge statuses first"
    );
    assert!(
        elapsed < Duration::from_secs(2),
        "refusing took {elapsed:?}"
    );
}

#[sqlx::test]
async fn imported_closed_sprint_has_completed_facts(pool: PgPool) {
    let (ana, _) = team(pool, "scrum").await;
    let csv = "Issue key,Summary,Status,Sprint,Custom field (Story Points)\n\
               OLD-1,Shipped,Done,Old sprint,3\n";
    let mapping = json!({
        "statuses": { "Done": ana.status_id("SANTI", "Done").await },
        "sprints": { "Old sprint": "closed" },
    });

    let (status, result) = import(&ana, csv, &mapping).await;

    assert_eq!(status, StatusCode::OK, "{result}");
    let sprint = &sprints(&ana).await[0];
    let (_, report) = ana
        .get(&format!(
            "/api/projects/SANTI/sprints/{}/report",
            sprint["id"]
        ))
        .await;
    let completed = &report["groups"][0];
    assert_eq!(completed["issues"][0]["key"], "SANTI-1");
    assert_eq!(completed["issues"][0]["points_at_start"], 3.0);
    assert_eq!(completed["issues"][0]["points_at_end"], 3.0);
    assert_eq!(report["committed"], 3.0);
    let (_, velocity) = ana.get("/api/projects/SANTI/reports/velocity").await;
    assert_eq!(velocity["sprints"][0]["completed"], 3.0);
    assert_eq!(velocity["average_completed"], 3.0);
}

/// RP-34: a closed sprint's facts are frozen; an import landing in a same-named native one adds none.
#[sqlx::test]
async fn importing_into_a_native_closed_sprint_keeps_its_report(pool: PgPool) {
    let (ana, _) = team(pool, "scrum").await;
    let native = ran_sprint(&ana, "Old sprint", true).await;
    let url = format!("/api/projects/SANTI/sprints/{}/report", native["id"]);
    let (_, before) = ana.get(&url).await;
    let (_, history_before) = ana.get("/api/projects/SANTI/reports/sprints").await;
    let csv = "Issue key,Summary,Status,Sprint,Custom field (Story Points)\n\
               OLD-1,Shipped,Done,Old sprint,3\n";
    let mapping = json!({
        "statuses": { "Done": ana.status_id("SANTI", "Done").await },
        "sprints": { "Old sprint": "closed" },
    });

    let (status, result) = import(&ana, csv, &mapping).await;

    assert_eq!(status, StatusCode::OK, "{result}");
    assert_eq!(issue(&ana, 2).await["sprint_id"], native["id"]);
    assert_eq!(ana.get(&url).await.1, before);
    assert_eq!(
        ana.get("/api/projects/SANTI/reports/sprints").await.1,
        history_before
    );
}
