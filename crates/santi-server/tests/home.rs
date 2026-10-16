mod common;

use axum::http::{Method, StatusCode};
use common::{PASSWORD, TestApp, json_request};
use serde_json::{Value, json};
use sqlx::PgPool;

/// Ana owns WEB (scrum) and OPS (kanban); Bob is a member of WEB only.
async fn two_projects(pool: PgPool) -> (TestApp, TestApp) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    ana.create_project("WEB", "scrum").await;
    ana.create_project("OPS", "kanban").await;
    let (status, _) = ana
        .post(
            "/api/projects/WEB/members",
            json!({ "email": "bob@example.com", "role": "member" }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED);
    (ana, bob)
}

async fn view(app: &TestApp, name: &str) -> Value {
    let (status, page) = app.get(&format!("/api/me/issues?view={name}")).await;
    assert_eq!(status, StatusCode::OK, "{page}");
    page
}

fn keys(page: &Value) -> Vec<&str> {
    page["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|issue| issue["key"].as_str().unwrap())
        .collect()
}

async fn open_issue(app: &TestApp, email: &str, key: &str, number: i64) {
    let uri = format!("/api/projects/{key}/issues/{number}/view");
    assert_eq!(app.browser_post(email, &uri).await, StatusCode::NO_CONTENT);
}

async fn my_projects(app: &TestApp) -> Vec<Value> {
    let (status, projects) = app.get("/api/me/projects").await;
    assert_eq!(status, StatusCode::OK, "{projects}");
    projects.as_array().unwrap().clone()
}

#[sqlx::test]
async fn assigned_lists_open_issues_across_projects_newest_first(pool: PgPool) {
    let (ana, bob) = two_projects(pool).await;
    let me = json!({ "summary": "mine", "assignee_id": ana.user_id });
    ana.create_issue("WEB", me.clone()).await;
    ana.create_issue("OPS", me.clone()).await;
    ana.create_issue(
        "WEB",
        json!({ "summary": "Bob's", "assignee_id": bob.user_id }),
    )
    .await;
    ana.create_issue("WEB", me).await;
    let done = ana.status_id("WEB", "Done").await;
    ana.post(
        "/api/projects/WEB/issues/3/move",
        json!({ "status_id": done }),
    )
    .await;

    let page = view(&ana, "assigned").await;

    assert_eq!(keys(&page), ["OPS-1", "WEB-1"]);
    let row = &page["items"][0];
    assert_eq!(row["summary"], "mine");
    assert_eq!(row["issue_type"], "story");
    assert_eq!(row["status_category"], "todo");
    assert_eq!(row["project_key"], "OPS");
    assert_eq!(row["project_name"], "Project OPS");
    assert_eq!(row["assignee_name"], "ana@example.com");
    assert_eq!(row["starred"], false);
    assert!(row["at"].is_string());
    assert_eq!(keys(&view(&bob, "assigned").await), ["WEB-2"]);
}

#[sqlx::test]
async fn my_projects_carry_lead_star_and_open_assigned_count(pool: PgPool) {
    let (ana, bob) = two_projects(pool).await;
    ana.create_issue("OPS", json!({ "summary": "a", "assignee_id": ana.user_id }))
        .await;
    ana.create_issue("OPS", json!({ "summary": "b", "assignee_id": ana.user_id }))
        .await;

    let projects = my_projects(&ana).await;

    let ops = projects.iter().find(|project| project["key"] == "OPS");
    let ops = ops.unwrap();
    assert_eq!(ops["name"], "Project OPS");
    assert_eq!(ops["board_type"], "kanban");
    assert_eq!(ops["role"], "admin");
    assert_eq!(ops["lead_name"], "ana@example.com");
    assert_eq!(ops["starred"], false);
    assert_eq!(ops["open_assigned"], 2);
    let bobs = my_projects(&bob).await;
    assert_eq!(bobs.len(), 1);
    assert_eq!(bobs[0]["key"], "WEB");
    assert_eq!(bobs[0]["role"], "member");
    assert_eq!(bobs[0]["lead_name"], "ana@example.com");
}

#[sqlx::test]
async fn recently_visited_or_worked_projects_come_first(pool: PgPool) {
    let (ana, _bob) = two_projects(pool).await;
    ana.create_project("API", "scrum").await;
    ana.create_project("ZED", "scrum").await;
    let visit = "/api/projects/WEB/visit";
    assert_eq!(
        ana.browser_post("ana@example.com", visit).await,
        StatusCode::NO_CONTENT
    );
    ana.create_issue("OPS", json!({ "summary": "work" })).await;
    assert_eq!(ana.get("/api/projects/API").await.0, StatusCode::OK);
    let (status, _) = ana.post("/api/projects/ZED/visit", json!({})).await;
    assert_eq!(status, StatusCode::NO_CONTENT, "a token caller is ignored");

    let order: Vec<Value> = my_projects(&ana)
        .await
        .iter()
        .map(|project| project["key"].clone())
        .collect();

    assert_eq!(order, ["OPS", "WEB", "API", "ZED"]);
}

#[sqlx::test]
async fn visits_and_views_need_membership(pool: PgPool) {
    let (ana, bob) = two_projects(pool).await;
    ana.create_issue("OPS", json!({ "summary": "private" }))
        .await;
    ana.create_issue("WEB", json!({ "summary": "shared" }))
        .await;

    for uri in [
        "/api/projects/OPS/visit",
        "/api/projects/NOPE/visit",
        "/api/projects/OPS/issues/1/view",
        "/api/projects/WEB/issues/99/view",
    ] {
        assert_eq!(
            bob.browser_post("bob@example.com", uri).await,
            StatusCode::NOT_FOUND,
            "{uri}"
        );
    }
    let anonymous = TestApp {
        token: None,
        ..bob.clone()
    };
    let (status, _) = anonymous.post("/api/projects/WEB/visit", json!({})).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[sqlx::test]
async fn a_project_without_an_admin_still_lists(pool: PgPool) {
    let (ana, _bob) = two_projects(pool.clone()).await;
    sqlx::query("UPDATE member SET role = 'member' WHERE project_id = (SELECT id FROM project WHERE key = 'OPS')")
        .execute(&pool)
        .await
        .unwrap();

    let projects = my_projects(&ana).await;

    let ops = projects.iter().find(|project| project["key"] == "OPS");
    assert!(ops.unwrap()["lead_name"].is_null());
}

#[sqlx::test]
async fn stars_toggle_on_projects_and_issues(pool: PgPool) {
    let (ana, _bob) = two_projects(pool).await;
    ana.create_issue("WEB", json!({ "summary": "first" })).await;
    ana.create_issue("WEB", json!({ "summary": "second" }))
        .await;

    for key in ["WEB", "WEB-1", "WEB-2"] {
        let (status, body) = ana.post("/api/me/stars", json!({ "key": key })).await;
        assert_eq!(status, StatusCode::NO_CONTENT, "{key}: {body}");
    }
    let (status, _) = ana.post("/api/me/stars", json!({ "key": "WEB-1" })).await;
    assert_eq!(status, StatusCode::NO_CONTENT, "starring twice is a no-op");

    let starred = view(&ana, "starred").await;
    assert_eq!(keys(&starred), ["WEB-2", "WEB-1"]);
    assert_eq!(starred["items"][0]["starred"], true);
    let web = my_projects(&ana).await;
    let web = web.iter().find(|project| project["key"] == "WEB").unwrap();
    assert_eq!(web["starred"], true);

    for key in ["WEB", "WEB-2", "WEB-2"] {
        let (status, _) = ana.delete(&format!("/api/me/stars/{key}")).await;
        assert_eq!(status, StatusCode::NO_CONTENT, "{key}");
    }
    assert_eq!(keys(&view(&ana, "starred").await), ["WEB-1"]);
    let projects = my_projects(&ana).await;
    assert!(projects.iter().all(|project| project["starred"] == false));
}

#[sqlx::test]
async fn stars_need_membership_and_a_valid_key(pool: PgPool) {
    let (ana, bob) = two_projects(pool).await;
    ana.create_issue("OPS", json!({ "summary": "private" }))
        .await;

    for key in ["OPS", "OPS-1", "WEB-99", "NOPE", "NOPE-1"] {
        let (status, _) = bob.post("/api/me/stars", json!({ "key": key })).await;
        assert_eq!(status, StatusCode::NOT_FOUND, "{key}");
        let (status, _) = bob.delete(&format!("/api/me/stars/{key}")).await;
        assert_eq!(status, StatusCode::NOT_FOUND, "{key}");
    }
    for key in ["W", "WEB-", "WEB-x", "WEB-0", "-1", "", "WEB-007", "WEB-+5"] {
        let (status, _) = bob.post("/api/me/stars", json!({ "key": key })).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{key:?}");
    }
    let anonymous = TestApp {
        token: None,
        ..bob.clone()
    };
    let (status, _) = anonymous.get("/api/me/projects").await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    let (status, _) = anonymous.get("/api/me/issues").await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[sqlx::test]
async fn opening_an_issue_records_a_view_once_a_minute(pool: PgPool) {
    let (ana, bob) = two_projects(pool).await;
    for summary in ["one", "two", "read", "scripted"] {
        ana.create_issue("WEB", json!({ "summary": summary })).await;
    }

    for number in [1, 2, 1] {
        open_issue(&bob, "bob@example.com", "WEB", number).await;
    }
    assert_eq!(
        bob.get("/api/projects/WEB/issues/3").await.0,
        StatusCode::OK
    );
    let (status, _) = bob.post("/api/projects/WEB/issues/4/view", json!({})).await;
    assert_eq!(status, StatusCode::NO_CONTENT, "a token caller is ignored");

    assert_eq!(keys(&view(&bob, "viewed").await), ["WEB-2", "WEB-1"]);
    assert!(keys(&view(&ana, "viewed").await).is_empty());
    assert!(keys(&view(&bob, "worked").await).is_empty());
}

#[sqlx::test]
async fn worked_on_covers_create_edit_move_and_comment(pool: PgPool) {
    let (ana, bob) = two_projects(pool).await;
    for summary in ["created", "edited", "moved", "commented", "untouched"] {
        ana.create_issue("WEB", json!({ "summary": summary })).await;
    }
    bob.create_issue("WEB", json!({ "summary": "Bob's own" }))
        .await;
    let doing = ana.status_id("WEB", "In Progress").await;
    bob.patch(
        "/api/projects/WEB/issues/2",
        json!({ "summary": "edited!" }),
    )
    .await;
    bob.post(
        "/api/projects/WEB/issues/3/move",
        json!({ "status_id": doing }),
    )
    .await;
    let (status, _) = bob
        .post(
            "/api/projects/WEB/issues/4/comments",
            json!({ "body": "on it" }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED);

    assert_eq!(
        keys(&view(&bob, "worked").await),
        ["WEB-4", "WEB-3", "WEB-2", "WEB-6"]
    );
    assert_eq!(
        keys(&view(&ana, "worked").await),
        ["WEB-5", "WEB-4", "WEB-3", "WEB-2", "WEB-1"]
    );
}

#[sqlx::test]
async fn recommended_mixes_assigned_worked_viewed_and_starred(pool: PgPool) {
    let (ana, bob) = two_projects(pool).await;
    ana.create_issue("WEB", json!({ "summary": "viewed" }))
        .await;
    ana.create_issue(
        "WEB",
        json!({ "summary": "assigned", "assignee_id": bob.user_id }),
    )
    .await;
    ana.create_issue("WEB", json!({ "summary": "starred" }))
        .await;
    ana.create_issue("WEB", json!({ "summary": "ignored" }))
        .await;
    open_issue(&bob, "bob@example.com", "WEB", 1).await;
    bob.post("/api/me/stars", json!({ "key": "WEB-3" })).await;
    bob.create_issue("WEB", json!({ "summary": "worked" }))
        .await;

    let page = view(&bob, "recommended").await;

    assert_eq!(keys(&page), ["WEB-5", "WEB-3", "WEB-1", "WEB-2"]);
    assert_eq!(keys(&view(&bob, "recommended").await), keys(&page));
    let (status, default) = bob.get("/api/me/issues").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(keys(&default), keys(&page));
}

#[sqlx::test]
async fn leaving_a_project_hides_its_issues_and_project(pool: PgPool) {
    let (ana, bob) = two_projects(pool).await;
    ana.create_issue("WEB", json!({ "summary": "x", "assignee_id": bob.user_id }))
        .await;
    open_issue(&bob, "bob@example.com", "WEB", 1).await;
    bob.post("/api/me/stars", json!({ "key": "WEB-1" })).await;
    bob.post(
        "/api/projects/WEB/issues/1/comments",
        json!({ "body": "hi" }),
    )
    .await;
    for name in ["assigned", "starred", "viewed", "worked", "recommended"] {
        assert_eq!(keys(&view(&bob, name).await), ["WEB-1"], "{name}");
    }

    let (status, _) = ana
        .delete(&format!("/api/projects/WEB/members/{}", bob.user_id))
        .await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    for name in ["assigned", "starred", "viewed", "worked", "recommended"] {
        assert!(keys(&view(&bob, name).await).is_empty(), "{name}");
    }
    assert!(my_projects(&bob).await.is_empty());

    let (status, _) = ana
        .post(
            "/api/projects/WEB/members",
            json!({ "email": "bob@example.com", "role": "member" }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED);
    for name in ["starred", "viewed", "worked"] {
        assert!(
            keys(&view(&bob, name).await).is_empty(),
            "{name} is gone for good"
        );
    }
}

#[sqlx::test]
async fn lists_page_and_reject_bad_queries(pool: PgPool) {
    let (ana, _bob) = two_projects(pool).await;
    for index in 1..=3 {
        ana.create_issue("WEB", json!({ "summary": format!("issue {index}") }))
            .await;
    }

    let (_, first) = ana.get("/api/me/issues?view=worked&limit=2").await;
    assert_eq!(keys(&first), ["WEB-3", "WEB-2"]);
    let cursor = first["next_cursor"].as_i64().unwrap();
    let (_, second) = ana
        .get(&format!(
            "/api/me/issues?view=worked&limit=2&cursor={cursor}"
        ))
        .await;
    assert_eq!(keys(&second), ["WEB-1"]);
    assert!(second["next_cursor"].is_null());

    let (status, _) = ana.get("/api/me/issues?view=everything").await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    let (status, _) = ana.get("/api/me/issues?limit=0").await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
}

#[sqlx::test]
async fn erasing_the_account_drops_stars_and_history(pool: PgPool) {
    let (ana, bob) = two_projects(pool.clone()).await;
    ana.create_issue("WEB", json!({ "summary": "x" })).await;
    open_issue(&bob, "bob@example.com", "WEB", 1).await;
    bob.post("/api/me/stars", json!({ "key": "WEB-1" })).await;
    bob.post("/api/me/stars", json!({ "key": "WEB" })).await;

    let request = json_request(
        Method::DELETE,
        "/api/me",
        bob.token.as_deref(),
        Some(json!({ "password": PASSWORD })),
    );
    assert_eq!(bob.send(request).await.status(), StatusCode::NO_CONTENT);

    let left: i64 = sqlx::query_scalar(
        "SELECT (SELECT count(*) FROM issue_activity WHERE user_id = $1)
              + (SELECT count(*) FROM issue_star WHERE user_id = $1)
              + (SELECT count(*) FROM member WHERE user_id = $1 AND starred_at IS NOT NULL)",
    )
    .bind(bob.user_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(left, 0);
}
