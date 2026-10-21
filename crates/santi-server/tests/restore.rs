mod common;

use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use common::{TestApp, body_json};
use serde_json::{Value, json};
use sqlx::PgPool;

const RESTORE: &str = "/api/projects/restore";

/// SHOP: 4 columns, an unmapped status, a closed and an active sprint, an epic with a story and a
/// subtask, comments (one edited) and labels; Bob is a member and the story's assignee.
async fn shop(pool: PgPool) -> (TestApp, TestApp) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    ana.create_project("SHOP", "scrum").await;
    ana.add_member("SHOP", &bob, "member").await;
    let (status, review) = ana
        .post(
            "/api/projects/SHOP/board/columns",
            json!({ "name": "Review", "new_status": "in_progress" }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{review}");
    let (status, body) = ana
        .post(
            "/api/projects/SHOP/statuses",
            json!({ "name": "Blocked", "category": "todo" }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");

    let first = ana.create_sprint("SHOP").await;
    let second = ana.create_sprint("SHOP").await;
    let done = ana.status_id("SHOP", "Done").await;
    ana.create_issue(
        "SHOP",
        json!({ "summary": "Checkout", "issue_type": "epic", "labels": ["web"] }),
    )
    .await;
    ana.create_issue(
        "SHOP",
        json!({ "summary": "Pay by card", "parent": "SHOP-1", "sprint_id": first["id"],
                "assignee_id": bob.user_id, "points": 3, "labels": ["web", "pay"], "priority": "high" }),
    )
    .await;
    ana.create_issue(
        "SHOP",
        json!({ "summary": "Card form", "issue_type": "subtask", "parent": "SHOP-2" }),
    )
    .await;
    ana.create_issue(
        "SHOP",
        json!({ "summary": "Shipped already", "sprint_id": first["id"], "status_id": done, "points": 1 }),
    )
    .await;
    ana.create_issue(
        "SHOP",
        json!({ "summary": "Wish list", "issue_type": "bug", "description": "Some *text*" }),
    )
    .await;
    let (status, comment) = ana
        .post(
            "/api/projects/SHOP/issues/2/comments",
            json!({ "body": "First draft" }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{comment}");
    let (status, body) = ana
        .patch(
            &format!("/api/projects/SHOP/issues/2/comments/{}", comment["id"]),
            json!({ "body": "Edited draft" }),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let (status, body) = bob
        .post(
            "/api/projects/SHOP/issues/1/comments",
            json!({ "body": "Looks good" }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");

    for (sprint, open_issues) in [
        (&first, json!({ "to": "sprint", "sprint_id": second["id"] })),
        (&second, Value::Null),
    ] {
        let start = format!("/api/projects/SHOP/sprints/{}/start", sprint["id"]);
        let (status, body) = ana.post(&start, json!({})).await;
        assert_eq!(status, StatusCode::OK, "{body}");
        if open_issues.is_null() {
            break;
        }
        let complete = format!("/api/projects/SHOP/sprints/{}/complete", sprint["id"]);
        let (status, body) = ana
            .post(&complete, json!({ "open_issues": open_issues }))
            .await;
        assert_eq!(status, StatusCode::OK, "{body}");
    }
    (ana, bob)
}

async fn export_of(app: &TestApp, key: &str) -> Value {
    let (status, export) = app.get("/api/me/export").await;
    assert_eq!(status, StatusCode::OK, "{export}");
    let projects = export["projects"].as_array().unwrap();
    projects
        .iter()
        .find(|project| project["project"]["key"] == key)
        .unwrap()
        .clone()
}

async fn purge(app: &TestApp, key: &str) {
    let (status, body) = app
        .post(&format!("/api/projects/{key}/trash"), json!(null))
        .await;
    assert_eq!(status, StatusCode::NO_CONTENT, "{body}");
    let (status, body) = app.delete(&format!("/api/projects/{key}")).await;
    assert_eq!(status, StatusCode::NO_CONTENT, "{body}");
}

/// Ids are new on every instance; issues come back in insert order.
fn comparable(mut value: Value) -> Value {
    fn strip(value: &mut Value) {
        match value {
            Value::Object(fields) => {
                for id in ["id", "status_id", "sprint_id", "column_id"] {
                    fields.remove(id);
                }
                fields.values_mut().for_each(strip);
            }
            Value::Array(items) => items.iter_mut().for_each(strip),
            _ => {}
        }
    }
    value["issues"]
        .as_array_mut()
        .unwrap()
        .sort_by_key(|issue| issue["number"].as_i64());
    strip(&mut value);
    value
}

async fn send_raw(app: &TestApp, body: Vec<u8>) -> (StatusCode, Value) {
    let request = Request::builder()
        .method(Method::POST)
        .uri(RESTORE)
        .header(
            header::AUTHORIZATION,
            format!("Bearer {}", app.token.as_deref().unwrap()),
        )
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(body))
        .unwrap();
    let response = app.send(request).await;
    let status = response.status();
    (status, body_json(response).await)
}

#[sqlx::test]
async fn a_restored_project_exports_like_the_original(pool: PgPool) {
    let (ana, _bob) = shop(pool).await;
    let original = export_of(&ana, "SHOP").await;
    assert_eq!(original["board"]["columns"].as_array().unwrap().len(), 4);
    assert_eq!(original["board"]["unmapped"][0]["name"], "Blocked");
    purge(&ana, "SHOP").await;

    let (status, restored) = ana.post(RESTORE, original.clone()).await;

    assert_eq!(status, StatusCode::CREATED, "{restored}");
    assert_eq!(restored["project"]["key"], "SHOP");
    assert_eq!(restored["project"]["role"], "admin");
    assert_eq!(
        (
            &restored["issues"],
            &restored["sprints"],
            &restored["comments"]
        ),
        (&json!(5), &json!(2), &json!(2))
    );
    assert_eq!(restored["problems"], json!([]));
    assert!(
        restored["not_restored"]
            .as_str()
            .unwrap()
            .contains("ttachments")
    );
    let again = export_of(&ana, "SHOP").await;
    assert_eq!(comparable(again), comparable(original));

    let created = ana
        .create_issue("SHOP", json!({ "summary": "After the restore" }))
        .await;
    assert_eq!(
        created["key"], "SHOP-6",
        "numbers continue after the file's"
    );
    let (status, report) = ana.get("/api/projects/SHOP/backlog").await;
    assert_eq!(status, StatusCode::OK, "{report}");
}

#[sqlx::test]
async fn restoring_a_key_that_exists_changes_nothing(pool: PgPool) {
    let (ana, _bob) = shop(pool).await;
    let original = export_of(&ana, "SHOP").await;
    ana.post("/api/projects/SHOP/trash", json!(null)).await;

    let (trashed, problem) = ana.post(RESTORE, original.clone()).await;
    let (_, body) = ana.post("/api/projects/SHOP/restore", json!(null)).await;
    let (live, _) = ana.post(RESTORE, original.clone()).await;

    assert_eq!(trashed, StatusCode::CONFLICT, "{body}");
    assert_eq!(problem["type"], "urn:santi:error:project-exists");
    assert!(problem["detail"].as_str().unwrap().contains("SHOP"));
    assert_eq!(live, StatusCode::CONFLICT);
    assert_eq!(
        comparable(export_of(&ana, "SHOP").await),
        comparable(original)
    );
}

#[sqlx::test]
async fn people_missing_here_give_way_to_the_caller(pool: PgPool) {
    let (ana, bob) = shop(pool).await;
    let mut file = export_of(&ana, "SHOP").await;
    purge(&ana, "SHOP").await;
    let gone = 987_654;
    file["issues"][1]["reporter_id"] = json!(gone);
    file["comments"][1]["author_id"] = json!(gone);
    file["members"] = json!([{ "user_id": gone, "email": "x@example.com", "display_name": "X", "role": "admin" }]);
    let carol = ana.another_user("carol@example.com").await;

    let (status, restored) = carol.post(RESTORE, file.clone()).await;

    assert_eq!(status, StatusCode::CREATED, "{restored}");
    assert_eq!(restored["project"]["role"], "admin");
    let keys: Vec<&str> = restored["problems"]
        .as_array()
        .unwrap()
        .iter()
        .map(|problem| problem["issue_key"].as_str().unwrap())
        .collect();
    assert_eq!(keys, ["SHOP-2", "SHOP-1"]);
    let story = carol.get("/api/projects/SHOP/issues/2").await.1;
    assert_eq!(story["reporter_id"], carol.user_id);
    assert_eq!(story["assignee_id"], bob.user_id, "Bob still exists");
    let (status, _) = ana.get("/api/projects/SHOP").await;
    assert_eq!(
        status,
        StatusCode::NOT_FOUND,
        "Ana was not in the file's members"
    );
    let (status, _) = bob.get("/api/projects/SHOP").await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn a_file_that_is_not_a_project_export_is_refused(pool: PgPool) {
    let (ana, _bob) = shop(pool.clone()).await;
    let mut file = export_of(&ana, "SHOP").await;
    purge(&ana, "SHOP").await;

    let (not_json, problem) = send_raw(&ana, b"not json".to_vec()).await;
    assert_eq!(not_json, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
    assert_eq!(problem["errors"][0]["field"], "body");
    let (wrong, problem) = ana.post(RESTORE, json!({ "project": 5 })).await;
    assert_eq!(wrong, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
    assert_eq!(problem["errors"][0]["field"], "project");
    file["issues"][2]["status_name"] = json!("Nowhere");
    let (unknown, problem) = ana.post(RESTORE, file).await;
    assert_eq!(unknown, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
    assert_eq!(problem["errors"][0]["field"], "issues[2].status_name");
    let (huge, _) = send_raw(&ana, vec![b' '; 50 * 1024 * 1024 + 1]).await;
    assert_eq!(huge, StatusCode::PAYLOAD_TOO_LARGE);
    let (anonymous, _) = TestApp::anonymous(pool).post(RESTORE, json!({})).await;
    assert_eq!(anonymous, StatusCode::UNAUTHORIZED);
    let (status, _) = ana.get("/api/projects/SHOP").await;
    assert_eq!(status, StatusCode::NOT_FOUND, "nothing was written");
}

#[sqlx::test]
async fn a_kanban_board_keeps_its_limits(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("FLOW", "kanban").await;
    let doing = ana.column_id("FLOW", "In Progress").await;
    let (status, body) = ana
        .put(
            &format!("/api/projects/FLOW/board/columns/{doing}"),
            json!({ "name": "Doing", "wip_limit": 3 }),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let (status, body) = ana
        .put(
            "/api/projects/FLOW/board/settings",
            json!({ "done_window_days": 30 }),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    ana.create_issue("FLOW", json!({ "summary": "Only card" }))
        .await;
    let original = export_of(&ana, "FLOW").await;
    purge(&ana, "FLOW").await;

    let (status, restored) = ana.post(RESTORE, original.clone()).await;

    assert_eq!(status, StatusCode::CREATED, "{restored}");
    assert_eq!(original["board"]["columns"][1]["wip_limit"], 3);
    assert_eq!(
        comparable(export_of(&ana, "FLOW").await),
        comparable(original)
    );
}
