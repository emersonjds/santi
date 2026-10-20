//! D39 regression guard: on a seeded 1k-issue dataset every hot endpoint stays within its SQL
//! statement budget (no N+1) and under a generous latency ceiling.
//! The statement counter is a process-wide `log` logger, so this binary holds a single test.

mod common;

use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::{Duration, Instant};

use axum::http::{Method, StatusCode, header};
use common::{TestApp, body_json, json_request, session_cookie};
use santi_server::seed::{self, SeedSize};
use serde_json::{Value, json};
use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;

static STATEMENTS: AtomicUsize = AtomicUsize::new(0);

/// sqlx reports every statement it runs on target `sqlx::query` (through `log` when no
/// `tracing` subscriber is installed).
struct StatementCounter;

impl log::Log for StatementCounter {
    fn enabled(&self, metadata: &log::Metadata) -> bool {
        metadata.target() == "sqlx::query"
    }

    fn log(&self, record: &log::Record) {
        if self.enabled(record.metadata()) {
            STATEMENTS.fetch_add(1, Ordering::SeqCst);
        }
    }

    fn flush(&self) {}
}

/// Name, method, URI, body, statement budget, expected status.
type Budget = (
    &'static str,
    Method,
    &'static str,
    Option<Value>,
    usize,
    StatusCode,
);

const CEILING: Duration = Duration::from_millis(250);

