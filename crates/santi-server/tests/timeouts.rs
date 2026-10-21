mod common;

use std::time::{Duration, Instant};

use axum::http::header::RETRY_AFTER;
use axum::http::{Method, StatusCode};
use axum::response::IntoResponse;
use common::{TestApp, body_json, json_request};
use santi_server::AppState;
use santi_server::error::AppError;
use santi_server::timeouts::{self, Timeouts};
use serde_json::Value;
use sqlx::PgPool;

fn pool_like(pool: &PgPool, max_connections: u32, timeouts: &Timeouts) -> PgPool {
    timeouts::pool((*pool.connect_options()).clone(), max_connections, timeouts)
}

fn assert_busy(status: StatusCode, retry_after: Option<&str>, body: &Value) {
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE, "{body}");
    assert_eq!(retry_after, Some("1"));
    assert_eq!(body["type"], "urn:santi:error:busy");
    assert_eq!(body["detail"], "The server is busy; try again.");
}

async fn timed_get(app: &TestApp, uri: &str) -> (StatusCode, Option<String>, Value, Duration) {
    let started = Instant::now();
    let response = app
        .send(json_request(Method::GET, uri, app.token.as_deref(), None))
        .await;
    let elapsed = started.elapsed();
    let status = response.status();
    let retry_after = response
        .headers()
        .get(RETRY_AFTER)
        .map(|value| value.to_str().unwrap().to_string());
    (status, retry_after, body_json(response).await, elapsed)
}

#[sqlx::test]
async fn a_statement_past_the_timeout_is_a_busy_503(pool: PgPool) {
    let short = pool_like(
        &pool,
        1,
        &Timeouts {
            statement: Duration::from_millis(50),
            ..Timeouts::default()
        },
    );

    let error = sqlx::query("SELECT pg_sleep(1)")
        .execute(&short)
        .await
        .unwrap_err();
    let response = AppError::from(error).into_response();

    let status = response.status();
    let retry_after = response.headers().get(RETRY_AFTER).cloned();
    let body = body_json(response).await;
    assert_busy(
        status,
        retry_after.as_ref().and_then(|v| v.to_str().ok()),
        &body,
    );
}

#[sqlx::test]
async fn a_long_transaction_may_raise_its_statement_timeout(pool: PgPool) {
    let short = pool_like(
        &pool,
        1,
        &Timeouts {
            statement: Duration::from_millis(50),
            ..Timeouts::default()
        },
    );

    let mut tx = short.begin().await.unwrap();
    timeouts::allow_long_statements(&mut tx).await.unwrap();
    sqlx::query("SELECT pg_sleep(0.2)")
        .execute(&mut *tx)
        .await
        .unwrap();
    tx.commit().await.unwrap();

    let after = sqlx::query("SELECT pg_sleep(0.2)")
        .execute(&short)
        .await
        .unwrap_err();
    assert_eq!(after.as_database_error().unwrap().code().unwrap(), "57014");
}

#[sqlx::test]
async fn an_exhausted_pool_answers_503_fast_on_api_routes_and_health(pool: PgPool) {
    let acquire = Duration::from_millis(200);
    let small = pool_like(
        &pool,
        1,
        &Timeouts {
            acquire,
            ..Timeouts::default()
        },
    );
    let ana = TestApp::signed_in(small.clone(), "ana@example.com").await;
    let _held = small.acquire().await.unwrap();

    for uri in ["/api/projects", "/health"] {
        let (status, retry_after, body, elapsed) = timed_get(&ana, uri).await;

        assert_busy(status, retry_after.as_deref(), &body);
        assert!(
            elapsed < acquire + Duration::from_secs(2),
            "{uri}: {elapsed:?}"
        );
    }
}

#[sqlx::test]
async fn a_request_past_its_timeout_answers_503_except_streams_and_restore(pool: PgPool) {
    let acquire = Duration::from_secs(1);
    let small = pool_like(
        &pool,
        1,
        &Timeouts {
            acquire,
            ..Timeouts::default()
        },
    );
    let ana = TestApp::signed_in(small.clone(), "ana@example.com").await;
    let timed = TestApp {
        router: santi_server::app(
            AppState {
                request_timeout: Duration::from_millis(100),
                ..AppState::new(small.clone())
            },
            None,
        ),
        ..ana
    };
    let _held = small.acquire().await.unwrap();

    let (status, retry_after, body, elapsed) = timed_get(&timed, "/api/projects").await;
    assert_busy(status, retry_after.as_deref(), &body);
    assert!(elapsed < acquire, "{elapsed:?}");

    for uri in [
        "/api/projects/SHOP/issues/1/attachments/1",
        "/api/projects/restore",
    ] {
        let method = match uri.ends_with("restore") {
            true => Method::POST,
            false => Method::GET,
        };
        let started = Instant::now();
        let response = timed
            .send(json_request(method, uri, timed.token.as_deref(), None))
            .await;

        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE, "{uri}");
        assert!(
            started.elapsed() >= acquire,
            "{uri} was cut by the request timeout"
        );
    }
}
