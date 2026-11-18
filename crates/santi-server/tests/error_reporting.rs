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

fn sentry(rate: &'static str) -> (Arc<TestTransport>, Arc<sentry::Hub>, Dispatch) {
    let transport = TestTransport::new();
    let mut options = santi_server::observability::sentry_options(|name| match name {
        "SANTI_SENTRY_DSN" => Some("https://public@sentry.example.com/1".into()),
        "SANTI_SENTRY_TRACES_SAMPLE_RATE" => Some(rate.into()),
        _ => None,
    })
    .unwrap()
    .unwrap();
    options.transport = Some(Arc::new(transport.clone()));
    let dispatch = Dispatch::new(santi_server::observability::subscriber(
        EnvFilter::new("info"),
        true,
        std::io::sink,
        Some(&options),
    ));
    let hub = Arc::new(sentry::Hub::new(
        Some(Arc::new(sentry::Client::with_options(options))),
        Default::default(),
    ));
    (transport, hub, dispatch)
}

fn envelopes_text(transport: &TestTransport) -> Vec<String> {
    transport
        .fetch_and_clear_envelopes()
        .iter()
        .map(|envelope| {
            let mut bytes = Vec::new();
            envelope.to_writer(&mut bytes).unwrap();
            String::from_utf8(bytes).unwrap()
        })
        .collect()
}

#[sqlx::test]
async fn with_sentry_a_500_after_sign_in_sends_the_error_and_trace_without_the_user(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let (transport, hub, dispatch) = sentry("1");
    let token = ana.token.clone().unwrap();

    let refused = ana
        .send(json_request(Method::GET, "/api/projects/NOPE", None, None))
        .bind_hub(hub.clone())
        .with_subscriber(dispatch.clone())
        .await;
    assert_eq!(refused.status(), StatusCode::UNAUTHORIZED);
    assert!(transport.fetch_and_clear_events().is_empty());

    sqlx::query("ALTER TABLE project RENAME TO project_x")
        .execute(&pool)
        .await
        .unwrap();
    // tracing caches callsite interest from the registering thread's dispatcher while one scoped
    // dispatcher is alive, so a parallel test without one can disable the error callsite.
    tracing::dispatcher::with_default(&dispatch, tracing::callsite::rebuild_interest_cache);
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
    assert!(!problem.to_string().contains("does not exist"), "{problem}");
    let envelopes = envelopes_text(&transport);
    let event = envelopes
        .iter()
        .find(|text| text.contains("\"type\":\"event\""))
        .unwrap_or_else(|| panic!("no event in {envelopes:?}"));
    let trace = envelopes
        .iter()
        .find(|text| text.contains("\"type\":\"transaction\""))
        .unwrap_or_else(|| panic!("no transaction in {envelopes:?}"));
    assert!(event.contains("does not exist"), "{event}");
    for sent in [event, trace] {
        assert!(sent.contains("/api/projects"), "{sent}");
        for leak in [
            "hush",
            "secret",
            "user_id",
            token.as_str(),
            "ana@example.com",
        ] {
            assert!(!sent.contains(leak), "{leak} in {sent}");
        }
    }
}

#[test]
fn with_sentry_error_fields_outside_the_allowlist_are_dropped() {
    let (transport, hub, dispatch) = sentry("0");
    tracing::dispatcher::with_default(&dispatch, || {
        sentry::Hub::run(hub, || {
            tracing::error!(email = "x@y.z", error = "boom", "failed");
        })
    });

    let events = transport.fetch_and_clear_events();
    assert_eq!(events.len(), 1, "{events:?}");
    let event = serde_json::to_string(&events[0]).unwrap();
    assert!(event.contains("boom"), "{event}");
    assert!(!event.contains("x@y.z"), "{event}");
    assert!(!event.contains("email"), "{event}");
}
