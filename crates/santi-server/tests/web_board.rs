mod common;

use axum::http::StatusCode;
use common::{PASSWORD, TestApp, form, htmx, location, page, session_cookie, text};
use serde_json::json;
use sqlx::PgPool;

/// Ana with project SANTI: an API client for setup and a browser cookie for the pages.
async fn board_owner(pool: PgPool) -> (TestApp, String) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("SANTI", "kanban").await;
    let body = format!("email=ana%40example.com&password={PASSWORD}");
    let response = ana.send(form("/login", &body, None)).await;
    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    let cookie = session_cookie(&response);
    (ana, cookie)
}

/// Card keys of one column, top to bottom, as the board HTML lists them.
fn column_keys(html: &str, column_id: i64) -> Vec<String> {
    let start = html
        .find(&format!(r#"data-column="{column_id}""#))
        .expect("column on the board");
    let column = &html[start..];
    let column = &column[..column.find("</section>").unwrap()];
    column
        .split(r#"data-key=""#)
        .skip(1)
        .map(|rest| rest[..rest.find('"').unwrap()].to_string())
        .collect()
}

async fn board_with_issues(pool: PgPool, count: usize) -> (TestApp, String) {
    let (ana, cookie) = board_owner(pool).await;
    for index in 1..=count {
        ana.create_issue("SANTI", json!({ "summary": format!("issue {index}") }))
            .await;
    }
    (ana, cookie)
}

#[sqlx::test]
async fn cards_are_draggable_and_carry_a_move_to_control(pool: PgPool) {
    let (ana, cookie) = board_with_issues(pool, 1).await;

    let html = text(ana.send(page("/p/SANTI/board", Some(&cookie))).await).await;

    assert!(html.contains(r#"id="board""#));
    assert!(html.contains(r#"draggable="true""#));
    assert!(html.contains(r#"data-key="SANTI-1""#));
    assert!(html.contains(r#"data-move="/p/SANTI/issues/1/move""#));
    assert!(html.contains(r#"action="/p/SANTI/issues/1/move""#));
    assert!(html.contains(r#"name="column_id""#));
    assert!(html.contains(r#"name="place""#));
    assert!(html.contains(r#"action="/p/SANTI/search""#));
}

#[sqlx::test]
async fn dropping_a_card_moves_it_and_the_order_survives_a_reload(pool: PgPool) {
    let (ana, cookie) = board_with_issues(pool, 3).await;
    let todo = ana.column_id("SANTI", "To Do").await;
    let doing = ana.column_id("SANTI", "In Progress").await;
    let in_progress = ana.status_id("SANTI", "In Progress").await;

    let first = ana
        .send(htmx(form(
            "/p/SANTI/issues/3/move",
            &format!("column_id={doing}"),
            Some(&cookie),
        )))
        .await;
    let second = ana
        .send(htmx(form(
            "/p/SANTI/issues/1/move",
            &format!("column_id={doing}&before=SANTI-3"),
            Some(&cookie),
        )))
        .await;

    assert_eq!(first.status(), StatusCode::OK);
    assert_eq!(second.status(), StatusCode::OK);
    let fragment = text(second).await;
    assert!(!fragment.contains("<html"));
    assert_eq!(column_keys(&fragment, doing), ["SANTI-1", "SANTI-3"]);
    let html = text(ana.send(page("/p/SANTI/board", Some(&cookie))).await).await;
    assert_eq!(column_keys(&html, doing), ["SANTI-1", "SANTI-3"]);
    assert_eq!(column_keys(&html, todo), ["SANTI-2"]);
    let (_, issue) = ana.get("/api/projects/SANTI/issues/1").await;
    assert_eq!(issue["status_id"], in_progress);
}

#[sqlx::test]
async fn dropping_between_cards_of_the_same_column_reorders_them(pool: PgPool) {
    let (ana, cookie) = board_with_issues(pool, 3).await;
    let todo = ana.column_id("SANTI", "To Do").await;

    let response = ana
        .send(htmx(form(
            "/p/SANTI/issues/1/move",
            &format!("column_id={todo}&after=SANTI-2"),
            Some(&cookie),
        )))
        .await;

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        column_keys(&text(response).await, todo),
        ["SANTI-2", "SANTI-1", "SANTI-3"]
    );
}

#[sqlx::test]
async fn move_to_form_places_the_card_at_the_top_or_bottom(pool: PgPool) {
    let (ana, cookie) = board_with_issues(pool, 3).await;
    let todo = ana.column_id("SANTI", "To Do").await;

    let top = ana
        .send(form(
            "/p/SANTI/issues/3/move",
            &format!("column_id={todo}&place=top"),
            Some(&cookie),
        ))
        .await;
    let after_top = text(ana.send(page("/p/SANTI/board", Some(&cookie))).await).await;
    ana.send(form(
        "/p/SANTI/issues/1/move",
        &format!("column_id={todo}&place=bottom"),
        Some(&cookie),
    ))
    .await;
    let after_bottom = text(ana.send(page("/p/SANTI/board", Some(&cookie))).await).await;

    assert_eq!(top.status(), StatusCode::SEE_OTHER);
    assert_eq!(location(&top), "/p/SANTI/board");
    assert_eq!(
        column_keys(&after_top, todo),
        ["SANTI-3", "SANTI-1", "SANTI-2"]
    );
    assert_eq!(
        column_keys(&after_bottom, todo),
        ["SANTI-3", "SANTI-2", "SANTI-1"]
    );
}

#[sqlx::test]
async fn refused_moves_show_an_error_and_keep_the_card_in_place(pool: PgPool) {
    let (ana, cookie) = board_with_issues(pool, 1).await;
    let todo = ana.column_id("SANTI", "To Do").await;
    ana.post(
        "/api/projects/SANTI/board/columns",
        json!({ "name": "Review" }),
    )
    .await;
    let review = ana.column_id("SANTI", "Review").await;

    let no_status = ana
        .send(htmx(form(
            "/p/SANTI/issues/1/move",
            &format!("column_id={review}"),
            Some(&cookie),
        )))
        .await;
    let no_column = ana
        .send(htmx(form(
            "/p/SANTI/issues/1/move",
            "column_id=999999",
            Some(&cookie),
        )))
        .await;
    let plain = ana
        .send(form(
            "/p/SANTI/issues/1/move",
            &format!("column_id={review}"),
            Some(&cookie),
        ))
        .await;

    assert_eq!(no_status.status(), StatusCode::CONFLICT);
    let fragment = text(no_status).await;
    assert!(fragment.contains(r#"role="alert""#));
    assert!(fragment.contains("Map a status to this column"));
    assert_eq!(column_keys(&fragment, todo), ["SANTI-1"]);
    assert_eq!(no_column.status(), StatusCode::UNPROCESSABLE_ENTITY);
    assert!(text(no_column).await.contains("no such column"));
    assert_eq!(plain.status(), StatusCode::CONFLICT);
    assert!(text(plain).await.contains("<html"));
}

#[sqlx::test]
async fn strangers_cannot_move_cards(pool: PgPool) {
    let (ana, _) = board_with_issues(pool, 1).await;
    let todo = ana.column_id("SANTI", "To Do").await;
    let body = format!("email=bob%40example.com&display_name=Bob&password={PASSWORD}");
    let bob = session_cookie(&ana.send(form("/register", &body, None)).await);

    let response = ana
        .send(form(
            "/p/SANTI/issues/1/move",
            &format!("column_id={todo}"),
            Some(&bob),
        ))
        .await;
    let unknown = ana
        .send(form(
            "/p/SANTI/issues/9/move",
            &format!("column_id={todo}"),
            Some(&session_cookie_of(&ana).await),
        ))
        .await;

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    assert_eq!(unknown.status(), StatusCode::NOT_FOUND);
}

async fn session_cookie_of(ana: &TestApp) -> String {
    let body = format!("email=ana%40example.com&password={PASSWORD}");
    session_cookie(&ana.send(form("/login", &body, None)).await)
}

#[sqlx::test]
async fn search_lists_matching_issues_with_links(pool: PgPool) {
    let (ana, cookie) = board_owner(pool).await;
    ana.create_issue("SANTI", json!({ "summary": "Fix login" }))
        .await;
    ana.create_issue("SANTI", json!({ "summary": "Write docs" }))
        .await;

    let found = ana
        .send(page("/p/SANTI/search?q=LOGIN", Some(&cookie)))
        .await;
    let nothing = ana
        .send(page("/p/SANTI/search?q=zebra", Some(&cookie)))
        .await;

    assert_eq!(found.status(), StatusCode::OK);
    let html = text(found).await;
    assert!(html.contains(r#"href="/p/SANTI/issues/1""#));
    assert!(html.contains("Fix login"));
    assert!(!html.contains("Write docs"));
    assert!(html.contains(r#"value="LOGIN""#));
    assert!(text(nothing).await.contains("No issues match"));
}

#[sqlx::test]
async fn board_shows_columns_cards_and_the_create_form(pool: PgPool) {
    let (ana, cookie) = board_owner(pool).await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "Fix login", "assignee_id": ana.user_id }),
    )
    .await;

    let response = ana.send(page("/p/SANTI/board", Some(&cookie))).await;

    assert_eq!(response.status(), StatusCode::OK);
    let html = text(response).await;
    for column in ["To Do", "In Progress", "Done"] {
        assert!(html.contains(column), "{column}");
    }
    assert!(html.contains("SANTI-1"));
    assert!(html.contains("Fix login"));
    assert!(html.contains("Story"));
    assert!(html.contains(r#"href="/p/SANTI/issues/1""#));
    assert!(html.contains(r#"title="Assigned to ana@example.com""#));
    assert!(html.contains(r#"action="/p/SANTI/issues""#));
    assert!(html.contains(r#"name="summary""#));
    assert!(html.contains(r#"name="issue_type""#));
    assert!(html.contains("<span>Board</span>"));
}

#[sqlx::test]
async fn creating_an_issue_from_the_form_lands_in_the_first_column(pool: PgPool) {
    let (ana, cookie) = board_owner(pool).await;
    let todo = ana.status_id("SANTI", "To Do").await;

    let response = ana
        .send(form(
            "/p/SANTI/issues",
            "summary=Fix+login&issue_type=bug",
            Some(&cookie),
        ))
        .await;

    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(location(&response), "/p/SANTI/board");
    let (_, issue) = ana.get("/api/projects/SANTI/issues/1").await;
    assert_eq!(issue["status_id"], todo);
    assert_eq!(issue["issue_type"], "bug");
    let html = text(ana.send(page("/p/SANTI/board", Some(&cookie))).await).await;
    assert!(html.contains("Fix login"));
    assert!(html.contains("Bug"));
}

#[sqlx::test]
async fn blank_title_rerenders_the_board_with_the_error(pool: PgPool) {
    let (ana, cookie) = board_owner(pool).await;

    let response = ana
        .send(form(
            "/p/SANTI/issues",
            "summary=+&issue_type=task",
            Some(&cookie),
        ))
        .await;

    assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
    let html = text(response).await;
    assert!(html.contains("Title must have 1 to 255 characters"));
    assert!(html.contains(r#"value="task" selected"#));
}

#[sqlx::test]
async fn issue_page_shows_the_issue_and_its_edit_form(pool: PgPool) {
    let (ana, cookie) = board_owner(pool).await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "Fix login", "description": "Steps to reproduce" }),
    )
    .await;

    let response = ana.send(page("/p/SANTI/issues/1", Some(&cookie))).await;

    assert_eq!(response.status(), StatusCode::OK);
    let html = text(response).await;
    assert!(html.contains("SANTI-1"));
    assert!(html.contains("Fix login"));
    assert!(html.contains("Steps to reproduce"));
    assert!(html.contains("Story"));
    assert!(html.contains(r#"action="/p/SANTI/issues/1""#));
    assert!(html.contains(r#"name="description""#));
    assert!(html.contains(r#"name="status_id""#));
}

#[sqlx::test]
async fn editing_changes_fields_and_moves_the_issue(pool: PgPool) {
    let (ana, cookie) = board_owner(pool).await;
    let done = ana.status_id("SANTI", "Done").await;
    ana.create_issue("SANTI", json!({ "summary": "Fix login" }))
        .await;
    let body = format!("summary=Fixed&description=Shipped+today&status_id={done}");

    let response = ana
        .send(form("/p/SANTI/issues/1", &body, Some(&cookie)))
        .await;

    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(location(&response), "/p/SANTI/issues/1");
    let (_, issue) = ana.get("/api/projects/SANTI/issues/1").await;
    assert_eq!(issue["summary"], "Fixed");
    assert_eq!(issue["description"], "Shipped today");
    assert_eq!(issue["status_id"], done);
    assert!(issue["done_at"].is_string());
    let html = text(ana.send(page("/p/SANTI/issues/1", Some(&cookie))).await).await;
    assert!(html.contains(&format!(r#"value="{done}" selected"#)));
}

#[sqlx::test]
async fn bad_edit_rerenders_the_issue_with_errors(pool: PgPool) {
    let (ana, cookie) = board_owner(pool).await;
    let todo = ana.status_id("SANTI", "To Do").await;
    ana.create_issue("SANTI", json!({ "summary": "Fix login" }))
        .await;
    let blank = format!("summary=+&description=&status_id={todo}");
    let foreign = "summary=Fix&description=&status_id=999999";

    let blank = ana
        .send(form("/p/SANTI/issues/1", &blank, Some(&cookie)))
        .await;
    let foreign = ana
        .send(form("/p/SANTI/issues/1", foreign, Some(&cookie)))
        .await;

    assert_eq!(blank.status(), StatusCode::UNPROCESSABLE_ENTITY);
    assert!(
        text(blank)
            .await
            .contains("Title must have 1 to 255 characters")
    );
    assert_eq!(foreign.status(), StatusCode::UNPROCESSABLE_ENTITY);
    assert!(text(foreign).await.contains("no such status"));
}

#[sqlx::test]
async fn moving_to_an_unmapped_status_is_refused(pool: PgPool) {
    let (ana, cookie) = board_owner(pool).await;
    ana.create_issue("SANTI", json!({ "summary": "Fix login" }))
        .await;
    let (_, parked) = ana
        .post(
            "/api/projects/SANTI/statuses",
            json!({ "name": "Parked", "category": "todo" }),
        )
        .await;
    let body = format!("summary=Fix&description=&status_id={}", parked["id"]);

    let response = ana
        .send(form("/p/SANTI/issues/1", &body, Some(&cookie)))
        .await;

    assert_eq!(response.status(), StatusCode::CONFLICT);
    assert!(text(response).await.contains("Map this status"));
}

#[sqlx::test]
async fn unknown_issues_and_strangers_get_not_found(pool: PgPool) {
    let (ana, cookie) = board_owner(pool).await;
    ana.create_issue("SANTI", json!({ "summary": "Fix login" }))
        .await;
    let body = format!("email=bob%40example.com&display_name=Bob&password={PASSWORD}");
    let bob = session_cookie(&ana.send(form("/register", &body, None)).await);

    let unknown = ana.send(page("/p/SANTI/issues/99", Some(&cookie))).await;
    let stranger_page = ana.send(page("/p/SANTI/issues/1", Some(&bob))).await;
    let stranger_create = ana
        .send(form(
            "/p/SANTI/issues",
            "summary=x&issue_type=task",
            Some(&bob),
        ))
        .await;
    let anonymous = ana.send(page("/p/SANTI/issues/1", None)).await;
    let unknown_edit = ana
        .send(form(
            "/p/SANTI/issues/99",
            "summary=x&description=&status_id=1",
            Some(&cookie),
        ))
        .await;

    assert_eq!(unknown.status(), StatusCode::NOT_FOUND);
    assert_eq!(stranger_page.status(), StatusCode::NOT_FOUND);
    assert_eq!(stranger_create.status(), StatusCode::NOT_FOUND);
    assert_eq!(location(&anonymous), "/login");
    assert_eq!(unknown_edit.status(), StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn board_without_a_todo_status_explains_why_it_cannot_create(pool: PgPool) {
    let (ana, cookie) = board_owner(pool).await;
    let todo = ana.status_id("SANTI", "To Do").await;
    ana.put(
        &format!("/api/projects/SANTI/statuses/{todo}"),
        json!({ "name": "To Do" }),
    )
    .await;

    let response = ana
        .send(form(
            "/p/SANTI/issues",
            "summary=x&issue_type=task",
            Some(&cookie),
        ))
        .await;

    assert_eq!(response.status(), StatusCode::CONFLICT);
    assert!(text(response).await.contains("Map a to-do status"));
}

/// The opening `<section …>` tag of one board column.
fn column_tag(html: &str, column_id: i64) -> &str {
    let start = html
        .find(&format!(r#"<section data-column="{column_id}""#))
        .expect("column on the board");
    let tag = &html[start..];
    &tag[..tag.find('>').unwrap()]
}

#[sqlx::test]
async fn cards_show_type_priority_points_subtasks_and_assignee(pool: PgPool) {
    let (ana, cookie) = board_owner(pool).await;
    let parent = json!({ "summary": "Fix login", "priority": "urgent", "points": 3.0, "assignee_id": ana.user_id });
    ana.create_issue("SANTI", parent).await;
    ana.create_issue("SANTI", json!({ "summary": "Reset form", "issue_type": "subtask", "parent": "SANTI-1", "priority": "low" }))
        .await;

    let html = text(ana.send(page("/p/SANTI/board", Some(&cookie))).await).await;

    assert!(html.contains(r#"title="Story""#));
    assert!(html.contains(r#"title="Subtask""#));
    assert!(html.contains(r#"title="Urgent priority""#));
    assert!(html.contains(r#"title="Low priority""#));
    assert!(html.contains(r#"aria-label="3 points""#));
    assert!(html.contains(r#"title="1 of 1 subtasks open""#));
    assert!(html.contains(r#"title="Assigned to ana@example.com""#));
    assert!(html.contains(r#"hx-get="/p/SANTI/issues/1""#));
}

#[sqlx::test]
async fn card_menu_assigns_and_sets_priority(pool: PgPool) {
    let (ana, cookie) = board_with_issues(pool, 1).await;
    let me = ana.user_id;

    let html = text(ana.send(page("/p/SANTI/board", Some(&cookie))).await).await;
    let assigned = ana
        .send(htmx(form(
            "/p/SANTI/issues/1",
            &format!("assignee={me}"),
            Some(&cookie),
        )))
        .await;
    let prioritized = ana
        .send(htmx(form(
            "/p/SANTI/issues/1",
            "priority=high",
            Some(&cookie),
        )))
        .await;

    assert!(html.contains(r#"name="assignee""#));
    assert!(html.contains(r#"name="priority""#));
    assert!(html.contains(r#"data-copy="SANTI-1""#));
    assert!(!html.contains("Delete"));
    assert_eq!(assigned.status(), StatusCode::OK);
    assert_eq!(assigned.headers()["hx-trigger"], "issue-saved");
    assert_eq!(prioritized.status(), StatusCode::OK);
    let (_, issue) = ana.get("/api/projects/SANTI/issues/1").await;
    assert_eq!(issue["assignee_id"], me);
    assert_eq!(issue["priority"], "high");
    assert_eq!(issue["summary"], "issue 1");
    ana.send(form("/p/SANTI/issues/1", "assignee=", Some(&cookie)))
        .await;
    let (_, issue) = ana.get("/api/projects/SANTI/issues/1").await;
    assert!(issue["assignee_id"].is_null());
}

#[sqlx::test]
async fn column_query_keeps_one_column_on_small_screens(pool: PgPool) {
    let (ana, cookie) = board_with_issues(pool, 1).await;
    let todo = ana.column_id("SANTI", "To Do").await;
    let doing = ana.column_id("SANTI", "In Progress").await;

    let first = text(ana.send(page("/p/SANTI/board", Some(&cookie))).await).await;
    let picked = text(
        ana.send(page(
            &format!("/p/SANTI/board?column={doing}"),
            Some(&cookie),
        ))
        .await,
    )
    .await;

    assert!(!column_tag(&first, todo).contains("max-md:hidden"));
    assert!(column_tag(&first, doing).contains("max-md:hidden"));
    assert!(column_tag(&picked, todo).contains("max-md:hidden"));
    assert!(!column_tag(&picked, doing).contains("max-md:hidden"));
    assert!(picked.contains(&format!(
        r#"href="/p/SANTI/board?column={doing}" aria-current="true""#
    )));
}

#[sqlx::test]
async fn board_filters_by_assignee_from_the_url(pool: PgPool) {
    let (ana, cookie) = board_owner(pool).await;
    let me = ana.user_id;
    ana.create_issue("SANTI", json!({ "summary": "Mine", "assignee_id": me }))
        .await;
    ana.create_issue("SANTI", json!({ "summary": "Nobody's" }))
        .await;

    let all = text(ana.send(page("/p/SANTI/board", Some(&cookie))).await).await;
    let mine_uri = format!("/p/SANTI/board?assignee={me}");
    let mine = text(ana.send(page(&mine_uri, Some(&cookie))).await).await;
    let fragment = text(ana.send(htmx(page(&mine_uri, Some(&cookie)))).await).await;

    assert!(all.contains(&format!(r#"href="/p/SANTI/board?assignee={me}""#)));
    assert!(all.contains("Only my issues"));
    assert!(mine.contains("SANTI-1"));
    assert!(!mine.contains("SANTI-2"));
    assert!(mine.contains(r#"aria-pressed="true""#));
    assert!(!fragment.contains("<html"));
    assert!(fragment.contains(r#"id="board""#));
    assert!(fragment.contains("SANTI-1"));
}
