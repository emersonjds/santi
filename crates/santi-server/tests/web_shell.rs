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

async fn create_project(app: &TestApp, cookie: &str, key: &str, board_type: &str) -> String {
    let body = format!("key={key}&name=Project+{key}&board_type={board_type}");
    let response = app.send(form("/projects", &body, Some(cookie))).await;
    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    location(&response).to_string()
}

#[sqlx::test]
async fn project_root_redirects_members_to_the_board(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    let ana = sign_up(&app, "ana@example.com", "Ana").await;
    let bob = sign_up(&app, "bob@example.com", "Bob").await;
    let scrum_landing = create_project(&app, &ana, "SANTI", "scrum").await;
    let kanban_landing = create_project(&app, &ana, "FLOW", "kanban").await;

    let root = app.send(page("/p/SANTI", Some(&ana))).await;
    let board = app.send(page("/p/SANTI/board", Some(&ana))).await;
    let stranger = app.send(page("/p/SANTI", Some(&bob))).await;

    assert_eq!(root.status(), StatusCode::SEE_OTHER);
    assert_eq!(location(&root), "/p/SANTI/board");
    assert_eq!(board.status(), StatusCode::OK);
    assert_eq!(stranger.status(), StatusCode::NOT_FOUND);
    assert_eq!(scrum_landing, "/p/SANTI/backlog");
    assert_eq!(kanban_landing, "/p/FLOW/board");
}

#[sqlx::test]
async fn project_navigation_offers_backlog_only_on_scrum_and_no_settings_yet(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    let ana = sign_up(&app, "ana@example.com", "Ana").await;
    create_project(&app, &ana, "SANTI", "scrum").await;
    create_project(&app, &ana, "FLOW", "kanban").await;

    let scrum = text(app.send(page("/p/SANTI/board", Some(&ana))).await).await;
    let kanban = text(app.send(page("/p/FLOW/board", Some(&ana))).await).await;

    assert!(scrum.contains(r#"href="/p/SANTI/backlog""#));
    assert!(!kanban.contains("/p/FLOW/backlog"));
    assert!(!scrum.contains("/settings"));
    assert!(!kanban.contains("/settings"));
}

#[sqlx::test]
async fn the_open_view_is_marked_current_in_tabs_and_sidebar(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    let ana = sign_up(&app, "ana@example.com", "Ana").await;
    create_project(&app, &ana, "SANTI", "scrum").await;

    let board = text(app.send(page("/p/SANTI/board", Some(&ana))).await).await;
    let backlog = text(app.send(page("/p/SANTI/backlog", Some(&ana))).await).await;

    let board_current = r#"href="/p/SANTI/board" aria-current="page""#;
    let backlog_current = r#"href="/p/SANTI/backlog" aria-current="page""#;
    assert_eq!(board.matches(board_current).count(), 2);
    assert!(!board.contains(backlog_current));
    assert_eq!(backlog.matches(backlog_current).count(), 2);
    assert!(!backlog.contains(board_current));
    assert!(board.contains(r#"aria-label="Breadcrumb""#));
    assert!(board.contains("Scrum"));
}

#[sqlx::test]
async fn create_button_opens_the_create_form_of_the_current_project(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    let ana = sign_up(&app, "ana@example.com", "Ana").await;

    let empty_home = text(app.send(page("/", Some(&ana))).await).await;
    create_project(&app, &ana, "SANTI", "scrum").await;
    create_project(&app, &ana, "FLOW", "kanban").await;
    let home = text(app.send(page("/", Some(&ana))).await).await;
    let scrum = text(app.send(page("/p/SANTI/board", Some(&ana))).await).await;
    let kanban = text(app.send(page("/p/FLOW/board", Some(&ana))).await).await;

    assert!(empty_home.contains(r#"id="create" href="/projects/new""#));
    assert!(home.contains(r#"id="create" href="/p/FLOW/issues/new""#));
    assert!(scrum.contains(r#"id="create" href="/p/SANTI/issues/new""#));
    assert!(kanban.contains(r#"id="create" href="/p/FLOW/issues/new""#));
}

#[sqlx::test]
async fn search_sits_in_the_top_bar_on_project_pages_only(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    let ana = sign_up(&app, "ana@example.com", "Ana").await;
    create_project(&app, &ana, "SANTI", "scrum").await;

    let home = text(app.send(page("/", Some(&ana))).await).await;
    let board = text(app.send(page("/p/SANTI/board", Some(&ana))).await).await;

    assert!(!home.contains(r#"role="search""#));
    assert!(board.contains(r#"action="/p/SANTI/search""#));
    assert!(board.contains(r#"placeholder="Search SANTI""#));
    assert!(board.contains("Sign out"));
}

#[sqlx::test]
async fn stylesheet_carries_the_brand_tokens(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    let path = format!("/static/{}/app.css", env!("CARGO_PKG_VERSION"));

    let css = text(app.send(page(&path, None)).await).await.to_lowercase();

    assert!(css.contains("#4c35d2"));
    assert!(css.contains("--color-primary"));
}

#[sqlx::test]
async fn pages_link_a_favicon_that_is_served(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    let ana = sign_up(&app, "ana@example.com", "Ana").await;
    let path = concat!("/static/", env!("CARGO_PKG_VERSION"), "/favicon.svg");

    let home = text(app.send(page("/", Some(&ana))).await).await;
    let icon = app.send(page(path, None)).await;

    assert!(home.contains(&format!(
        r#"<link rel="icon" href="{path}" type="image/svg+xml">"#
    )));
    assert_eq!(icon.status(), StatusCode::OK);
    assert_eq!(icon.headers()["content-type"], "image/svg+xml");
    assert!(text(icon).await.starts_with("<svg"));
}

#[sqlx::test]
async fn home_rows_show_each_project_board_type(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    let ana = sign_up(&app, "ana@example.com", "Ana").await;
    create_project(&app, &ana, "SANTI", "scrum").await;
    create_project(&app, &ana, "FLOW", "kanban").await;

    let home = text(app.send(page("/", Some(&ana))).await).await;

    assert!(home.contains(r#"<div class="max-w-5xl">"#));
    assert!(home.contains(r#"title="Board type">Scrum</span>"#));
    assert!(home.contains(r#"title="Board type">Kanban</span>"#));
}
