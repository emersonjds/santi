#![allow(dead_code)]

use axum::Router;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use axum::response::Response;
use http_body_util::BodyExt;
use serde_json::{Value, json};
use sqlx::PgPool;
use tower::ServiceExt;

pub const PASSWORD: &str = "correct horse battery";

#[derive(Clone)]
pub struct TestApp {
    pub router: Router,
    pub token: Option<String>,
    pub user_id: i64,
}

impl TestApp {
    pub fn anonymous(pool: PgPool) -> Self {
        let router = santi_server::app(santi_server::AppState::new(pool), None);
        TestApp {
            router,
            token: None,
            user_id: 0,
        }
    }

    pub async fn signed_in(pool: PgPool, email: &str) -> Self {
        TestApp::anonymous(pool).another_user(email).await
    }

    /// Registers a new user on the same router and signs in with a fresh API token.
    pub async fn another_user(&self, email: &str) -> Self {
        let register = json!({ "email": email, "password": PASSWORD, "display_name": email, "accept_terms": true, "confirm_age": true });
        let response = self
            .send(json_request(
                Method::POST,
                "/api/auth/register",
                None,
                Some(register),
            ))
            .await;
        assert_eq!(response.status(), StatusCode::CREATED);
        let cookie = session_cookie(&response);
        let user = body_json(response).await;
        let mut request = json_request(
            Method::POST,
            "/api/tokens",
            None,
            Some(json!({ "name": "tests" })),
        );
        request
            .headers_mut()
            .insert(header::COOKIE, cookie.parse().unwrap());
        let created = body_json(self.send(request).await).await;
        TestApp {
            router: self.router.clone(),
            token: Some(created["token"].as_str().unwrap().to_string()),
            user_id: user["id"].as_i64().unwrap(),
        }
    }

    pub async fn send(&self, request: Request<Body>) -> Response {
        self.router.clone().oneshot(request).await.unwrap()
    }

    pub async fn get(&self, uri: &str) -> (StatusCode, Value) {
        self.call(Method::GET, uri, None).await
    }

    pub async fn delete(&self, uri: &str) -> (StatusCode, Value) {
        self.call(Method::DELETE, uri, None).await
    }

    pub async fn post(&self, uri: &str, body: Value) -> (StatusCode, Value) {
        self.call(Method::POST, uri, Some(body)).await
    }

    pub async fn put(&self, uri: &str, body: Value) -> (StatusCode, Value) {
        self.call(Method::PUT, uri, Some(body)).await
    }

    pub async fn patch(&self, uri: &str, body: Value) -> (StatusCode, Value) {
        self.call(Method::PATCH, uri, Some(body)).await
    }

    /// A body-less POST as the browser sends it: the session cookie of a fresh login, no Bearer token.
    pub async fn browser_post(&self, email: &str, uri: &str) -> StatusCode {
        let login = json!({ "email": email, "password": PASSWORD });
        let request = json_request(Method::POST, "/api/auth/login", None, Some(login));
        let response = self.send(request).await;
        assert_eq!(response.status(), StatusCode::OK);
        let mut request = json_request(Method::POST, uri, None, None);
        request
            .headers_mut()
            .insert(header::COOKIE, session_cookie(&response).parse().unwrap());
        self.send(request).await.status()
    }

    async fn call(&self, method: Method, uri: &str, body: Option<Value>) -> (StatusCode, Value) {
        let request = json_request(method, uri, self.token.as_deref(), body);
        let response = self.send(request).await;
        let status = response.status();
        (status, body_json(response).await)
    }
}

pub fn json_request(
    method: Method,
    uri: &str,
    bearer: Option<&str>,
    body: Option<Value>,
) -> Request<Body> {
    let mut builder = Request::builder().method(method).uri(uri);
    if let Some(token) = bearer {
        builder = builder.header(header::AUTHORIZATION, format!("Bearer {token}"));
    }
    let Some(body) = body else {
        return builder.body(Body::empty()).unwrap();
    };
    builder
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(body.to_string()))
        .unwrap()
}

pub async fn body_json(response: Response) -> Value {
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    if bytes.is_empty() {
        return Value::Null;
    }
    serde_json::from_slice(&bytes).unwrap()
}

/// The `name=value` part of the response's `Set-Cookie`, ready for a `Cookie` header.
pub fn session_cookie(response: &Response) -> String {
    let set_cookie = response.headers()[header::SET_COOKIE].to_str().unwrap();
    set_cookie.split(';').next().unwrap().to_string()
}

impl TestApp {
    pub async fn create_project(&self, key: &str, board_type: &str) -> Value {
        let body =
            json!({ "key": key, "name": format!("Project {key}"), "board_type": board_type });
        let (status, project) = self.post("/api/projects", body).await;
        assert_eq!(status, StatusCode::CREATED, "{project}");
        project
    }
}

impl TestApp {
    pub async fn settings(&self, key: &str) -> Value {
        let (status, settings) = self
            .get(&format!("/api/projects/{key}/board/settings"))
            .await;
        assert_eq!(status, StatusCode::OK, "{settings}");
        settings
    }

    pub async fn column_id(&self, key: &str, name: &str) -> i64 {
        let settings = self.settings(key).await;
        let column = settings["columns"]
            .as_array()
            .unwrap()
            .iter()
            .find(|column| column["name"] == name);
        column.unwrap()["id"].as_i64().unwrap()
    }

    pub async fn status_id(&self, key: &str, name: &str) -> i64 {
        let settings = self.settings(key).await;
        let mapped = settings["columns"]
            .as_array()
            .unwrap()
            .iter()
            .flat_map(|column| column["statuses"].as_array().unwrap());
        let mut all = mapped.chain(settings["unmapped"].as_array().unwrap());
        all.find(|status| status["name"] == name).unwrap()["id"]
            .as_i64()
            .unwrap()
    }

    pub async fn create_issue(&self, key: &str, body: Value) -> Value {
        let (status, issue) = self
            .post(&format!("/api/projects/{key}/issues"), body)
            .await;
        assert_eq!(status, StatusCode::CREATED, "{issue}");
        issue
    }
}

impl TestApp {
    pub async fn create_sprint(&self, key: &str) -> Value {
        let (status, sprint) = self
            .post(&format!("/api/projects/{key}/sprints"), json!({}))
            .await;
        assert_eq!(status, StatusCode::CREATED, "{sprint}");
        sprint
    }
}

impl TestApp {
    /// Brings `member` into project `key` with an invite link, the only way people join.
    pub async fn add_member(&self, key: &str, member: &TestApp, role: &str) {
        let (status, invite) = self
            .post(
                &format!("/api/projects/{key}/invites"),
                json!({ "role": role }),
            )
            .await;
        assert_eq!(status, StatusCode::CREATED, "{invite}");
        let accept = format!("/api/invites/{}/accept", invite["token"].as_str().unwrap());
        let (status, joined) = member.post(&accept, json!(null)).await;
        assert_eq!(status, StatusCode::OK, "{joined}");
        assert_eq!(joined["key"], key);
        assert_eq!(joined["role"], role);
    }
}
