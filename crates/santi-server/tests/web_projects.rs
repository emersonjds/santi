mod common;

use axum::http::StatusCode;
use common::{PASSWORD, TestApp, form, location, page, session_cookie, text};
use sqlx::PgPool;

async fn sign_up(app: &TestApp, email: &str, name: &str) -> String {
    let body = format!("email={email}&display_name={name}&password={PASSWORD}");
    let response = app.send(form("/register", &body, None)).await;
    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    session_cookie(&response)
}

async fn create_project(app: &TestApp, cookie: &str, key: &str, name: &str) {
    let body = format!("key={key}&name={name}&board_type=scrum");
    let response = app.send(form("/projects", &body, Some(cookie))).await;
    assert_eq!(response.status(), StatusCode::SEE_OTHER);
}

/// Creates an invite on the project page and returns the invite link path.
async fn invite_link(app: &TestApp, cookie: &str, key: &str) -> String {
    let uri = format!("/p/{key}/invites");
    let response = app.send(form(&uri, "role=member", Some(cookie))).await;
    assert_eq!(response.status(), StatusCode::CREATED);
    let html = text(response).await;
    let start = html.find("/invites/").expect("invite link shown");
    let end = start + html[start..].find('"').unwrap();
    html[start..end].to_string()
}

#[sqlx::test]
async fn new_project_page_renders_a_form(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    let cookie = sign_up(&app, "ana@example.com", "Ana").await;

    let html = text(app.send(page("/projects/new", Some(&cookie))).await).await;

    assert!(html.contains(r#"action="/projects""#));
    assert!(html.contains(r#"name="name""#));
    assert!(html.contains(r#"name="key""#));
    assert!(html.contains(r#"name="board_type""#));
}

#[sqlx::test]
async fn creating_a_project_opens_its_page(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    let cookie = sign_up(&app, "ana@example.com", "Ana").await;
    let body = "key=santi&name=Santi+Tracker&board_type=kanban";

    let response = app.send(form("/projects", body, Some(&cookie))).await;

    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(location(&response), "/p/SANTI");
}

#[sqlx::test]
async fn bad_project_input_rerenders_with_message_and_typed_values(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    let cookie = sign_up(&app, "ana@example.com", "Ana").await;

    let response = app
        .send(form(
            "/projects",
            "key=1X&name=Santi&board_type=scrum",
            Some(&cookie),
        ))
        .await;

    assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
    let html = text(response).await;
    assert!(html.contains("starting with a letter"));
    assert!(html.contains(r#"value="1X""#));
    assert!(html.contains(r#"value="Santi""#));
}

#[sqlx::test]
async fn taken_key_rerenders_the_project_form(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    let cookie = sign_up(&app, "ana@example.com", "Ana").await;
    create_project(&app, &cookie, "SANTI", "Santi").await;

    let response = app
        .send(form(
            "/projects",
            "key=santi&name=Other&board_type=scrum",
            Some(&cookie),
        ))
        .await;

    assert_eq!(response.status(), StatusCode::CONFLICT);
    assert!(text(response).await.contains("is already used"));
}

#[sqlx::test]
async fn home_and_sidebar_list_my_projects(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    let cookie = sign_up(&app, "ana@example.com", "Ana").await;
    create_project(&app, &cookie, "SANTI", "Santi+Tracker").await;

    let html = text(app.send(page("/", Some(&cookie))).await).await;

    assert!(html.contains("Santi Tracker"));
    assert!(html.contains(r#"href="/p/SANTI""#));
    assert!(html.contains(r#"href="/projects/new""#));
    assert!(html.contains(r#"id="sidebar""#));
    assert!(!html.contains("No projects yet"));
}

#[sqlx::test]
async fn project_page_shows_members_and_the_invite_form_to_admins(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    let cookie = sign_up(&app, "ana@example.com", "Ana+Lima").await;
    create_project(&app, &cookie, "SANTI", "Santi+Tracker").await;

    let response = app.send(page("/p/SANTI", Some(&cookie))).await;

    assert_eq!(response.status(), StatusCode::OK);
    let html = text(response).await;
    assert!(html.contains("Santi Tracker"));
    assert!(html.contains("Board coming next"));
    assert!(html.contains("Ana Lima"));
    assert!(html.contains("Admin"));
    assert!(html.contains(r#"action="/p/SANTI/invites""#));
    assert!(html.contains(r#"aria-current="page""#));
}

#[sqlx::test]
async fn invite_link_lets_another_user_join_as_member(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    let ana = sign_up(&app, "ana@example.com", "Ana").await;
    let bob = sign_up(&app, "bob@example.com", "Bob").await;
    create_project(&app, &ana, "SANTI", "Santi").await;
    let link = invite_link(&app, &ana, "SANTI").await;

    let join_page = text(app.send(page(&link, Some(&bob))).await).await;
    let joined = app.send(form(&link, "", Some(&bob))).await;
    let project = text(app.send(page("/p/SANTI", Some(&bob))).await).await;
    let reused = app.send(form(&link, "", Some(&bob))).await;

    assert!(join_page.contains(&format!(r#"action="{link}""#)));
    assert_eq!(joined.status(), StatusCode::SEE_OTHER);
    assert_eq!(location(&joined), "/p/SANTI");
    assert!(project.contains("Bob"));
    assert!(!project.contains(r#"action="/p/SANTI/invites""#));
    assert_eq!(reused.status(), StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn strangers_get_not_found_and_anonymous_visitors_sign_in(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    let ana = sign_up(&app, "ana@example.com", "Ana").await;
    let bob = sign_up(&app, "bob@example.com", "Bob").await;
    create_project(&app, &ana, "SANTI", "Santi").await;

    let stranger = app.send(page("/p/SANTI", Some(&bob))).await;
    let unknown = app.send(page("/p/NOPE", Some(&ana))).await;
    let stranger_invite = app
        .send(form("/p/SANTI/invites", "role=member", Some(&bob)))
        .await;
    let anonymous = app.send(page("/p/SANTI", None)).await;

    assert_eq!(stranger.status(), StatusCode::NOT_FOUND);
    assert_eq!(unknown.status(), StatusCode::NOT_FOUND);
    assert_eq!(stranger_invite.status(), StatusCode::NOT_FOUND);
    assert_eq!(location(&anonymous), "/login");
}
