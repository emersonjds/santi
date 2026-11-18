mod common;

use std::sync::Arc;

use axum::http::{Method, StatusCode};
use common::{TestApp, body_json, json_request};
use sentry::SentryFutureExt;
use sentry::test::TestTransport;
use sqlx::PgPool;
use tracing::Dispatch;
use tracing::instrument::WithSubscriber;
use tracing_subscriber::EnvFilter;

#[sqlx::test]
async fn without_sentry_a_failing_request_answers_500_as_before(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    pool.close().await;

    let (status, problem) = ana.get("/api/projects").await;

    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
    assert_eq!(problem["type"], "urn:santi:error:internal");
    assert_eq!(problem["detail"], "Something went wrong on the server.");
    assert!(!problem.to_string().contains("pool"), "{problem}");
}

#[sqlx::test]
async fn with_sentry_a_500_sends_one_event_with_the_error_and_a_4xx_none(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let transport = TestTransport::new();
    let mut options = santi_server::observability::sentry_options(|name| {
        (name == "SANTI_SENTRY_DSN").then(|| "https://public@sentry.example.com/1".into())
    })
    .unwrap()
    .unwrap();
    options.transport = Some(Arc::new(transport.clone()));
    let hub = Arc::new(sentry::Hub::new(
        Some(Arc::new(sentry::Client::with_options(options))),
        Default::default(),
    ));
    let dispatch = Dispatch::new(santi_server::observability::subscriber(
        EnvFilter::new("info"),
        true,
        std::io::sink,
        true,
    ));
    let token = ana.token.clone().unwrap();

    let refused = ana
        .send(json_request(Method::GET, "/api/projects/NOPE", None, None))
        .bind_hub(hub.clone())
        .with_subscriber(dispatch.clone())
        .await;
    assert_eq!(refused.status(), StatusCode::UNAUTHORIZED);
    assert!(transport.fetch_and_clear_events().is_empty());

    pool.close().await;
    let failed = ana
        .send(json_request(
            Method::GET,
            "/api/projects?secret=hush",
            Some(&token),
            None,
        ))
        .bind_hub(hub.clone())
        .with_subscriber(dispatch)
        .await;

    assert_eq!(failed.status(), StatusCode::INTERNAL_SERVER_ERROR);
    let problem = body_json(failed).await;
    assert!(!problem.to_string().contains("pool"), "{problem}");
    let events = transport.fetch_and_clear_events();
    assert_eq!(events.len(), 1, "{events:?}");
    let event = serde_json::to_string(&events[0]).unwrap();
    assert!(event.contains("closed pool"), "{event}");
    assert!(event.contains("/api/projects"), "{event}");
    for leak in [
        "hush",
        "secret",
        "user_id",
        token.as_str(),
        "ana@example.com",
    ] {
        assert!(!event.contains(leak), "{leak} in {event}");
    }
}
