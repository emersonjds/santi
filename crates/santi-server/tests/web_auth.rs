mod common;

use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use axum::response::Response;
use common::{PASSWORD, TestApp, session_cookie};
use http_body_util::BodyExt;
use sqlx::PgPool;

const STATIC: &str = concat!("/static/", env!("CARGO_PKG_VERSION"));

/// A browser form post: urlencoded body and the same-origin fetch metadata D22 expects.
fn form(uri: &str, body: &str, cookie: Option<&str>) -> Request<Body> {
    let mut builder = Request::post(uri)
        .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
        .header("sec-fetch-site", "same-origin");
    if let Some(cookie) = cookie {
        builder = builder.header(header::COOKIE, cookie);
    }
    builder.body(Body::from(body.to_string())).unwrap()
}

fn page(uri: &str, cookie: Option<&str>) -> Request<Body> {
    let mut builder = Request::get(uri);
    if let Some(cookie) = cookie {
        builder = builder.header(header::COOKIE, cookie);
    }
    builder.body(Body::empty()).unwrap()
}

async fn text(response: Response) -> String {
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    String::from_utf8(bytes.to_vec()).unwrap()
}

fn location(response: &Response) -> &str {
    response.headers()[header::LOCATION].to_str().unwrap()
}

async fn sign_up(app: &TestApp) -> String {
    let body = format!("email=ana%40example.com&display_name=Ana+Lima&password={PASSWORD}");
    let response = app.send(form("/register", &body, None)).await;
    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    session_cookie(&response)
}

#[sqlx::test]
async fn login_page_renders_a_form(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let response = app.send(page("/login", None)).await;

    assert_eq!(response.status(), StatusCode::OK);
    assert!(
        response.headers()[header::CONTENT_TYPE]
            .to_str()
            .unwrap()
            .starts_with("text/html")
    );
    let html = text(response).await;
    assert!(html.contains(r#"action="/login""#));
    assert!(html.contains(r#"name="email""#));
    assert!(html.contains(r#"name="password""#));
    assert!(html.contains(&format!("{STATIC}/app.css")));
}

#[sqlx::test]
async fn register_page_renders_a_form(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let html = text(app.send(page("/register", None)).await).await;

    assert!(html.contains(r#"action="/register""#));
    assert!(html.contains(r#"name="display_name""#));
}

#[sqlx::test]
async fn register_signs_in_and_redirects_home(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    let body = format!("email=Ana%40Example.com&display_name=Ana&password={PASSWORD}");

    let response = app.send(form("/register", &body, None)).await;

    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(location(&response), "/");
    let set_cookie = response.headers()[header::SET_COOKIE].to_str().unwrap();
    assert!(set_cookie.starts_with("santi_session="));
    assert!(set_cookie.contains("HttpOnly"));
}

#[sqlx::test]
async fn bad_register_input_rerenders_with_message_and_typed_values(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    let body = "email=ana%40example.com&display_name=Ana&password=tiny-pw";

    let response = app.send(form("/register", body, None)).await;

    assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
    assert!(response.headers().get(header::SET_COOKIE).is_none());
    let html = text(response).await;
    assert!(html.contains("10 to 128 characters"));
    assert!(html.contains(r#"value="ana@example.com""#));
    assert!(html.contains(r#"value="Ana""#));
    assert!(!html.contains("tiny-pw"));
}

#[sqlx::test]
async fn taken_email_rerenders_the_register_form(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    sign_up(&app).await;
    let body = format!("email=ANA%40example.com&display_name=Ana&password={PASSWORD}");

    let response = app.send(form("/register", &body, None)).await;

    assert_eq!(response.status(), StatusCode::CONFLICT);
    assert!(text(response).await.contains("already has an account"));
}

#[sqlx::test]
async fn login_signs_in_and_redirects_home(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    sign_up(&app).await;
    let body = format!("email=ana%40example.com&password={PASSWORD}");

    let response = app.send(form("/login", &body, None)).await;

    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(location(&response), "/");
    assert!(response.headers().contains_key(header::SET_COOKIE));
}

#[sqlx::test]
async fn wrong_password_and_unknown_email_get_the_same_message(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    sign_up(&app).await;
    let message = "Email or password is not right.";

    let wrong_password = app
        .send(form(
            "/login",
            "email=ana%40example.com&password=wrong+password",
            None,
        ))
        .await;
    let unknown_email = app
        .send(form(
            "/login",
            &format!("email=bob%40example.com&password={PASSWORD}"),
            None,
        ))
        .await;

    for response in [wrong_password, unknown_email] {
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        assert!(response.headers().get(header::SET_COOKIE).is_none());
        let html = text(response).await;
        assert!(html.contains(message));
        assert!(html.contains(r#"name="email""#));
    }
}

#[sqlx::test]
async fn anonymous_home_redirects_to_login(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let response = app.send(page("/", None)).await;

    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(location(&response), "/login");
}

#[sqlx::test]
async fn signed_in_home_greets_the_user_with_an_empty_state(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    let cookie = sign_up(&app).await;

    let response = app.send(page("/", Some(&cookie))).await;

    assert_eq!(response.status(), StatusCode::OK);
    let html = text(response).await;
    assert!(html.contains("Ana Lima"));
    assert!(html.contains("No projects yet"));
    assert!(html.contains(r#"action="/logout""#));
}

#[sqlx::test]
async fn logout_clears_the_cookie_and_ends_the_session(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    let cookie = sign_up(&app).await;

    let response = app.send(form("/logout", "", Some(&cookie))).await;

    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(location(&response), "/login");
    assert!(
        response.headers()[header::SET_COOKIE]
            .to_str()
            .unwrap()
            .contains("Max-Age=0")
    );
    let home = app.send(page("/", Some(&cookie))).await;
    assert_eq!(location(&home), "/login");
}

#[sqlx::test]
async fn anonymous_logout_redirects_to_login(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let response = app.send(form("/logout", "", None)).await;

    assert_eq!(location(&response), "/login");
}

#[sqlx::test]
async fn static_assets_are_served_with_immutable_cache(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    for (file, content_type) in [
        ("app.css", "text/css"),
        ("app.js", "text/javascript"),
        ("htmx.min.js", "text/javascript"),
    ] {
        let response = app.send(page(&format!("{STATIC}/{file}"), None)).await;
        assert_eq!(response.status(), StatusCode::OK, "{file}");
        let headers = response.headers();
        assert!(
            headers[header::CONTENT_TYPE]
                .to_str()
                .unwrap()
                .starts_with(content_type)
        );
        assert!(
            headers[header::CACHE_CONTROL]
                .to_str()
                .unwrap()
                .contains("immutable")
        );
    }
}

#[sqlx::test]
async fn unknown_or_stale_static_paths_are_not_found(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let stale = app.send(page("/static/0.0.0/app.css", None)).await;
    let unknown = app.send(page(&format!("{STATIC}/secret.txt"), None)).await;

    assert_eq!(stale.status(), StatusCode::NOT_FOUND);
    assert_eq!(unknown.status(), StatusCode::NOT_FOUND);
}
