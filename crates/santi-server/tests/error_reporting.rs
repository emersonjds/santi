mod common;

use axum::http::StatusCode;
use common::TestApp;
use sqlx::PgPool;

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
