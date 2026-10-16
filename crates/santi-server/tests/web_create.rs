mod common;

use axum::http::StatusCode;
use common::{PASSWORD, TestApp, form, htmx, location, page, session_cookie, text};
use sqlx::PgPool;

/// Ana with a scrum project SANTI and a kanban project FLOW, signed in on the browser.
async fn two_projects(pool: PgPool) -> (TestApp, String) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    ana.create_project("FLOW", "kanban").await;
    let body = format!("email=ana%40example.com&password={PASSWORD}");
    let cookie = session_cookie(&ana.send(form("/login", &body, None)).await);
    (ana, cookie)
}

#[sqlx::test]
async fn create_form_preselects_the_project_and_offers_its_fields(pool: PgPool) {
    let (ana, cookie) = two_projects(pool).await;
    ana.create_sprint("SANTI").await;

    let kanban = text(ana.send(page("/p/FLOW/issues/new", Some(&cookie))).await).await;
    let scrum = text(
        ana.send(htmx(page("/p/SANTI/issues/new", Some(&cookie))))
            .await,
    )
    .await;
    let board = text(ana.send(page("/p/FLOW/board", Some(&cookie))).await).await;

    assert!(kanban.contains("<html"));
    assert!(kanban.contains(r#"<option value="FLOW" selected>"#));
    for field in [
        "issue_type",
        "summary",
        "description",
        "assignee",
        "priority",
        "points",
    ] {
        assert!(kanban.contains(&format!(r#"name="{field}""#)), "{field}");
    }
    assert!(!kanban.contains(r#"name="sprint_id""#));
    assert!(!scrum.contains("<html"));
    assert!(scrum.contains(r#"<option value="SANTI" selected>"#));
    assert!(scrum.contains(r#"name="sprint_id""#));
    assert!(scrum.contains("Sprint 1"));
    assert!(board.contains(r#"id="create" href="/p/FLOW/issues/new""#));
}

#[sqlx::test]
async fn posting_the_form_creates_the_issue(pool: PgPool) {
    let (ana, cookie) = two_projects(pool).await;
    let me = ana.user_id;
    let body = format!(
        "project=FLOW&issue_type=bug&summary=Crash+on+save&description=Steps&assignee={me}&priority=high&points=2"
    );

    let plain = ana
        .send(form("/p/FLOW/issues/new", &body, Some(&cookie)))
        .await;
    let from_dialog = ana
        .send(htmx(form(
            "/p/FLOW/issues/new",
            "summary=Second&points=",
            Some(&cookie),
        )))
        .await;

    assert_eq!(plain.status(), StatusCode::SEE_OTHER);
    assert_eq!(location(&plain), "/p/FLOW/board");
    let (_, issue) = ana.get("/api/projects/FLOW/issues/1").await;
    assert_eq!(issue["summary"], "Crash on save");
    assert_eq!(issue["issue_type"], "bug");
    assert_eq!(issue["description"], "Steps");
    assert_eq!(issue["assignee_id"], me);
    assert_eq!(issue["priority"], "high");
    assert_eq!(issue["points"], 2.0);
    assert_eq!(from_dialog.status(), StatusCode::OK);
    assert_eq!(from_dialog.headers()["hx-refresh"], "true");
    let (_, second) = ana.get("/api/projects/FLOW/issues/2").await;
    assert_eq!(second["summary"], "Second");
    assert!(second["points"].is_null());
}

#[sqlx::test]
async fn bad_input_rerenders_the_form_with_the_errors(pool: PgPool) {
    let (ana, cookie) = two_projects(pool).await;

    let blank = ana
        .send(form(
            "/p/FLOW/issues/new",
            "summary=+&description=Keep+me",
            Some(&cookie),
        ))
        .await;
    let points = ana
        .send(htmx(form(
            "/p/FLOW/issues/new",
            "summary=Ok&points=many",
            Some(&cookie),
        )))
        .await;

    assert_eq!(blank.status(), StatusCode::UNPROCESSABLE_ENTITY);
    let html = text(blank).await;
    assert!(html.contains("Title must have 1 to 255 characters"));
    assert!(html.contains("Keep me"));
    assert_eq!(points.status(), StatusCode::UNPROCESSABLE_ENTITY);
    let fragment = text(points).await;
    assert!(!fragment.contains("<html"));
    assert!(fragment.contains("Points must be a number"));
}
