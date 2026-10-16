mod common;

use axum::http::StatusCode;
use common::{PASSWORD, TestApp, form, location, page, session_cookie, text};
use serde_json::json;
use sqlx::PgPool;

/// Ana with project SANTI and issue SANTI-1: an API client for setup and a browser cookie.
async fn issue_owner(pool: PgPool) -> (TestApp, String) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    ana.create_issue("SANTI", json!({ "summary": "Fix login" }))
        .await;
    let body = format!("email=ana%40example.com&password={PASSWORD}");
    let cookie = session_cookie(&ana.send(form("/login", &body, None)).await);
    (ana, cookie)
}

#[sqlx::test]
async fn comments_are_added_and_listed_with_author_and_time(pool: PgPool) {
    let (ana, cookie) = issue_owner(pool).await;

    let response = ana
        .send(form(
            "/p/SANTI/issues/1/comments",
            "body=Looks+good",
            Some(&cookie),
        ))
        .await;

    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(location(&response), "/p/SANTI/issues/1#comments");
    let html = text(ana.send(page("/p/SANTI/issues/1", Some(&cookie))).await).await;
    assert!(html.contains("Looks good"));
    assert!(html.contains("<strong>ana@example.com</strong>"));
    assert!(html.contains("<time datetime="));
    assert!(html.contains(r#"action="/p/SANTI/issues/1/comments""#));
}

#[sqlx::test]
async fn empty_comment_rerenders_the_issue_with_the_error(pool: PgPool) {
    let (ana, cookie) = issue_owner(pool).await;

    let response = ana
        .send(form("/p/SANTI/issues/1/comments", "body=+", Some(&cookie)))
        .await;

    assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
    assert!(
        text(response)
            .await
            .contains("Comment must have 1 to 20000 characters")
    );
}

#[sqlx::test]
async fn comments_need_a_known_issue_and_a_same_origin_post(pool: PgPool) {
    let (ana, cookie) = issue_owner(pool).await;
    let mut cross_site = form("/p/SANTI/issues/1/comments", "body=hi", Some(&cookie));
    cross_site
        .headers_mut()
        .insert("sec-fetch-site", "cross-site".parse().unwrap());

    let unknown = ana
        .send(form("/p/SANTI/issues/9/comments", "body=hi", Some(&cookie)))
        .await;
    let forged = ana.send(cross_site).await;

    assert_eq!(unknown.status(), StatusCode::NOT_FOUND);
    assert_eq!(forged.status(), StatusCode::FORBIDDEN);
}