#[sqlx::test]
async fn hot_endpoints_stay_within_statement_and_latency_budgets(pool: PgPool) {
    log::set_logger(&StatementCounter).unwrap();
    log::set_max_level(log::LevelFilter::Debug);
    let size = SeedSize {
        issues: 1000,
        users: 10,
        sprints: 6,
    };
    seed::seed(&pool, &size).await.unwrap();
    let app = TestApp::anonymous(pool.clone());
    let login = json!({ "email": seed::OWNER_EMAIL, "password": seed::PASSWORD });
    let response = app
        .send(json_request(
            Method::POST,
            "/api/auth/login",
            None,
            Some(login),
        ))
        .await;
    assert_eq!(response.status(), StatusCode::OK);
    let cookie = session_cookie(&response);

    let budgets: [Budget; 28] = [
        (
            "board",
            Method::GET,
            "/api/projects/PERF/board",
            None,
            4,
            StatusCode::OK,
        ),
        (
            "kanban",
            Method::GET,
            "/api/projects/FLOW/board",
            None,
            4,
            StatusCode::OK,
        ),
        (
            "backlog",
            Method::GET,
            "/api/projects/PERF/backlog",
            None,
            5,
            StatusCode::OK,
        ),
        (
            "issue",
            Method::GET,
            "/api/projects/PERF/issues/300",
            None,
            2,
            StatusCode::OK,
        ),
        (
            "search",
            Method::GET,
            "/api/projects/PERF/issues?q=search%20index&type=bug&status=todo&parent=none&limit=50",
            None,
            2,
            StatusCode::OK,
        ),
        (
            "move",
            Method::POST,
            "/api/projects/PERF/issues/500/move",
            Some(json!({ "after": "PERF-520" })),
            9,
            StatusCode::OK,
        ),
        (
            "labels",
            Method::GET,
            "/api/projects/PERF/labels",
            None,
            2,
            StatusCode::OK,
        ),
        ("me", Method::GET, "/api/me", None, 2, StatusCode::OK),
        (
            "comment with nobody to notify",
            Method::POST,
            "/api/projects/PERF/issues/300/comments",
            Some(json!({ "body": "Plain note" })),
            4,
            StatusCode::CREATED,
        ),
        (
            "notifications",
            Method::GET,
            "/api/notifications",
            None,
            2,
            StatusCode::OK,
        ),
        (
            "unread count",
            Method::GET,
            "/api/notifications/unread-count",
            None,
            2,
            StatusCode::OK,
        ),
        (
            "my projects",
            Method::GET,
            "/api/me/projects",
            None,
            2,
            StatusCode::OK,
        ),
        (
            "star",
            Method::POST,
            "/api/me/stars",
            Some(json!({ "key": "PERF-300" })),
            2,
            StatusCode::NO_CONTENT,
        ),
        (
            "recommended",
            Method::GET,
            "/api/me/issues?view=recommended",
            None,
            2,
            StatusCode::OK,
        ),
        (
            "assigned",
            Method::GET,
            "/api/me/issues?view=assigned",
            None,
            2,
            StatusCode::OK,
        ),
        (
            "worked",
            Method::GET,
            "/api/me/issues?view=worked",
            None,
            2,
            StatusCode::OK,
        ),
        (
            "starred",
            Method::GET,
            "/api/me/issues?view=starred",
            None,
            2,
            StatusCode::OK,
        ),
        (
            "viewed",
            Method::GET,
            "/api/me/issues?view=viewed",
            None,
            2,
            StatusCode::OK,
        ),
        (
            "recent",
            Method::GET,
            "/api/me/recent?q=perf&limit=15",
            None,
            2,
            StatusCode::OK,
        ),
        (
            "starred feed",
            Method::GET,
            "/api/me/starred?kind=issue&limit=15",
            None,
            2,
            StatusCode::OK,
        ),
        (
            "view",
            Method::POST,
            "/api/projects/PERF/issues/300/view",
            None,
            2,
            StatusCode::NO_CONTENT,
        ),
        (
            "visit",
            Method::POST,
            "/api/projects/PERF/visit",
            None,
            2,
            StatusCode::NO_CONTENT,
        ),
        (
            "unstar",
            Method::DELETE,
            "/api/me/stars/PERF-300",
            None,
            2,
            StatusCode::NO_CONTENT,
        ),
        (
            "archived tab",
            Method::GET,
            "/api/projects?state=archived",
            None,
            2,
            StatusCode::OK,
        ),
        (
            "trash tab",
            Method::GET,
            "/api/projects?state=trashed",
            None,
            2,
            StatusCode::OK,
        ),
        (
            "reports sprints",
            Method::GET,
            "/api/projects/PERF/reports/sprints",
            None,
            2,
            StatusCode::OK,
        ),
        (
            "reports velocity",
            Method::GET,
            "/api/projects/PERF/reports/velocity",
            None,
            2,
            StatusCode::OK,
        ),
        (
            "sprint report",
            Method::GET,
            "/api/projects/PERF/sprints/1/report",
            None,
            3,
            StatusCode::OK,
        ),
    ];
    for (name, method, uri, body, budget, expected) in budgets {
        // A fresh single-connection pool: the first run lands on a cold connection, the worst
        // case for sqlx's per-connection caches, so the budget holds whichever connection serves.
        let cold = PgPoolOptions::new()
            .max_connections(1)
            .connect_with((*pool.connect_options()).clone())
            .await
            .unwrap();
        let app = TestApp::anonymous(cold);
        let mut fastest = Duration::MAX;
        let mut statements = 0;
        let mut payload = Value::Null;
        for _ in 0..3 {
            let mut request = json_request(method.clone(), uri, None, body.clone());
            let cookie = cookie.parse().unwrap();
            request.headers_mut().insert(header::COOKIE, cookie);
            STATEMENTS.store(0, Ordering::SeqCst);
            let started = Instant::now();
            let response = app.send(request).await;
            let status = response.status();
            payload = body_json(response).await;
            fastest = fastest.min(started.elapsed());
            statements = statements.max(STATEMENTS.load(Ordering::SeqCst));
            assert_eq!(status, expected, "{name}: {payload}");
        }
        assert!(
            (1..=budget).contains(&statements),
            "{name}: {statements} statements, budget {budget}"
        );
        assert!(fastest < CEILING, "{name}: {fastest:?}");
        if name == "backlog" {
            let longest = payload["sections"]
                .as_array()
                .unwrap()
                .iter()
                .flat_map(|section| section["cards"].as_array().unwrap())
                .map(|card| card["rank"].as_str().unwrap().len())
                .max()
                .unwrap();
            assert!(longest <= 5, "backlog rank keys up to {longest} chars");
        }
    }

    // A delete runs once per issue, so it is measured once, on the costliest case: a parent in
    // the running sprint (its removal is recorded).
    let in_sprint: i64 = sqlx::query_scalar(
        "SELECT i.number FROM issue i JOIN sprint s ON s.id = i.sprint_id
         JOIN project p ON p.id = i.project_id
         WHERE p.key = 'PERF' AND s.state = 'active' AND i.issue_type <> 'subtask'
         ORDER BY i.number LIMIT 1",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let uri = format!("/api/projects/PERF/issues/{in_sprint}");
    let mut request = json_request(Method::DELETE, &uri, None, None);
    request
        .headers_mut()
        .insert(header::COOKIE, cookie.parse().unwrap());
    STATEMENTS.store(0, Ordering::SeqCst);
    let started = Instant::now();
    let response = app.send(request).await;
    let statements = STATEMENTS.load(Ordering::SeqCst);
    assert_eq!(response.status(), StatusCode::NO_CONTENT);
    assert!(
        (1..=5).contains(&statements),
        "delete: {statements} statements, budget 5"
    );
    assert!(
        started.elapsed() < CEILING,
        "delete: {:?}",
        started.elapsed()
    );

    // The sample project (SAN-62) runs once per user: its whole seed, then the cheap reopen.
    for (name, budget, ceiling) in [("sample", 152, CEILING * 4), ("sample again", 3, CEILING)] {
        let mut request = json_request(Method::POST, "/api/sample-project", None, None);
        request
            .headers_mut()
            .insert(header::COOKIE, cookie.parse().unwrap());
        STATEMENTS.store(0, Ordering::SeqCst);
        let started = Instant::now();
        let response = app.send(request).await;
        let elapsed = started.elapsed();
        let statements = STATEMENTS.load(Ordering::SeqCst);
        assert!(response.status().is_success(), "{name}");
        assert!(
            (1..=budget).contains(&statements),
            "{name}: {statements} statements, budget {budget}"
        );
        assert!(elapsed < ceiling, "{name}: {elapsed:?}");
    }

    // SAN-70: each lifecycle step runs once, ending with the purge of the seeded kanban project.
    for (name, method, uri, budget, ceiling) in [
        (
            "archive",
            Method::POST,
            "/api/projects/FLOW/archive",
            2,
            CEILING,
        ),
        (
            "unarchive",
            Method::POST,
            "/api/projects/FLOW/unarchive",
            2,
            CEILING,
        ),
        (
            "trash",
            Method::POST,
            "/api/projects/FLOW/trash",
            2,
            CEILING,
        ),
        (
            "restore",
            Method::POST,
            "/api/projects/FLOW/restore",
            3,
            CEILING,
        ),
        (
            "trash again",
            Method::POST,
            "/api/projects/FLOW/trash",
            2,
            CEILING,
        ),
        (
            "purge",
            Method::DELETE,
            "/api/projects/FLOW",
            3,
            CEILING * 4,
        ),
    ] {
        let mut request = json_request(method, uri, None, None);
        request
            .headers_mut()
            .insert(header::COOKIE, cookie.parse().unwrap());
        STATEMENTS.store(0, Ordering::SeqCst);
        let started = Instant::now();
        let response = app.send(request).await;
        let elapsed = started.elapsed();
        let statements = STATEMENTS.load(Ordering::SeqCst);
        assert_eq!(response.status(), StatusCode::NO_CONTENT, "{name}");
        assert!(
            (1..=budget).contains(&statements),
            "{name}: {statements} statements, budget {budget}"
        );
        assert!(elapsed < ceiling, "{name}: {elapsed:?}");
    }
}
