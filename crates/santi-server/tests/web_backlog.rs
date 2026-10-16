mod common;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use common::{PASSWORD, TestApp, form, location, page, session_cookie, text};
use serde_json::{Value, json};
use sqlx::PgPool;

/// Ana with scrum project SANTI: an API client for setup and a browser cookie for the pages.
async fn backlog_owner(pool: PgPool) -> (TestApp, String) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    let body = format!("email=ana%40example.com&password={PASSWORD}");
    let cookie = session_cookie(&ana.send(form("/login", &body, None)).await);
    (ana, cookie)
}

fn htmx(mut request: Request<Body>) -> Request<Body> {
    request
        .headers_mut()
        .insert("hx-request", "true".parse().unwrap());
    request
}

/// Row keys of one backlog section (`""` is the no-sprint section), top to bottom.
fn section_keys(html: &str, sprint: &str) -> Vec<String> {
    let start = html
        .find(&format!(r#"data-sprint="{sprint}""#))
        .expect("section on the backlog");
    let section = &html[start..];
    let section = &section[..section.find("</section>").unwrap()];
    section
        .split(r#"data-key=""#)
        .skip(1)
        .map(|rest| rest[..rest.find('"').unwrap()].to_string())
        .collect()
}

async fn sprint_of(ana: &TestApp, number: i64) -> Value {
    ana.get(&format!("/api/projects/SANTI/issues/{number}"))
        .await
        .1["sprint_id"]
        .clone()
}

async fn sprint(ana: &TestApp, id: &Value) -> Value {
    let (_, sprints) = ana.get("/api/projects/SANTI/sprints").await;
    let found = sprints.as_array().unwrap().iter().find(|s| s["id"] == *id);
    found.cloned().unwrap_or(Value::Null)
}

#[sqlx::test]
async fn backlog_lists_sprint_sections_then_the_backlog_with_counts(pool: PgPool) {
    let (ana, cookie) = backlog_owner(pool).await;
    let planned = ana.create_sprint("SANTI").await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "Planned", "points": 3, "sprint_id": planned["id"] }),
    )
    .await;
    ana.create_issue("SANTI", json!({ "summary": "Loose one" }))
        .await;
    ana.create_issue("SANTI", json!({ "summary": "Loose two" }))
        .await;

    let response = ana.send(page("/p/SANTI/backlog", Some(&cookie))).await;

    assert_eq!(response.status(), StatusCode::OK);
    let html = text(response).await;
    let id = planned["id"].to_string();
    assert_eq!(section_keys(&html, &id), ["SANTI-1"]);
    assert_eq!(section_keys(&html, ""), ["SANTI-2", "SANTI-3"]);
    assert!(html.contains("Sprint 1"));
    assert!(html.contains("1 issue<"));
    assert!(html.contains(r#"aria-label="3 points""#));
    assert!(html.contains("2 issues<"));
    assert!(html.contains(r#"aria-label="0 points""#));
    assert!(html.contains(r#"id="backlog""#));
    assert!(html.contains(r#"draggable="true""#));
    assert!(html.contains(r#"data-move="/p/SANTI/issues/1/plan""#));
    assert!(html.contains(r#"action="/p/SANTI/issues/2/plan""#));
    assert!(html.contains(r#"href="/p/SANTI/backlog""#));
    assert!(html.contains(r#"action="/p/SANTI/sprints""#));
    assert!(html.contains(&format!(r#"action="/p/SANTI/sprints/{id}/start""#)));
    assert!(html.contains(&format!(r#"action="/p/SANTI/sprints/{id}/delete""#)));
}

#[sqlx::test]
async fn kanban_projects_have_no_backlog(pool: PgPool) {
    let (ana, cookie) = backlog_owner(pool).await;
    ana.create_project("FLOW", "kanban").await;

    let board = text(ana.send(page("/p/FLOW/board", Some(&cookie))).await).await;
    let backlog = ana.send(page("/p/FLOW/backlog", Some(&cookie))).await;

    assert!(!board.contains(r#"href="/p/FLOW/backlog""#));
    assert_eq!(backlog.status(), StatusCode::SEE_OTHER);
    assert_eq!(location(&backlog), "/p/FLOW/board");
}

#[sqlx::test]
async fn sprints_are_created_edited_and_deleted_from_the_backlog(pool: PgPool) {
    let (ana, cookie) = backlog_owner(pool).await;

    let created = ana
        .send(form("/p/SANTI/sprints", "name=&goal=", Some(&cookie)))
        .await;
    let (_, sprints) = ana.get("/api/projects/SANTI/sprints").await;
    let id = sprints[0]["id"].clone();
    let url = format!("/p/SANTI/sprints/{id}");
    let edited = ana
        .send(form(
            &url,
            "name=Launch&goal=Ship+it&start_date=2026-11-01&end_date=2026-11-14",
            Some(&cookie),
        ))
        .await;
    let after_edit = sprint(&ana, &id).await;
    let backwards = ana
        .send(form(
            &url,
            "name=Launch&goal=&start_date=2026-11-14&end_date=2026-11-01",
            Some(&cookie),
        ))
        .await;
    let undated = ana
        .send(form(
            &url,
            "name=Launch&goal=&start_date=soon&end_date=",
            Some(&cookie),
        ))
        .await;
    let deleted = ana
        .send(form(&format!("{url}/delete"), "", Some(&cookie)))
        .await;

    assert_eq!(created.status(), StatusCode::SEE_OTHER);
    assert_eq!(location(&created), "/p/SANTI/backlog");
    assert_eq!(sprints[0]["name"], "Sprint 1");
    assert_eq!(edited.status(), StatusCode::SEE_OTHER);
    assert_eq!(after_edit["name"], "Launch");
    assert_eq!(after_edit["goal"], "Ship it");
    assert_eq!(after_edit["end_date"], "2026-11-14");
    assert_eq!(backwards.status(), StatusCode::UNPROCESSABLE_ENTITY);
    assert!(
        text(backwards)
            .await
            .contains("End date must be on or after the start date")
    );
    assert_eq!(undated.status(), StatusCode::UNPROCESSABLE_ENTITY);
    assert!(text(undated).await.contains("Start date must be a date"));
    assert_eq!(deleted.status(), StatusCode::SEE_OTHER);
    assert_eq!(sprint(&ana, &id).await, Value::Null);
}

#[sqlx::test]
async fn rows_move_between_sections_by_drop_or_move_to(pool: PgPool) {
    let (ana, cookie) = backlog_owner(pool).await;
    let planned = ana.create_sprint("SANTI").await;
    let id = planned["id"].to_string();
    for summary in ["one", "two", "three"] {
        ana.create_issue("SANTI", json!({ "summary": summary }))
            .await;
    }

    let dropped = ana
        .send(htmx(form(
            "/p/SANTI/issues/2/plan",
            &format!("sprint={id}"),
            Some(&cookie),
        )))
        .await;
    let status = dropped.status();
    let fragment = text(dropped).await;
    let above = ana
        .send(htmx(form(
            "/p/SANTI/issues/3/plan",
            &format!("sprint={id}&before=SANTI-2"),
            Some(&cookie),
        )))
        .await;
    let reordered = text(above).await;
    let back = ana
        .send(form(
            "/p/SANTI/issues/2/plan",
            "sprint=&place=top",
            Some(&cookie),
        ))
        .await;
    let html = text(ana.send(page("/p/SANTI/backlog", Some(&cookie))).await).await;

    assert_eq!(status, StatusCode::OK);
    assert!(fragment.trim_start().starts_with(r#"<div id="backlog""#));
    assert_eq!(section_keys(&fragment, &id), ["SANTI-2"]);
    assert_eq!(section_keys(&reordered, &id), ["SANTI-3", "SANTI-2"]);
    assert_eq!(back.status(), StatusCode::SEE_OTHER);
    assert_eq!(location(&back), "/p/SANTI/backlog");
    assert_eq!(section_keys(&html, ""), ["SANTI-2", "SANTI-1"]);
    assert_eq!(section_keys(&html, &id), ["SANTI-3"]);
    assert_eq!(sprint_of(&ana, 2).await, Value::Null);
}

#[sqlx::test]
async fn refused_plans_show_the_reason(pool: PgPool) {
    let (ana, cookie) = backlog_owner(pool).await;
    ana.create_issue("SANTI", json!({ "summary": "one" })).await;

    let unknown = ana
        .send(htmx(form(
            "/p/SANTI/issues/1/plan",
            "sprint=999999",
            Some(&cookie),
        )))
        .await;
    let garbage = ana
        .send(form("/p/SANTI/issues/1/plan", "sprint=abc", Some(&cookie)))
        .await;

    assert_eq!(unknown.status(), StatusCode::UNPROCESSABLE_ENTITY);
    let fragment = text(unknown).await;
    assert!(fragment.contains(r#"role="alert""#));
    assert!(fragment.contains("Sprint no such sprint on this board"));
    assert_eq!(section_keys(&fragment, ""), ["SANTI-1"]);
    assert_eq!(garbage.status(), StatusCode::UNPROCESSABLE_ENTITY);
    assert!(text(garbage).await.contains("<html"));
}

#[sqlx::test]
async fn a_sprint_starts_from_its_form_and_a_second_is_refused(pool: PgPool) {
    let (ana, cookie) = backlog_owner(pool).await;
    let first = ana.create_sprint("SANTI").await;
    let second = ana.create_sprint("SANTI").await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "In first", "sprint_id": first["id"] }),
    )
    .await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "In second", "sprint_id": second["id"] }),
    )
    .await;
    ana.create_issue("SANTI", json!({ "summary": "Unplanned" }))
        .await;
    let idle_board = text(ana.send(page("/p/SANTI/board", Some(&cookie))).await).await;

    let started = ana
        .send(form(
            &format!("/p/SANTI/sprints/{}/start", first["id"]),
            "name=Alpha&goal=Ship+login&start_date=2026-10-15&end_date=2026-10-29",
            Some(&cookie),
        ))
        .await;
    let refused = ana
        .send(form(
            &format!("/p/SANTI/sprints/{}/start", second["id"]),
            "name=Beta&goal=&start_date=&end_date=",
            Some(&cookie),
        ))
        .await;
    let active = sprint(&ana, &first["id"]).await;
    let board = text(ana.send(page("/p/SANTI/board", Some(&cookie))).await).await;
    let from_board = ana
        .send(form(
            "/p/SANTI/issues",
            &format!(
                "summary=Board+made&issue_type=task&sprint_id={}",
                first["id"]
            ),
            Some(&cookie),
        ))
        .await;

    assert!(idle_board.contains("No sprint is running"));
    assert!(idle_board.contains(r#"href="/p/SANTI/backlog""#));
    assert_eq!(started.status(), StatusCode::SEE_OTHER);
    assert_eq!(location(&started), "/p/SANTI/board");
    assert_eq!(active["state"], "active");
    assert_eq!(active["name"], "Alpha");
    assert_eq!(active["end_date"], "2026-10-29");
    assert_eq!(refused.status(), StatusCode::CONFLICT);
    let html = text(refused).await;
    assert!(html.contains("Complete the active sprint before starting another."));
    assert!(html.contains(&format!(r#"id="sprint-{}-error""#, second["id"])));
    assert!(board.contains("Alpha"));
    assert!(board.contains("Ship login"));
    assert!(board.contains("In first"));
    assert!(!board.contains("In second"));
    assert!(!board.contains("Unplanned"));
    assert!(board.contains(&format!(r#"name="sprint_id" value="{}""#, first["id"])));
    assert_eq!(from_board.status(), StatusCode::SEE_OTHER);
    assert_eq!(sprint_of(&ana, 4).await, first["id"]);
}

#[sqlx::test]
async fn completing_sends_unfinished_issues_where_chosen(pool: PgPool) {
    let (ana, cookie) = backlog_owner(pool).await;
    let first = ana.create_sprint("SANTI").await;
    let next = ana.create_sprint("SANTI").await;
    let done = ana.status_id("SANTI", "Done").await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "finished", "sprint_id": first["id"], "status_id": done }),
    )
    .await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "open", "sprint_id": first["id"] }),
    )
    .await;
    ana.post(
        &format!("/api/projects/SANTI/sprints/{}/start", first["id"]),
        json!({}),
    )
    .await;
    let backlog = text(ana.send(page("/p/SANTI/backlog", Some(&cookie))).await).await;

    let into_next = ana
        .send(form(
            &format!("/p/SANTI/sprints/{}/complete", first["id"]),
            &format!("open_issues={}", next["id"]),
            Some(&cookie),
        ))
        .await;
    ana.post(
        &format!("/api/projects/SANTI/sprints/{}/start", next["id"]),
        json!({}),
    )
    .await;
    let into_backlog = ana
        .send(form(
            &format!("/p/SANTI/sprints/{}/complete", next["id"]),
            "open_issues=backlog",
            Some(&cookie),
        ))
        .await;
    let again = ana
        .send(form(
            &format!("/p/SANTI/sprints/{}/complete", next["id"]),
            "open_issues=new_sprint",
            Some(&cookie),
        ))
        .await;

    assert!(backlog.contains(&format!(
        r#"action="/p/SANTI/sprints/{}/complete""#,
        first["id"]
    )));
    assert!(backlog.contains(&format!(r#"name="open_issues" value="{}""#, next["id"])));
    assert_eq!(into_next.status(), StatusCode::SEE_OTHER);
    assert_eq!(location(&into_next), "/p/SANTI/backlog");
    assert_eq!(sprint(&ana, &first["id"]).await["state"], "closed");
    assert_eq!(sprint_of(&ana, 1).await, first["id"]);
    assert_eq!(into_backlog.status(), StatusCode::SEE_OTHER);
    assert_eq!(sprint_of(&ana, 2).await, Value::Null);
    assert_eq!(again.status(), StatusCode::CONFLICT);
    assert!(
        text(again)
            .await
            .contains("Only the active sprint can be completed.")
    );
}

#[sqlx::test]
async fn issues_are_created_into_the_backlog_or_a_sprint(pool: PgPool) {
    let (ana, cookie) = backlog_owner(pool).await;
    let planned = ana.create_sprint("SANTI").await;

    let loose = ana
        .send(form(
            "/p/SANTI/backlog/issues",
            "summary=Loose&issue_type=bug&sprint=",
            Some(&cookie),
        ))
        .await;
    let into_sprint = ana
        .send(form(
            "/p/SANTI/backlog/issues",
            &format!("summary=Planned&issue_type=story&sprint={}", planned["id"]),
            Some(&cookie),
        ))
        .await;
    let blank = ana
        .send(form(
            "/p/SANTI/backlog/issues",
            "summary=+&issue_type=task&sprint=",
            Some(&cookie),
        ))
        .await;

    assert_eq!(loose.status(), StatusCode::SEE_OTHER);
    assert_eq!(location(&loose), "/p/SANTI/backlog");
    assert_eq!(sprint_of(&ana, 1).await, Value::Null);
    assert_eq!(into_sprint.status(), StatusCode::SEE_OTHER);
    assert_eq!(sprint_of(&ana, 2).await, planned["id"]);
    assert_eq!(blank.status(), StatusCode::UNPROCESSABLE_ENTITY);
    let html = text(blank).await;
    assert!(html.contains("Title must have 1 to 255 characters"));
    assert!(html.contains(r#"value="task" selected"#));
}

#[sqlx::test]
async fn strangers_and_anonymous_visitors_are_kept_out(pool: PgPool) {
    let (ana, _) = backlog_owner(pool).await;
    let body = format!("email=bob%40example.com&display_name=Bob&password={PASSWORD}");
    let bob = session_cookie(&ana.send(form("/register", &body, None)).await);

    let page_for_bob = ana.send(page("/p/SANTI/backlog", Some(&bob))).await;
    let post_for_bob = ana
        .send(form("/p/SANTI/sprints", "name=&goal=", Some(&bob)))
        .await;
    let anonymous = ana.send(page("/p/SANTI/backlog", None)).await;

    assert_eq!(page_for_bob.status(), StatusCode::NOT_FOUND);
    assert_eq!(post_for_bob.status(), StatusCode::NOT_FOUND);
    assert_eq!(anonymous.status(), StatusCode::SEE_OTHER);
    assert_eq!(location(&anonymous), "/login");
}

#[sqlx::test]
async fn sections_carry_status_chips_estimates_and_drop_zones(pool: PgPool) {
    let (ana, cookie) = backlog_owner(pool).await;
    let running = ana.create_sprint("SANTI").await;
    let empty = ana.create_sprint("SANTI").await;
    let progress = ana.status_id("SANTI", "In Progress").await;
    let epic = ana
        .create_issue(
            "SANTI",
            json!({ "summary": "Sign in", "issue_type": "epic" }),
        )
        .await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "Form", "points": 2, "sprint_id": running["id"], "parent": epic["key"] }),
    )
    .await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "Api", "points": 3, "sprint_id": running["id"], "status_id": progress }),
    )
    .await;
    ana.post(
        &format!("/api/projects/SANTI/sprints/{}/start", running["id"]),
        json!({}),
    )
    .await;

    let html = text(ana.send(page("/p/SANTI/backlog", Some(&cookie))).await).await;
    let fragment = text(
        ana.send(htmx(page("/p/SANTI/backlog", Some(&cookie))))
            .await,
    )
    .await;

    let (running, empty) = (running["id"].to_string(), empty["id"].to_string());
    assert!(html.contains(r#"title="1 to do""#));
    assert!(html.contains(r#"title="1 in progress""#));
    assert!(!html.contains(" done\""));
    assert!(html.contains("2 issues<"));
    assert!(html.contains(r#"aria-label="5 points""#));
    assert!(html.contains("2 of 2 issues visible · Estimate: 5 of 5"));
    assert!(html.contains("In Progress</span>"));
    assert!(html.contains(r#"title="Epic Sign in""#));
    assert!(html.contains("Drag issues here to plan this sprint"));
    assert!(html.contains("Add an issue before starting."));
    assert!(html.contains(&format!(r#"<dialog id="complete-{running}""#)));
    assert!(html.contains(&format!(
        r#"commandfor="complete-{running}" command="show-modal""#
    )));
    assert!(html.contains(&format!(r#"<dialog id="start-{empty}""#)));
    assert!(html.contains(&format!(r#"<dialog id="edit-{empty}""#)));
    assert!(html.contains(&format!(r#"<dialog id="delete-{empty}""#)));
    assert!(html.contains(&format!(r#"name="sprint" value="{running}""#)));
    assert!(html.contains(
        r##"href="/p/SANTI/issues/2" hx-get="/p/SANTI/issues/2" hx-target="#dialog-body" hx-swap="innerHTML" data-push"##
    ));
    assert!(fragment.trim_start().starts_with(r#"<div id="backlog""#));
    assert!(fragment.contains(r#"hx-trigger="issue-saved from:body""#));
    assert!(!fragment.contains("<html"));
}

#[sqlx::test]
async fn inline_create_reopens_its_section_with_the_errors(pool: PgPool) {
    let (ana, cookie) = backlog_owner(pool).await;
    let planned = ana.create_sprint("SANTI").await;
    let id = planned["id"].to_string();

    let blank = ana
        .send(form(
            "/p/SANTI/backlog/issues",
            &format!("summary=+&issue_type=bug&sprint={id}"),
            Some(&cookie),
        ))
        .await;

    assert_eq!(blank.status(), StatusCode::UNPROCESSABLE_ENTITY);
    let html = text(blank).await;
    assert!(html.contains(&format!(r#"id="create-{id}" class="mx-2" open"#)));
    assert!(html.contains(&format!(r#"id="summary-{id}-error""#)));
    assert!(html.contains(r#"value="bug" selected"#));
}
