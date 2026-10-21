mod common;

use std::io::Write;
use std::sync::{Arc, Mutex};

use axum::http::{Method, StatusCode};
use common::{TestApp, json_request};
use serde_json::{Value, json};
use sqlx::PgPool;
use tracing::Dispatch;
use tracing::instrument::WithSubscriber;
use tracing_subscriber::EnvFilter;

#[derive(Clone, Default)]
struct Logs(Arc<Mutex<Vec<u8>>>);

impl Write for Logs {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        self.0.lock().unwrap().extend_from_slice(bytes);
        Ok(bytes.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

impl Logs {
    fn lines(&self) -> Vec<String> {
        let text = String::from_utf8(self.0.lock().unwrap().clone()).unwrap();
        text.lines().map(str::to_string).collect()
    }
}

#[sqlx::test]
async fn each_request_logs_one_json_line_with_the_route_template(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("LOG", "scrum").await;
    ana.create_issue("LOG", json!({ "summary": "one" })).await;
    let logs = Logs::default();
    let writer = logs.clone();
    let dispatch = Dispatch::new(santi_server::observability::subscriber(
        EnvFilter::new("info"),
        true,
        move || writer.clone(),
    ));
    let uri = "/api/projects/LOG/issues/1?secret=hush";

    let mut signed_in = json_request(Method::GET, uri, ana.token.as_deref(), None);
    signed_in
        .headers_mut()
        .insert("x-request-id", "abc-123".parse().unwrap());
    let found = ana.send(signed_in).with_subscriber(dispatch.clone()).await;
    let mut anonymous = json_request(Method::GET, uri, None, None);
    anonymous
        .headers_mut()
        .insert("x-request-id", "not safe; id".parse().unwrap());
    let refused = ana.send(anonymous).with_subscriber(dispatch).await;

    assert_eq!(found.status(), StatusCode::OK);
    assert_eq!(found.headers()["x-request-id"], "abc-123");
    assert_eq!(refused.status(), StatusCode::UNAUTHORIZED);
    let generated = refused.headers()["x-request-id"]
        .to_str()
        .unwrap()
        .to_string();
    assert_eq!(generated.len(), 36);
    let lines = logs.lines();
    assert_eq!(lines.len(), 2, "{lines:?}");
    for line in &lines {
        let token = ana.token.as_deref().unwrap();
        for leak in ["LOG", "/issues/1", "secret", "hush", "Bearer", token] {
            assert!(!line.contains(leak), "{leak} in {line}");
        }
    }
    let first: Value = serde_json::from_str(&lines[0]).unwrap();
    assert_eq!(first["level"], "INFO");
    assert_eq!(first["status"], 200);
    assert!(first["latency_ms"].is_u64(), "{first}");
    assert_eq!(first["span"]["method"], "GET");
    assert_eq!(
        first["span"]["route"],
        "/api/projects/{key}/issues/{number}"
    );
    assert_eq!(first["span"]["request_id"], "abc-123");
    assert_eq!(first["span"]["user_id"], ana.user_id);
    let second: Value = serde_json::from_str(&lines[1]).unwrap();
    assert_eq!(second["status"], 401);
    assert_eq!(
        second["span"]["route"],
        "/api/projects/{key}/issues/{number}"
    );
    assert_eq!(second["span"]["request_id"], generated.as_str());
    assert!(second["span"].get("user_id").is_none(), "{second}");
}
