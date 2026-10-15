# E2 Domain and API — implementation plan

> For agentic workers: execute task by task, one agent at a time. Steps use checkbox (`- [ ]`) syntax.

**Goal:** a JSON API over PostgreSQL that covers auth, projects, members, statuses, the board layout, issues, sprints and the board/backlog reads, documented by OpenAPI at `/docs`, so E3 (CLI and MCP) can drive every manual action.

**Architecture:** `santi-server` gains one vertical slice per concept (`auth/`, `projects/`, `members/`, `boards/`, `issues/`, `sprints/`), each split into `domain.rs` (pure rules), `repo.rs` (sqlx), `service.rs` (use cases taking `&Member`) and `handler.rs` (JSON routes with utoipa annotations). Request and response types live in `santi-types` so the CLI reuses them. Migrations are embedded and applied at startup; every error is RFC 9457 problem+json; responses are gzip/br compressed (D34).

**Tech stack:** Rust 1.97 (edition 2024), axum 0.8.9, axum-extra 0.12.6 (`query`), sqlx 0.9 (PostgreSQL 17, `runtime-tokio`, `macros`, `migrate`, `chrono`), utoipa 6 + utoipa-axum 0.3 + utoipa-swagger-ui 10 (`vendored`), tower-http 0.7.1 (`compression-gzip`, `compression-br`, `csrf`), argon2 0.6, sha2 0.11, getrandom 0.4, chrono 0.4.45, sqlx-cli 0.9.0, PostgreSQL 17 on OrbStack.

## Global constraints

- Binding inputs: `docs/specs/2026-10-15-santi-v1-design.md`, `docs/specs/decisions.md` (D1–D34), the "Proposed v1 cut" sections of `docs/specs/behavior/{scrum-board,kanban-board,backlog,sprint-lifecycle}.md`. Never open `/research`.
- Branch per task: `feat/SAN-<card>-<slug>` out of an up-to-date `developer` (`<card>` is the Jira card of the task). Conventional Commits in English, author `Emerson Silva <emerson_jdss@hotmail.com>`, no trailers, files added by name.
- Local database: `docker --context orbstack compose up -d --wait` (OrbStack only). Every shell exports `DATABASE_URL=postgres://santi:santi@localhost:5440/santi`.
- sqlx-cli once per machine: `cargo install sqlx-cli --version 0.9.0 --locked --no-default-features --features postgres,rustls`.
- After adding a migration: `sqlx migrate run --source crates/santi-server/migrations` (the query macros check SQL against this database). After any SQL change: `cargo sqlx prepare --workspace` and commit `.sqlx/` (D27).
- SQL lives in `repo.rs` files (plus the health ping) and uses the checked macros `sqlx::query!`, `query_as!`, `query_scalar!`. Tests use the runtime functions (`sqlx::query`, `sqlx::query_scalar`) so they need no `.sqlx/` entries.
- Repo functions take `conn: &mut PgConnection` and return `Result<_, sqlx::Error>`; callers pass `&mut tx` (a `Transaction`) or `&mut conn` (a `PoolConnection`), which deref to `PgConnection`. Inside repo functions executors are written `&mut *conn`.
- Services take `pool: &PgPool` and `&Member` (project routes) or `&CurrentUser` (user routes) and return `Result<_, AppError>`; handlers only extract, call one service function and wrap the result.
- Enums are `text` columns with a `CHECK`; the Rust enum lives in `santi-types` with `#[cfg_attr(feature = "sqlx", derive(sqlx::Type), sqlx(type_name = "text", rename_all = "snake_case"))]` and `#[serde(rename_all = "snake_case")]`. Decode with `col AS "col: Type"`, bind with `value as Type`, bind arrays with `&values[..] as &[Type]`.
- Errors: only `AppError` (Task 1) leaves a handler. Problem `type` is `urn:santi:error:<slug>`. Slugs used in E2: `bad-request`, `validation`, `unauthorized`, `forbidden`, `not-found`, `already-exists`, `in-use`, `internal`, `last-admin`, `done-column`, `rightmost-column`, `status-unmapped`, `no-todo-status`, `kanban-has-no-sprints`, `kanban-has-no-backlog`, `sprint-not-future`, `sprint-not-active`, `sprint-already-active`, `sprint-empty`, `sprint-closed`.
- Readability: a non-Rust developer understands any function in about 10 seconds — short functions, early returns, descriptive names, no abbreviations, no clever generics, no trait with a single implementation, no macros of our own. Comments only for facts the code cannot show (decision ids are fine: `-- D20`).
- Performance: board and backlog cards come from exactly one ranked query each, plus a fixed number of small metadata queries (never one per column, card or filter); every filter and sort path has an index declared in its migration; `rank` is `text COLLATE "C"`.
- Pagination (D29): search and comments use keyset (`limit` default 50, max 200, `cursor` = last id, response `next_cursor`); board and backlog are unpaged; configuration lists (projects, members, tokens, statuses, sprints) are bounded and unpaged.
- Tests: pure domain rules as unit tests inside `domain.rs`; everything that touches the database as HTTP tests in `crates/santi-server/tests/<topic>.rs` with `#[sqlx::test]` (fresh database per test, migrations applied) through `tests/common/mod.rs`. TDD per task: write the task's tests together, one red run, the code, one green run.
- Gate at the end of every task, all clean:
  - `cargo fmt --all --check`
  - `cargo clippy --workspace --all-targets -- -D warnings`
  - `cargo test --workspace`
  - `cargo sqlx prepare --workspace --check`
  - `LLVM_COV=$(brew --prefix llvm@22)/bin/llvm-cov LLVM_PROFDATA=$(brew --prefix llvm@22)/bin/llvm-profdata cargo llvm-cov --workspace --ignore-filename-regex 'main\.rs$' --fail-under-lines 90 --fail-under-functions 90 --fail-under-regions 90`
- Out of E2 (YAGNI): issue deletion, password change, sprint reports read endpoint, closed-sprint reopen/delete, sprint reordering, swimlanes, saved filters, real-time push, TLS to PostgreSQL (add `tls-rustls-ring-webpki` to sqlx when an instance needs a remote database), HTML pages (E4).

## File map

```
compose.yaml                                   PostgreSQL 17 on port 5440 (Task 1)
.github/workflows/ci.yml                       Postgres service, sqlx prepare --check (Task 1)
.sqlx/                                         offline query data, refreshed by every task with SQL
crates/santi-types/src/
  lib.rs        Health, Problem, FieldError, nullable_field (Tasks 1, 5)
  auth.rs       Register, Login, User, CreateToken, CreatedToken, ApiToken (Task 2)
  projects.rs   BoardType, MemberRole, CreateProject, Project, MemberInfo, AddMember, SetRole, CreateInvite, Invite (Task 3)
  boards.rs     StatusCategory, Status, Column, BoardSettings + edits (Task 4); Card, BoardView, Backlog… (Task 9)
  issues.rs     IssueType, Priority, CreateIssue, Issue, UpdateIssue (Task 5); MoveIssue, Comment, Page, IssueFilter (Task 6)
  sprints.rs    SprintState, Sprint, CreateSprint, UpdateSprint (Task 7); StartSprint, CompleteSprint (Task 8)
crates/santi-server/
  migrations/0001_extensions.sql … 0008_sprint_facts.sql
  src/lib.rs           AppState, app(), migrate(), health, OpenAPI
  src/error.rs         AppError -> problem+json (D24)
  src/extract.rs       JsonBody, PathParams, QueryParams (rejections as problem+json)
  src/pagination.rs    page_limit, into_page (Task 6)
  src/auth/            mod.rs, domain.rs, repo.rs, service.rs, handler.rs, extract.rs (CurrentUser)
  src/projects/        mod.rs, domain.rs, repo.rs, service.rs, handler.rs
  src/members/         mod.rs (Member), domain.rs, repo.rs, service.rs, handler.rs, extract.rs (Member extractor, D28)
  src/boards/          mod.rs, domain.rs, repo.rs, service.rs, handler.rs
  src/issues/          mod.rs, domain.rs, repo.rs, service.rs, handler.rs
  src/sprints/         mod.rs, domain.rs, repo.rs, service.rs, handler.rs
  tests/common/mod.rs  TestApp helper
  tests/health.rs, foundation.rs, auth.rs, projects.rs, board_settings.rs, issues.rs,
        issue_moves.rs, comments_search.rs, sprints.rs, sprint_lifecycle.rs, board_view.rs, backlog.rs
```

Each slice's `mod.rs` only declares its files, e.g. `pub mod domain; pub mod handler; pub mod repo; pub mod service;`.

---

### Task 1: Database, errors, OpenAPI and compression

**Branch:** `feat/SAN-<card>-database-foundation`

**Files:**
- Create: `compose.yaml`
- Modify: `Cargo.toml`, `crates/santi-types/Cargo.toml`, `crates/santi-types/src/lib.rs`, `crates/santi-server/Cargo.toml`, `crates/santi-server/src/lib.rs`, `crates/santi-server/src/main.rs`, `crates/santi-server/tests/health.rs`, `.github/workflows/ci.yml`, `CONTRIBUTING.md`
- Create: `crates/santi-server/migrations/0001_extensions.sql`, `crates/santi-server/src/error.rs`, `crates/santi-server/src/extract.rs`, `crates/santi-server/tests/common/mod.rs`, `crates/santi-server/tests/foundation.rs`, `.sqlx/`

**Interfaces:**
- Consumes: `santi_types::Health { status: String, version: String }` (E0).
- Produces:
  - `santi_server::AppState { pub pool: PgPool }` (`Clone`)
  - `santi_server::app(state: AppState) -> axum::Router` (replaces E0's `app()`)
  - `santi_server::migrate(pool: &PgPool) -> Result<(), sqlx::migrate::MigrateError>`
  - `santi_server::error::AppError` with variants `BadRequest(String)`, `Validation(Vec<FieldError>)`, `Unauthorized`, `Forbidden`, `NotFound`, `Conflict { slug: &'static str, detail: String }`, `Internal(String)`; constructors `AppError::invalid(field: &str, message: &str) -> AppError`, `AppError::conflict(slug: &'static str, detail: &str) -> AppError`; `fn to_problem(&self) -> Problem`; `impl IntoResponse`; `impl From<sqlx::Error>`, `From<JsonRejection>`, `From<PathRejection>`
  - `santi_server::extract::{JsonBody<T>(pub T), PathParams<T>(pub T)}`
  - `santi_types::{Problem { problem_type (serialized "type"), title, status: u16, detail, errors: Vec<FieldError> }, FieldError { field, message }}`
  - Test helper `tests/common/mod.rs`: `TestApp::anonymous(pool) -> TestApp`, `send(&self, Request<Body>) -> Response`, `get/delete(&self, uri) -> (StatusCode, Value)`, `post/put/patch(&self, uri, Value) -> (StatusCode, Value)`, `json_request(method, uri, bearer: Option<&str>, body: Option<Value>) -> Request<Body>`, `body_json(Response) -> Value`

- [ ] **Step 1: PostgreSQL compose file**

`compose.yaml`:

```yaml
services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_USER: santi
      POSTGRES_PASSWORD: santi
      POSTGRES_DB: santi
    ports:
      - "5440:5432"
    volumes:
      - santi-postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U santi -d santi"]
      interval: 2s
      timeout: 3s
      retries: 15

volumes:
  santi-postgres:
```

Run: `docker --context orbstack compose up -d --wait`
Expected: `Container santi-postgres-1  Healthy`.

- [ ] **Step 2: Manifests**

`Cargo.toml`, replace `[workspace.dependencies]` and add the profile at the end:

```toml
[workspace.dependencies]
santi-types = { path = "crates/santi-types" }
axum = { version = "0.8.9", features = ["macros"] }
tokio = { version = "1.53", features = ["macros", "rt-multi-thread", "net"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
clap = { version = "4.6", features = ["derive"] }
tower = { version = "0.5", features = ["util"] }
http-body-util = "0.1"
sqlx = { version = "0.9", default-features = false, features = ["runtime-tokio", "postgres", "macros", "migrate", "chrono"] }
chrono = { version = "0.4.45", default-features = false, features = ["clock", "serde", "std"] }
utoipa = { version = "6", features = ["chrono"] }
utoipa-axum = "0.3"
utoipa-swagger-ui = { version = "10", features = ["axum", "vendored"] }
tower-http = { version = "0.7.1", features = ["compression-gzip", "compression-br"] }
```

`crates/santi-types/Cargo.toml`:

```toml
[features]
sqlx = ["dep:sqlx"]

[dependencies]
serde.workspace = true
chrono.workspace = true
utoipa.workspace = true
sqlx = { workspace = true, optional = true }
```

(keep `[package]`, `[dev-dependencies]` and `[lints]` as they are.)

`crates/santi-server/Cargo.toml`:

```toml
[dependencies]
santi-types = { workspace = true, features = ["sqlx"] }
axum.workspace = true
tokio.workspace = true
sqlx.workspace = true
chrono.workspace = true
utoipa.workspace = true
utoipa-axum.workspace = true
utoipa-swagger-ui.workspace = true
tower-http.workspace = true

[dev-dependencies]
tower.workspace = true
http-body-util.workspace = true
serde_json.workspace = true
```

- [ ] **Step 3: First migration and apply it**

`crates/santi-server/migrations/0001_extensions.sql`:

```sql
-- Trigram index support for free-text issue search (D3, Task 6).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

Run: `sqlx migrate run --source crates/santi-server/migrations`
Expected: `Applied 1/migrate extensions`.

- [ ] **Step 4: Write the failing tests**

`crates/santi-server/tests/common/mod.rs`:

```rust
#![allow(dead_code)]

use axum::Router;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use axum::response::Response;
use http_body_util::BodyExt;
use serde_json::Value;
use sqlx::PgPool;
use tower::ServiceExt;

#[derive(Clone)]
pub struct TestApp {
    pub router: Router,
    pub token: Option<String>,
    pub user_id: i64,
}

impl TestApp {
    pub fn anonymous(pool: PgPool) -> Self {
        let router = santi_server::app(santi_server::AppState { pool });
        TestApp { router, token: None, user_id: 0 }
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

    async fn call(&self, method: Method, uri: &str, body: Option<Value>) -> (StatusCode, Value) {
        let request = json_request(method, uri, self.token.as_deref(), body);
        let response = self.send(request).await;
        let status = response.status();
        (status, body_json(response).await)
    }
}

pub fn json_request(method: Method, uri: &str, bearer: Option<&str>, body: Option<Value>) -> Request<Body> {
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
```

`crates/santi-server/tests/health.rs` (replaces the E0 file):

```rust
mod common;

use axum::http::StatusCode;
use common::TestApp;
use sqlx::PgPool;

#[sqlx::test]
async fn health_returns_ok_and_package_version(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let (status, body) = app.get("/health").await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["status"], "ok");
    assert_eq!(body["version"], env!("CARGO_PKG_VERSION"));
}
```

`crates/santi-server/tests/foundation.rs`:

```rust
mod common;

use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use common::TestApp;
use sqlx::PgPool;

#[sqlx::test]
async fn unknown_route_returns_not_found_problem(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let response = app.send(Request::get("/nope").body(Body::empty()).unwrap()).await;

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    assert_eq!(response.headers()[header::CONTENT_TYPE], "application/problem+json");
    let body = common::body_json(response).await;
    assert_eq!(body["type"], "urn:santi:error:not-found");
    assert_eq!(body["status"], 404);
}

#[sqlx::test]
async fn openapi_document_lists_health_and_problem(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let (status, body) = app.get("/openapi.json").await;

    assert_eq!(status, StatusCode::OK);
    assert!(body["paths"]["/health"]["get"].is_object());
    assert!(body["components"]["schemas"]["Problem"].is_object());
}

#[sqlx::test]
async fn docs_page_is_served(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let response = app.send(Request::get("/docs/").body(Body::empty()).unwrap()).await;

    assert_eq!(response.status(), StatusCode::OK);
    let content_type = response.headers()[header::CONTENT_TYPE].to_str().unwrap();
    assert!(content_type.starts_with("text/html"));
}

#[sqlx::test]
async fn responses_are_gzip_compressed_when_accepted(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    let request = Request::get("/openapi.json")
        .header(header::ACCEPT_ENCODING, "gzip")
        .body(Body::empty())
        .unwrap();

    let response = app.send(request).await;

    assert_eq!(response.headers()[header::CONTENT_ENCODING], "gzip");
}

#[sqlx::test]
async fn responses_are_brotli_compressed_when_accepted(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    let request = Request::get("/openapi.json")
        .header(header::ACCEPT_ENCODING, "br")
        .body(Body::empty())
        .unwrap();

    let response = app.send(request).await;

    assert_eq!(response.headers()[header::CONTENT_ENCODING], "br");
}

#[sqlx::test(migrations = false)]
async fn migrations_apply_to_an_empty_database(pool: PgPool) {
    santi_server::migrate(&pool).await.unwrap();

    let installed: i64 =
        sqlx::query_scalar("SELECT count(*) FROM pg_extension WHERE extname = 'pg_trgm'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(installed, 1);
}
```

Unit tests at the bottom of `crates/santi-server/src/error.rs` (the file holds only this module for now):

```rust
#[cfg(test)]
mod tests {
    use super::AppError;
    use axum::http::{StatusCode, header};
    use axum::response::IntoResponse;
    use sqlx::PgPool;

    #[test]
    fn validation_lists_field_errors_with_422() {
        let problem = AppError::invalid("email", "must be an email address").to_problem();

        assert_eq!(problem.status, 422);
        assert_eq!(problem.problem_type, "urn:santi:error:validation");
        assert_eq!(problem.errors[0].field, "email");
    }

    #[test]
    fn conflict_puts_its_slug_in_the_type() {
        let problem = AppError::conflict("sprint-empty", "Add an issue first.").to_problem();

        assert_eq!(problem.status, 409);
        assert_eq!(problem.problem_type, "urn:santi:error:sprint-empty");
        assert_eq!(problem.detail, "Add an issue first.");
    }

    #[test]
    fn internal_error_hides_its_message() {
        let problem = AppError::Internal("password=hunter2".into()).to_problem();

        assert_eq!(problem.status, 500);
        assert!(!problem.detail.contains("hunter2"));
    }

    #[test]
    fn every_status_maps_to_its_code() {
        assert_eq!(AppError::BadRequest("x".into()).to_problem().status, 400);
        assert_eq!(AppError::Unauthorized.to_problem().status, 401);
        assert_eq!(AppError::Forbidden.to_problem().status, 403);
        assert_eq!(AppError::NotFound.to_problem().status, 404);
    }

    #[test]
    fn response_uses_problem_content_type() {
        let response = AppError::NotFound.into_response();

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        assert_eq!(response.headers()[header::CONTENT_TYPE], "application/problem+json");
    }

    #[test]
    fn row_not_found_becomes_not_found() {
        assert_eq!(AppError::from(sqlx::Error::RowNotFound), AppError::NotFound);
    }

    #[sqlx::test(migrations = false)]
    async fn database_constraint_errors_are_mapped(pool: PgPool) {
        sqlx::query("CREATE TABLE sample (id int PRIMARY KEY, amount int CHECK (amount > 0), parent int REFERENCES sample (id))")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO sample (id, amount) VALUES (1, 5)").execute(&pool).await.unwrap();

        let duplicate = sqlx::query("INSERT INTO sample (id, amount) VALUES (1, 5)").execute(&pool).await.unwrap_err();
        let negative = sqlx::query("INSERT INTO sample (id, amount) VALUES (2, -1)").execute(&pool).await.unwrap_err();
        let orphan = sqlx::query("INSERT INTO sample (id, amount, parent) VALUES (3, 1, 99)").execute(&pool).await.unwrap_err();
        let syntax = sqlx::query("SELEC 1").execute(&pool).await.unwrap_err();

        assert_eq!(AppError::from(duplicate).to_problem().problem_type, "urn:santi:error:already-exists");
        assert_eq!(AppError::from(negative).to_problem().status, 422);
        assert_eq!(AppError::from(orphan).to_problem().problem_type, "urn:santi:error:in-use");
        assert_eq!(AppError::from(syntax).to_problem().status, 500);
    }
}
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `cargo test -p santi-server`
Expected: compile errors — `function takes 0 arguments but 1 argument was supplied` / `cannot find struct AppState`, `cannot find function migrate`, `cannot find type AppError`.

- [ ] **Step 6: Minimal implementation**

`crates/santi-types/src/lib.rs` (above the existing test module; add `ToSchema` to `Health`):

```rust
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct Health {
    pub status: String,
    pub version: String,
}

/// RFC 9457 problem details, the body of every error response (D24).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct Problem {
    #[serde(rename = "type")]
    pub problem_type: String,
    pub title: String,
    pub status: u16,
    pub detail: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub errors: Vec<FieldError>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct FieldError {
    pub field: String,
    pub message: String,
}
```

`crates/santi-server/src/error.rs`:

```rust
use axum::Json;
use axum::extract::rejection::{JsonRejection, PathRejection};
use axum::http::{StatusCode, header::CONTENT_TYPE};
use axum::response::{IntoResponse, Response};
use santi_types::{FieldError, Problem};

#[derive(Debug, PartialEq)]
pub enum AppError {
    BadRequest(String),
    Validation(Vec<FieldError>),
    Unauthorized,
    Forbidden,
    NotFound,
    Conflict { slug: &'static str, detail: String },
    Internal(String),
}

impl AppError {
    pub fn invalid(field: &str, message: &str) -> Self {
        AppError::Validation(vec![FieldError { field: field.into(), message: message.into() }])
    }

    pub fn conflict(slug: &'static str, detail: &str) -> Self {
        AppError::Conflict { slug, detail: detail.into() }
    }

    pub fn to_problem(&self) -> Problem {
        let (status, slug, title, detail) = match self {
            AppError::BadRequest(detail) => (400, "bad-request", "Malformed request", detail.clone()),
            AppError::Validation(_) => (422, "validation", "Invalid input", "One or more fields are invalid.".into()),
            AppError::Unauthorized => (401, "unauthorized", "Not signed in", "Sign in or send a valid API token.".into()),
            AppError::Forbidden => (403, "forbidden", "Not allowed", "You are not allowed to do this.".into()),
            AppError::NotFound => (404, "not-found", "Not found", "Nothing exists here, or you cannot see it.".into()),
            AppError::Conflict { slug, detail } => (409, *slug, "Conflict", detail.clone()),
            AppError::Internal(_) => (500, "internal", "Internal error", "Something went wrong on the server.".into()),
        };
        let errors = match self {
            AppError::Validation(errors) => errors.clone(),
            _ => Vec::new(),
        };
        Problem { problem_type: format!("urn:santi:error:{slug}"), title: title.into(), status, detail, errors }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        if let AppError::Internal(message) = &self {
            eprintln!("internal error: {message}");
        }
        let problem = self.to_problem();
        let status = StatusCode::from_u16(problem.status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
        (status, [(CONTENT_TYPE, "application/problem+json")], Json(problem)).into_response()
    }
}

impl From<sqlx::Error> for AppError {
    fn from(error: sqlx::Error) -> Self {
        if matches!(error, sqlx::Error::RowNotFound) {
            return AppError::NotFound;
        }
        let Some(database_error) = error.as_database_error() else {
            return AppError::Internal(error.to_string());
        };
        if database_error.is_unique_violation() {
            return AppError::conflict("already-exists", "A record with these values already exists.");
        }
        if database_error.is_foreign_key_violation() {
            return AppError::conflict("in-use", "Other records still point to this one.");
        }
        if database_error.is_check_violation() {
            return AppError::invalid(database_error.constraint().unwrap_or("input"), "value is not allowed");
        }
        AppError::Internal(error.to_string())
    }
}

impl From<JsonRejection> for AppError {
    fn from(rejection: JsonRejection) -> Self {
        AppError::BadRequest(rejection.body_text())
    }
}

impl From<PathRejection> for AppError {
    fn from(rejection: PathRejection) -> Self {
        AppError::BadRequest(rejection.body_text())
    }
}
```

`crates/santi-server/src/extract.rs`:

```rust
use axum::extract::{FromRequest, FromRequestParts};

use crate::error::AppError;

/// JSON request body; a malformed body answers with problem+json (D24).
#[derive(FromRequest)]
#[from_request(via(axum::Json), rejection(AppError))]
pub struct JsonBody<T>(pub T);

/// Path parameters; an unparsable segment answers with problem+json (D24).
#[derive(FromRequestParts)]
#[from_request(via(axum::extract::Path), rejection(AppError))]
pub struct PathParams<T>(pub T);
```

`crates/santi-server/src/lib.rs`:

```rust
pub mod error;
pub mod extract;

use axum::extract::State;
use axum::{Json, Router};
use santi_types::{Health, Problem};
use sqlx::PgPool;
use tower_http::compression::CompressionLayer;
use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;
use utoipa_swagger_ui::SwaggerUi;

use crate::error::AppError;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
}

#[derive(OpenApi)]
#[openapi(
    info(
        title = "santi",
        description = "Agile tracker API. Authenticate with the `santi_session` cookie or `Authorization: Bearer santi_…`. Errors are RFC 9457 `application/problem+json`."
    ),
    components(schemas(Problem))
)]
struct ApiDoc;

pub fn app(state: AppState) -> Router {
    let (router, api) = OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(health))
        .split_for_parts();
    router
        .merge(SwaggerUi::new("/docs").url("/openapi.json", api))
        .fallback(not_found)
        .layer(CompressionLayer::new())
        .with_state(state)
}

pub async fn migrate(pool: &PgPool) -> Result<(), sqlx::migrate::MigrateError> {
    sqlx::migrate!().run(pool).await
}

#[utoipa::path(get, path = "/health", tag = "health", responses((status = 200, body = Health)))]
async fn health(State(state): State<AppState>) -> Result<Json<Health>, AppError> {
    sqlx::query_scalar!(r#"SELECT 1 AS "one!""#).fetch_one(&state.pool).await?;
    Ok(Json(Health { status: "ok".into(), version: env!("CARGO_PKG_VERSION").into() }))
}

async fn not_found() -> AppError {
    AppError::NotFound
}
```

`crates/santi-server/src/main.rs`:

```rust
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let database_url = std::env::var("DATABASE_URL")?;
    let address = std::env::var("SANTI_ADDR").unwrap_or_else(|_| "127.0.0.1:8080".into());
    let pool = sqlx::PgPool::connect(&database_url).await?;
    santi_server::migrate(&pool).await?;
    let listener = tokio::net::TcpListener::bind(address).await?;
    axum::serve(listener, santi_server::app(santi_server::AppState { pool })).await?;
    Ok(())
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cargo test -p santi-server`
Expected: `test result: ok.` for the unit tests, `tests/health.rs` and `tests/foundation.rs`, 0 failed.

- [ ] **Step 8: Offline query data, CI and contributor docs**

Run: `cargo sqlx prepare --workspace`
Expected: `query data written to .sqlx in the workspace root; please check this into version control`.

`.github/workflows/ci.yml`: add to **both** jobs (`check` and `branch-coverage`) this `services` block and `env`, right under `runs-on`:

```yaml
    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_USER: santi
          POSTGRES_PASSWORD: santi
          POSTGRES_DB: santi
        ports:
          - 5440:5432
        options: >-
          --health-cmd "pg_isready -U santi -d santi"
          --health-interval 2s --health-timeout 3s --health-retries 15
    env:
      DATABASE_URL: postgres://santi:santi@localhost:5440/santi
      SQLX_OFFLINE: "true"
```

and in the `check` job, after `cargo clippy …`:

```yaml
      - run: cargo install sqlx-cli --version 0.9.0 --locked --no-default-features --features postgres,rustls
      - run: sqlx migrate run --source crates/santi-server/migrations
      - run: cargo sqlx prepare --workspace --check
```

`CONTRIBUTING.md`, add a `## Database` section:

```markdown
## Database

santi needs PostgreSQL 17. Start it on OrbStack and point the tools at it:

    docker --context orbstack compose up -d --wait
    export DATABASE_URL=postgres://santi:santi@localhost:5440/santi
    cargo install sqlx-cli --version 0.9.0 --locked --no-default-features --features postgres,rustls
    sqlx migrate run --source crates/santi-server/migrations

Tests create a throwaway database per test (`#[sqlx::test]`). After changing any SQL, refresh the
offline query data with `cargo sqlx prepare --workspace` and commit `.sqlx/`.
```

- [ ] **Step 9: Gate**

Run the gate from Global constraints. Expected: fmt and clippy clean, `test result: ok.` everywhere, `query data is up to date`, coverage above 90% on the three metrics.
Run: `DATABASE_URL=$DATABASE_URL cargo run -p santi-server` then `curl -s localhost:8080/health` — expected `{"status":"ok","version":"0.1.0"}`; `curl -sI localhost:8080/docs/` — expected `HTTP/1.1 200 OK`.

- [ ] **Step 10: Commit**

```bash
git add compose.yaml Cargo.toml Cargo.lock crates/santi-types/Cargo.toml crates/santi-types/src/lib.rs \
  crates/santi-server/Cargo.toml crates/santi-server/migrations/0001_extensions.sql \
  crates/santi-server/src/lib.rs crates/santi-server/src/main.rs crates/santi-server/src/error.rs \
  crates/santi-server/src/extract.rs crates/santi-server/tests/common/mod.rs \
  crates/santi-server/tests/health.rs crates/santi-server/tests/foundation.rs \
  .sqlx .github/workflows/ci.yml CONTRIBUTING.md
git commit -m "feat: add postgres, problem errors, openapi docs and compression"
```

---

### Task 2: Auth — users, sessions, API tokens

**Branch:** `feat/SAN-<card>-auth`

**Files:**
- Modify: `Cargo.toml`, `crates/santi-server/Cargo.toml`, `crates/santi-types/src/lib.rs`, `crates/santi-server/src/lib.rs`, `crates/santi-server/tests/common/mod.rs`
- Create: `crates/santi-server/migrations/0002_auth.sql`, `crates/santi-types/src/auth.rs`, `crates/santi-server/src/auth/{mod.rs,domain.rs,repo.rs,service.rs,handler.rs,extract.rs}`, `crates/santi-server/tests/auth.rs`
- Modify: `.sqlx/`

**Interfaces:**
- Consumes: `AppState`, `AppError`, `JsonBody`, `PathParams`, `TestApp` (Task 1).
- Produces:
  - `santi_server::auth::extract::CurrentUser { pub id: i64, pub token_id: i64 }` — `impl FromRequestParts<AppState>` (rejection `AppError::Unauthorized`), reads `Authorization: Bearer <token>` first, then the `santi_session` cookie (D23)
  - `santi_server::auth::domain::{new_secret() -> String, new_api_token() -> String, hash_token(token: &str) -> Vec<u8>, SESSION_COOKIE: &str}` (reused by invites in Task 3)
  - `santi_server::auth::handler::router() -> OpenApiRouter<AppState>`
  - `santi_types::auth::{Register, Login, User, CreateToken, CreatedToken, ApiToken}`
  - Test helper: `TestApp::signed_in(pool, email) -> TestApp` (bearer token set, `user_id` filled), `TestApp::another_user(&self, email) -> TestApp` (same router, new user), `PASSWORD: &str`, `session_cookie(&Response) -> String`

Routes:

| Method | Path | Auth | Body | Success |
|---|---|---|---|---|
| POST | `/api/auth/register` | none | `Register` | 201 `User` + `Set-Cookie` session |
| POST | `/api/auth/login` | none | `Login` | 200 `User` + `Set-Cookie` session; 401 on wrong email or password |
| POST | `/api/auth/logout` | `CurrentUser` | — | 204 + expired cookie; revokes that session |
| GET | `/api/me` | `CurrentUser` | — | 200 `User` |
| POST | `/api/tokens` | `CurrentUser` | `CreateToken` | 201 `CreatedToken` (token shown once) |
| GET | `/api/tokens` | `CurrentUser` | — | 200 `Vec<ApiToken>` |
| DELETE | `/api/tokens/{id}` | `CurrentUser` | — | 204; 404 if not the caller's |

- [ ] **Step 1: Dependencies**

`Cargo.toml`, add to `[workspace.dependencies]` and turn on the CSRF middleware:

```toml
argon2 = "0.6"
sha2 = "0.11"
getrandom = "0.4"
tower-http = { version = "0.7.1", features = ["compression-gzip", "compression-br", "csrf"] }
```

and at the end of the file (argon2 is unusably slow unoptimized; tests hash passwords):

```toml
[profile.dev.package.argon2]
opt-level = 3

[profile.dev.package.blake2]
opt-level = 3
```

`crates/santi-server/Cargo.toml` `[dependencies]`: `argon2.workspace = true`, `sha2.workspace = true`, `getrandom.workspace = true`.

- [ ] **Step 2: Migration and apply it**

`crates/santi-server/migrations/0002_auth.sql`:

```sql
CREATE TABLE app_user (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email         text NOT NULL UNIQUE CHECK (email = lower(email)),
    display_name  text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 100),
    password_hash text NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now()
);

-- D22/D23: web sessions and personal API tokens share one table; only the SHA-256 is stored.
CREATE TABLE auth_token (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    bigint NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    kind       text NOT NULL CHECK (kind IN ('session', 'api')),
    name       text CHECK (length(name) BETWEEN 1 AND 100),
    token_hash bytea NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz,
    CHECK (kind <> 'session' OR expires_at IS NOT NULL),
    CHECK (kind <> 'api' OR (name IS NOT NULL AND expires_at IS NULL))
);

CREATE INDEX auth_token_user_kind_idx ON auth_token (user_id, kind);
```

Run: `sqlx migrate run --source crates/santi-server/migrations`
Expected: `Applied 2/migrate auth`.

- [ ] **Step 3: Write the failing tests**

Unit tests at the bottom of `crates/santi-server/src/auth/domain.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::{HeaderMap, HeaderValue, header};

    #[test]
    fn email_is_trimmed_and_lowercased() {
        assert_eq!(normalize_email("  Ana@Example.COM ").unwrap(), "ana@example.com");
    }

    #[test]
    fn email_without_at_or_dot_is_rejected() {
        assert!(normalize_email("ana.example.com").is_err());
        assert!(normalize_email("ana@localhost").is_err());
        assert!(normalize_email("@example.com").is_err());
    }

    #[test]
    fn password_length_is_bounded() {
        assert!(check_password("short").is_err());
        assert!(check_password(&"x".repeat(129)).is_err());
        assert!(check_password("correct horse").is_ok());
    }

    #[test]
    fn display_name_is_trimmed_and_required() {
        assert_eq!(check_display_name("  Ana ").unwrap(), "Ana");
        assert!(check_display_name("   ").is_err());
    }

    #[test]
    fn secrets_are_64_hex_chars_and_unique() {
        let first = new_secret();
        assert_eq!(first.len(), 64);
        assert!(first.chars().all(|character| character.is_ascii_hexdigit()));
        assert_ne!(first, new_secret());
    }

    #[test]
    fn api_tokens_carry_the_santi_prefix() {
        assert!(new_api_token().starts_with("santi_"));
    }

    #[test]
    fn token_hash_is_a_stable_sha256() {
        assert_eq!(hash_token("abc"), hash_token("abc"));
        assert_eq!(hash_token("abc").len(), 32);
    }

    #[test]
    fn password_hash_verifies_only_the_same_password() {
        let hash = hash_password("correct horse").unwrap();
        assert!(verify_password("correct horse", &hash));
        assert!(!verify_password("wrong horse", &hash));
        assert!(!verify_password("correct horse", "not-a-hash"));
    }

    #[test]
    fn bearer_wins_over_cookie() {
        let mut headers = HeaderMap::new();
        headers.insert(header::AUTHORIZATION, HeaderValue::from_static("Bearer santi_abc"));
        headers.insert(header::COOKIE, HeaderValue::from_static("santi_session=def"));
        assert_eq!(token_from_headers(&headers), Some("santi_abc"));
    }

    #[test]
    fn session_cookie_is_found_among_others() {
        let mut headers = HeaderMap::new();
        headers.insert(header::COOKIE, HeaderValue::from_static("theme=dark; santi_session=def"));
        assert_eq!(token_from_headers(&headers), Some("def"));
    }

    #[test]
    fn other_authorization_schemes_are_ignored() {
        let mut headers = HeaderMap::new();
        headers.insert(header::AUTHORIZATION, HeaderValue::from_static("Basic abc"));
        assert_eq!(token_from_headers(&headers), None);
    }

    #[test]
    fn session_cookie_is_http_only_secure_and_lax() {
        let cookie = session_cookie("abc");
        assert!(cookie.starts_with("santi_session=abc;"));
        assert!(cookie.contains("HttpOnly"));
        assert!(cookie.contains("Secure"));
        assert!(cookie.contains("SameSite=Lax"));
        assert!(expired_session_cookie().contains("Max-Age=0"));
    }
}
```

Add to `crates/santi-server/tests/common/mod.rs`:

```rust
use serde_json::json;

pub const PASSWORD: &str = "correct horse battery";

impl TestApp {
    pub async fn signed_in(pool: PgPool, email: &str) -> Self {
        TestApp::anonymous(pool).another_user(email).await
    }

    pub async fn another_user(&self, email: &str) -> Self {
        let register = json!({ "email": email, "password": PASSWORD, "display_name": email });
        let response = self.send(json_request(Method::POST, "/api/auth/register", None, Some(register))).await;
        assert_eq!(response.status(), StatusCode::CREATED);
        let cookie = session_cookie(&response);
        let user = body_json(response).await;
        let mut request = json_request(Method::POST, "/api/tokens", None, Some(json!({ "name": "tests" })));
        request.headers_mut().insert(header::COOKIE, cookie.parse().unwrap());
        let created = body_json(self.send(request).await).await;
        TestApp {
            router: self.router.clone(),
            token: Some(created["token"].as_str().unwrap().to_string()),
            user_id: user["id"].as_i64().unwrap(),
        }
    }
}

/// The `name=value` part of the response's `Set-Cookie`, ready for a `Cookie` header.
pub fn session_cookie(response: &Response) -> String {
    let set_cookie = response.headers()[header::SET_COOKIE].to_str().unwrap();
    set_cookie.split(';').next().unwrap().to_string()
}
```

`crates/santi-server/tests/auth.rs`:

```rust
mod common;

use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use common::{PASSWORD, TestApp, body_json, json_request, session_cookie};
use serde_json::json;
use sqlx::PgPool;

async fn register(app: &TestApp, email: &str, password: &str) -> axum::response::Response {
    let body = json!({ "email": email, "password": password, "display_name": "Ana" });
    app.send(json_request(Method::POST, "/api/auth/register", None, Some(body))).await
}

async fn login(app: &TestApp, email: &str, password: &str) -> axum::response::Response {
    let body = json!({ "email": email, "password": password });
    app.send(json_request(Method::POST, "/api/auth/login", None, Some(body))).await
}

fn with_cookie(method: Method, uri: &str, cookie: &str) -> Request<Body> {
    let mut request = json_request(method, uri, None, None);
    request.headers_mut().insert(header::COOKIE, cookie.parse().unwrap());
    request
}

#[sqlx::test]
async fn register_returns_user_and_session_cookie(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let response = register(&app, "  Ana@Example.com ", PASSWORD).await;

    assert_eq!(response.status(), StatusCode::CREATED);
    let set_cookie = response.headers()[header::SET_COOKIE].to_str().unwrap().to_string();
    assert!(set_cookie.starts_with("santi_session="));
    assert!(set_cookie.contains("HttpOnly"));
    assert_eq!(body_json(response).await["email"], "ana@example.com");
}

#[sqlx::test]
async fn register_refuses_a_taken_email_in_any_case(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    register(&app, "ana@example.com", PASSWORD).await;

    let response = register(&app, "ANA@example.com", PASSWORD).await;

    assert_eq!(response.status(), StatusCode::CONFLICT);
    assert_eq!(body_json(response).await["type"], "urn:santi:error:already-exists");
}

#[sqlx::test]
async fn register_validates_password_and_email(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let short = body_json(register(&app, "ana@example.com", "short").await).await;
    let bad_email = body_json(register(&app, "not-an-email", PASSWORD).await).await;

    assert_eq!(short["errors"][0]["field"], "password");
    assert_eq!(bad_email["errors"][0]["field"], "email");
}

#[sqlx::test]
async fn malformed_json_is_a_bad_request_problem(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    let request = Request::post("/api/auth/login")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from("{"))
        .unwrap();

    let response = app.send(request).await;

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert_eq!(body_json(response).await["type"], "urn:santi:error:bad-request");
}

#[sqlx::test]
async fn login_cookie_authenticates_me(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    register(&app, "ana@example.com", PASSWORD).await;

    let response = login(&app, "ana@example.com", PASSWORD).await;
    assert_eq!(response.status(), StatusCode::OK);
    let cookie = session_cookie(&response);
    let me = app.send(with_cookie(Method::GET, "/api/me", &cookie)).await;

    assert_eq!(me.status(), StatusCode::OK);
    assert_eq!(body_json(me).await["email"], "ana@example.com");
}

#[sqlx::test]
async fn login_with_wrong_password_or_unknown_email_is_unauthorized(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    register(&app, "ana@example.com", PASSWORD).await;

    assert_eq!(login(&app, "ana@example.com", "wrong password").await.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(login(&app, "bob@example.com", PASSWORD).await.status(), StatusCode::UNAUTHORIZED);
}

#[sqlx::test]
async fn me_without_credentials_is_unauthorized(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let (status, body) = app.get("/api/me").await;

    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(body["type"], "urn:santi:error:unauthorized");
}

#[sqlx::test]
async fn logout_revokes_the_session(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    let cookie = session_cookie(&register(&app, "ana@example.com", PASSWORD).await);

    let logout = app.send(with_cookie(Method::POST, "/api/auth/logout", &cookie)).await;
    assert_eq!(logout.status(), StatusCode::NO_CONTENT);
    assert!(logout.headers()[header::SET_COOKIE].to_str().unwrap().contains("Max-Age=0"));

    let me = app.send(with_cookie(Method::GET, "/api/me", &cookie)).await;
    assert_eq!(me.status(), StatusCode::UNAUTHORIZED);
}

#[sqlx::test]
async fn expired_session_is_rejected(pool: PgPool) {
    let app = TestApp::anonymous(pool.clone());
    let cookie = session_cookie(&register(&app, "ana@example.com", PASSWORD).await);
    sqlx::query("UPDATE auth_token SET expires_at = now() - interval '1 minute' WHERE kind = 'session'")
        .execute(&pool)
        .await
        .unwrap();

    let me = app.send(with_cookie(Method::GET, "/api/me", &cookie)).await;

    assert_eq!(me.status(), StatusCode::UNAUTHORIZED);
}

#[sqlx::test]
async fn api_token_authenticates_with_bearer(pool: PgPool) {
    let app = TestApp::signed_in(pool, "ana@example.com").await;

    let (status, me) = app.get("/api/me").await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(me["id"], app.user_id);
}

#[sqlx::test]
async fn created_token_is_shown_once(pool: PgPool) {
    let app = TestApp::signed_in(pool, "ana@example.com").await;

    let (status, created) = app.post("/api/tokens", json!({ "name": "laptop" })).await;
    let (_, listed) = app.get("/api/tokens").await;

    assert_eq!(status, StatusCode::CREATED);
    assert!(created["token"].as_str().unwrap().starts_with("santi_"));
    let laptop = listed.as_array().unwrap().iter().find(|token| token["name"] == "laptop").unwrap();
    assert!(laptop.get("token").is_none());
}

#[sqlx::test]
async fn deleting_a_token_revokes_it(pool: PgPool) {
    let app = TestApp::signed_in(pool, "ana@example.com").await;
    let (_, created) = app.post("/api/tokens", json!({ "name": "laptop" })).await;
    let laptop = TestApp { token: Some(created["token"].as_str().unwrap().into()), ..app.clone() };

    let (status, _) = app.delete(&format!("/api/tokens/{}", created["id"])).await;

    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(laptop.get("/api/me").await.0, StatusCode::UNAUTHORIZED);
}

#[sqlx::test]
async fn deleting_someone_elses_token_is_not_found(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    let (_, created) = ana.post("/api/tokens", json!({ "name": "laptop" })).await;

    let (status, _) = bob.delete(&format!("/api/tokens/{}", created["id"])).await;

    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn cross_site_writes_are_forbidden(pool: PgPool) {
    let app = TestApp::anonymous(pool);
    let mut request = json_request(Method::POST, "/api/auth/login", None, Some(json!({ "email": "a@b.co", "password": PASSWORD })));
    request.headers_mut().insert("sec-fetch-site", "cross-site".parse().unwrap());

    let response = app.send(request).await;

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    assert_eq!(body_json(response).await["type"], "urn:santi:error:forbidden");
}

#[sqlx::test]
async fn openapi_lists_auth_routes(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let (_, api) = app.get("/openapi.json").await;

    for path in ["/api/auth/register", "/api/auth/login", "/api/auth/logout", "/api/me", "/api/tokens", "/api/tokens/{id}"] {
        assert!(api["paths"][path].is_object(), "{path} missing");
    }
}
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cargo test -p santi-server --lib auth && cargo test -p santi-server --test auth`
Expected: compile errors — `unresolved module auth`, `no function or associated item named signed_in`.

- [ ] **Step 5: Minimal implementation**

`crates/santi-types/src/lib.rs`: add `pub mod auth;` at the top.

`crates/santi-types/src/auth.rs`:

```rust
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Clone, Serialize, Deserialize, ToSchema)]
pub struct Register {
    pub email: String,
    pub password: String,
    pub display_name: String,
}

#[derive(Clone, Serialize, Deserialize, ToSchema)]
pub struct Login {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct User {
    pub id: i64,
    pub email: String,
    pub display_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct CreateToken {
    pub name: String,
}

/// Returned once at creation; only the hash is stored (D23).
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct CreatedToken {
    pub id: i64,
    pub name: String,
    pub token: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct ApiToken {
    pub id: i64,
    pub name: String,
    pub created_at: DateTime<Utc>,
}
```

`crates/santi-server/src/auth/mod.rs`:

```rust
pub mod domain;
pub mod extract;
pub mod handler;
pub mod repo;
pub mod service;
```

`crates/santi-server/src/auth/domain.rs` (above the tests):

```rust
use std::sync::LazyLock;

use argon2::Argon2;
use argon2::password_hash::phc::PasswordHash;
use argon2::password_hash::{PasswordHasher, PasswordVerifier};
use axum::http::HeaderMap;
use axum::http::header::{AUTHORIZATION, COOKIE};
use sha2::{Digest, Sha256};

use crate::error::AppError;

pub const SESSION_COOKIE: &str = "santi_session";
pub const SESSION_DAYS: i64 = 30;
pub const API_TOKEN_PREFIX: &str = "santi_";

pub fn normalize_email(email: &str) -> Result<String, AppError> {
    let email = email.trim().to_lowercase();
    let Some((local, domain)) = email.split_once('@') else {
        return Err(AppError::invalid("email", "must be an email address"));
    };
    if local.is_empty() || !domain.contains('.') || email.len() > 254 {
        return Err(AppError::invalid("email", "must be an email address"));
    }
    Ok(email)
}

pub fn check_password(password: &str) -> Result<(), AppError> {
    let length = password.chars().count();
    if !(10..=128).contains(&length) {
        return Err(AppError::invalid("password", "must have 10 to 128 characters"));
    }
    Ok(())
}

pub fn check_display_name(name: &str) -> Result<String, AppError> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 100 {
        return Err(AppError::invalid("display_name", "must have 1 to 100 characters"));
    }
    Ok(name.to_string())
}

/// 32 random bytes as lowercase hex.
pub fn new_secret() -> String {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).expect("the operating system random source works");
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

pub fn new_api_token() -> String {
    format!("{API_TOKEN_PREFIX}{}", new_secret())
}

pub fn hash_token(token: &str) -> Vec<u8> {
    Sha256::digest(token.as_bytes()).to_vec()
}

pub fn hash_password(password: &str) -> Result<String, AppError> {
    Argon2::default()
        .hash_password(password.as_bytes())
        .map(|hash| hash.to_string())
        .map_err(|error| AppError::Internal(error.to_string()))
}

pub fn verify_password(password: &str, stored_hash: &str) -> bool {
    let Ok(hash) = PasswordHash::new(stored_hash) else {
        return false;
    };
    Argon2::default().verify_password(password.as_bytes(), &hash).is_ok()
}

/// Verified against when the email is unknown, so both failures take the same time.
pub fn dummy_password_hash() -> String {
    static DUMMY: LazyLock<String> = LazyLock::new(|| hash_password("not a real password").unwrap_or_default());
    DUMMY.clone()
}

pub fn token_from_headers(headers: &HeaderMap) -> Option<&str> {
    bearer_token(headers).or_else(|| session_token(headers))
}

fn bearer_token(headers: &HeaderMap) -> Option<&str> {
    headers.get(AUTHORIZATION)?.to_str().ok()?.strip_prefix("Bearer ")
}

fn session_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get_all(COOKIE)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .flat_map(|value| value.split(';'))
        .find_map(|pair| pair.trim().strip_prefix("santi_session="))
}

pub fn session_cookie(token: &str) -> String {
    let max_age = SESSION_DAYS * 24 * 60 * 60;
    format!("{SESSION_COOKIE}={token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age={max_age}")
}

pub fn expired_session_cookie() -> String {
    format!("{SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0")
}
```

`crates/santi-server/src/auth/repo.rs`:

```rust
use chrono::{DateTime, Utc};
use santi_types::auth::{ApiToken, User};
use sqlx::PgConnection;

use super::extract::CurrentUser;

pub struct UserWithHash {
    pub id: i64,
    pub email: String,
    pub display_name: String,
    pub password_hash: String,
}

pub async fn insert_user(conn: &mut PgConnection, email: &str, display_name: &str, password_hash: &str) -> Result<User, sqlx::Error> {
    sqlx::query_as!(
        User,
        "INSERT INTO app_user (email, display_name, password_hash) VALUES ($1, $2, $3)
         RETURNING id, email, display_name",
        email,
        display_name,
        password_hash
    )
    .fetch_one(&mut *conn)
    .await
}

pub async fn find_user_by_email(conn: &mut PgConnection, email: &str) -> Result<Option<UserWithHash>, sqlx::Error> {
    sqlx::query_as!(
        UserWithHash,
        "SELECT id, email, display_name, password_hash FROM app_user WHERE email = $1",
        email
    )
    .fetch_optional(&mut *conn)
    .await
}

pub async fn find_user(conn: &mut PgConnection, user_id: i64) -> Result<User, sqlx::Error> {
    sqlx::query_as!(User, "SELECT id, email, display_name FROM app_user WHERE id = $1", user_id)
        .fetch_one(&mut *conn)
        .await
}

pub async fn insert_session(conn: &mut PgConnection, user_id: i64, token_hash: &[u8], expires_at: DateTime<Utc>) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "INSERT INTO auth_token (user_id, kind, token_hash, expires_at) VALUES ($1, 'session', $2, $3)",
        user_id,
        token_hash,
        expires_at
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

pub async fn delete_expired_sessions(conn: &mut PgConnection, user_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query!("DELETE FROM auth_token WHERE user_id = $1 AND expires_at < now()", user_id)
        .execute(&mut *conn)
        .await?;
    Ok(())
}

pub async fn delete_session(conn: &mut PgConnection, token_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query!("DELETE FROM auth_token WHERE id = $1 AND kind = 'session'", token_id)
        .execute(&mut *conn)
        .await?;
    Ok(())
}

pub async fn find_by_token(conn: &mut PgConnection, token_hash: &[u8]) -> Result<Option<CurrentUser>, sqlx::Error> {
    sqlx::query_as!(
        CurrentUser,
        "SELECT user_id AS id, id AS token_id FROM auth_token
         WHERE token_hash = $1 AND (expires_at IS NULL OR expires_at > now())",
        token_hash
    )
    .fetch_optional(&mut *conn)
    .await
}

pub async fn insert_api_token(conn: &mut PgConnection, user_id: i64, name: &str, token_hash: &[u8]) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!(
        "INSERT INTO auth_token (user_id, kind, name, token_hash) VALUES ($1, 'api', $2, $3) RETURNING id",
        user_id,
        name,
        token_hash
    )
    .fetch_one(&mut *conn)
    .await
}

pub async fn list_api_tokens(conn: &mut PgConnection, user_id: i64) -> Result<Vec<ApiToken>, sqlx::Error> {
    sqlx::query_as!(
        ApiToken,
        r#"SELECT id, name AS "name!", created_at FROM auth_token
           WHERE user_id = $1 AND kind = 'api' ORDER BY id"#,
        user_id
    )
    .fetch_all(&mut *conn)
    .await
}

/// Returns false when no API token with this id belongs to the user.
pub async fn delete_api_token(conn: &mut PgConnection, user_id: i64, token_id: i64) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!(
        "DELETE FROM auth_token WHERE id = $1 AND user_id = $2 AND kind = 'api'",
        token_id,
        user_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(result.rows_affected() == 1)
}
```

`crates/santi-server/src/auth/extract.rs`:

```rust
use axum::extract::FromRequestParts;
use axum::http::request::Parts;

use super::{domain, repo};
use crate::AppState;
use crate::error::AppError;

/// The signed-in caller, from a Bearer API token or the session cookie (D22, D23).
#[derive(Debug, Clone)]
pub struct CurrentUser {
    pub id: i64,
    pub token_id: i64,
}

impl FromRequestParts<AppState> for CurrentUser {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, AppError> {
        let token = domain::token_from_headers(&parts.headers).ok_or(AppError::Unauthorized)?;
        let mut conn = state.pool.acquire().await?;
        let user = repo::find_by_token(&mut conn, &domain::hash_token(token)).await?;
        user.ok_or(AppError::Unauthorized)
    }
}
```

`crates/santi-server/src/auth/service.rs`:

```rust
use chrono::{Duration, Utc};
use santi_types::auth::{ApiToken, CreateToken, CreatedToken, Login, Register, User};
use sqlx::{PgConnection, PgPool};

use super::extract::CurrentUser;
use super::{domain, repo};
use crate::error::AppError;

/// Creates the user and signs them in; returns the user and the session token.
pub async fn register(pool: &PgPool, input: Register) -> Result<(User, String), AppError> {
    let email = domain::normalize_email(&input.email)?;
    let display_name = domain::check_display_name(&input.display_name)?;
    domain::check_password(&input.password)?;
    let password_hash = hash_in_background(input.password).await?;
    let mut tx = pool.begin().await?;
    let user = repo::insert_user(&mut tx, &email, &display_name, &password_hash).await?;
    let session = start_session(&mut tx, user.id).await?;
    tx.commit().await?;
    Ok((user, session))
}

pub async fn login(pool: &PgPool, input: Login) -> Result<(User, String), AppError> {
    let email = input.email.trim().to_lowercase();
    let mut conn = pool.acquire().await?;
    let found = repo::find_user_by_email(&mut conn, &email).await?;
    let stored_hash = found.as_ref().map_or_else(domain::dummy_password_hash, |user| user.password_hash.clone());
    let password_matches = verify_in_background(input.password, stored_hash).await?;
    let Some(user) = found.filter(|_| password_matches) else {
        return Err(AppError::Unauthorized);
    };
    repo::delete_expired_sessions(&mut conn, user.id).await?;
    let session = start_session(&mut conn, user.id).await?;
    Ok((User { id: user.id, email: user.email, display_name: user.display_name }, session))
}

pub async fn logout(pool: &PgPool, user: &CurrentUser) -> Result<(), AppError> {
    let mut conn = pool.acquire().await?;
    repo::delete_session(&mut conn, user.token_id).await?;
    Ok(())
}

pub async fn me(pool: &PgPool, user: &CurrentUser) -> Result<User, AppError> {
    let mut conn = pool.acquire().await?;
    Ok(repo::find_user(&mut conn, user.id).await?)
}

pub async fn create_token(pool: &PgPool, user: &CurrentUser, input: CreateToken) -> Result<CreatedToken, AppError> {
    let name = input.name.trim().to_string();
    if name.is_empty() || name.chars().count() > 100 {
        return Err(AppError::invalid("name", "must have 1 to 100 characters"));
    }
    let token = domain::new_api_token();
    let mut conn = pool.acquire().await?;
    let id = repo::insert_api_token(&mut conn, user.id, &name, &domain::hash_token(&token)).await?;
    Ok(CreatedToken { id, name, token })
}

pub async fn list_tokens(pool: &PgPool, user: &CurrentUser) -> Result<Vec<ApiToken>, AppError> {
    let mut conn = pool.acquire().await?;
    Ok(repo::list_api_tokens(&mut conn, user.id).await?)
}

pub async fn delete_token(pool: &PgPool, user: &CurrentUser, token_id: i64) -> Result<(), AppError> {
    let mut conn = pool.acquire().await?;
    let deleted = repo::delete_api_token(&mut conn, user.id, token_id).await?;
    if !deleted {
        return Err(AppError::NotFound);
    }
    Ok(())
}

async fn start_session(conn: &mut PgConnection, user_id: i64) -> Result<String, AppError> {
    let token = domain::new_secret();
    let expires_at = Utc::now() + Duration::days(domain::SESSION_DAYS);
    repo::insert_session(conn, user_id, &domain::hash_token(&token), expires_at).await?;
    Ok(token)
}

/// argon2 takes tens of milliseconds of CPU; keep it off the async workers.
async fn hash_in_background(password: String) -> Result<String, AppError> {
    tokio::task::spawn_blocking(move || domain::hash_password(&password))
        .await
        .map_err(|error| AppError::Internal(error.to_string()))?
}

async fn verify_in_background(password: String, stored_hash: String) -> Result<bool, AppError> {
    tokio::task::spawn_blocking(move || domain::verify_password(&password, &stored_hash))
        .await
        .map_err(|error| AppError::Internal(error.to_string()))
}
```

`crates/santi-server/src/auth/handler.rs` — this is **the handler pattern every later slice copies**: one `#[utoipa::path]` per handler with its path, tag, body and every status it returns; the handler extracts, calls one service function, wraps the result.

```rust
use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::http::header::SET_COOKIE;
use axum::response::IntoResponse;
use santi_types::Problem;
use santi_types::auth::{ApiToken, CreateToken, CreatedToken, Login, Register, User};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::extract::CurrentUser;
use super::{domain, service};
use crate::AppState;
use crate::error::AppError;
use crate::extract::{JsonBody, PathParams};

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(register))
        .routes(routes!(login))
        .routes(routes!(logout))
        .routes(routes!(me))
        .routes(routes!(create_token, list_tokens))
        .routes(routes!(delete_token))
}

#[utoipa::path(post, path = "/api/auth/register", tag = "auth", request_body = Register,
    responses(
        (status = 201, body = User, description = "Signed up and signed in; sets the session cookie"),
        (status = 409, body = Problem, content_type = "application/problem+json"),
        (status = 422, body = Problem, content_type = "application/problem+json")))]
pub async fn register(State(state): State<AppState>, JsonBody(input): JsonBody<Register>) -> Result<impl IntoResponse, AppError> {
    let (user, session) = service::register(&state.pool, input).await?;
    Ok((StatusCode::CREATED, [(SET_COOKIE, domain::session_cookie(&session))], Json(user)))
}

#[utoipa::path(post, path = "/api/auth/login", tag = "auth", request_body = Login,
    responses(
        (status = 200, body = User, description = "Signed in; sets the session cookie"),
        (status = 401, body = Problem, content_type = "application/problem+json")))]
pub async fn login(State(state): State<AppState>, JsonBody(input): JsonBody<Login>) -> Result<impl IntoResponse, AppError> {
    let (user, session) = service::login(&state.pool, input).await?;
    Ok(([(SET_COOKIE, domain::session_cookie(&session))], Json(user)))
}

#[utoipa::path(post, path = "/api/auth/logout", tag = "auth",
    responses((status = 204, description = "Session revoked; cookie cleared"),
              (status = 401, body = Problem, content_type = "application/problem+json")))]
pub async fn logout(State(state): State<AppState>, user: CurrentUser) -> Result<impl IntoResponse, AppError> {
    service::logout(&state.pool, &user).await?;
    Ok((StatusCode::NO_CONTENT, [(SET_COOKIE, domain::expired_session_cookie())]))
}

#[utoipa::path(get, path = "/api/me", tag = "auth",
    responses((status = 200, body = User), (status = 401, body = Problem, content_type = "application/problem+json")))]
pub async fn me(State(state): State<AppState>, user: CurrentUser) -> Result<Json<User>, AppError> {
    Ok(Json(service::me(&state.pool, &user).await?))
}

#[utoipa::path(post, path = "/api/tokens", tag = "auth", request_body = CreateToken,
    responses((status = 201, body = CreatedToken), (status = 422, body = Problem, content_type = "application/problem+json")))]
pub async fn create_token(State(state): State<AppState>, user: CurrentUser, JsonBody(input): JsonBody<CreateToken>) -> Result<(StatusCode, Json<CreatedToken>), AppError> {
    let created = service::create_token(&state.pool, &user, input).await?;
    Ok((StatusCode::CREATED, Json(created)))
}

#[utoipa::path(get, path = "/api/tokens", tag = "auth", responses((status = 200, body = Vec<ApiToken>)))]
pub async fn list_tokens(State(state): State<AppState>, user: CurrentUser) -> Result<Json<Vec<ApiToken>>, AppError> {
    Ok(Json(service::list_tokens(&state.pool, &user).await?))
}

#[utoipa::path(delete, path = "/api/tokens/{id}", tag = "auth", params(("id" = i64, Path, description = "Token id")),
    responses((status = 204), (status = 404, body = Problem, content_type = "application/problem+json")))]
pub async fn delete_token(State(state): State<AppState>, user: CurrentUser, PathParams(token_id): PathParams<i64>) -> Result<StatusCode, AppError> {
    service::delete_token(&state.pool, &user, token_id).await?;
    Ok(StatusCode::NO_CONTENT)
}
```

`crates/santi-server/src/lib.rs`: add `pub mod auth;`, add `.merge(auth::handler::router())` after `.routes(routes!(health))`, and add the CSRF layer (D22: non-GET browser requests must be same-origin; requests with neither `Origin` nor `Sec-Fetch-Site`, such as the CLI, pass):

```rust
use axum::response::IntoResponse;
use tower_http::csrf::{CsrfLayer, ProtectionError};

// in app(), before the CompressionLayer:
        .layer(CsrfLayer::new().with_rejection_response(|_: ProtectionError| AppError::Forbidden.into_response()))
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cargo test -p santi-server`
Expected: `test result: ok.` for the lib and every test file, 0 failed.

- [ ] **Step 7: Offline data and gate**

Run: `cargo sqlx prepare --workspace`, then the gate. Expected: all clean, coverage above 90%.

- [ ] **Step 8: Commit**

```bash
git add Cargo.toml Cargo.lock crates/santi-server/Cargo.toml crates/santi-server/migrations/0002_auth.sql \
  crates/santi-types/src/lib.rs crates/santi-types/src/auth.rs crates/santi-server/src/lib.rs \
  crates/santi-server/src/auth crates/santi-server/tests/common/mod.rs crates/santi-server/tests/auth.rs .sqlx
git commit -m "feat: add registration, sessions and personal api tokens"
```

---

### Task 3: Projects, members, invites and the membership extractor

**Branch:** `feat/SAN-<card>-projects-members`

**Files:**
- Create: `crates/santi-server/migrations/0003_projects.sql`, `crates/santi-types/src/projects.rs`, `crates/santi-server/src/projects/{mod.rs,domain.rs,repo.rs,service.rs,handler.rs}`, `crates/santi-server/src/members/{mod.rs,domain.rs,repo.rs,service.rs,handler.rs,extract.rs}`, `crates/santi-server/tests/projects.rs`
- Modify: `crates/santi-types/src/lib.rs`, `crates/santi-server/src/lib.rs`, `crates/santi-server/tests/common/mod.rs`, `.sqlx/`

**Interfaces:**
- Consumes: `CurrentUser`, `auth::domain::{new_secret, hash_token}` (Task 2); `AppError`, `JsonBody`, `PathParams` (Task 1).
- Produces:
  - `santi_server::members::Member { pub user_id: i64, pub project_id: i64, pub project_key: String, pub board_id: i64, pub board_type: BoardType, pub role: MemberRole }` with `impl FromRequestParts<AppState>` (reads the `{key}` path segment; non-members and unknown keys get 404, D28)
  - `santi_server::members::domain::require_admin(member: &Member) -> Result<(), AppError>`
  - `santi_server::members::repo::is_member(conn: &mut PgConnection, project_id: i64, user_id: i64) -> Result<bool, sqlx::Error>`
  - `santi_server::projects::repo::lock_project(conn: &mut PgConnection, project_id: i64) -> Result<(), sqlx::Error>` (row lock, D20/D21)
  - `santi_server::projects::repo::take_issue_number(conn: &mut PgConnection, project_id: i64) -> Result<i64, sqlx::Error>` (D20)
  - `santi_server::projects::service::create_project(pool: &PgPool, user: &CurrentUser, input: CreateProject) -> Result<Project, AppError>` (Task 4 adds the default layout inside it)
  - `santi_types::projects::{BoardType, MemberRole, CreateProject, Project, MemberInfo, AddMember, SetRole, CreateInvite, Invite}`
  - Test helper: `TestApp::create_project(&self, key: &str, board_type: &str) -> Value`

Routes:

| Method | Path | Auth | Body | Success |
|---|---|---|---|---|
| POST | `/api/projects` | `CurrentUser` | `CreateProject` | 201 `Project` (caller is admin) |
| GET | `/api/projects` | `CurrentUser` | — | 200 `Vec<Project>` (caller's projects, by key) |
| GET | `/api/projects/{key}` | `Member` | — | 200 `Project` |
| GET | `/api/projects/{key}/members` | `Member` | — | 200 `Vec<MemberInfo>` |
| POST | `/api/projects/{key}/members` | admin | `AddMember` | 201 `MemberInfo`; 422 unknown email; 409 already a member |
| PUT | `/api/projects/{key}/members/{user_id}` | admin | `SetRole` | 200 `MemberInfo`; 409 `last-admin` |
| DELETE | `/api/projects/{key}/members/{user_id}` | admin | — | 204; 409 `last-admin` |
| POST | `/api/projects/{key}/invites` | admin | `CreateInvite` | 201 `Invite` (token shown once, valid 7 days) |
| POST | `/api/invites/{token}/accept` | `CurrentUser` | — | 200 `Project`; 404 unknown or expired; single use |

- [ ] **Step 1: Migration and apply it**

`crates/santi-server/migrations/0003_projects.sql`:

```sql
CREATE TABLE project (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    key               text NOT NULL UNIQUE CHECK (key ~ '^[A-Z][A-Z0-9]{1,9}$'),
    name              text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
    next_issue_number bigint NOT NULL DEFAULT 1,               -- D20
    created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE member (
    project_id bigint NOT NULL REFERENCES project (id) ON DELETE CASCADE,
    user_id    bigint NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    role       text NOT NULL CHECK (role IN ('admin', 'member')),
    PRIMARY KEY (project_id, user_id)
);

CREATE INDEX member_user_idx ON member (user_id);

-- D31: exactly one board per project; its type never changes (KB-8 dropped).
CREATE TABLE board (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id         bigint NOT NULL UNIQUE REFERENCES project (id) ON DELETE CASCADE,
    board_type         text NOT NULL CHECK (board_type IN ('scrum', 'kanban')),
    done_window_days   integer CHECK (done_window_days IN (7, 14, 30)),   -- D8; NULL = never hide
    next_sprint_number bigint NOT NULL DEFAULT 1                          -- D12
);

CREATE TABLE invite (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id bigint NOT NULL REFERENCES project (id) ON DELETE CASCADE,
    role       text NOT NULL CHECK (role IN ('admin', 'member')),
    token_hash bytea NOT NULL UNIQUE,
    created_by bigint NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL
);

CREATE INDEX invite_project_idx ON invite (project_id);
```

Run: `sqlx migrate run --source crates/santi-server/migrations`
Expected: `Applied 3/migrate projects`.

- [ ] **Step 2: Write the failing tests**

Unit tests at the bottom of `crates/santi-server/src/projects/domain.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use santi_types::projects::BoardType;

    #[test]
    fn project_key_is_trimmed_and_uppercased() {
        assert_eq!(check_project_key(" santi ").unwrap(), "SANTI");
    }

    #[test]
    fn project_key_shape_is_enforced() {
        for bad in ["S", "1ABC", "AB-C", "ABCDEFGHIJK", ""] {
            assert!(check_project_key(bad).is_err(), "{bad} should be refused");
        }
        assert!(check_project_key("A1").is_ok());
    }

    #[test]
    fn project_name_is_required() {
        assert!(check_project_name("  ").is_err());
        assert_eq!(check_project_name(" Santi ").unwrap(), "Santi");
    }

    #[test]
    fn kanban_hides_done_after_14_days_and_scrum_never() {
        assert_eq!(default_done_window(BoardType::Kanban), Some(14));
        assert_eq!(default_done_window(BoardType::Scrum), None);
    }
}
```

Unit tests at the bottom of `crates/santi-server/src/members/domain.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::members::Member;
    use santi_types::projects::{BoardType, MemberRole};

    fn member(role: MemberRole) -> Member {
        Member { user_id: 1, project_id: 1, project_key: "SANTI".into(), board_id: 1, board_type: BoardType::Scrum, role }
    }

    #[test]
    fn only_admins_pass_require_admin() {
        assert!(require_admin(&member(MemberRole::Admin)).is_ok());
        assert_eq!(require_admin(&member(MemberRole::Member)), Err(AppError::Forbidden));
    }

    #[test]
    fn the_last_admin_cannot_be_demoted_or_removed() {
        assert!(check_admin_remains(1, MemberRole::Admin, Some(MemberRole::Member)).is_err());
        assert!(check_admin_remains(1, MemberRole::Admin, None).is_err());
    }

    #[test]
    fn other_role_changes_are_allowed() {
        assert!(check_admin_remains(2, MemberRole::Admin, None).is_ok());
        assert!(check_admin_remains(1, MemberRole::Member, None).is_ok());
        assert!(check_admin_remains(1, MemberRole::Admin, Some(MemberRole::Admin)).is_ok());
    }
}
```

Add to `crates/santi-server/tests/common/mod.rs`:

```rust
impl TestApp {
    pub async fn create_project(&self, key: &str, board_type: &str) -> Value {
        let body = json!({ "key": key, "name": format!("Project {key}"), "board_type": board_type });
        let (status, project) = self.post("/api/projects", body).await;
        assert_eq!(status, StatusCode::CREATED, "{project}");
        project
    }
}
```

`crates/santi-server/tests/projects.rs`:

```rust
mod common;

use axum::http::StatusCode;
use common::TestApp;
use serde_json::json;
use sqlx::PgPool;

#[sqlx::test]
async fn creator_becomes_admin_of_a_new_project(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;

    let project = ana.create_project("santi", "scrum").await;

    assert_eq!(project["key"], "SANTI");
    assert_eq!(project["board_type"], "scrum");
    assert_eq!(project["role"], "admin");
}

#[sqlx::test]
async fn project_key_is_validated_and_unique(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("SANTI", "scrum").await;

    let (invalid, problem) = ana.post("/api/projects", json!({ "key": "1X", "name": "x", "board_type": "scrum" })).await;
    let (duplicate, _) = ana.post("/api/projects", json!({ "key": "SANTI", "name": "x", "board_type": "kanban" })).await;

    assert_eq!(invalid, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "key");
    assert_eq!(duplicate, StatusCode::CONFLICT);
}

#[sqlx::test]
async fn project_list_shows_only_my_projects(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    ana.create_project("ANA", "scrum").await;
    bob.create_project("BOB", "kanban").await;

    let (_, projects) = ana.get("/api/projects").await;

    let keys: Vec<&str> = projects.as_array().unwrap().iter().map(|project| project["key"].as_str().unwrap()).collect();
    assert_eq!(keys, ["ANA"]);
}

#[sqlx::test]
async fn non_members_and_unknown_keys_get_not_found(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    ana.create_project("SANTI", "scrum").await;

    assert_eq!(bob.get("/api/projects/SANTI").await.0, StatusCode::NOT_FOUND);
    assert_eq!(ana.get("/api/projects/NOPE").await.0, StatusCode::NOT_FOUND);
    assert_eq!(ana.get("/api/projects/SANTI").await.0, StatusCode::OK);
}

#[sqlx::test]
async fn admin_adds_a_member_by_email(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    ana.create_project("SANTI", "scrum").await;

    let (status, added) = ana.post("/api/projects/SANTI/members", json!({ "email": "BOB@example.com", "role": "member" })).await;
    let (_, members) = bob.get("/api/projects/SANTI/members").await;

    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(added["user_id"], bob.user_id);
    assert_eq!(members.as_array().unwrap().len(), 2);
}

#[sqlx::test]
async fn adding_unknown_or_existing_members_fails(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("SANTI", "scrum").await;

    let (unknown, problem) = ana.post("/api/projects/SANTI/members", json!({ "email": "zed@example.com", "role": "member" })).await;
    let (existing, _) = ana.post("/api/projects/SANTI/members", json!({ "email": "ana@example.com", "role": "member" })).await;

    assert_eq!(unknown, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "email");
    assert_eq!(existing, StatusCode::CONFLICT);
}

#[sqlx::test]
async fn members_cannot_manage_membership(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    ana.post("/api/projects/SANTI/members", json!({ "email": "bob@example.com", "role": "member" })).await;

    let (add, problem) = bob.post("/api/projects/SANTI/members", json!({ "email": "ana@example.com", "role": "admin" })).await;
    let (invite, _) = bob.post("/api/projects/SANTI/invites", json!({ "role": "member" })).await;

    assert_eq!(add, StatusCode::FORBIDDEN);
    assert_eq!(problem["type"], "urn:santi:error:forbidden");
    assert_eq!(invite, StatusCode::FORBIDDEN);
}

#[sqlx::test]
async fn the_last_admin_stays(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    let me = format!("/api/projects/SANTI/members/{}", ana.user_id);

    let (demote, problem) = ana.put(&me, json!({ "role": "member" })).await;
    let (remove, _) = ana.delete(&me).await;

    assert_eq!(demote, StatusCode::CONFLICT);
    assert_eq!(problem["type"], "urn:santi:error:last-admin");
    assert_eq!(remove, StatusCode::CONFLICT);
}

#[sqlx::test]
async fn admin_changes_roles_and_removes_members(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    ana.post("/api/projects/SANTI/members", json!({ "email": "bob@example.com", "role": "member" })).await;
    let bob_url = format!("/api/projects/SANTI/members/{}", bob.user_id);

    let (_, promoted) = ana.put(&bob_url, json!({ "role": "admin" })).await;
    let (removed, _) = ana.delete(&bob_url).await;

    assert_eq!(promoted["role"], "admin");
    assert_eq!(removed, StatusCode::NO_CONTENT);
    assert_eq!(bob.get("/api/projects/SANTI").await.0, StatusCode::NOT_FOUND);
    assert_eq!(ana.delete(&bob_url).await.0, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn invite_link_adds_the_member_once(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    let carl = ana.another_user("carl@example.com").await;
    ana.create_project("SANTI", "scrum").await;

    let (created, invite) = ana.post("/api/projects/SANTI/invites", json!({ "role": "member" })).await;
    let accept = format!("/api/invites/{}/accept", invite["token"].as_str().unwrap());
    let (accepted, project) = bob.post(&accept, json!(null)).await;
    let (reused, _) = carl.post(&accept, json!(null)).await;

    assert_eq!(created, StatusCode::CREATED);
    assert_eq!(accepted, StatusCode::OK);
    assert_eq!(project["role"], "member");
    assert_eq!(reused, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn expired_invite_is_not_found(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    let (_, invite) = ana.post("/api/projects/SANTI/invites", json!({ "role": "member" })).await;
    sqlx::query("UPDATE invite SET expires_at = now() - interval '1 minute'").execute(&pool).await.unwrap();

    let (status, _) = bob.post(&format!("/api/invites/{}/accept", invite["token"].as_str().unwrap()), json!(null)).await;

    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn projects_require_sign_in(pool: PgPool) {
    let anonymous = TestApp::anonymous(pool);

    assert_eq!(anonymous.get("/api/projects").await.0, StatusCode::UNAUTHORIZED);
    assert_eq!(anonymous.get("/api/projects/SANTI").await.0, StatusCode::UNAUTHORIZED);
}

#[sqlx::test]
async fn openapi_lists_project_routes(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let (_, api) = app.get("/openapi.json").await;

    for path in ["/api/projects", "/api/projects/{key}", "/api/projects/{key}/members",
                 "/api/projects/{key}/members/{user_id}", "/api/projects/{key}/invites", "/api/invites/{token}/accept"] {
        assert!(api["paths"][path].is_object(), "{path} missing");
    }
}
```

`post(&accept, json!(null))` sends the body `null`; the accept handler takes no body, so axum ignores it.

- [ ] **Step 3: Run tests to verify they fail**

Run: `cargo test -p santi-server --test projects`
Expected: compile errors — `no method named create_project`, unresolved `santi_types::projects`.

- [ ] **Step 4: Minimal implementation**

`crates/santi-types/src/lib.rs`: add `pub mod projects;`.

`crates/santi-types/src/projects.rs`:

```rust
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[cfg_attr(feature = "sqlx", derive(sqlx::Type), sqlx(type_name = "text", rename_all = "snake_case"))]
#[serde(rename_all = "snake_case")]
pub enum BoardType {
    Scrum,
    Kanban,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[cfg_attr(feature = "sqlx", derive(sqlx::Type), sqlx(type_name = "text", rename_all = "snake_case"))]
#[serde(rename_all = "snake_case")]
pub enum MemberRole {
    Admin,
    Member,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct CreateProject {
    pub key: String,
    pub name: String,
    pub board_type: BoardType,
}

/// A project as seen by the caller: `role` is the caller's role in it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct Project {
    pub id: i64,
    pub key: String,
    pub name: String,
    pub board_type: BoardType,
    pub role: MemberRole,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct MemberInfo {
    pub user_id: i64,
    pub email: String,
    pub display_name: String,
    pub role: MemberRole,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct AddMember {
    pub email: String,
    pub role: MemberRole,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct SetRole {
    pub role: MemberRole,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct CreateInvite {
    pub role: MemberRole,
}

/// The token is shown once; the invite link is `/invites/{token}`.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct Invite {
    pub token: String,
    pub expires_at: DateTime<Utc>,
}
```

`crates/santi-server/src/projects/domain.rs` (above the tests):

```rust
use santi_types::projects::BoardType;

use crate::error::AppError;

pub fn check_project_key(key: &str) -> Result<String, AppError> {
    let key = key.trim().to_uppercase();
    let mut characters = key.chars();
    let starts_with_letter = characters.next().is_some_and(|first| first.is_ascii_uppercase());
    let rest_is_alphanumeric = characters.all(|character| character.is_ascii_uppercase() || character.is_ascii_digit());
    let length_ok = (2..=10).contains(&key.len());
    if !(starts_with_letter && rest_is_alphanumeric && length_ok) {
        return Err(AppError::invalid("key", "must be 2 to 10 letters or digits, starting with a letter"));
    }
    Ok(key)
}

pub fn check_project_name(name: &str) -> Result<String, AppError> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 100 {
        return Err(AppError::invalid("name", "must have 1 to 100 characters"));
    }
    Ok(name.to_string())
}

/// KB-23: kanban boards hide done work after 14 days by default; scrum boards never hide.
pub fn default_done_window(board_type: BoardType) -> Option<i32> {
    match board_type {
        BoardType::Kanban => Some(14),
        BoardType::Scrum => None,
    }
}
```

`crates/santi-server/src/projects/repo.rs`:

```rust
use santi_types::projects::{BoardType, MemberRole, Project};
use sqlx::PgConnection;

pub async fn insert_project(conn: &mut PgConnection, key: &str, name: &str) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!("INSERT INTO project (key, name) VALUES ($1, $2) RETURNING id", key, name)
        .fetch_one(&mut *conn)
        .await
}

pub async fn insert_board(conn: &mut PgConnection, project_id: i64, board_type: BoardType, done_window_days: Option<i32>) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!(
        "INSERT INTO board (project_id, board_type, done_window_days) VALUES ($1, $2, $3) RETURNING id",
        project_id,
        board_type as BoardType,
        done_window_days
    )
    .fetch_one(&mut *conn)
    .await
}

pub async fn find_project(conn: &mut PgConnection, project_id: i64, user_id: i64) -> Result<Project, sqlx::Error> {
    sqlx::query_as!(
        Project,
        r#"SELECT p.id, p.key, p.name, b.board_type AS "board_type: BoardType", m.role AS "role: MemberRole"
           FROM project p
           JOIN board b ON b.project_id = p.id
           JOIN member m ON m.project_id = p.id AND m.user_id = $2
           WHERE p.id = $1"#,
        project_id,
        user_id
    )
    .fetch_one(&mut *conn)
    .await
}

pub async fn list_projects(conn: &mut PgConnection, user_id: i64) -> Result<Vec<Project>, sqlx::Error> {
    sqlx::query_as!(
        Project,
        r#"SELECT p.id, p.key, p.name, b.board_type AS "board_type: BoardType", m.role AS "role: MemberRole"
           FROM member m
           JOIN project p ON p.id = m.project_id
           JOIN board b ON b.project_id = p.id
           WHERE m.user_id = $1
           ORDER BY p.key"#,
        user_id
    )
    .fetch_all(&mut *conn)
    .await
}

/// Serializes writes that must not interleave inside one project (D20, D21).
pub async fn lock_project(conn: &mut PgConnection, project_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query!("SELECT id FROM project WHERE id = $1 FOR UPDATE", project_id)
        .fetch_one(&mut *conn)
        .await?;
    Ok(())
}

/// D20: hands out KEY-N numbers that are never reused; the UPDATE also locks the project row.
pub async fn take_issue_number(conn: &mut PgConnection, project_id: i64) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!(
        r#"UPDATE project SET next_issue_number = next_issue_number + 1
           WHERE id = $1 RETURNING next_issue_number - 1 AS "number!""#,
        project_id
    )
    .fetch_one(&mut *conn)
    .await
}
```

`crates/santi-server/src/projects/service.rs`:

```rust
use santi_types::projects::{CreateProject, MemberRole, Project};
use sqlx::PgPool;

use super::{domain, repo};
use crate::auth::extract::CurrentUser;
use crate::error::AppError;
use crate::members::{self, Member};

pub async fn create_project(pool: &PgPool, user: &CurrentUser, input: CreateProject) -> Result<Project, AppError> {
    let key = domain::check_project_key(&input.key)?;
    let name = domain::check_project_name(&input.name)?;
    let mut tx = pool.begin().await?;
    let project_id = repo::insert_project(&mut tx, &key, &name).await?;
    let done_window = domain::default_done_window(input.board_type);
    repo::insert_board(&mut tx, project_id, input.board_type, done_window).await?;
    members::repo::insert_member(&mut tx, project_id, user.id, MemberRole::Admin).await?;
    let project = repo::find_project(&mut tx, project_id, user.id).await?;
    tx.commit().await?;
    Ok(project)
}

pub async fn list_projects(pool: &PgPool, user: &CurrentUser) -> Result<Vec<Project>, AppError> {
    let mut conn = pool.acquire().await?;
    Ok(repo::list_projects(&mut conn, user.id).await?)
}

pub async fn get_project(pool: &PgPool, member: &Member) -> Result<Project, AppError> {
    let mut conn = pool.acquire().await?;
    Ok(repo::find_project(&mut conn, member.project_id, member.user_id).await?)
}
```

`crates/santi-server/src/projects/handler.rs` — follow the Task 2 handler pattern for the three project routes in the table: `create_project(State, CurrentUser, JsonBody<CreateProject>) -> Result<(StatusCode, Json<Project>), AppError>` returning 201; `list_projects(State, CurrentUser) -> Result<Json<Vec<Project>>, AppError>`; `get_project(State, Member) -> Result<Json<Project>, AppError>`, `params(("key" = String, Path, description = "Project key"))`. Router:

```rust
pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(create_project, list_projects))
        .routes(routes!(get_project))
}
```

`crates/santi-server/src/members/mod.rs`:

```rust
pub mod domain;
pub mod extract;
pub mod handler;
pub mod repo;
pub mod service;

use santi_types::projects::{BoardType, MemberRole};

/// The caller inside one project: every project-scoped use case takes it (D28).
#[derive(Debug, Clone)]
pub struct Member {
    pub user_id: i64,
    pub project_id: i64,
    pub project_key: String,
    pub board_id: i64,
    pub board_type: BoardType,
    pub role: MemberRole,
}
```

`crates/santi-server/src/members/extract.rs`:

```rust
use axum::extract::{FromRequestParts, RawPathParams};
use axum::http::request::Parts;

use super::{Member, repo};
use crate::AppState;
use crate::auth::extract::CurrentUser;
use crate::error::AppError;

/// D28: loads the project from `{key}` and the caller's membership in one query; strangers get 404.
impl FromRequestParts<AppState> for Member {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, AppError> {
        let user = CurrentUser::from_request_parts(parts, state).await?;
        let params = RawPathParams::from_request_parts(parts, state).await.map_err(|_| AppError::NotFound)?;
        let key = params.iter().find(|(name, _)| *name == "key").map(|(_, value)| value.to_string());
        let key = key.ok_or(AppError::NotFound)?;
        let mut conn = state.pool.acquire().await?;
        let member = repo::find_member(&mut conn, &key, user.id).await?;
        member.ok_or(AppError::NotFound)
    }
}
```

`crates/santi-server/src/members/domain.rs` (above the tests):

```rust
use santi_types::projects::MemberRole;

use super::Member;
use crate::error::AppError;

pub const INVITE_DAYS: i64 = 7;

pub fn require_admin(member: &Member) -> Result<(), AppError> {
    if member.role != MemberRole::Admin {
        return Err(AppError::Forbidden);
    }
    Ok(())
}

/// `new_role` is None when the member is being removed.
pub fn check_admin_remains(admin_count: i64, current_role: MemberRole, new_role: Option<MemberRole>) -> Result<(), AppError> {
    let loses_admin = current_role == MemberRole::Admin && new_role != Some(MemberRole::Admin);
    if loses_admin && admin_count == 1 {
        return Err(AppError::conflict("last-admin", "A project needs at least one admin."));
    }
    Ok(())
}
```

`crates/santi-server/src/members/repo.rs`:

```rust
use chrono::{DateTime, Utc};
use santi_types::projects::{BoardType, MemberInfo, MemberRole};
use sqlx::PgConnection;

use super::Member;

pub struct InviteGrant {
    pub project_id: i64,
    pub role: MemberRole,
}

pub async fn find_member(conn: &mut PgConnection, project_key: &str, user_id: i64) -> Result<Option<Member>, sqlx::Error> {
    sqlx::query_as!(
        Member,
        r#"SELECT m.user_id, p.id AS project_id, p.key AS project_key, b.id AS board_id,
                  b.board_type AS "board_type: BoardType", m.role AS "role: MemberRole"
           FROM project p
           JOIN board b ON b.project_id = p.id
           JOIN member m ON m.project_id = p.id AND m.user_id = $2
           WHERE p.key = $1"#,
        project_key,
        user_id
    )
    .fetch_optional(&mut *conn)
    .await
}

pub async fn insert_member(conn: &mut PgConnection, project_id: i64, user_id: i64, role: MemberRole) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "INSERT INTO member (project_id, user_id, role) VALUES ($1, $2, $3)",
        project_id,
        user_id,
        role as MemberRole
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

pub async fn is_member(conn: &mut PgConnection, project_id: i64, user_id: i64) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT EXISTS (SELECT 1 FROM member WHERE project_id = $1 AND user_id = $2) AS "exists!""#,
        project_id,
        user_id
    )
    .fetch_one(&mut *conn)
    .await
}

pub async fn find_member_info(conn: &mut PgConnection, project_id: i64, user_id: i64) -> Result<Option<MemberInfo>, sqlx::Error> {
    sqlx::query_as!(
        MemberInfo,
        r#"SELECT u.id AS user_id, u.email, u.display_name, m.role AS "role: MemberRole"
           FROM member m JOIN app_user u ON u.id = m.user_id
           WHERE m.project_id = $1 AND m.user_id = $2"#,
        project_id,
        user_id
    )
    .fetch_optional(&mut *conn)
    .await
}

pub async fn list_members(conn: &mut PgConnection, project_id: i64) -> Result<Vec<MemberInfo>, sqlx::Error> {
    sqlx::query_as!(
        MemberInfo,
        r#"SELECT u.id AS user_id, u.email, u.display_name, m.role AS "role: MemberRole"
           FROM member m JOIN app_user u ON u.id = m.user_id
           WHERE m.project_id = $1
           ORDER BY u.display_name, u.id"#,
        project_id
    )
    .fetch_all(&mut *conn)
    .await
}

pub async fn find_user_id_by_email(conn: &mut PgConnection, email: &str) -> Result<Option<i64>, sqlx::Error> {
    sqlx::query_scalar!("SELECT id FROM app_user WHERE email = $1", email)
        .fetch_optional(&mut *conn)
        .await
}

pub async fn count_admins(conn: &mut PgConnection, project_id: i64) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT count(*) AS "count!" FROM member WHERE project_id = $1 AND role = 'admin'"#,
        project_id
    )
    .fetch_one(&mut *conn)
    .await
}

pub async fn set_role(conn: &mut PgConnection, project_id: i64, user_id: i64, role: MemberRole) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE member SET role = $3 WHERE project_id = $1 AND user_id = $2",
        project_id,
        user_id,
        role as MemberRole
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

pub async fn delete_member(conn: &mut PgConnection, project_id: i64, user_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query!("DELETE FROM member WHERE project_id = $1 AND user_id = $2", project_id, user_id)
        .execute(&mut *conn)
        .await?;
    Ok(())
}

pub async fn insert_invite(conn: &mut PgConnection, project_id: i64, role: MemberRole, token_hash: &[u8], created_by: i64, expires_at: DateTime<Utc>) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "INSERT INTO invite (project_id, role, token_hash, created_by, expires_at) VALUES ($1, $2, $3, $4, $5)",
        project_id,
        role as MemberRole,
        token_hash,
        created_by,
        expires_at
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// Invites are single use: a valid one is deleted and its grant returned.
pub async fn take_invite(conn: &mut PgConnection, token_hash: &[u8]) -> Result<Option<InviteGrant>, sqlx::Error> {
    sqlx::query_as!(
        InviteGrant,
        r#"DELETE FROM invite WHERE token_hash = $1 AND expires_at > now()
           RETURNING project_id, role AS "role: MemberRole""#,
        token_hash
    )
    .fetch_optional(&mut *conn)
    .await
}
```

`crates/santi-server/src/members/service.rs`:

```rust
use chrono::{Duration, Utc};
use santi_types::projects::{AddMember, CreateInvite, Invite, MemberInfo, Project, SetRole};
use sqlx::PgPool;

use super::{Member, domain, repo};
use crate::auth::{self, extract::CurrentUser};
use crate::error::AppError;
use crate::projects;

pub async fn list_members(pool: &PgPool, member: &Member) -> Result<Vec<MemberInfo>, AppError> {
    let mut conn = pool.acquire().await?;
    Ok(repo::list_members(&mut conn, member.project_id).await?)
}

pub async fn add_member(pool: &PgPool, member: &Member, input: AddMember) -> Result<MemberInfo, AppError> {
    domain::require_admin(member)?;
    let email = input.email.trim().to_lowercase();
    let mut conn = pool.acquire().await?;
    let user_id = repo::find_user_id_by_email(&mut conn, &email).await?;
    let user_id = user_id.ok_or_else(|| AppError::invalid("email", "no account uses this email; send an invite link"))?;
    repo::insert_member(&mut conn, member.project_id, user_id, input.role).await?;
    repo::find_member_info(&mut conn, member.project_id, user_id).await?.ok_or(AppError::NotFound)
}

pub async fn set_role(pool: &PgPool, member: &Member, user_id: i64, input: SetRole) -> Result<MemberInfo, AppError> {
    domain::require_admin(member)?;
    let mut tx = pool.begin().await?;
    projects::repo::lock_project(&mut tx, member.project_id).await?;
    let target = repo::find_member_info(&mut tx, member.project_id, user_id).await?.ok_or(AppError::NotFound)?;
    let admin_count = repo::count_admins(&mut tx, member.project_id).await?;
    domain::check_admin_remains(admin_count, target.role, Some(input.role))?;
    repo::set_role(&mut tx, member.project_id, user_id, input.role).await?;
    tx.commit().await?;
    Ok(MemberInfo { role: input.role, ..target })
}

pub async fn remove_member(pool: &PgPool, member: &Member, user_id: i64) -> Result<(), AppError> {
    domain::require_admin(member)?;
    let mut tx = pool.begin().await?;
    projects::repo::lock_project(&mut tx, member.project_id).await?;
    let target = repo::find_member_info(&mut tx, member.project_id, user_id).await?.ok_or(AppError::NotFound)?;
    let admin_count = repo::count_admins(&mut tx, member.project_id).await?;
    domain::check_admin_remains(admin_count, target.role, None)?;
    repo::delete_member(&mut tx, member.project_id, user_id).await?;
    tx.commit().await?;
    Ok(())
}

pub async fn create_invite(pool: &PgPool, member: &Member, input: CreateInvite) -> Result<Invite, AppError> {
    domain::require_admin(member)?;
    let token = auth::domain::new_secret();
    let expires_at = Utc::now() + Duration::days(domain::INVITE_DAYS);
    let mut conn = pool.acquire().await?;
    repo::insert_invite(&mut conn, member.project_id, input.role, &auth::domain::hash_token(&token), member.user_id, expires_at).await?;
    Ok(Invite { token, expires_at })
}

pub async fn accept_invite(pool: &PgPool, user: &CurrentUser, token: &str) -> Result<Project, AppError> {
    let mut tx = pool.begin().await?;
    let grant = repo::take_invite(&mut tx, &auth::domain::hash_token(token)).await?.ok_or(AppError::NotFound)?;
    repo::insert_member(&mut tx, grant.project_id, user.id, grant.role).await?;
    let project = projects::repo::find_project(&mut tx, grant.project_id, user.id).await?;
    tx.commit().await?;
    Ok(project)
}
```

`crates/santi-server/src/members/handler.rs` — Task 2 handler pattern for the six member/invite routes in the table. Signatures:

```rust
pub async fn list_members(State(state): State<AppState>, member: Member) -> Result<Json<Vec<MemberInfo>>, AppError>
pub async fn add_member(State(state): State<AppState>, member: Member, JsonBody(input): JsonBody<AddMember>) -> Result<(StatusCode, Json<MemberInfo>), AppError>
pub async fn set_role(State(state): State<AppState>, member: Member, PathParams((_key, user_id)): PathParams<(String, i64)>, JsonBody(input): JsonBody<SetRole>) -> Result<Json<MemberInfo>, AppError>
pub async fn remove_member(State(state): State<AppState>, member: Member, PathParams((_key, user_id)): PathParams<(String, i64)>) -> Result<StatusCode, AppError>
pub async fn create_invite(State(state): State<AppState>, member: Member, JsonBody(input): JsonBody<CreateInvite>) -> Result<(StatusCode, Json<Invite>), AppError>
pub async fn accept_invite(State(state): State<AppState>, user: CurrentUser, PathParams(token): PathParams<String>) -> Result<Json<Project>, AppError>

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(list_members, add_member))
        .routes(routes!(set_role, remove_member))
        .routes(routes!(create_invite))
        .routes(routes!(accept_invite))
}
```

`crates/santi-server/src/lib.rs`: add `pub mod members; pub mod projects;` and `.merge(projects::handler::router()).merge(members::handler::router())`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cargo test -p santi-server`
Expected: `test result: ok.` everywhere, 0 failed.

- [ ] **Step 6: Offline data and gate**

Run: `cargo sqlx prepare --workspace`, then the gate. Expected: all clean, coverage above 90%.

- [ ] **Step 7: Commit**

```bash
git add crates/santi-server/migrations/0003_projects.sql crates/santi-types/src/lib.rs crates/santi-types/src/projects.rs \
  crates/santi-server/src/lib.rs crates/santi-server/src/projects crates/santi-server/src/members \
  crates/santi-server/tests/common/mod.rs crates/santi-server/tests/projects.rs .sqlx
git commit -m "feat: add projects, members, invites and the membership extractor"
```

---
### Task 4: Statuses, columns and board settings

**Branch:** `feat/SAN-<card>-board-layout`

**Files:**
- Modify: `Cargo.toml`, `crates/santi-server/Cargo.toml`, `crates/santi-types/src/lib.rs`, `crates/santi-server/src/lib.rs`, `crates/santi-server/src/error.rs`, `crates/santi-server/src/extract.rs`, `crates/santi-server/src/projects/service.rs`, `crates/santi-server/tests/common/mod.rs`
- Create: `crates/santi-server/migrations/0004_board_layout.sql`, `crates/santi-types/src/boards.rs`, `crates/santi-server/src/boards/{mod.rs,domain.rs,repo.rs,service.rs,handler.rs}`, `crates/santi-server/tests/board_settings.rs`
- Modify: `.sqlx/`

**Interfaces:**
- Consumes: `Member`, `members::domain::require_admin` (Task 3); `projects::service::create_project` (Task 3); `AppError`, `JsonBody`, `PathParams` (Task 1).
- Produces:
  - `santi_server::extract::QueryParams<T>(pub T)` over `axum_extra::extract::Query` (repeated keys become `Vec`, D3/D18)
  - `santi_server::boards::domain::{ColumnRow { id: i64, name: String, position: i32, wip_limit: Option<i32> }, LayoutColumn { id: i64, categories: Vec<StatusCategory> }, check_done_mapping(&[LayoutColumn]) -> Result<(), AppError>}`
  - `santi_server::boards::repo::list_columns(conn: &mut PgConnection, board_id: i64) -> Result<Vec<ColumnRow>, sqlx::Error>` (Task 9 reuses it)
  - `santi_server::boards::service::seed_default_layout(conn: &mut PgConnection, project_id: i64, board_id: i64) -> Result<(), sqlx::Error>` (SB-1: To Do / In Progress / Done)
  - `santi_types::boards::{StatusCategory, Status, Column, BoardSettings, UpdateBoardSettings, CreateColumn, UpdateColumn, ReorderColumns, DeleteColumnParams, CreateStatus, UpdateStatus}`
  - Test helpers: `TestApp::settings(&self, key) -> Value`, `TestApp::column_id(&self, key, name) -> i64`, `TestApp::status_id(&self, key, name) -> i64`

Routes (all writes admin-only, SB-4; every layout write re-checks D2 inside its transaction and rolls back on failure):

| Method | Path | Body / query | Success |
|---|---|---|---|
| GET | `/api/projects/{key}/board/settings` | — | 200 `BoardSettings` |
| PUT | `/api/projects/{key}/board/settings` | `UpdateBoardSettings` | 200 `BoardSettings`; 422 window not 7/14/30/null or set on scrum |
| POST | `/api/projects/{key}/board/columns` | `CreateColumn` | 201 `BoardSettings` (new column sits left of the rightmost one; optional same-name status, SB-5) |
| PUT | `/api/projects/{key}/board/columns/order` | `ReorderColumns` | 200 `BoardSettings` |
| PUT | `/api/projects/{key}/board/columns/{id}` | `UpdateColumn` | 200 `BoardSettings`; 422 `wip_limit` on scrum (D7) |
| DELETE | `/api/projects/{key}/board/columns/{id}` | `?move_statuses_to=<column id>` | 200 `BoardSettings` (D16) |
| POST | `/api/projects/{key}/statuses` | `CreateStatus` | 201 `Status` (unmapped, SB-3) |
| PUT | `/api/projects/{key}/statuses/{id}` | `UpdateStatus` | 200 `Status` (rename, map or unmap) |
| DELETE | `/api/projects/{key}/statuses/{id}` | — | 204; 409 `in-use` while an issue holds it (SB-6, Task 5 test) |

- [ ] **Step 1: Dependency and migration**

`Cargo.toml` `[workspace.dependencies]`: `axum-extra = { version = "0.12.6", features = ["query"] }`; `crates/santi-server/Cargo.toml` `[dependencies]`: `axum-extra.workspace = true`.

`crates/santi-server/migrations/0004_board_layout.sql`:

```sql
CREATE TABLE board_column (
    id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    board_id  bigint NOT NULL REFERENCES board (id) ON DELETE CASCADE,
    name      text NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
    position  integer NOT NULL,
    wip_limit integer CHECK (wip_limit > 0),                      -- D7: warns, never blocks
    CONSTRAINT board_column_position_key UNIQUE (board_id, position) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE status (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id bigint NOT NULL REFERENCES project (id) ON DELETE CASCADE,
    name       text NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
    category   text NOT NULL CHECK (category IN ('todo', 'in_progress', 'done')),
    -- D30: NULL = unmapped. No ON DELETE action: a column is deleted only after its statuses moved (D16).
    column_id  bigint REFERENCES board_column (id),
    UNIQUE (project_id, name)
);

CREATE INDEX status_column_idx ON status (column_id);
```

Run: `sqlx migrate run --source crates/santi-server/migrations`
Expected: `Applied 4/migrate board layout`.

- [ ] **Step 2: Write the failing tests**

Unit tests at the bottom of `crates/santi-server/src/boards/domain.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use santi_types::boards::StatusCategory::{Done, InProgress, Todo};

    fn layout(columns: &[(i64, &[StatusCategory])]) -> Vec<LayoutColumn> {
        columns.iter().map(|(id, categories)| LayoutColumn { id: *id, categories: categories.to_vec() }).collect()
    }

    #[test]
    fn default_layout_satisfies_the_done_rule() {
        assert!(check_done_mapping(&layout(&[(1, &[Todo]), (2, &[InProgress]), (3, &[Done])])).is_ok());
    }

    #[test]
    fn done_status_outside_the_rightmost_column_is_refused() {
        let error = check_done_mapping(&layout(&[(1, &[Todo, Done]), (2, &[Done])])).unwrap_err();
        assert_eq!(error.to_problem().problem_type, "urn:santi:error:done-column");
    }

    #[test]
    fn non_done_status_in_the_rightmost_column_is_refused() {
        assert!(check_done_mapping(&layout(&[(1, &[Todo]), (2, &[Done, InProgress])])).is_err());
    }

    #[test]
    fn empty_columns_and_empty_boards_pass() {
        assert!(check_done_mapping(&layout(&[(1, &[Todo]), (2, &[])])).is_ok());
        assert!(check_done_mapping(&[]).is_ok());
    }

    #[test]
    fn column_deletion_rules() {
        let board = layout(&[(1, &[Todo]), (2, &[]), (3, &[Done])]);
        assert_eq!(check_column_deletion(&board, 9, None), Err(AppError::NotFound));
        assert!(check_column_deletion(&board, 3, Some(1)).is_err());
        assert_eq!(check_column_deletion(&board, 2, None), Ok(None));
        assert!(check_column_deletion(&board, 1, None).is_err());
        assert!(check_column_deletion(&board, 1, Some(1)).is_err());
        assert!(check_column_deletion(&board, 1, Some(9)).is_err());
        assert_eq!(check_column_deletion(&board, 1, Some(2)), Ok(Some(2)));
    }

    #[test]
    fn reorder_must_list_every_column_once() {
        assert!(check_same_columns(&[1, 2, 3], &[3, 1, 2]).is_ok());
        assert!(check_same_columns(&[1, 2, 3], &[1, 2]).is_err());
        assert!(check_same_columns(&[1, 2, 3], &[1, 2, 2]).is_err());
    }

    #[test]
    fn wip_limits_are_kanban_only_and_positive() {
        assert!(check_wip_limit(BoardType::Kanban, Some(3)).is_ok());
        assert!(check_wip_limit(BoardType::Kanban, None).is_ok());
        assert!(check_wip_limit(BoardType::Kanban, Some(0)).is_err());
        assert!(check_wip_limit(BoardType::Scrum, Some(3)).is_err());
        assert!(check_wip_limit(BoardType::Scrum, None).is_ok());
    }

    #[test]
    fn done_window_accepts_only_the_offered_choices() {
        for days in [None, Some(7), Some(14), Some(30)] {
            assert!(check_done_window(BoardType::Kanban, days).is_ok());
        }
        assert!(check_done_window(BoardType::Kanban, Some(10)).is_err());
        assert!(check_done_window(BoardType::Scrum, Some(14)).is_err());
        assert!(check_done_window(BoardType::Scrum, None).is_ok());
    }

    #[test]
    fn names_are_trimmed_and_bounded() {
        assert_eq!(check_name("name", " Review ").unwrap(), "Review");
        assert!(check_name("name", "").is_err());
        assert!(check_name("name", &"x".repeat(61)).is_err());
    }

    #[test]
    fn settings_group_statuses_by_column() {
        let columns = vec![ColumnRow { id: 1, name: "To Do".into(), position: 0, wip_limit: None }];
        let statuses = vec![
            Status { id: 10, name: "To Do".into(), category: Todo, column_id: Some(1) },
            Status { id: 11, name: "Parked".into(), category: Todo, column_id: None },
        ];

        let settings = assemble_settings(BoardType::Scrum, None, columns, statuses);

        assert_eq!(settings.columns[0].statuses[0].id, 10);
        assert_eq!(settings.unmapped[0].id, 11);
    }
}
```

Add to `crates/santi-server/tests/common/mod.rs`:

```rust
impl TestApp {
    pub async fn settings(&self, key: &str) -> Value {
        let (status, settings) = self.get(&format!("/api/projects/{key}/board/settings")).await;
        assert_eq!(status, StatusCode::OK, "{settings}");
        settings
    }

    pub async fn column_id(&self, key: &str, name: &str) -> i64 {
        let settings = self.settings(key).await;
        let column = settings["columns"].as_array().unwrap().iter().find(|column| column["name"] == name);
        column.unwrap()["id"].as_i64().unwrap()
    }

    pub async fn status_id(&self, key: &str, name: &str) -> i64 {
        let settings = self.settings(key).await;
        let mapped = settings["columns"].as_array().unwrap().iter().flat_map(|column| column["statuses"].as_array().unwrap());
        let mut all = mapped.chain(settings["unmapped"].as_array().unwrap());
        all.find(|status| status["name"] == name).unwrap()["id"].as_i64().unwrap()
    }
}
```

`crates/santi-server/tests/board_settings.rs`:

```rust
mod common;

use axum::http::StatusCode;
use common::TestApp;
use serde_json::{Value, json};
use sqlx::PgPool;

fn column_names(settings: &Value) -> Vec<String> {
    settings["columns"].as_array().unwrap().iter().map(|column| column["name"].as_str().unwrap().to_string()).collect()
}

async fn admin_with_project(pool: PgPool, board_type: &str) -> TestApp {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("SANTI", board_type).await;
    ana
}

#[sqlx::test]
async fn new_scrum_project_has_three_default_columns(pool: PgPool) {
    let ana = admin_with_project(pool, "scrum").await;

    let settings = ana.settings("SANTI").await;

    assert_eq!(column_names(&settings), ["To Do", "In Progress", "Done"]);
    assert_eq!(settings["columns"][2]["statuses"][0]["category"], "done");
    assert_eq!(settings["unmapped"], json!([]));
    assert_eq!(settings["done_window_days"], Value::Null);
}

#[sqlx::test]
async fn new_kanban_project_hides_done_after_14_days(pool: PgPool) {
    let ana = admin_with_project(pool, "kanban").await;

    assert_eq!(ana.settings("SANTI").await["done_window_days"], 14);
}

#[sqlx::test]
async fn new_column_lands_left_of_done_with_its_status(pool: PgPool) {
    let ana = admin_with_project(pool, "scrum").await;

    let (status, settings) = ana.post("/api/projects/SANTI/board/columns", json!({ "name": "Review", "new_status": "in_progress" })).await;

    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(column_names(&settings), ["To Do", "In Progress", "Review", "Done"]);
    assert_eq!(settings["columns"][2]["statuses"][0]["name"], "Review");
}

#[sqlx::test]
async fn new_column_with_a_done_status_is_refused_and_rolled_back(pool: PgPool) {
    let ana = admin_with_project(pool, "scrum").await;

    let (status, problem) = ana.post("/api/projects/SANTI/board/columns", json!({ "name": "Shipped", "new_status": "done" })).await;

    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(problem["type"], "urn:santi:error:done-column");
    assert_eq!(column_names(&ana.settings("SANTI").await), ["To Do", "In Progress", "Done"]);
}

#[sqlx::test]
async fn members_cannot_change_the_layout(pool: PgPool) {
    let ana = admin_with_project(pool, "scrum").await;
    let bob = ana.another_user("bob@example.com").await;
    ana.post("/api/projects/SANTI/members", json!({ "email": "bob@example.com", "role": "member" })).await;

    let (status, _) = bob.post("/api/projects/SANTI/board/columns", json!({ "name": "Review" })).await;

    assert_eq!(status, StatusCode::FORBIDDEN);
    assert_eq!(bob.get("/api/projects/SANTI/board/settings").await.0, StatusCode::OK);
}

#[sqlx::test]
async fn reorder_keeps_done_rightmost(pool: PgPool) {
    let ana = admin_with_project(pool, "scrum").await;
    let todo = ana.column_id("SANTI", "To Do").await;
    let doing = ana.column_id("SANTI", "In Progress").await;
    let done = ana.column_id("SANTI", "Done").await;
    let order = "/api/projects/SANTI/board/columns/order";

    let (swapped, settings) = ana.put(order, json!({ "column_ids": [doing, todo, done] })).await;
    let (done_left, _) = ana.put(order, json!({ "column_ids": [done, todo, doing] })).await;
    let (missing, _) = ana.put(order, json!({ "column_ids": [todo, done] })).await;

    assert_eq!(swapped, StatusCode::OK);
    assert_eq!(column_names(&settings), ["In Progress", "To Do", "Done"]);
    assert_eq!(done_left, StatusCode::CONFLICT);
    assert_eq!(missing, StatusCode::UNPROCESSABLE_ENTITY);
}

#[sqlx::test]
async fn kanban_columns_take_a_wip_limit_and_scrum_columns_do_not(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("FLOW", "kanban").await;
    ana.create_project("SPRINT", "scrum").await;
    let flow = ana.column_id("FLOW", "In Progress").await;
    let sprint = ana.column_id("SPRINT", "In Progress").await;

    let (_, settings) = ana.put(&format!("/api/projects/FLOW/board/columns/{flow}"), json!({ "name": "Doing", "wip_limit": 3 })).await;
    let (refused, problem) = ana.put(&format!("/api/projects/SPRINT/board/columns/{sprint}"), json!({ "name": "Doing", "wip_limit": 3 })).await;

    assert_eq!(settings["columns"][1]["name"], "Doing");
    assert_eq!(settings["columns"][1]["wip_limit"], 3);
    assert_eq!(refused, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "wip_limit");
}

#[sqlx::test]
async fn updating_an_unknown_column_is_not_found(pool: PgPool) {
    let ana = admin_with_project(pool, "scrum").await;

    let (status, _) = ana.put("/api/projects/SANTI/board/columns/999999", json!({ "name": "X" })).await;

    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn deleting_a_column_moves_its_statuses_to_the_target(pool: PgPool) {
    let ana = admin_with_project(pool, "scrum").await;
    let todo = ana.column_id("SANTI", "To Do").await;
    let doing = ana.column_id("SANTI", "In Progress").await;

    let (status, settings) = ana.delete(&format!("/api/projects/SANTI/board/columns/{doing}?move_statuses_to={todo}")).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(column_names(&settings), ["To Do", "Done"]);
    assert_eq!(settings["columns"][0]["statuses"].as_array().unwrap().len(), 2);
}

#[sqlx::test]
async fn column_deletion_guards(pool: PgPool) {
    let ana = admin_with_project(pool, "scrum").await;
    let todo = ana.column_id("SANTI", "To Do").await;
    let done = ana.column_id("SANTI", "Done").await;

    let (rightmost, problem) = ana.delete(&format!("/api/projects/SANTI/board/columns/{done}?move_statuses_to={todo}")).await;
    let (no_target, _) = ana.delete(&format!("/api/projects/SANTI/board/columns/{todo}")).await;
    let (into_done, _) = ana.delete(&format!("/api/projects/SANTI/board/columns/{todo}?move_statuses_to={done}")).await;
    let (garbage, bad) = ana.delete(&format!("/api/projects/SANTI/board/columns/{todo}?move_statuses_to=abc")).await;

    assert_eq!(rightmost, StatusCode::CONFLICT);
    assert_eq!(problem["type"], "urn:santi:error:rightmost-column");
    assert_eq!(no_target, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(into_done, StatusCode::CONFLICT);
    assert_eq!(garbage, StatusCode::BAD_REQUEST);
    assert_eq!(bad["type"], "urn:santi:error:bad-request");
    assert_eq!(column_names(&ana.settings("SANTI").await), ["To Do", "In Progress", "Done"]);
}

#[sqlx::test]
async fn deleting_an_empty_column_needs_no_target(pool: PgPool) {
    let ana = admin_with_project(pool, "scrum").await;
    ana.post("/api/projects/SANTI/board/columns", json!({ "name": "Spare" })).await;
    let spare = ana.column_id("SANTI", "Spare").await;

    let (status, settings) = ana.delete(&format!("/api/projects/SANTI/board/columns/{spare}")).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(column_names(&settings), ["To Do", "In Progress", "Done"]);
}

#[sqlx::test]
async fn statuses_start_unmapped_and_can_be_mapped(pool: PgPool) {
    let ana = admin_with_project(pool, "scrum").await;
    let doing = ana.column_id("SANTI", "In Progress").await;

    let (created, status) = ana.post("/api/projects/SANTI/statuses", json!({ "name": "Blocked", "category": "in_progress" })).await;
    let url = format!("/api/projects/SANTI/statuses/{}", status["id"]);
    let (_, mapped) = ana.put(&url, json!({ "name": "Blocked", "column_id": doing })).await;
    let (_, renamed) = ana.put(&url, json!({ "name": "On hold" })).await;

    assert_eq!(created, StatusCode::CREATED);
    assert_eq!(status["column_id"], Value::Null);
    assert_eq!(mapped["column_id"], doing);
    assert_eq!(renamed["name"], "On hold");
    assert_eq!(renamed["column_id"], Value::Null);
}

#[sqlx::test]
async fn mapping_a_done_status_to_a_middle_column_is_refused(pool: PgPool) {
    let ana = admin_with_project(pool, "scrum").await;
    let doing = ana.column_id("SANTI", "In Progress").await;
    let done_status = ana.status_id("SANTI", "Done").await;

    let (status, _) = ana.put(&format!("/api/projects/SANTI/statuses/{done_status}"), json!({ "name": "Done", "column_id": doing })).await;

    assert_eq!(status, StatusCode::CONFLICT);
}

#[sqlx::test]
async fn status_edits_validate_their_inputs(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    ana.create_project("OTHER", "scrum").await;
    let other_column = ana.column_id("OTHER", "To Do").await;
    let todo_status = ana.status_id("SANTI", "To Do").await;

    let (foreign_column, problem) = ana.put(&format!("/api/projects/SANTI/statuses/{todo_status}"), json!({ "name": "To Do", "column_id": other_column })).await;
    let (duplicate, _) = ana.post("/api/projects/SANTI/statuses", json!({ "name": "Done", "category": "done" })).await;
    let (unknown, _) = ana.put("/api/projects/SANTI/statuses/999999", json!({ "name": "X" })).await;

    assert_eq!(foreign_column, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "column_id");
    assert_eq!(duplicate, StatusCode::CONFLICT);
    assert_eq!(unknown, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn unused_statuses_can_be_deleted(pool: PgPool) {
    let ana = admin_with_project(pool, "scrum").await;
    let (_, status) = ana.post("/api/projects/SANTI/statuses", json!({ "name": "Parked", "category": "todo" })).await;
    let url = format!("/api/projects/SANTI/statuses/{}", status["id"]);

    assert_eq!(ana.delete(&url).await.0, StatusCode::NO_CONTENT);
    assert_eq!(ana.delete(&url).await.0, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn done_window_is_validated(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("FLOW", "kanban").await;
    ana.create_project("SPRINT", "scrum").await;

    let (_, settings) = ana.put("/api/projects/FLOW/board/settings", json!({ "done_window_days": 30 })).await;
    let (odd, _) = ana.put("/api/projects/FLOW/board/settings", json!({ "done_window_days": 10 })).await;
    let (scrum, _) = ana.put("/api/projects/SPRINT/board/settings", json!({ "done_window_days": 14 })).await;

    assert_eq!(settings["done_window_days"], 30);
    assert_eq!(odd, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(scrum, StatusCode::UNPROCESSABLE_ENTITY);
}

#[sqlx::test]
async fn openapi_lists_board_settings_routes(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let (_, api) = app.get("/openapi.json").await;

    for path in ["/api/projects/{key}/board/settings", "/api/projects/{key}/board/columns",
                 "/api/projects/{key}/board/columns/order", "/api/projects/{key}/board/columns/{id}",
                 "/api/projects/{key}/statuses", "/api/projects/{key}/statuses/{id}"] {
        assert!(api["paths"][path].is_object(), "{path} missing");
    }
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cargo test -p santi-server --test board_settings`
Expected: compile errors — `no method named settings`; unit tests: unresolved `crate::boards`.

- [ ] **Step 4: Minimal implementation**

`crates/santi-types/src/lib.rs`: add `pub mod boards;`.

`crates/santi-types/src/boards.rs`:

```rust
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};

use crate::projects::BoardType;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[cfg_attr(feature = "sqlx", derive(sqlx::Type), sqlx(type_name = "text", rename_all = "snake_case"))]
#[serde(rename_all = "snake_case")]
pub enum StatusCategory {
    Todo,
    InProgress,
    Done,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct Status {
    pub id: i64,
    pub name: String,
    pub category: StatusCategory,
    /// None = unmapped: issues in this status are hidden from board and backlog (D30).
    pub column_id: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct Column {
    pub id: i64,
    pub name: String,
    pub position: i32,
    pub wip_limit: Option<i32>,
    pub statuses: Vec<Status>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct BoardSettings {
    pub board_type: BoardType,
    pub done_window_days: Option<i32>,
    /// Left to right.
    pub columns: Vec<Column>,
    pub unmapped: Vec<Status>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct UpdateBoardSettings {
    /// 7, 14, 30, or null for never (kanban only, D8).
    #[serde(default)]
    pub done_window_days: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct CreateColumn {
    pub name: String,
    /// Also create a status with the column's name and this category (SB-5).
    #[serde(default)]
    pub new_status: Option<StatusCategory>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct UpdateColumn {
    pub name: String,
    #[serde(default)]
    pub wip_limit: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ReorderColumns {
    pub column_ids: Vec<i64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct DeleteColumnParams {
    /// Column that receives the deleted column's statuses (D16); required when it has any.
    #[serde(default)]
    pub move_statuses_to: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct CreateStatus {
    pub name: String,
    pub category: StatusCategory,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct UpdateStatus {
    pub name: String,
    /// The column to map to; null unmaps the status.
    #[serde(default)]
    pub column_id: Option<i64>,
}
```

`crates/santi-server/src/extract.rs`, add:

```rust
/// Query string with repeated keys collected into `Vec`s (`?type=bug&type=task`); errors as problem+json.
#[derive(FromRequestParts)]
#[from_request(via(axum_extra::extract::Query), rejection(AppError))]
pub struct QueryParams<T>(pub T);
```

`crates/santi-server/src/error.rs`, add:

```rust
impl From<axum_extra::extract::QueryRejection> for AppError {
    fn from(rejection: axum_extra::extract::QueryRejection) -> Self {
        AppError::BadRequest(rejection.to_string())
    }
}
```

`crates/santi-server/src/boards/domain.rs` (above the tests):

```rust
use santi_types::boards::{BoardSettings, Column, Status, StatusCategory};
use santi_types::projects::BoardType;

use crate::error::AppError;

/// SB-1: every new board starts with these columns, each holding the status of the same name.
pub const DEFAULT_LAYOUT: [(&str, StatusCategory); 3] = [
    ("To Do", StatusCategory::Todo),
    ("In Progress", StatusCategory::InProgress),
    ("Done", StatusCategory::Done),
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ColumnRow {
    pub id: i64,
    pub name: String,
    pub position: i32,
    pub wip_limit: Option<i32>,
}

/// One column, left to right, with the categories of the statuses mapped to it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LayoutColumn {
    pub id: i64,
    pub categories: Vec<StatusCategory>,
}

pub fn check_name(field: &str, name: &str) -> Result<String, AppError> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 60 {
        return Err(AppError::invalid(field, "must have 1 to 60 characters"));
    }
    Ok(name.to_string())
}

/// D2, strict: done statuses map only to the rightmost column, which holds only done statuses.
pub fn check_done_mapping(layout: &[LayoutColumn]) -> Result<(), AppError> {
    let rightmost = layout.len().saturating_sub(1);
    for (index, column) in layout.iter().enumerate() {
        let is_rightmost = index == rightmost;
        let misplaced = column.categories.iter().any(|category| (*category == StatusCategory::Done) != is_rightmost);
        if misplaced {
            return Err(AppError::conflict(
                "done-column",
                "Done statuses belong in the rightmost column, and that column holds only done statuses.",
            ));
        }
    }
    Ok(())
}

/// D16: returns the column that receives the statuses, or None when the column holds none.
pub fn check_column_deletion(layout: &[LayoutColumn], column_id: i64, move_to: Option<i64>) -> Result<Option<i64>, AppError> {
    let Some(position) = layout.iter().position(|column| column.id == column_id) else {
        return Err(AppError::NotFound);
    };
    if position + 1 == layout.len() {
        return Err(AppError::conflict("rightmost-column", "The rightmost column holds done work and cannot be deleted."));
    }
    if layout[position].categories.is_empty() {
        return Ok(None);
    }
    let Some(target) = move_to else {
        return Err(AppError::invalid("move_statuses_to", "pick the column that receives this column's statuses"));
    };
    let target_is_another_column = target != column_id && layout.iter().any(|column| column.id == target);
    if !target_is_another_column {
        return Err(AppError::invalid("move_statuses_to", "must be another column of this board"));
    }
    Ok(Some(target))
}

pub fn check_same_columns(current: &[i64], requested: &[i64]) -> Result<(), AppError> {
    let mut current = current.to_vec();
    let mut requested = requested.to_vec();
    current.sort_unstable();
    requested.sort_unstable();
    if current != requested {
        return Err(AppError::invalid("column_ids", "must list every column of the board exactly once"));
    }
    Ok(())
}

pub fn check_wip_limit(board_type: BoardType, wip_limit: Option<i32>) -> Result<(), AppError> {
    let Some(limit) = wip_limit else {
        return Ok(());
    };
    if board_type == BoardType::Scrum {
        return Err(AppError::invalid("wip_limit", "column limits exist only on kanban boards"));
    }
    if limit < 1 {
        return Err(AppError::invalid("wip_limit", "must be at least 1"));
    }
    Ok(())
}

pub fn check_done_window(board_type: BoardType, days: Option<i32>) -> Result<(), AppError> {
    if board_type == BoardType::Scrum && days.is_some() {
        return Err(AppError::invalid("done_window_days", "only kanban boards hide done work"));
    }
    if !matches!(days, None | Some(7) | Some(14) | Some(30)) {
        return Err(AppError::invalid("done_window_days", "must be 7, 14, 30 or null"));
    }
    Ok(())
}

pub fn assemble_settings(board_type: BoardType, done_window_days: Option<i32>, columns: Vec<ColumnRow>, statuses: Vec<Status>) -> BoardSettings {
    let columns = columns
        .into_iter()
        .map(|column| Column {
            statuses: statuses.iter().filter(|status| status.column_id == Some(column.id)).cloned().collect(),
            id: column.id,
            name: column.name,
            position: column.position,
            wip_limit: column.wip_limit,
        })
        .collect();
    let unmapped = statuses.into_iter().filter(|status| status.column_id.is_none()).collect();
    BoardSettings { board_type, done_window_days, columns, unmapped }
}
```

`crates/santi-server/src/boards/repo.rs`:

```rust
use santi_types::boards::{Status, StatusCategory};
use sqlx::PgConnection;

use super::domain::{ColumnRow, LayoutColumn};

/// Serializes layout edits on one board so the D2 check sees a stable layout.
pub async fn lock_board(conn: &mut PgConnection, board_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query!("SELECT id FROM board WHERE id = $1 FOR UPDATE", board_id).fetch_one(&mut *conn).await?;
    Ok(())
}

pub async fn find_done_window(conn: &mut PgConnection, board_id: i64) -> Result<Option<i32>, sqlx::Error> {
    sqlx::query_scalar!("SELECT done_window_days FROM board WHERE id = $1", board_id).fetch_one(&mut *conn).await
}

pub async fn set_done_window(conn: &mut PgConnection, board_id: i64, days: Option<i32>) -> Result<(), sqlx::Error> {
    sqlx::query!("UPDATE board SET done_window_days = $2 WHERE id = $1", board_id, days).execute(&mut *conn).await?;
    Ok(())
}

pub async fn list_columns(conn: &mut PgConnection, board_id: i64) -> Result<Vec<ColumnRow>, sqlx::Error> {
    sqlx::query_as!(
        ColumnRow,
        "SELECT id, name, position, wip_limit FROM board_column WHERE board_id = $1 ORDER BY position",
        board_id
    )
    .fetch_all(&mut *conn)
    .await
}

pub async fn list_statuses(conn: &mut PgConnection, project_id: i64) -> Result<Vec<Status>, sqlx::Error> {
    sqlx::query_as!(
        Status,
        r#"SELECT id, name, category AS "category: StatusCategory", column_id
           FROM status WHERE project_id = $1 ORDER BY id"#,
        project_id
    )
    .fetch_all(&mut *conn)
    .await
}

pub async fn load_layout(conn: &mut PgConnection, board_id: i64) -> Result<Vec<LayoutColumn>, sqlx::Error> {
    sqlx::query_as!(
        LayoutColumn,
        r#"SELECT c.id,
                  COALESCE(array_agg(s.category ORDER BY s.id) FILTER (WHERE s.id IS NOT NULL), '{}')
                      AS "categories!: Vec<StatusCategory>"
           FROM board_column c
           LEFT JOIN status s ON s.column_id = c.id
           WHERE c.board_id = $1
           GROUP BY c.id
           ORDER BY c.position"#,
        board_id
    )
    .fetch_all(&mut *conn)
    .await
}

pub async fn insert_column(conn: &mut PgConnection, board_id: i64, name: &str, position: i32) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!(
        "INSERT INTO board_column (board_id, name, position) VALUES ($1, $2, $3) RETURNING id",
        board_id,
        name,
        position
    )
    .fetch_one(&mut *conn)
    .await
}

/// Shifts the rightmost column one step right and returns the position it left free.
pub async fn make_room_before_last_column(conn: &mut PgConnection, board_id: i64) -> Result<i32, sqlx::Error> {
    sqlx::query_scalar!(
        r#"UPDATE board_column SET position = position + 1
           WHERE board_id = $1
             AND position = (SELECT max(position) FROM board_column WHERE board_id = $1)
           RETURNING position - 1 AS "position!""#,
        board_id
    )
    .fetch_one(&mut *conn)
    .await
}

/// Returns false when the column is not on this board.
pub async fn update_column(conn: &mut PgConnection, board_id: i64, column_id: i64, name: &str, wip_limit: Option<i32>) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!(
        "UPDATE board_column SET name = $3, wip_limit = $4 WHERE board_id = $1 AND id = $2",
        board_id,
        column_id,
        name,
        wip_limit
    )
    .execute(&mut *conn)
    .await?;
    Ok(result.rows_affected() == 1)
}

pub async fn set_positions(conn: &mut PgConnection, board_id: i64, column_ids: &[i64]) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE board_column c SET position = ordered.position::integer
         FROM unnest($2::bigint[]) WITH ORDINALITY AS ordered(id, position)
         WHERE c.id = ordered.id AND c.board_id = $1",
        board_id,
        column_ids
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

pub async fn move_statuses(conn: &mut PgConnection, from_column: i64, to_column: i64) -> Result<(), sqlx::Error> {
    sqlx::query!("UPDATE status SET column_id = $2 WHERE column_id = $1", from_column, to_column)
        .execute(&mut *conn)
        .await?;
    Ok(())
}

pub async fn delete_column(conn: &mut PgConnection, board_id: i64, column_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query!("DELETE FROM board_column WHERE board_id = $1 AND id = $2", board_id, column_id)
        .execute(&mut *conn)
        .await?;
    Ok(())
}

pub async fn column_belongs_to_board(conn: &mut PgConnection, board_id: i64, column_id: i64) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT EXISTS (SELECT 1 FROM board_column WHERE board_id = $1 AND id = $2) AS "exists!""#,
        board_id,
        column_id
    )
    .fetch_one(&mut *conn)
    .await
}

pub async fn insert_status(conn: &mut PgConnection, project_id: i64, name: &str, category: StatusCategory, column_id: Option<i64>) -> Result<Status, sqlx::Error> {
    sqlx::query_as!(
        Status,
        r#"INSERT INTO status (project_id, name, category, column_id) VALUES ($1, $2, $3, $4)
           RETURNING id, name, category AS "category: StatusCategory", column_id"#,
        project_id,
        name,
        category as StatusCategory,
        column_id
    )
    .fetch_one(&mut *conn)
    .await
}

pub async fn update_status(conn: &mut PgConnection, project_id: i64, status_id: i64, name: &str, column_id: Option<i64>) -> Result<Option<Status>, sqlx::Error> {
    sqlx::query_as!(
        Status,
        r#"UPDATE status SET name = $3, column_id = $4 WHERE project_id = $1 AND id = $2
           RETURNING id, name, category AS "category: StatusCategory", column_id"#,
        project_id,
        status_id,
        name,
        column_id
    )
    .fetch_optional(&mut *conn)
    .await
}

/// Returns false when no such status exists in the project.
pub async fn delete_status(conn: &mut PgConnection, project_id: i64, status_id: i64) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!("DELETE FROM status WHERE project_id = $1 AND id = $2", project_id, status_id)
        .execute(&mut *conn)
        .await?;
    Ok(result.rows_affected() == 1)
}
```

`crates/santi-server/src/boards/service.rs`:

```rust
use santi_types::boards::{
    BoardSettings, CreateColumn, CreateStatus, DeleteColumnParams, ReorderColumns, Status, UpdateBoardSettings, UpdateColumn,
    UpdateStatus,
};
use sqlx::{PgConnection, PgPool, Postgres, Transaction};

use super::{domain, repo};
use crate::error::AppError;
use crate::members::Member;
use crate::members::domain::require_admin;

pub async fn seed_default_layout(conn: &mut PgConnection, project_id: i64, board_id: i64) -> Result<(), sqlx::Error> {
    for (position, (name, category)) in (0..).zip(domain::DEFAULT_LAYOUT) {
        let column_id = repo::insert_column(conn, board_id, name, position).await?;
        repo::insert_status(conn, project_id, name, category, Some(column_id)).await?;
    }
    Ok(())
}

pub async fn get_settings(pool: &PgPool, member: &Member) -> Result<BoardSettings, AppError> {
    let mut conn = pool.acquire().await?;
    let done_window = repo::find_done_window(&mut conn, member.board_id).await?;
    let columns = repo::list_columns(&mut conn, member.board_id).await?;
    let statuses = repo::list_statuses(&mut conn, member.project_id).await?;
    Ok(domain::assemble_settings(member.board_type, done_window, columns, statuses))
}

pub async fn update_settings(pool: &PgPool, member: &Member, input: UpdateBoardSettings) -> Result<BoardSettings, AppError> {
    require_admin(member)?;
    domain::check_done_window(member.board_type, input.done_window_days)?;
    let mut conn = pool.acquire().await?;
    repo::set_done_window(&mut conn, member.board_id, input.done_window_days).await?;
    get_settings(pool, member).await
}

pub async fn create_column(pool: &PgPool, member: &Member, input: CreateColumn) -> Result<BoardSettings, AppError> {
    require_admin(member)?;
    let name = domain::check_name("name", &input.name)?;
    let mut tx = pool.begin().await?;
    repo::lock_board(&mut tx, member.board_id).await?;
    let position = repo::make_room_before_last_column(&mut tx, member.board_id).await?;
    let column_id = repo::insert_column(&mut tx, member.board_id, &name, position).await?;
    if let Some(category) = input.new_status {
        repo::insert_status(&mut tx, member.project_id, &name, category, Some(column_id)).await?;
    }
    commit_if_layout_valid(tx, member.board_id).await?;
    get_settings(pool, member).await
}

pub async fn update_column(pool: &PgPool, member: &Member, column_id: i64, input: UpdateColumn) -> Result<BoardSettings, AppError> {
    require_admin(member)?;
    let name = domain::check_name("name", &input.name)?;
    domain::check_wip_limit(member.board_type, input.wip_limit)?;
    let mut conn = pool.acquire().await?;
    let updated = repo::update_column(&mut conn, member.board_id, column_id, &name, input.wip_limit).await?;
    if !updated {
        return Err(AppError::NotFound);
    }
    get_settings(pool, member).await
}

pub async fn reorder_columns(pool: &PgPool, member: &Member, input: ReorderColumns) -> Result<BoardSettings, AppError> {
    require_admin(member)?;
    let mut tx = pool.begin().await?;
    repo::lock_board(&mut tx, member.board_id).await?;
    let layout = repo::load_layout(&mut tx, member.board_id).await?;
    let current: Vec<i64> = layout.iter().map(|column| column.id).collect();
    domain::check_same_columns(&current, &input.column_ids)?;
    repo::set_positions(&mut tx, member.board_id, &input.column_ids).await?;
    commit_if_layout_valid(tx, member.board_id).await?;
    get_settings(pool, member).await
}

pub async fn delete_column(pool: &PgPool, member: &Member, column_id: i64, params: DeleteColumnParams) -> Result<BoardSettings, AppError> {
    require_admin(member)?;
    let mut tx = pool.begin().await?;
    repo::lock_board(&mut tx, member.board_id).await?;
    let layout = repo::load_layout(&mut tx, member.board_id).await?;
    let target = domain::check_column_deletion(&layout, column_id, params.move_statuses_to)?;
    if let Some(target) = target {
        repo::move_statuses(&mut tx, column_id, target).await?;
    }
    repo::delete_column(&mut tx, member.board_id, column_id).await?;
    commit_if_layout_valid(tx, member.board_id).await?;
    get_settings(pool, member).await
}

pub async fn create_status(pool: &PgPool, member: &Member, input: CreateStatus) -> Result<Status, AppError> {
    require_admin(member)?;
    let name = domain::check_name("name", &input.name)?;
    let mut conn = pool.acquire().await?;
    Ok(repo::insert_status(&mut conn, member.project_id, &name, input.category, None).await?)
}

pub async fn update_status(pool: &PgPool, member: &Member, status_id: i64, input: UpdateStatus) -> Result<Status, AppError> {
    require_admin(member)?;
    let name = domain::check_name("name", &input.name)?;
    let mut tx = pool.begin().await?;
    repo::lock_board(&mut tx, member.board_id).await?;
    if let Some(column_id) = input.column_id {
        require_column(&mut tx, member, column_id).await?;
    }
    let status = repo::update_status(&mut tx, member.project_id, status_id, &name, input.column_id).await?;
    let status = status.ok_or(AppError::NotFound)?;
    commit_if_layout_valid(tx, member.board_id).await?;
    Ok(status)
}

pub async fn delete_status(pool: &PgPool, member: &Member, status_id: i64) -> Result<(), AppError> {
    require_admin(member)?;
    let mut conn = pool.acquire().await?;
    let deleted = repo::delete_status(&mut conn, member.project_id, status_id).await?;
    if !deleted {
        return Err(AppError::NotFound);
    }
    Ok(())
}

async fn require_column(conn: &mut PgConnection, member: &Member, column_id: i64) -> Result<(), AppError> {
    let belongs = repo::column_belongs_to_board(conn, member.board_id, column_id).await?;
    if !belongs {
        return Err(AppError::invalid("column_id", "no such column on this board"));
    }
    Ok(())
}

/// Every layout edit ends here: re-read the layout, enforce D2, commit; an error rolls the edit back.
async fn commit_if_layout_valid(mut tx: Transaction<'_, Postgres>, board_id: i64) -> Result<(), AppError> {
    let layout = repo::load_layout(&mut tx, board_id).await?;
    domain::check_done_mapping(&layout)?;
    tx.commit().await?;
    Ok(())
}
```

`crates/santi-server/src/boards/handler.rs` — Task 2 handler pattern, one handler per row of the route table. Signatures:

```rust
pub async fn get_settings(State(state): State<AppState>, member: Member) -> Result<Json<BoardSettings>, AppError>
pub async fn update_settings(State(state): State<AppState>, member: Member, JsonBody(input): JsonBody<UpdateBoardSettings>) -> Result<Json<BoardSettings>, AppError>
pub async fn create_column(State(state): State<AppState>, member: Member, JsonBody(input): JsonBody<CreateColumn>) -> Result<(StatusCode, Json<BoardSettings>), AppError>
pub async fn reorder_columns(State(state): State<AppState>, member: Member, JsonBody(input): JsonBody<ReorderColumns>) -> Result<Json<BoardSettings>, AppError>
pub async fn update_column(State(state): State<AppState>, member: Member, PathParams((_key, column_id)): PathParams<(String, i64)>, JsonBody(input): JsonBody<UpdateColumn>) -> Result<Json<BoardSettings>, AppError>
pub async fn delete_column(State(state): State<AppState>, member: Member, PathParams((_key, column_id)): PathParams<(String, i64)>, QueryParams(params): QueryParams<DeleteColumnParams>) -> Result<Json<BoardSettings>, AppError>
pub async fn create_status(State(state): State<AppState>, member: Member, JsonBody(input): JsonBody<CreateStatus>) -> Result<(StatusCode, Json<Status>), AppError>
pub async fn update_status(State(state): State<AppState>, member: Member, PathParams((_key, status_id)): PathParams<(String, i64)>, JsonBody(input): JsonBody<UpdateStatus>) -> Result<Json<Status>, AppError>
pub async fn delete_status(State(state): State<AppState>, member: Member, PathParams((_key, status_id)): PathParams<(String, i64)>) -> Result<StatusCode, AppError>

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(get_settings, update_settings))
        .routes(routes!(create_column))
        .routes(routes!(reorder_columns))
        .routes(routes!(update_column, delete_column))
        .routes(routes!(create_status))
        .routes(routes!(update_status, delete_status))
}
```

`delete_column`'s annotation lists `params(("key" = String, Path), ("id" = i64, Path), DeleteColumnParams)`.

`crates/santi-server/src/projects/service.rs` — `create_project` seeds the layout:

```rust
pub async fn create_project(pool: &PgPool, user: &CurrentUser, input: CreateProject) -> Result<Project, AppError> {
    let key = domain::check_project_key(&input.key)?;
    let name = domain::check_project_name(&input.name)?;
    let mut tx = pool.begin().await?;
    let project_id = repo::insert_project(&mut tx, &key, &name).await?;
    let done_window = domain::default_done_window(input.board_type);
    let board_id = repo::insert_board(&mut tx, project_id, input.board_type, done_window).await?;
    boards::service::seed_default_layout(&mut tx, project_id, board_id).await?;
    members::repo::insert_member(&mut tx, project_id, user.id, MemberRole::Admin).await?;
    let project = repo::find_project(&mut tx, project_id, user.id).await?;
    tx.commit().await?;
    Ok(project)
}
```

(add `use crate::boards;`.)

`crates/santi-server/src/lib.rs`: add `pub mod boards;` and `.merge(boards::handler::router())`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cargo test -p santi-server`
Expected: `test result: ok.` everywhere, 0 failed.

- [ ] **Step 6: Offline data and gate**

Run: `cargo sqlx prepare --workspace`, then the gate. Expected: all clean, coverage above 90%.

- [ ] **Step 7: Commit**

```bash
git add Cargo.toml Cargo.lock crates/santi-server/Cargo.toml crates/santi-server/migrations/0004_board_layout.sql \
  crates/santi-types/src/lib.rs crates/santi-types/src/boards.rs crates/santi-server/src/lib.rs \
  crates/santi-server/src/error.rs crates/santi-server/src/extract.rs crates/santi-server/src/boards \
  crates/santi-server/src/projects/service.rs crates/santi-server/tests/common/mod.rs \
  crates/santi-server/tests/board_settings.rs .sqlx
git commit -m "feat: add board columns, statuses and the done-column rule"
```

---

### Task 5: Issues — create, read, edit, numbering and rank

**Branch:** `feat/SAN-<card>-issues`

**Files:**
- Create: `crates/santi-server/migrations/0005_issues.sql`, `crates/santi-types/src/issues.rs`, `crates/santi-server/src/issues/{mod.rs,domain.rs,repo.rs,service.rs,handler.rs}`, `crates/santi-server/tests/issues.rs`
- Modify: `crates/santi-types/src/lib.rs`, `crates/santi-server/src/lib.rs`, `crates/santi-server/src/boards/repo.rs`, `crates/santi-server/tests/common/mod.rs`, `.sqlx/`

**Interfaces:**
- Consumes: `Member`, `members::repo::is_member`, `projects::repo::take_issue_number` (Task 3); `boards` tables (Task 4).
- Produces:
  - `santi_server::issues::domain::rank_between(before: Option<&str>, after: Option<&str>) -> String` (D21; panics if `before >= after`)
  - `santi_server::issues::domain::parse_issue_key(field: &str, project_key: &str, key: &str) -> Result<i64, AppError>`
  - `santi_server::issues::service::{create_issue(pool, member, CreateIssue) -> Result<Issue, AppError>, get_issue(pool, member, number: i64) -> Result<Issue, AppError>, update_issue(pool, member, number: i64, UpdateIssue) -> Result<Issue, AppError>, resolve_status(conn, member, Option<i64>) -> Result<StatusRef, AppError>}`
  - `santi_server::issues::repo::{IssueKind { id: i64, issue_type: IssueType, sprint_id: Option<i64> }, NewIssue {…, sprint_id: Option<i64>, …}, insert_issue(conn, &NewIssue) -> Result<i64, sqlx::Error>, find_issue(conn, project_id, number) -> Result<Option<Issue>, sqlx::Error>}`
  - `santi_server::boards::repo::{StatusRef { id: i64, category: StatusCategory, column_id: Option<i64> }, find_status_ref(conn, project_id, status_id) -> Result<Option<StatusRef>, sqlx::Error>, first_todo_status(conn, project_id) -> Result<Option<StatusRef>, sqlx::Error>}`
  - `santi_types::nullable_field` — serde helper for PATCH-style fields: absent → `None`, `null` → `Some(None)`
  - `santi_types::issues::{IssueType, Priority, CreateIssue, Issue, UpdateIssue}`
  - Test helper: `TestApp::create_issue(&self, key: &str, body: Value) -> Value`

Routes:

| Method | Path | Body | Success |
|---|---|---|---|
| POST | `/api/projects/{key}/issues` | `CreateIssue` | 201 `Issue` — number from the project counter (D20), rank after the last issue (D5), status = given or the first mapped `todo` status (D5) |
| GET | `/api/projects/{key}/issues/{number}` | — | 200 `Issue`; 404 |
| PATCH | `/api/projects/{key}/issues/{number}` | `UpdateIssue` | 200 `Issue` (absent fields untouched, `null` clears) |

- [ ] **Step 1: Migration and apply it**

`crates/santi-server/migrations/0005_issues.sql`:

```sql
CREATE TABLE issue (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id  bigint NOT NULL REFERENCES project (id) ON DELETE CASCADE,
    number      bigint NOT NULL,                                                        -- D20: KEY-N
    issue_type  text NOT NULL CHECK (issue_type IN ('epic', 'story', 'task', 'bug', 'subtask')),
    summary     text NOT NULL CHECK (length(summary) BETWEEN 1 AND 255),
    description text NOT NULL DEFAULT '',
    priority    text NOT NULL DEFAULT 'medium' CHECK (priority IN ('urgent', 'high', 'medium', 'low')),
    status_id   bigint NOT NULL REFERENCES status (id),                                -- SB-6: a held status cannot be deleted
    assignee_id bigint REFERENCES app_user (id) ON DELETE SET NULL,
    reporter_id bigint NOT NULL REFERENCES app_user (id),
    points      double precision CHECK (points >= 0),
    labels      text[] NOT NULL DEFAULT '{}',
    parent_id   bigint REFERENCES issue (id),
    sprint_id   bigint,                                                                 -- foreign key added with the sprint table (Task 7)
    rank        text COLLATE "C" NOT NULL,                                              -- D21: sorts bytewise, like Rust
    done_at     timestamptz,                                                            -- D8
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, number),
    UNIQUE (project_id, rank),
    CHECK (issue_type <> 'subtask' OR (points IS NULL AND parent_id IS NOT NULL)),      -- D11, D6
    CHECK (issue_type <> 'epic' OR parent_id IS NULL)
);

CREATE INDEX issue_status_idx ON issue (status_id);
CREATE INDEX issue_parent_idx ON issue (parent_id);
CREATE INDEX issue_sprint_idx ON issue (sprint_id);
CREATE INDEX issue_assignee_idx ON issue (project_id, assignee_id);
CREATE INDEX issue_labels_idx ON issue USING gin (labels);
CREATE INDEX issue_summary_trgm_idx ON issue USING gin (summary gin_trgm_ops);
```

Run: `sqlx migrate run --source crates/santi-server/migrations`
Expected: `Applied 5/migrate issues`.

- [ ] **Step 2: Write the failing tests**

Unit tests at the bottom of `crates/santi-server/src/issues/domain.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use santi_types::boards::StatusCategory;
    use santi_types::issues::{IssueType::*, Priority, UpdateIssue};

    #[test]
    fn first_rank_is_the_middle_digit() {
        assert_eq!(rank_between(None, None), "V");
    }

    #[test]
    fn ranks_fall_strictly_between_their_neighbours() {
        let cases = [(Some("A"), Some("B")), (Some("A"), Some("A1")), (Some("Az"), Some("B")), (None, Some("1")), (Some("z"), None), (Some("A0V"), Some("A1"))];
        for (before, after) in cases {
            let rank = rank_between(before, after);
            assert!(before.is_none_or(|before| before < rank.as_str()), "{before:?} < {rank}");
            assert!(after.is_none_or(|after| rank.as_str() < after), "{rank} < {after:?}");
            assert!(!rank.ends_with('0'));
        }
    }

    #[test]
    #[should_panic(expected = "before < after")]
    fn rank_between_refuses_inverted_bounds() {
        rank_between(Some("B"), Some("A"));
    }

    #[test]
    fn ranks_keep_order_over_many_random_inserts() {
        let mut ranks = vec![rank_between(None, None)];
        let mut seed: u64 = 42;
        for _ in 0..2000 {
            seed = seed.wrapping_mul(6_364_136_223_846_793_005).wrapping_add(1_442_695_040_888_963_407);
            let slot = (seed >> 33) as usize % (ranks.len() + 1);
            let before = slot.checked_sub(1).map(|index| ranks[index].as_str());
            let after = ranks.get(slot).map(String::as_str);
            let rank = rank_between(before, after);
            assert!(before.is_none_or(|before| before < rank.as_str()));
            assert!(after.is_none_or(|after| rank.as_str() < after));
            ranks.insert(slot, rank);
        }
        assert!(ranks.windows(2).all(|pair| pair[0] < pair[1]));
    }

    #[test]
    fn repeated_inserts_into_one_gap_grow_slowly() {
        let mut after = rank_between(None, None);
        for _ in 0..60 {
            after = rank_between(Some("U"), Some(&after));
        }
        assert!(after.len() < 20, "{after}");
    }

    #[test]
    fn parent_rules() {
        assert!(check_parent(Subtask, Some(Story)).is_ok());
        assert!(check_parent(Subtask, Some(Bug)).is_ok());
        assert!(check_parent(Subtask, Some(Epic)).is_err());
        assert!(check_parent(Subtask, None).is_err());
        assert!(check_parent(Story, Some(Epic)).is_ok());
        assert!(check_parent(Story, Some(Task)).is_err());
        assert!(check_parent(Story, None).is_ok());
        assert!(check_parent(Epic, Some(Epic)).is_err());
        assert!(check_parent(Epic, None).is_ok());
    }

    #[test]
    fn only_stories_tasks_and_bugs_change_type() {
        assert!(check_type_change(Story, Bug).is_ok());
        assert!(check_type_change(Epic, Epic).is_ok());
        assert!(check_type_change(Epic, Story).is_err());
        assert!(check_type_change(Task, Subtask).is_err());
    }

    #[test]
    fn subtasks_keep_their_parent() {
        assert!(check_parent_change(Subtask).is_err());
        assert!(check_parent_change(Story).is_ok());
    }

    #[test]
    fn points_rules() {
        assert!(check_points(Story, Some(3.5)).is_ok());
        assert!(check_points(Subtask, Some(1.0)).is_err());
        assert!(check_points(Story, Some(-1.0)).is_err());
        assert!(check_points(Story, Some(f64::NAN)).is_err());
        assert!(check_points(Subtask, None).is_ok());
    }

    #[test]
    fn labels_are_trimmed_deduplicated_and_single_words() {
        let labels = normalize_labels(vec![" ui ".into(), "ui".into(), "".into(), "api".into()]).unwrap();
        assert_eq!(labels, ["ui", "api"]);
        assert!(normalize_labels(vec!["two words".into()]).is_err());
        assert!(normalize_labels((0..21).map(|index| format!("l{index}")).collect()).is_err());
    }

    #[test]
    fn summary_is_trimmed_and_bounded() {
        assert_eq!(check_summary("  Fix login ").unwrap(), "Fix login");
        assert!(check_summary("   ").is_err());
        assert!(check_summary(&"x".repeat(256)).is_err());
    }

    #[test]
    fn issue_keys_must_belong_to_the_project() {
        assert_eq!(parse_issue_key("parent", "SANTI", "SANTI-12").unwrap(), 12);
        assert!(parse_issue_key("parent", "SANTI", "OTHER-12").is_err());
        assert!(parse_issue_key("parent", "SANTI", "SANTI-0").is_err());
        assert!(parse_issue_key("parent", "SANTI", "SANTI12").is_err());
    }

    #[test]
    fn done_at_is_set_only_for_done_statuses() {
        let now = chrono::Utc::now();
        assert_eq!(done_at_on_create(StatusCategory::Done, now), Some(now));
        assert_eq!(done_at_on_create(StatusCategory::Todo, now), None);
    }

    #[test]
    fn field_changes_apply_only_what_is_sent() {
        let current = EditableIssue {
            id: 1, summary: "Old".into(), description: "".into(), issue_type: Story, priority: Priority::Medium,
            assignee_id: Some(7), points: Some(3.0), labels: vec![], parent_id: None,
        };
        let change = UpdateIssue { summary: Some("New".into()), points: Some(None), ..UpdateIssue::default() };

        let next = apply_field_changes(&current, &change).unwrap();

        assert_eq!(next.summary, "New");
        assert_eq!(next.points, None);
        assert_eq!(next.assignee_id, Some(7));
    }
}
```

Add to `crates/santi-server/tests/common/mod.rs`:

```rust
impl TestApp {
    pub async fn create_issue(&self, key: &str, body: Value) -> Value {
        let (status, issue) = self.post(&format!("/api/projects/{key}/issues"), body).await;
        assert_eq!(status, StatusCode::CREATED, "{issue}");
        issue
    }
}
```

`crates/santi-server/tests/issues.rs`:

```rust
mod common;

use axum::http::StatusCode;
use common::TestApp;
use serde_json::{Value, json};
use sqlx::PgPool;

async fn project(pool: PgPool) -> TestApp {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    ana
}

#[sqlx::test]
async fn new_issue_gets_defaults(pool: PgPool) {
    let ana = project(pool).await;
    let todo = ana.status_id("SANTI", "To Do").await;

    let issue = ana.create_issue("SANTI", json!({ "summary": "Fix login" })).await;

    assert_eq!(issue["key"], "SANTI-1");
    assert_eq!(issue["issue_type"], "story");
    assert_eq!(issue["priority"], "medium");
    assert_eq!(issue["status_id"], todo);
    assert_eq!(issue["reporter_id"], ana.user_id);
    assert_eq!(issue["done_at"], Value::Null);
    assert_eq!(issue["sprint_id"], Value::Null);
}

#[sqlx::test]
async fn numbers_increase_and_new_issues_rank_last(pool: PgPool) {
    let ana = project(pool).await;

    let first = ana.create_issue("SANTI", json!({ "summary": "one" })).await;
    let second = ana.create_issue("SANTI", json!({ "summary": "two" })).await;

    assert_eq!(second["number"], 2);
    assert!(first["rank"].as_str().unwrap() < second["rank"].as_str().unwrap());
}

#[sqlx::test]
async fn concurrent_creates_get_distinct_numbers_and_ranks(pool: PgPool) {
    let ana = project(pool).await;
    let mut creates = tokio::task::JoinSet::new();
    for index in 0..10 {
        let app = ana.clone();
        creates.spawn(async move { app.create_issue("SANTI", json!({ "summary": format!("issue {index}") })).await });
    }

    let issues = creates.join_all().await;

    let mut numbers: Vec<i64> = issues.iter().map(|issue| issue["number"].as_i64().unwrap()).collect();
    let mut ranks: Vec<&str> = issues.iter().map(|issue| issue["rank"].as_str().unwrap()).collect();
    numbers.sort_unstable();
    ranks.sort_unstable();
    ranks.dedup();
    assert_eq!(numbers, (1..=10).collect::<Vec<i64>>());
    assert_eq!(ranks.len(), 10);
}

#[sqlx::test]
async fn creating_in_a_done_status_stamps_done_at(pool: PgPool) {
    let ana = project(pool).await;
    let done = ana.status_id("SANTI", "Done").await;

    let issue = ana.create_issue("SANTI", json!({ "summary": "Already shipped", "status_id": done })).await;

    assert!(issue["done_at"].is_string());
}

#[sqlx::test]
async fn status_must_be_mapped_and_belong_to_the_project(pool: PgPool) {
    let ana = project(pool).await;
    ana.create_project("OTHER", "scrum").await;
    let (_, parked) = ana.post("/api/projects/SANTI/statuses", json!({ "name": "Parked", "category": "todo" })).await;
    let foreign = ana.status_id("OTHER", "To Do").await;

    let (unmapped, problem) = ana.post("/api/projects/SANTI/issues", json!({ "summary": "x", "status_id": parked["id"] })).await;
    let (other, _) = ana.post("/api/projects/SANTI/issues", json!({ "summary": "x", "status_id": foreign })).await;

    assert_eq!(unmapped, StatusCode::CONFLICT);
    assert_eq!(problem["type"], "urn:santi:error:status-unmapped");
    assert_eq!(other, StatusCode::UNPROCESSABLE_ENTITY);
}

#[sqlx::test]
async fn a_board_without_todo_status_cannot_take_default_issues(pool: PgPool) {
    let ana = project(pool).await;
    let todo = ana.status_id("SANTI", "To Do").await;
    ana.put(&format!("/api/projects/SANTI/statuses/{todo}"), json!({ "name": "To Do" })).await;

    let (status, problem) = ana.post("/api/projects/SANTI/issues", json!({ "summary": "x" })).await;

    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(problem["type"], "urn:santi:error:no-todo-status");
}

#[sqlx::test]
async fn parent_rules_are_enforced(pool: PgPool) {
    let ana = project(pool).await;
    ana.create_issue("SANTI", json!({ "summary": "Epic", "issue_type": "epic" })).await;
    ana.create_issue("SANTI", json!({ "summary": "Story", "parent": "SANTI-1" })).await;

    let subtask = ana.create_issue("SANTI", json!({ "summary": "Sub", "issue_type": "subtask", "parent": "SANTI-2" })).await;
    let (orphan, problem) = ana.post("/api/projects/SANTI/issues", json!({ "summary": "Sub", "issue_type": "subtask" })).await;
    let (under_epic, _) = ana.post("/api/projects/SANTI/issues", json!({ "summary": "Sub", "issue_type": "subtask", "parent": "SANTI-1" })).await;
    let (with_points, _) = ana.post("/api/projects/SANTI/issues", json!({ "summary": "Sub", "issue_type": "subtask", "parent": "SANTI-2", "points": 2 })).await;
    let (missing, _) = ana.post("/api/projects/SANTI/issues", json!({ "summary": "Story", "parent": "SANTI-99" })).await;

    assert_eq!(subtask["parent_key"], "SANTI-2");
    assert_eq!(orphan, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "parent");
    assert_eq!(under_epic, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(with_points, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(missing, StatusCode::UNPROCESSABLE_ENTITY);
}

#[sqlx::test]
async fn assignee_must_be_a_member(pool: PgPool) {
    let ana = project(pool).await;
    let bob = ana.another_user("bob@example.com").await;

    let (stranger, problem) = ana.post("/api/projects/SANTI/issues", json!({ "summary": "x", "assignee_id": bob.user_id })).await;
    let mine = ana.create_issue("SANTI", json!({ "summary": "x", "assignee_id": ana.user_id })).await;

    assert_eq!(stranger, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "assignee_id");
    assert_eq!(mine["assignee_id"], ana.user_id);
}

#[sqlx::test]
async fn labels_are_normalized(pool: PgPool) {
    let ana = project(pool).await;

    let issue = ana.create_issue("SANTI", json!({ "summary": "x", "labels": [" ui ", "ui", "api"] })).await;

    assert_eq!(issue["labels"], json!(["ui", "api"]));
}

#[sqlx::test]
async fn unknown_issues_and_strangers_get_not_found(pool: PgPool) {
    let ana = project(pool).await;
    let bob = ana.another_user("bob@example.com").await;
    ana.create_issue("SANTI", json!({ "summary": "x" })).await;

    assert_eq!(ana.get("/api/projects/SANTI/issues/99").await.0, StatusCode::NOT_FOUND);
    assert_eq!(bob.get("/api/projects/SANTI/issues/1").await.0, StatusCode::NOT_FOUND);
    assert_eq!(ana.get("/api/projects/SANTI/issues/1").await.0, StatusCode::OK);
}

#[sqlx::test]
async fn patch_changes_only_sent_fields(pool: PgPool) {
    let ana = project(pool).await;
    ana.create_issue("SANTI", json!({ "summary": "Old", "assignee_id": ana.user_id, "points": 3, "labels": ["ui"] })).await;

    let (status, issue) = ana.patch("/api/projects/SANTI/issues/1", json!({ "summary": "New", "assignee_id": null, "issue_type": "bug" })).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(issue["summary"], "New");
    assert_eq!(issue["assignee_id"], Value::Null);
    assert_eq!(issue["issue_type"], "bug");
    assert_eq!(issue["points"], 3.0);
    assert_eq!(issue["labels"], json!(["ui"]));
}

#[sqlx::test]
async fn patch_enforces_type_parent_and_points_rules(pool: PgPool) {
    let ana = project(pool).await;
    ana.create_issue("SANTI", json!({ "summary": "Epic", "issue_type": "epic" })).await;
    ana.create_issue("SANTI", json!({ "summary": "Story" })).await;
    ana.create_issue("SANTI", json!({ "summary": "Sub", "issue_type": "subtask", "parent": "SANTI-2" })).await;

    let (_, linked) = ana.patch("/api/projects/SANTI/issues/2", json!({ "parent": "SANTI-1" })).await;
    let (_, unlinked) = ana.patch("/api/projects/SANTI/issues/2", json!({ "parent": null })).await;
    let (epic_to_story, _) = ana.patch("/api/projects/SANTI/issues/1", json!({ "issue_type": "story" })).await;
    let (move_subtask, _) = ana.patch("/api/projects/SANTI/issues/3", json!({ "parent": "SANTI-1" })).await;
    let (subtask_points, _) = ana.patch("/api/projects/SANTI/issues/3", json!({ "points": 1 })).await;
    let (empty_summary, _) = ana.patch("/api/projects/SANTI/issues/2", json!({ "summary": " " })).await;
    let (unknown_assignee, _) = ana.patch("/api/projects/SANTI/issues/2", json!({ "assignee_id": 999999 })).await;
    let (missing, _) = ana.patch("/api/projects/SANTI/issues/99", json!({ "summary": "x" })).await;

    assert_eq!(linked["parent_key"], "SANTI-1");
    assert_eq!(unlinked["parent_key"], Value::Null);
    assert_eq!(epic_to_story, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(move_subtask, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(subtask_points, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(empty_summary, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(unknown_assignee, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(missing, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn a_status_held_by_an_issue_cannot_be_deleted(pool: PgPool) {
    let ana = project(pool).await;
    let todo = ana.status_id("SANTI", "To Do").await;
    ana.create_issue("SANTI", json!({ "summary": "x" })).await;

    let (status, problem) = ana.delete(&format!("/api/projects/SANTI/statuses/{todo}")).await;

    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(problem["type"], "urn:santi:error:in-use");
}

#[sqlx::test]
async fn openapi_lists_issue_routes(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let (_, api) = app.get("/openapi.json").await;

    assert!(api["paths"]["/api/projects/{key}/issues"]["post"].is_object());
    assert!(api["paths"]["/api/projects/{key}/issues/{number}"]["patch"].is_object());
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cargo test -p santi-server --lib issues && cargo test -p santi-server --test issues`
Expected: compile errors — unresolved `crate::issues`, `no method named create_issue`.

- [ ] **Step 4: Minimal implementation**

`crates/santi-types/src/lib.rs`: add `pub mod issues;` and:

```rust
/// For PATCH bodies: a missing field deserializes to `None`, an explicit `null` to `Some(None)`.
/// Use with `#[serde(default, deserialize_with = "crate::nullable_field")]`.
pub fn nullable_field<'de, D, T>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: serde::Deserialize<'de>,
{
    Option::<T>::deserialize(deserializer).map(Some)
}
```

`crates/santi-types/src/issues.rs`:

```rust
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[cfg_attr(feature = "sqlx", derive(sqlx::Type), sqlx(type_name = "text", rename_all = "snake_case"))]
#[serde(rename_all = "snake_case")]
pub enum IssueType {
    Epic,
    #[default]
    Story,
    Task,
    Bug,
    Subtask,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[cfg_attr(feature = "sqlx", derive(sqlx::Type), sqlx(type_name = "text", rename_all = "snake_case"))]
#[serde(rename_all = "snake_case")]
pub enum Priority {
    Urgent,
    High,
    #[default]
    Medium,
    Low,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, ToSchema)]
pub struct CreateIssue {
    pub summary: String,
    #[serde(default)]
    pub issue_type: IssueType,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub priority: Priority,
    /// Defaults to the project's first mapped to-do status (D5).
    #[serde(default)]
    pub status_id: Option<i64>,
    #[serde(default)]
    pub assignee_id: Option<i64>,
    #[serde(default)]
    pub points: Option<f64>,
    #[serde(default)]
    pub labels: Vec<String>,
    /// Parent issue key, e.g. `SANTI-3`.
    #[serde(default)]
    pub parent: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct Issue {
    pub id: i64,
    pub key: String,
    pub number: i64,
    pub summary: String,
    pub description: String,
    pub issue_type: IssueType,
    pub priority: Priority,
    pub status_id: i64,
    pub assignee_id: Option<i64>,
    pub reporter_id: i64,
    pub points: Option<f64>,
    pub labels: Vec<String>,
    pub parent_key: Option<String>,
    pub sprint_id: Option<i64>,
    pub rank: String,
    pub done_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

/// Absent fields stay as they are; `null` clears a nullable field.
#[derive(Debug, Clone, Default, Serialize, Deserialize, ToSchema)]
pub struct UpdateIssue {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub issue_type: Option<IssueType>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub priority: Option<Priority>,
    #[serde(default, deserialize_with = "crate::nullable_field", skip_serializing_if = "Option::is_none")]
    #[schema(value_type = Option<i64>)]
    pub assignee_id: Option<Option<i64>>,
    #[serde(default, deserialize_with = "crate::nullable_field", skip_serializing_if = "Option::is_none")]
    #[schema(value_type = Option<f64>)]
    pub points: Option<Option<f64>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub labels: Option<Vec<String>>,
    #[serde(default, deserialize_with = "crate::nullable_field", skip_serializing_if = "Option::is_none")]
    #[schema(value_type = Option<String>)]
    pub parent: Option<Option<String>>,
}
```

`crates/santi-server/src/issues/domain.rs` (above the tests):

```rust
use chrono::{DateTime, Utc};
use santi_types::boards::StatusCategory;
use santi_types::issues::{IssueType, Priority, UpdateIssue};

use crate::error::AppError;

/// Base-62 digits in ASCII order, so Rust and PostgreSQL (`COLLATE "C"`) sort keys the same way.
const DIGITS: &[u8] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/// D21: a key that sorts strictly between `before` and `after`; `None` means open-ended.
/// Keys never end in '0', so there is always room before any key.
pub fn rank_between(before: Option<&str>, after: Option<&str>) -> String {
    if let (Some(before), Some(after)) = (before, after) {
        assert!(before < after, "rank_between needs before < after, got {before} and {after}");
    }
    let key = midpoint(before.unwrap_or("").as_bytes(), after.map(str::as_bytes));
    String::from_utf8(key).expect("rank digits are ASCII")
}

/// Fractional-index midpoint of two digit strings read as fractions (0.low and 0.high; missing high = 1).
fn midpoint(low: &[u8], high: Option<&[u8]>) -> Vec<u8> {
    if let Some(high) = high {
        let shared = common_prefix_length(low, high);
        if shared > 0 {
            let mut key = high[..shared].to_vec();
            key.extend(midpoint(low.get(shared..).unwrap_or_default(), Some(&high[shared..])));
            return key;
        }
    }
    let low_digit = low.first().map_or(0, |digit| digit_value(*digit));
    let high_digit = high.map_or(DIGITS.len(), |high| digit_value(high[0]));
    if high_digit - low_digit > 1 {
        return vec![DIGITS[(low_digit + high_digit) / 2]];
    }
    if let Some(high) = high
        && high.len() > 1
    {
        return vec![high[0]];
    }
    let mut key = vec![DIGITS[low_digit]];
    key.extend(midpoint(low.get(1..).unwrap_or_default(), None));
    key
}

/// Leading digits both keys share, padding `low` with '0' (0.5 equals 0.50).
fn common_prefix_length(low: &[u8], high: &[u8]) -> usize {
    high.iter()
        .enumerate()
        .take_while(|(index, digit)| low.get(*index).copied().unwrap_or(b'0') == **digit)
        .count()
}

fn digit_value(digit: u8) -> usize {
    DIGITS.iter().position(|candidate| *candidate == digit).expect("rank keys use base-62 digits")
}

/// The fields PATCH may change, as stored.
#[derive(Debug, Clone, PartialEq)]
pub struct EditableIssue {
    pub id: i64,
    pub summary: String,
    pub description: String,
    pub issue_type: IssueType,
    pub priority: Priority,
    pub assignee_id: Option<i64>,
    pub points: Option<f64>,
    pub labels: Vec<String>,
    pub parent_id: Option<i64>,
}

pub fn check_summary(summary: &str) -> Result<String, AppError> {
    let summary = summary.trim();
    if summary.is_empty() || summary.chars().count() > 255 {
        return Err(AppError::invalid("summary", "must have 1 to 255 characters"));
    }
    Ok(summary.to_string())
}

pub fn normalize_labels(labels: Vec<String>) -> Result<Vec<String>, AppError> {
    let mut normalized: Vec<String> = Vec::new();
    for label in labels {
        let label = label.trim().to_string();
        if label.is_empty() || normalized.contains(&label) {
            continue;
        }
        if label.chars().count() > 50 || label.contains(char::is_whitespace) {
            return Err(AppError::invalid("labels", "labels are single words of up to 50 characters"));
        }
        normalized.push(label);
    }
    if normalized.len() > 20 {
        return Err(AppError::invalid("labels", "an issue takes at most 20 labels"));
    }
    Ok(normalized)
}

/// D11: subtasks carry no points; points are finite and not negative.
pub fn check_points(issue_type: IssueType, points: Option<f64>) -> Result<(), AppError> {
    let Some(points) = points else {
        return Ok(());
    };
    if issue_type == IssueType::Subtask {
        return Err(AppError::invalid("points", "subtasks carry no points"));
    }
    if !points.is_finite() || points < 0.0 {
        return Err(AppError::invalid("points", "must be zero or more"));
    }
    Ok(())
}

/// A subtask hangs under a story, task or bug; those hang under an epic or nothing; an epic has no parent.
pub fn check_parent(child: IssueType, parent: Option<IssueType>) -> Result<(), AppError> {
    let (allowed, message) = match child {
        IssueType::Subtask => (
            matches!(parent, Some(IssueType::Story | IssueType::Task | IssueType::Bug)),
            "a subtask needs a story, task or bug as parent",
        ),
        IssueType::Epic => (parent.is_none(), "an epic has no parent"),
        _ => (matches!(parent, None | Some(IssueType::Epic)), "only an epic can be the parent"),
    };
    if !allowed {
        return Err(AppError::invalid("parent", message));
    }
    Ok(())
}

pub fn check_type_change(from: IssueType, to: IssueType) -> Result<(), AppError> {
    let standard = |issue_type| matches!(issue_type, IssueType::Story | IssueType::Task | IssueType::Bug);
    if from != to && !(standard(from) && standard(to)) {
        return Err(AppError::invalid("issue_type", "only stories, tasks and bugs can change type"));
    }
    Ok(())
}

pub fn check_parent_change(issue_type: IssueType) -> Result<(), AppError> {
    if issue_type == IssueType::Subtask {
        return Err(AppError::invalid("parent", "a subtask keeps its parent"));
    }
    Ok(())
}

/// `SANTI-12` → 12, only for keys of this project.
pub fn parse_issue_key(field: &str, project_key: &str, key: &str) -> Result<i64, AppError> {
    let number = key
        .trim()
        .strip_prefix(project_key)
        .and_then(|rest| rest.strip_prefix('-'))
        .and_then(|digits| digits.parse::<i64>().ok());
    number
        .filter(|number| *number > 0)
        .ok_or_else(|| AppError::invalid(field, "must be an issue key of this project, like SANTI-12"))
}

/// D8: the done timer starts when an issue is created straight into a done status.
pub fn done_at_on_create(category: StatusCategory, now: DateTime<Utc>) -> Option<DateTime<Utc>> {
    (category == StatusCategory::Done).then_some(now)
}

/// Applies the plain fields of a PATCH; assignee and parent need the database and are applied by the service.
pub fn apply_field_changes(current: &EditableIssue, change: &UpdateIssue) -> Result<EditableIssue, AppError> {
    let mut next = current.clone();
    if let Some(summary) = &change.summary {
        next.summary = check_summary(summary)?;
    }
    if let Some(description) = &change.description {
        next.description = description.clone();
    }
    if let Some(issue_type) = change.issue_type {
        check_type_change(current.issue_type, issue_type)?;
        next.issue_type = issue_type;
    }
    if let Some(priority) = change.priority {
        next.priority = priority;
    }
    if let Some(points) = change.points {
        next.points = points;
    }
    if let Some(labels) = &change.labels {
        next.labels = normalize_labels(labels.clone())?;
    }
    check_points(next.issue_type, next.points)?;
    Ok(next)
}
```

`crates/santi-server/src/boards/repo.rs`, add:

```rust
/// What issue writes need to know about a status.
pub struct StatusRef {
    pub id: i64,
    pub category: StatusCategory,
    pub column_id: Option<i64>,
}

pub async fn find_status_ref(conn: &mut PgConnection, project_id: i64, status_id: i64) -> Result<Option<StatusRef>, sqlx::Error> {
    sqlx::query_as!(
        StatusRef,
        r#"SELECT id, category AS "category: StatusCategory", column_id FROM status WHERE project_id = $1 AND id = $2"#,
        project_id,
        status_id
    )
    .fetch_optional(&mut *conn)
    .await
}

/// D5: the default status of a new issue is the leftmost mapped to-do status.
pub async fn first_todo_status(conn: &mut PgConnection, project_id: i64) -> Result<Option<StatusRef>, sqlx::Error> {
    sqlx::query_as!(
        StatusRef,
        r#"SELECT s.id, s.category AS "category: StatusCategory", s.column_id
           FROM status s JOIN board_column c ON c.id = s.column_id
           WHERE s.project_id = $1 AND s.category = 'todo'
           ORDER BY c.position, s.id
           LIMIT 1"#,
        project_id
    )
    .fetch_optional(&mut *conn)
    .await
}
```

`crates/santi-server/src/issues/repo.rs`:

```rust
use chrono::{DateTime, Utc};
use santi_types::issues::{Issue, IssueType, Priority};
use sqlx::PgConnection;

use super::domain::EditableIssue;

pub struct IssueKind {
    pub id: i64,
    pub issue_type: IssueType,
    pub sprint_id: Option<i64>,
}

pub struct NewIssue {
    pub project_id: i64,
    pub number: i64,
    pub issue_type: IssueType,
    pub summary: String,
    pub description: String,
    pub priority: Priority,
    pub status_id: i64,
    pub assignee_id: Option<i64>,
    pub reporter_id: i64,
    pub points: Option<f64>,
    pub labels: Vec<String>,
    pub parent_id: Option<i64>,
    pub sprint_id: Option<i64>,
    pub rank: String,
    pub done_at: Option<DateTime<Utc>>,
}

pub async fn insert_issue(conn: &mut PgConnection, issue: &NewIssue) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!(
        "INSERT INTO issue (project_id, number, issue_type, summary, description, priority, status_id,
                            assignee_id, reporter_id, points, labels, parent_id, sprint_id, rank, done_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         RETURNING id",
        issue.project_id,
        issue.number,
        issue.issue_type as IssueType,
        issue.summary,
        issue.description,
        issue.priority as Priority,
        issue.status_id,
        issue.assignee_id,
        issue.reporter_id,
        issue.points,
        &issue.labels[..],
        issue.parent_id,
        issue.sprint_id,
        issue.rank,
        issue.done_at
    )
    .fetch_one(&mut *conn)
    .await
}

pub async fn find_issue(conn: &mut PgConnection, project_id: i64, number: i64) -> Result<Option<Issue>, sqlx::Error> {
    sqlx::query_as!(
        Issue,
        r#"SELECT i.id, p.key || '-' || i.number AS "key!", i.number, i.summary, i.description,
                  i.issue_type AS "issue_type: IssueType", i.priority AS "priority: Priority",
                  i.status_id, i.assignee_id, i.reporter_id, i.points, i.labels,
                  p.key || '-' || parent.number AS parent_key, i.sprint_id, i.rank, i.done_at, i.created_at
           FROM issue i
           JOIN project p ON p.id = i.project_id
           LEFT JOIN issue parent ON parent.id = i.parent_id
           WHERE i.project_id = $1 AND i.number = $2"#,
        project_id,
        number
    )
    .fetch_optional(&mut *conn)
    .await
}

pub async fn last_rank(conn: &mut PgConnection, project_id: i64) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_scalar!("SELECT max(rank) FROM issue WHERE project_id = $1", project_id)
        .fetch_one(&mut *conn)
        .await
}

pub async fn find_kind(conn: &mut PgConnection, project_id: i64, number: i64) -> Result<Option<IssueKind>, sqlx::Error> {
    sqlx::query_as!(
        IssueKind,
        r#"SELECT id, issue_type AS "issue_type: IssueType", sprint_id FROM issue WHERE project_id = $1 AND number = $2"#,
        project_id,
        number
    )
    .fetch_optional(&mut *conn)
    .await
}

pub async fn find_editable_for_update(conn: &mut PgConnection, project_id: i64, number: i64) -> Result<Option<EditableIssue>, sqlx::Error> {
    sqlx::query_as!(
        EditableIssue,
        r#"SELECT id, summary, description, issue_type AS "issue_type: IssueType", priority AS "priority: Priority",
                  assignee_id, points, labels, parent_id
           FROM issue WHERE project_id = $1 AND number = $2
           FOR UPDATE"#,
        project_id,
        number
    )
    .fetch_optional(&mut *conn)
    .await
}

pub async fn update_fields(conn: &mut PgConnection, issue: &EditableIssue) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE issue SET summary = $2, description = $3, issue_type = $4, priority = $5,
                          assignee_id = $6, points = $7, labels = $8, parent_id = $9
         WHERE id = $1",
        issue.id,
        issue.summary,
        issue.description,
        issue.issue_type as IssueType,
        issue.priority as Priority,
        issue.assignee_id,
        issue.points,
        &issue.labels[..],
        issue.parent_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}
```

`crates/santi-server/src/issues/service.rs`:

```rust
use chrono::Utc;
use santi_types::issues::{CreateIssue, Issue, IssueType, UpdateIssue};
use sqlx::{PgConnection, PgPool};

use super::repo::{IssueKind, NewIssue};
use super::{domain, repo};
use crate::boards::repo::StatusRef;
use crate::error::AppError;
use crate::members::Member;
use crate::{boards, members, projects};

pub async fn create_issue(pool: &PgPool, member: &Member, input: CreateIssue) -> Result<Issue, AppError> {
    let summary = domain::check_summary(&input.summary)?;
    let labels = domain::normalize_labels(input.labels)?;
    domain::check_points(input.issue_type, input.points)?;
    let mut tx = pool.begin().await?;
    let number = projects::repo::take_issue_number(&mut tx, member.project_id).await?;
    let status = resolve_status(&mut tx, member, input.status_id).await?;
    let parent = resolve_parent(&mut tx, member, input.issue_type, input.parent.as_deref()).await?;
    check_assignee(&mut tx, member, input.assignee_id).await?;
    let last_rank = repo::last_rank(&mut tx, member.project_id).await?;
    let new_issue = NewIssue {
        project_id: member.project_id,
        number,
        issue_type: input.issue_type,
        summary,
        description: input.description,
        priority: input.priority,
        status_id: status.id,
        assignee_id: input.assignee_id,
        reporter_id: member.user_id,
        points: input.points,
        labels,
        parent_id: parent.map(|parent| parent.id),
        sprint_id: None,
        rank: domain::rank_between(last_rank.as_deref(), None),
        done_at: domain::done_at_on_create(status.category, Utc::now()),
    };
    repo::insert_issue(&mut tx, &new_issue).await?;
    tx.commit().await?;
    get_issue(pool, member, number).await
}

pub async fn get_issue(pool: &PgPool, member: &Member, number: i64) -> Result<Issue, AppError> {
    let mut conn = pool.acquire().await?;
    repo::find_issue(&mut conn, member.project_id, number).await?.ok_or(AppError::NotFound)
}

pub async fn update_issue(pool: &PgPool, member: &Member, number: i64, change: UpdateIssue) -> Result<Issue, AppError> {
    let mut tx = pool.begin().await?;
    let current = repo::find_editable_for_update(&mut tx, member.project_id, number).await?;
    let current = current.ok_or(AppError::NotFound)?;
    let mut next = domain::apply_field_changes(&current, &change)?;
    if let Some(assignee_id) = change.assignee_id {
        check_assignee(&mut tx, member, assignee_id).await?;
        next.assignee_id = assignee_id;
    }
    if let Some(parent) = &change.parent {
        domain::check_parent_change(current.issue_type)?;
        let parent = resolve_parent(&mut tx, member, next.issue_type, parent.as_deref()).await?;
        next.parent_id = parent.map(|parent| parent.id);
    }
    repo::update_fields(&mut tx, &next).await?;
    tx.commit().await?;
    get_issue(pool, member, number).await
}

/// The status a write may use: the given one (mapped, of this project) or the default to-do status.
pub async fn resolve_status(conn: &mut PgConnection, member: &Member, status_id: Option<i64>) -> Result<StatusRef, AppError> {
    let Some(status_id) = status_id else {
        let status = boards::repo::first_todo_status(conn, member.project_id).await?;
        return status.ok_or_else(|| AppError::conflict("no-todo-status", "Map a to-do status to a board column first."));
    };
    let status = boards::repo::find_status_ref(conn, member.project_id, status_id).await?;
    let status = status.ok_or_else(|| AppError::invalid("status_id", "no such status in this project"))?;
    if status.column_id.is_none() {
        return Err(AppError::conflict("status-unmapped", "Map this status to a board column before using it."));
    }
    Ok(status)
}

async fn resolve_parent(conn: &mut PgConnection, member: &Member, child_type: IssueType, parent_key: Option<&str>) -> Result<Option<IssueKind>, AppError> {
    let Some(parent_key) = parent_key else {
        domain::check_parent(child_type, None)?;
        return Ok(None);
    };
    let number = domain::parse_issue_key("parent", &member.project_key, parent_key)?;
    let parent = repo::find_kind(conn, member.project_id, number).await?;
    let parent = parent.ok_or_else(|| AppError::invalid("parent", "no such issue in this project"))?;
    domain::check_parent(child_type, Some(parent.issue_type))?;
    Ok(Some(parent))
}

async fn check_assignee(conn: &mut PgConnection, member: &Member, assignee_id: Option<i64>) -> Result<(), AppError> {
    let Some(assignee_id) = assignee_id else {
        return Ok(());
    };
    if !members::repo::is_member(conn, member.project_id, assignee_id).await? {
        return Err(AppError::invalid("assignee_id", "must be a member of the project"));
    }
    Ok(())
}
```

`crates/santi-server/src/issues/handler.rs` — Task 2 handler pattern:

```rust
pub async fn create_issue(State(state): State<AppState>, member: Member, JsonBody(input): JsonBody<CreateIssue>) -> Result<(StatusCode, Json<Issue>), AppError>
pub async fn get_issue(State(state): State<AppState>, member: Member, PathParams((_key, number)): PathParams<(String, i64)>) -> Result<Json<Issue>, AppError>
pub async fn update_issue(State(state): State<AppState>, member: Member, PathParams((_key, number)): PathParams<(String, i64)>, JsonBody(change): JsonBody<UpdateIssue>) -> Result<Json<Issue>, AppError>

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(create_issue))
        .routes(routes!(get_issue, update_issue))
}
```

`crates/santi-server/src/lib.rs`: add `pub mod issues;` and `.merge(issues::handler::router())`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cargo test -p santi-server`
Expected: `test result: ok.` everywhere, 0 failed.

- [ ] **Step 6: Offline data and gate**

Run: `cargo sqlx prepare --workspace`, then the gate. Expected: all clean, coverage above 90%.

- [ ] **Step 7: Commit**

```bash
git add crates/santi-server/migrations/0005_issues.sql crates/santi-types/src/lib.rs crates/santi-types/src/issues.rs \
  crates/santi-server/src/lib.rs crates/santi-server/src/issues crates/santi-server/src/boards/repo.rs \
  crates/santi-server/tests/common/mod.rs crates/santi-server/tests/issues.rs .sqlx
git commit -m "feat: add issues with per-project numbering and fractional rank"
```

---

### Task 6: Issue moves, comments and search

**Branch:** `feat/SAN-<card>-issue-moves-search`

**Files:**
- Create: `crates/santi-server/migrations/0006_comments_search.sql`, `crates/santi-server/src/pagination.rs`, `crates/santi-server/tests/issue_moves.rs`, `crates/santi-server/tests/comments_search.rs`
- Modify: `crates/santi-types/src/issues.rs`, `crates/santi-server/src/lib.rs`, `crates/santi-server/src/issues/{domain.rs,repo.rs,service.rs,handler.rs}`, `.sqlx/`

**Interfaces:**
- Consumes: `rank_between`, `parse_issue_key`, `resolve_status`, `get_issue` (Task 5); `projects::repo::lock_project` (Task 3); `QueryParams` (Task 4).
- Produces:
  - `santi_server::issues::repo::{Position { id: i64, issue_type: IssueType, status_id: i64, category: StatusCategory, sprint_id: Option<i64>, rank: String, done_at: Option<DateTime<Utc>> }, find_position_for_update(conn, project_id, number) -> Result<Option<Position>, sqlx::Error>}` (Task 7 extends the move)
  - `santi_server::issues::service::move_issue(pool, member, number: i64, input: MoveIssue) -> Result<Issue, AppError>`
  - `santi_server::pagination::{page_limit(Option<i64>) -> Result<i64, AppError>, into_page<T>(items: Vec<T>, limit: i64, id_of: fn(&T) -> i64) -> Page<T>}`
  - `santi_types::issues::{MoveIssue, Comment, CreateComment, Page<T> { items: Vec<T>, next_cursor: Option<i64> }, PageParams { limit: Option<i64>, cursor: Option<i64> }, IssueFilter { assignee: Vec<i64>, issue_type: Vec<IssueType> (query key "type"), label: Vec<String>, parent: Vec<String>, q: Option<String> }}` (Task 9 reuses `IssueFilter`)

Routes:

| Method | Path | Body / query | Success |
|---|---|---|---|
| POST | `/api/projects/{key}/issues/{number}/move` | `MoveIssue` | 200 `Issue` — status change (D8 timer), rank next to one anchor (D4) |
| GET | `/api/projects/{key}/issues` | `IssueFilter` + `PageParams` | 200 `Page<Issue>` by id (D3, D29) |
| POST | `/api/projects/{key}/issues/{number}/comments` | `CreateComment` | 201 `Comment` |
| GET | `/api/projects/{key}/issues/{number}/comments` | `PageParams` | 200 `Page<Comment>` by id |

- [ ] **Step 1: Migration and apply it**

`crates/santi-server/migrations/0006_comments_search.sql`:

```sql
CREATE TABLE issue_comment (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    issue_id   bigint NOT NULL REFERENCES issue (id) ON DELETE CASCADE,
    author_id  bigint NOT NULL REFERENCES app_user (id),
    body       text NOT NULL CHECK (length(body) BETWEEN 1 AND 20000),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX issue_comment_issue_idx ON issue_comment (issue_id, id);   -- keyset pages (D29)
CREATE INDEX issue_project_id_idx ON issue (project_id, id);            -- search keyset pages (D29)
CREATE INDEX issue_project_type_idx ON issue (project_id, issue_type);  -- type filter (D3)
```

Run: `sqlx migrate run --source crates/santi-server/migrations`
Expected: `Applied 6/migrate comments search`.

- [ ] **Step 2: Write the failing tests**

Unit tests appended to the test module of `crates/santi-server/src/issues/domain.rs`:

```rust
    #[test]
    fn anchors_are_parsed_and_checked() {
        assert_eq!(anchor_for("SANTI", 1, None, None).unwrap(), Anchor::Keep);
        assert_eq!(anchor_for("SANTI", 1, Some("SANTI-2"), None).unwrap(), Anchor::After(2));
        assert_eq!(anchor_for("SANTI", 1, None, Some("SANTI-3")).unwrap(), Anchor::Before(3));
        assert!(anchor_for("SANTI", 1, Some("SANTI-2"), Some("SANTI-3")).is_err());
        assert!(anchor_for("SANTI", 1, Some("SANTI-1"), None).is_err());
        assert!(anchor_for("SANTI", 1, None, Some("OTHER-3")).is_err());
    }

    #[test]
    fn done_timer_starts_on_entering_done_and_stops_on_leaving() {
        let then = chrono::Utc::now() - chrono::Duration::days(3);
        let now = chrono::Utc::now();
        assert_eq!(next_done_at(StatusCategory::Todo, StatusCategory::Done, None, now), Some(now));
        assert_eq!(next_done_at(StatusCategory::Done, StatusCategory::Done, Some(then), now), Some(then));
        assert_eq!(next_done_at(StatusCategory::Done, StatusCategory::InProgress, Some(then), now), None);
        assert_eq!(next_done_at(StatusCategory::Todo, StatusCategory::InProgress, None, now), None);
    }

    #[test]
    fn free_text_becomes_an_escaped_like_pattern() {
        assert_eq!(like_pattern(Some(" login ")), Some("%login%".into()));
        assert_eq!(like_pattern(Some("50%_off\\")), Some("%50\\%\\_off\\\\%".into()));
        assert_eq!(like_pattern(Some("  ")), None);
        assert_eq!(like_pattern(None), None);
    }

    #[test]
    fn filters_become_a_search_query() {
        let filter = IssueFilter { parent: vec!["SANTI-4".into()], q: Some("bug".into()), ..IssueFilter::default() };
        let query = to_search_query("SANTI", &filter).unwrap();
        assert_eq!(query.parent_numbers, [4]);
        assert_eq!(query.pattern.as_deref(), Some("%bug%"));
        let bad = IssueFilter { parent: vec!["OTHER-4".into()], ..IssueFilter::default() };
        assert!(to_search_query("SANTI", &bad).is_err());
    }

    #[test]
    fn comment_body_is_trimmed_and_required() {
        assert_eq!(check_comment_body(" hi ").unwrap(), "hi");
        assert!(check_comment_body("  ").is_err());
    }
```

(add `use santi_types::issues::IssueFilter;` to the test module imports.)

Unit tests at the bottom of `crates/santi-server/src/pagination.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn limit_defaults_to_50_and_caps_at_200() {
        assert_eq!(page_limit(None).unwrap(), 50);
        assert_eq!(page_limit(Some(200)).unwrap(), 200);
        assert!(page_limit(Some(201)).is_err());
        assert!(page_limit(Some(0)).is_err());
    }

    #[test]
    fn an_extra_row_means_there_is_a_next_page() {
        let page = into_page(vec![1_i64, 2, 3], 2, |item| *item);
        assert_eq!(page.items, [1, 2]);
        assert_eq!(page.next_cursor, Some(2));
        let last = into_page(vec![3_i64], 2, |item| *item);
        assert_eq!(last.next_cursor, None);
    }
}
```

`crates/santi-server/tests/issue_moves.rs`:

```rust
mod common;

use axum::http::StatusCode;
use common::TestApp;
use serde_json::{Value, json};
use sqlx::PgPool;

async fn project_with_issues(pool: PgPool, count: usize) -> TestApp {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    for index in 1..=count {
        ana.create_issue("SANTI", json!({ "summary": format!("issue {index}") })).await;
    }
    ana
}

async fn keys_by_rank(app: &TestApp, numbers: &[i64]) -> Vec<String> {
    let mut issues = Vec::new();
    for number in numbers {
        issues.push(app.get(&format!("/api/projects/SANTI/issues/{number}")).await.1);
    }
    issues.sort_by(|left, right| left["rank"].as_str().unwrap().cmp(right["rank"].as_str().unwrap()));
    issues.iter().map(|issue| issue["key"].as_str().unwrap().to_string()).collect()
}

async fn move_issue(app: &TestApp, number: i64, body: Value) -> (StatusCode, Value) {
    app.post(&format!("/api/projects/SANTI/issues/{number}/move"), body).await
}

#[sqlx::test]
async fn status_move_keeps_the_rank(pool: PgPool) {
    let ana = project_with_issues(pool, 1).await;
    let doing = ana.status_id("SANTI", "In Progress").await;
    let before = ana.get("/api/projects/SANTI/issues/1").await.1;

    let (status, moved) = move_issue(&ana, 1, json!({ "status_id": doing })).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(moved["status_id"], doing);
    assert_eq!(moved["rank"], before["rank"]);
}

#[sqlx::test]
async fn done_timer_follows_the_status_category(pool: PgPool) {
    let ana = project_with_issues(pool, 1).await;
    let done = ana.status_id("SANTI", "Done").await;
    let todo = ana.status_id("SANTI", "To Do").await;

    let (_, finished) = move_issue(&ana, 1, json!({ "status_id": done })).await;
    let (_, reopened) = move_issue(&ana, 1, json!({ "status_id": todo })).await;

    assert!(finished["done_at"].is_string());
    assert_eq!(reopened["done_at"], Value::Null);
}

#[sqlx::test]
async fn moving_between_done_statuses_keeps_the_timer(pool: PgPool) {
    let ana = project_with_issues(pool, 1).await;
    let done_column = ana.column_id("SANTI", "Done").await;
    let (_, shipped) = ana.post("/api/projects/SANTI/statuses", json!({ "name": "Shipped", "category": "done" })).await;
    ana.put(&format!("/api/projects/SANTI/statuses/{}", shipped["id"]), json!({ "name": "Shipped", "column_id": done_column })).await;
    let done = ana.status_id("SANTI", "Done").await;

    let (_, first) = move_issue(&ana, 1, json!({ "status_id": done })).await;
    let (_, second) = move_issue(&ana, 1, json!({ "status_id": shipped["id"] })).await;

    assert_eq!(first["done_at"], second["done_at"]);
}

#[sqlx::test]
async fn moving_to_an_unmapped_status_is_refused(pool: PgPool) {
    let ana = project_with_issues(pool, 1).await;
    let (_, parked) = ana.post("/api/projects/SANTI/statuses", json!({ "name": "Parked", "category": "todo" })).await;

    let (status, problem) = move_issue(&ana, 1, json!({ "status_id": parked["id"] })).await;

    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(problem["type"], "urn:santi:error:status-unmapped");
}

#[sqlx::test]
async fn after_anchor_places_the_issue_right_after_it(pool: PgPool) {
    let ana = project_with_issues(pool, 3).await;

    move_issue(&ana, 1, json!({ "after": "SANTI-2" })).await;

    assert_eq!(keys_by_rank(&ana, &[1, 2, 3]).await, ["SANTI-2", "SANTI-1", "SANTI-3"]);
}

#[sqlx::test]
async fn before_anchor_places_the_issue_right_before_it(pool: PgPool) {
    let ana = project_with_issues(pool, 3).await;

    move_issue(&ana, 3, json!({ "before": "SANTI-1" })).await;
    move_issue(&ana, 2, json!({ "after": "SANTI-1" })).await;

    assert_eq!(keys_by_rank(&ana, &[1, 2, 3]).await, ["SANTI-3", "SANTI-1", "SANTI-2"]);
}

#[sqlx::test]
async fn anchors_at_both_ends(pool: PgPool) {
    let ana = project_with_issues(pool, 3).await;

    move_issue(&ana, 1, json!({ "after": "SANTI-3" })).await;
    move_issue(&ana, 3, json!({ "before": "SANTI-2" })).await;

    assert_eq!(keys_by_rank(&ana, &[1, 2, 3]).await, ["SANTI-3", "SANTI-2", "SANTI-1"]);
}

#[sqlx::test]
async fn invalid_anchors_are_refused(pool: PgPool) {
    let ana = project_with_issues(pool, 2).await;

    let (both, _) = move_issue(&ana, 1, json!({ "after": "SANTI-2", "before": "SANTI-2" })).await;
    let (itself, _) = move_issue(&ana, 1, json!({ "after": "SANTI-1" })).await;
    let (unknown, problem) = move_issue(&ana, 1, json!({ "after": "SANTI-99" })).await;
    let (missing_issue, _) = move_issue(&ana, 99, json!({ "after": "SANTI-1" })).await;

    assert_eq!(both, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(itself, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(unknown, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "after");
    assert_eq!(missing_issue, StatusCode::NOT_FOUND);
}
```

`crates/santi-server/tests/comments_search.rs`:

```rust
mod common;

use axum::http::StatusCode;
use common::TestApp;
use serde_json::{Value, json};
use sqlx::PgPool;

async fn project(pool: PgPool) -> TestApp {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    ana
}

fn keys(page: &Value) -> Vec<String> {
    page["items"].as_array().unwrap().iter().map(|issue| issue["key"].as_str().unwrap().to_string()).collect()
}

#[sqlx::test]
async fn comments_are_added_and_listed_in_order(pool: PgPool) {
    let ana = project(pool).await;
    ana.create_issue("SANTI", json!({ "summary": "x" })).await;
    let url = "/api/projects/SANTI/issues/1/comments";

    let (created, comment) = ana.post(url, json!({ "body": " first " })).await;
    ana.post(url, json!({ "body": "second" })).await;
    let (_, page) = ana.get(url).await;

    assert_eq!(created, StatusCode::CREATED);
    assert_eq!(comment["body"], "first");
    assert_eq!(comment["author_id"], ana.user_id);
    assert_eq!(page["items"][1]["body"], "second");
    assert_eq!(page["next_cursor"], Value::Null);
}

#[sqlx::test]
async fn comment_rules(pool: PgPool) {
    let ana = project(pool).await;
    ana.create_issue("SANTI", json!({ "summary": "x" })).await;

    let (empty, _) = ana.post("/api/projects/SANTI/issues/1/comments", json!({ "body": "  " })).await;
    let (missing, _) = ana.post("/api/projects/SANTI/issues/9/comments", json!({ "body": "hi" })).await;
    let (listing_missing, _) = ana.get("/api/projects/SANTI/issues/9/comments").await;

    assert_eq!(empty, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(missing, StatusCode::NOT_FOUND);
    assert_eq!(listing_missing, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn comment_pages_follow_the_cursor(pool: PgPool) {
    let ana = project(pool).await;
    ana.create_issue("SANTI", json!({ "summary": "x" })).await;
    for body in ["a", "b", "c"] {
        ana.post("/api/projects/SANTI/issues/1/comments", json!({ "body": body })).await;
    }

    let (_, first) = ana.get("/api/projects/SANTI/issues/1/comments?limit=2").await;
    let cursor = first["next_cursor"].as_i64().unwrap();
    let (_, second) = ana.get(&format!("/api/projects/SANTI/issues/1/comments?limit=2&cursor={cursor}")).await;

    assert_eq!(first["items"].as_array().unwrap().len(), 2);
    assert_eq!(second["items"][0]["body"], "c");
    assert_eq!(second["next_cursor"], Value::Null);
}

#[sqlx::test]
async fn search_combines_filters_and_within_or_across_and(pool: PgPool) {
    let ana = project(pool).await;
    ana.create_issue("SANTI", json!({ "summary": "Login fails", "issue_type": "bug", "labels": ["ui"], "assignee_id": ana.user_id })).await;
    ana.create_issue("SANTI", json!({ "summary": "Write docs", "issue_type": "task", "labels": ["docs"] })).await;
    ana.create_issue("SANTI", json!({ "summary": "Big story", "labels": ["ui"] })).await;

    let (_, either_type) = ana.get("/api/projects/SANTI/issues?type=bug&type=task").await;
    let (_, type_and_label) = ana.get("/api/projects/SANTI/issues?type=bug&type=task&label=ui").await;
    let (_, mine) = ana.get(&format!("/api/projects/SANTI/issues?assignee={}", ana.user_id)).await;
    let (_, text) = ana.get("/api/projects/SANTI/issues?q=LOGIN").await;
    let (_, literal_percent) = ana.get("/api/projects/SANTI/issues?q=50%25").await;

    assert_eq!(keys(&either_type), ["SANTI-1", "SANTI-2"]);
    assert_eq!(keys(&type_and_label), ["SANTI-1"]);
    assert_eq!(keys(&mine), ["SANTI-1"]);
    assert_eq!(keys(&text), ["SANTI-1"]);
    assert_eq!(keys(&literal_percent), Vec::<String>::new());
}

#[sqlx::test]
async fn search_filters_by_parent_and_pages(pool: PgPool) {
    let ana = project(pool).await;
    ana.create_issue("SANTI", json!({ "summary": "Epic", "issue_type": "epic" })).await;
    ana.create_issue("SANTI", json!({ "summary": "Child one", "parent": "SANTI-1" })).await;
    ana.create_issue("SANTI", json!({ "summary": "Child two", "parent": "SANTI-1" })).await;

    let (_, children) = ana.get("/api/projects/SANTI/issues?parent=SANTI-1").await;
    let (_, first) = ana.get("/api/projects/SANTI/issues?limit=2").await;
    let cursor = first["next_cursor"].as_i64().unwrap();
    let (_, second) = ana.get(&format!("/api/projects/SANTI/issues?limit=2&cursor={cursor}")).await;

    assert_eq!(keys(&children), ["SANTI-2", "SANTI-3"]);
    assert_eq!(keys(&first), ["SANTI-1", "SANTI-2"]);
    assert_eq!(keys(&second), ["SANTI-3"]);
}

#[sqlx::test]
async fn search_rejects_bad_query_values(pool: PgPool) {
    let ana = project(pool).await;

    let (bad_type, problem) = ana.get("/api/projects/SANTI/issues?type=feature").await;
    let (too_many, _) = ana.get("/api/projects/SANTI/issues?limit=500").await;
    let (bad_parent, _) = ana.get("/api/projects/SANTI/issues?parent=OTHER-1").await;

    assert_eq!(bad_type, StatusCode::BAD_REQUEST);
    assert_eq!(problem["type"], "urn:santi:error:bad-request");
    assert_eq!(too_many, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(bad_parent, StatusCode::UNPROCESSABLE_ENTITY);
}

#[sqlx::test]
async fn openapi_lists_move_search_and_comment_routes(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let (_, api) = app.get("/openapi.json").await;

    assert!(api["paths"]["/api/projects/{key}/issues"]["get"].is_object());
    assert!(api["paths"]["/api/projects/{key}/issues/{number}/move"]["post"].is_object());
    assert!(api["paths"]["/api/projects/{key}/issues/{number}/comments"]["get"].is_object());
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cargo test -p santi-server --lib && cargo test -p santi-server --test issue_moves --test comments_search`
Expected: compile errors — `cannot find function anchor_for`, unresolved `crate::pagination`; HTTP tests fail with 405 on `/move` once compiled.

- [ ] **Step 4: Minimal implementation**

`crates/santi-types/src/issues.rs`, add (and `use utoipa::IntoParams;`):

```rust
#[derive(Debug, Clone, Default, Serialize, Deserialize, ToSchema)]
pub struct MoveIssue {
    /// New status; absent keeps the current one.
    #[serde(default)]
    pub status_id: Option<i64>,
    /// Place right after this issue key (D4). Send at most one of `after` and `before`.
    #[serde(default)]
    pub after: Option<String>,
    /// Place right before this issue key.
    #[serde(default)]
    pub before: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct Comment {
    pub id: i64,
    pub author_id: i64,
    pub body: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct CreateComment {
    pub body: String,
}

/// One keyset page (D29): pass `next_cursor` back as `cursor` for the next page; null means last page.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct Page<T> {
    pub items: Vec<T>,
    pub next_cursor: Option<i64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct PageParams {
    /// 1 to 200, default 50.
    #[serde(default)]
    pub limit: Option<i64>,
    #[serde(default)]
    pub cursor: Option<i64>,
}

/// Quick filters (D3): repeated values of one key mean "any of them"; different keys must all match.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct IssueFilter {
    /// Assignee user ids.
    #[serde(default)]
    pub assignee: Vec<i64>,
    #[serde(default, rename = "type")]
    pub issue_type: Vec<IssueType>,
    #[serde(default)]
    pub label: Vec<String>,
    /// Parent issue keys, e.g. an epic's `SANTI-3`.
    #[serde(default)]
    pub parent: Vec<String>,
    /// Free text matched against the summary, ignoring case.
    #[serde(default)]
    pub q: Option<String>,
}
```

`crates/santi-server/src/pagination.rs` (above the tests):

```rust
use santi_types::issues::Page;

use crate::error::AppError;

pub const DEFAULT_LIMIT: i64 = 50;
pub const MAX_LIMIT: i64 = 200;

pub fn page_limit(limit: Option<i64>) -> Result<i64, AppError> {
    let limit = limit.unwrap_or(DEFAULT_LIMIT);
    if !(1..=MAX_LIMIT).contains(&limit) {
        return Err(AppError::invalid("limit", "must be between 1 and 200"));
    }
    Ok(limit)
}

/// `items` holds up to `limit + 1` rows ordered by id; the extra row only signals a next page.
pub fn into_page<T>(mut items: Vec<T>, limit: i64, id_of: fn(&T) -> i64) -> Page<T> {
    let has_more = items.len() > limit as usize;
    items.truncate(limit as usize);
    let next_cursor = if has_more { items.last().map(id_of) } else { None };
    Page { items, next_cursor }
}
```

`crates/santi-server/src/issues/domain.rs`, add:

```rust
use santi_types::issues::IssueFilter;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Anchor {
    Keep,
    After(i64),
    Before(i64),
}

pub fn anchor_for(project_key: &str, moving_number: i64, after: Option<&str>, before: Option<&str>) -> Result<Anchor, AppError> {
    let anchor = match (after, before) {
        (None, None) => return Ok(Anchor::Keep),
        (Some(_), Some(_)) => return Err(AppError::invalid("after", "send either after or before, not both")),
        (Some(key), None) => Anchor::After(parse_issue_key("after", project_key, key)?),
        (None, Some(key)) => Anchor::Before(parse_issue_key("before", project_key, key)?),
    };
    if matches!(anchor, Anchor::After(number) | Anchor::Before(number) if number == moving_number) {
        return Err(AppError::invalid("after", "an issue cannot be placed next to itself"));
    }
    Ok(anchor)
}

/// D8: the timer starts on entering a done status, survives done-to-done moves and clears on leaving.
pub fn next_done_at(from: StatusCategory, to: StatusCategory, current: Option<DateTime<Utc>>, now: DateTime<Utc>) -> Option<DateTime<Utc>> {
    if to != StatusCategory::Done {
        return None;
    }
    if from == StatusCategory::Done {
        return current;
    }
    Some(now)
}

/// `ILIKE` pattern matching the text anywhere; `%`, `_` and `\` in the text match literally.
pub fn like_pattern(text: Option<&str>) -> Option<String> {
    let text = text?.trim();
    if text.is_empty() {
        return None;
    }
    let escaped = text.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_");
    Some(format!("%{escaped}%"))
}

/// The filter in the shape the search query binds.
#[derive(Debug, Clone, PartialEq)]
pub struct SearchQuery {
    pub assignee_ids: Vec<i64>,
    pub types: Vec<IssueType>,
    pub labels: Vec<String>,
    pub parent_numbers: Vec<i64>,
    pub pattern: Option<String>,
}

pub fn to_search_query(project_key: &str, filter: &IssueFilter) -> Result<SearchQuery, AppError> {
    let parent_numbers = filter
        .parent
        .iter()
        .map(|key| parse_issue_key("parent", project_key, key))
        .collect::<Result<Vec<i64>, AppError>>()?;
    Ok(SearchQuery {
        assignee_ids: filter.assignee.clone(),
        types: filter.issue_type.clone(),
        labels: filter.label.clone(),
        parent_numbers,
        pattern: like_pattern(filter.q.as_deref()),
    })
}

pub fn check_comment_body(body: &str) -> Result<String, AppError> {
    let body = body.trim();
    if body.is_empty() || body.chars().count() > 20_000 {
        return Err(AppError::invalid("body", "must have 1 to 20000 characters"));
    }
    Ok(body.to_string())
}
```

`crates/santi-server/src/issues/repo.rs`, add (plus `use santi_types::boards::StatusCategory; use santi_types::issues::Comment; use super::domain::SearchQuery;`):

```rust
/// What a move needs to know about the issue, read under a row lock.
pub struct Position {
    pub id: i64,
    pub issue_type: IssueType,
    pub status_id: i64,
    pub category: StatusCategory,
    pub sprint_id: Option<i64>,
    pub rank: String,
    pub done_at: Option<DateTime<Utc>>,
}

pub async fn find_position_for_update(conn: &mut PgConnection, project_id: i64, number: i64) -> Result<Option<Position>, sqlx::Error> {
    sqlx::query_as!(
        Position,
        r#"SELECT i.id, i.issue_type AS "issue_type: IssueType", i.status_id,
                  s.category AS "category: StatusCategory", i.sprint_id, i.rank, i.done_at
           FROM issue i JOIN status s ON s.id = i.status_id
           WHERE i.project_id = $1 AND i.number = $2
           FOR UPDATE OF i"#,
        project_id,
        number
    )
    .fetch_optional(&mut *conn)
    .await
}

pub async fn find_rank(conn: &mut PgConnection, project_id: i64, number: i64) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_scalar!("SELECT rank FROM issue WHERE project_id = $1 AND number = $2", project_id, number)
        .fetch_optional(&mut *conn)
        .await
}

/// The next rank after `rank` in the project, skipping the issue being moved.
pub async fn rank_after(conn: &mut PgConnection, project_id: i64, rank: &str, moving_id: i64) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_scalar!(
        "SELECT rank FROM issue WHERE project_id = $1 AND rank > $2 AND id <> $3 ORDER BY rank LIMIT 1",
        project_id,
        rank,
        moving_id
    )
    .fetch_optional(&mut *conn)
    .await
}

/// The previous rank before `rank` in the project, skipping the issue being moved.
pub async fn rank_before(conn: &mut PgConnection, project_id: i64, rank: &str, moving_id: i64) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_scalar!(
        "SELECT rank FROM issue WHERE project_id = $1 AND rank < $2 AND id <> $3 ORDER BY rank DESC LIMIT 1",
        project_id,
        rank,
        moving_id
    )
    .fetch_optional(&mut *conn)
    .await
}

pub async fn update_position(conn: &mut PgConnection, issue_id: i64, status_id: i64, rank: &str, done_at: Option<DateTime<Utc>>) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE issue SET status_id = $2, rank = $3, done_at = $4 WHERE id = $1",
        issue_id,
        status_id,
        rank,
        done_at
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

pub async fn find_id(conn: &mut PgConnection, project_id: i64, number: i64) -> Result<Option<i64>, sqlx::Error> {
    sqlx::query_scalar!("SELECT id FROM issue WHERE project_id = $1 AND number = $2", project_id, number)
        .fetch_optional(&mut *conn)
        .await
}

pub async fn insert_comment(conn: &mut PgConnection, issue_id: i64, author_id: i64, body: &str) -> Result<Comment, sqlx::Error> {
    sqlx::query_as!(
        Comment,
        "INSERT INTO issue_comment (issue_id, author_id, body) VALUES ($1, $2, $3)
         RETURNING id, author_id, body, created_at",
        issue_id,
        author_id,
        body
    )
    .fetch_one(&mut *conn)
    .await
}

pub async fn list_comments(conn: &mut PgConnection, issue_id: i64, after_id: i64, limit: i64) -> Result<Vec<Comment>, sqlx::Error> {
    sqlx::query_as!(
        Comment,
        "SELECT id, author_id, body, created_at FROM issue_comment
         WHERE issue_id = $1 AND id > $2 ORDER BY id LIMIT $3",
        issue_id,
        after_id,
        limit
    )
    .fetch_all(&mut *conn)
    .await
}

/// D3: empty arrays mean "no filter"; within one array any value matches; filters are AND-ed.
pub async fn search_issues(conn: &mut PgConnection, project_id: i64, query: &SearchQuery, after_id: i64, limit: i64) -> Result<Vec<Issue>, sqlx::Error> {
    sqlx::query_as!(
        Issue,
        r#"SELECT i.id, p.key || '-' || i.number AS "key!", i.number, i.summary, i.description,
                  i.issue_type AS "issue_type: IssueType", i.priority AS "priority: Priority",
                  i.status_id, i.assignee_id, i.reporter_id, i.points, i.labels,
                  p.key || '-' || parent.number AS parent_key, i.sprint_id, i.rank, i.done_at, i.created_at
           FROM issue i
           JOIN project p ON p.id = i.project_id
           LEFT JOIN issue parent ON parent.id = i.parent_id
           WHERE i.project_id = $1
             AND i.id > $2
             AND (cardinality($3::bigint[]) = 0 OR i.assignee_id = ANY($3))
             AND (cardinality($4::text[]) = 0 OR i.issue_type = ANY($4))
             AND (cardinality($5::text[]) = 0 OR i.labels && $5)
             AND (cardinality($6::bigint[]) = 0 OR parent.number = ANY($6))
             AND ($7::text IS NULL OR i.summary ILIKE $7)
           ORDER BY i.id
           LIMIT $8"#,
        project_id,
        after_id,
        &query.assignee_ids[..],
        &query.types[..] as &[IssueType],
        &query.labels[..],
        &query.parent_numbers[..],
        query.pattern.as_deref(),
        limit
    )
    .fetch_all(&mut *conn)
    .await
}
```

`crates/santi-server/src/issues/service.rs`, add (plus imports `santi_types::issues::{Comment, CreateComment, IssueFilter, MoveIssue, Page, PageParams}`, `chrono::DateTime`, `super::domain::Anchor`, `super::repo::Position`, `crate::pagination`):

```rust
pub async fn move_issue(pool: &PgPool, member: &Member, number: i64, input: MoveIssue) -> Result<Issue, AppError> {
    let anchor = domain::anchor_for(&member.project_key, number, input.after.as_deref(), input.before.as_deref())?;
    let mut tx = pool.begin().await?;
    projects::repo::lock_project(&mut tx, member.project_id).await?; // D21: moves in one project are serialized
    let issue = repo::find_position_for_update(&mut tx, member.project_id, number).await?;
    let issue = issue.ok_or(AppError::NotFound)?;
    let (status_id, done_at) = next_status(&mut tx, member, &issue, input.status_id).await?;
    let rank = next_rank(&mut tx, member, &issue, anchor).await?;
    repo::update_position(&mut tx, issue.id, status_id, &rank, done_at).await?;
    tx.commit().await?;
    get_issue(pool, member, number).await
}

async fn next_status(conn: &mut PgConnection, member: &Member, issue: &Position, requested: Option<i64>) -> Result<(i64, Option<DateTime<Utc>>), AppError> {
    let Some(status_id) = requested else {
        return Ok((issue.status_id, issue.done_at));
    };
    let status = resolve_status(conn, member, Some(status_id)).await?;
    let done_at = domain::next_done_at(issue.category, status.category, issue.done_at, Utc::now());
    Ok((status.id, done_at))
}

/// D4: the issue lands right next to its anchor in the project's single order.
async fn next_rank(conn: &mut PgConnection, member: &Member, issue: &Position, anchor: Anchor) -> Result<String, AppError> {
    match anchor {
        Anchor::Keep => Ok(issue.rank.clone()),
        Anchor::After(number) => {
            let anchor_rank = anchor_rank(conn, member, "after", number).await?;
            let next = repo::rank_after(conn, member.project_id, &anchor_rank, issue.id).await?;
            Ok(domain::rank_between(Some(&anchor_rank), next.as_deref()))
        }
        Anchor::Before(number) => {
            let anchor_rank = anchor_rank(conn, member, "before", number).await?;
            let previous = repo::rank_before(conn, member.project_id, &anchor_rank, issue.id).await?;
            Ok(domain::rank_between(previous.as_deref(), Some(&anchor_rank)))
        }
    }
}

async fn anchor_rank(conn: &mut PgConnection, member: &Member, field: &str, number: i64) -> Result<String, AppError> {
    let rank = repo::find_rank(conn, member.project_id, number).await?;
    rank.ok_or_else(|| AppError::invalid(field, "no such issue in this project"))
}

pub async fn search_issues(pool: &PgPool, member: &Member, filter: IssueFilter, page: PageParams) -> Result<Page<Issue>, AppError> {
    let limit = pagination::page_limit(page.limit)?;
    let query = domain::to_search_query(&member.project_key, &filter)?;
    let mut conn = pool.acquire().await?;
    let issues = repo::search_issues(&mut conn, member.project_id, &query, page.cursor.unwrap_or(0), limit + 1).await?;
    Ok(pagination::into_page(issues, limit, |issue: &Issue| issue.id))
}

pub async fn add_comment(pool: &PgPool, member: &Member, number: i64, input: CreateComment) -> Result<Comment, AppError> {
    let body = domain::check_comment_body(&input.body)?;
    let mut conn = pool.acquire().await?;
    let issue_id = repo::find_id(&mut conn, member.project_id, number).await?.ok_or(AppError::NotFound)?;
    Ok(repo::insert_comment(&mut conn, issue_id, member.user_id, &body).await?)
}

pub async fn list_comments(pool: &PgPool, member: &Member, number: i64, page: PageParams) -> Result<Page<Comment>, AppError> {
    let limit = pagination::page_limit(page.limit)?;
    let mut conn = pool.acquire().await?;
    let issue_id = repo::find_id(&mut conn, member.project_id, number).await?.ok_or(AppError::NotFound)?;
    let comments = repo::list_comments(&mut conn, issue_id, page.cursor.unwrap_or(0), limit + 1).await?;
    Ok(pagination::into_page(comments, limit, |comment: &Comment| comment.id))
}
```

`crates/santi-server/src/issues/handler.rs`, add four handlers (Task 2 pattern) and extend the router:

```rust
pub async fn move_issue(State(state): State<AppState>, member: Member, PathParams((_key, number)): PathParams<(String, i64)>, JsonBody(input): JsonBody<MoveIssue>) -> Result<Json<Issue>, AppError>
pub async fn search_issues(State(state): State<AppState>, member: Member, QueryParams(filter): QueryParams<IssueFilter>, QueryParams(page): QueryParams<PageParams>) -> Result<Json<Page<Issue>>, AppError>
pub async fn add_comment(State(state): State<AppState>, member: Member, PathParams((_key, number)): PathParams<(String, i64)>, JsonBody(input): JsonBody<CreateComment>) -> Result<(StatusCode, Json<Comment>), AppError>
pub async fn list_comments(State(state): State<AppState>, member: Member, PathParams((_key, number)): PathParams<(String, i64)>, QueryParams(page): QueryParams<PageParams>) -> Result<Json<Page<Comment>>, AppError>

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(create_issue, search_issues))
        .routes(routes!(get_issue, update_issue))
        .routes(routes!(move_issue))
        .routes(routes!(add_comment, list_comments))
}
```

`search_issues`' annotation: `params(("key" = String, Path), IssueFilter, PageParams)`, `responses((status = 200, body = Page<Issue>), (status = 400, body = Problem, …), (status = 422, body = Problem, …))`.

`crates/santi-server/src/lib.rs`: add `pub mod pagination;`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cargo test -p santi-server`
Expected: `test result: ok.` everywhere, 0 failed.

- [ ] **Step 6: Offline data and gate**

Run: `cargo sqlx prepare --workspace`, then the gate. Expected: all clean, coverage above 90%.

- [ ] **Step 7: Commit**

```bash
git add crates/santi-server/migrations/0006_comments_search.sql crates/santi-types/src/issues.rs \
  crates/santi-server/src/lib.rs crates/santi-server/src/pagination.rs crates/santi-server/src/issues \
  crates/santi-server/tests/issue_moves.rs crates/santi-server/tests/comments_search.rs .sqlx
git commit -m "feat: add issue moves, comments and filtered search"
```

---
### Task 7: Sprints — create, edit, delete and issue assignment

**Branch:** `feat/SAN-<card>-sprints`

**Files:**
- Create: `crates/santi-server/migrations/0007_sprints.sql`, `crates/santi-types/src/sprints.rs`, `crates/santi-server/src/sprints/{mod.rs,domain.rs,repo.rs,service.rs,handler.rs}`, `crates/santi-server/tests/sprints.rs`
- Modify: `crates/santi-types/src/lib.rs`, `crates/santi-types/src/issues.rs`, `crates/santi-server/src/lib.rs`, `crates/santi-server/src/issues/{repo.rs,service.rs}`, `crates/santi-server/tests/common/mod.rs`, `.sqlx/`

**Interfaces:**
- Consumes: `Member` (Task 3); `issues::repo::{IssueKind, Position, find_position_for_update}`, `issues::service::{create_issue, move_issue}` (Tasks 5, 6); `nullable_field` (Task 5).
- Produces:
  - `santi_server::sprints::domain::{require_scrum(BoardType) -> Result<(), AppError>, sprint_name(custom: Option<&str>, number: i64) -> Result<String, AppError>, check_sprint_open(SprintState) -> Result<(), AppError>, check_issue_can_change_sprint(IssueType) -> Result<(), AppError>}`
  - `santi_server::sprints::repo::{find_sprint(conn, board_id, sprint_id) -> Result<Option<Sprint>, sqlx::Error>, find_sprint_for_update(…), take_sprint_number(conn, board_id) -> Result<i64, sqlx::Error>, insert_sprint(conn, board_id, name: &str, goal: &str) -> Result<i64, sqlx::Error>}`
  - `santi_server::sprints::service::get_sprint(pool, member, sprint_id: i64) -> Result<Sprint, AppError>`
  - `santi_server::issues::repo::set_sprint(conn, issue_id: i64, sprint_id: Option<i64>) -> Result<(), sqlx::Error>` (moves the issue and its subtasks, D6)
  - `santi_server::issues::service::change_sprint(conn, member, issue: &Position, target: Option<i64>) -> Result<(), AppError>` (Task 8 records scope changes inside it)
  - `santi_types::sprints::{SprintState, Sprint, CreateSprint, UpdateSprint}`; `CreateIssue.sprint_id: Option<i64>`; `MoveIssue.sprint_id: Option<Option<i64>>` (absent keeps, `null` sends to the backlog)
  - Test helper: `TestApp::create_sprint(&self, key: &str) -> Value`

Routes (any member, SP-15 dropped):

| Method | Path | Body | Success |
|---|---|---|---|
| POST | `/api/projects/{key}/sprints` | `CreateSprint` | 201 `Sprint` (future, default name `Sprint N`, D12); 409 `kanban-has-no-sprints` |
| GET | `/api/projects/{key}/sprints` | — | 200 `Vec<Sprint>` in creation order (D13) |
| PUT | `/api/projects/{key}/sprints/{id}` | `UpdateSprint` | 200 `Sprint` (SP-11: closed sprints keep their dates) |
| DELETE | `/api/projects/{key}/sprints/{id}` | — | 204; 409 `sprint-not-future` (D14, D32) |

`POST /issues` and `POST /issues/{number}/move` gain `sprint_id`.

- [ ] **Step 1: Migration and apply it**

`crates/santi-server/migrations/0007_sprints.sql`:

```sql
CREATE TABLE sprint (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    board_id   bigint NOT NULL REFERENCES board (id) ON DELETE CASCADE,
    name       text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
    goal       text NOT NULL DEFAULT '' CHECK (length(goal) <= 1000),
    state      text NOT NULL DEFAULT 'future' CHECK (state IN ('future', 'active', 'closed')),
    start_date date,
    end_date   date,
    started_at timestamptz,
    closed_at  timestamptz,
    CHECK (end_date >= start_date),                                                                    -- D12
    CHECK (state = 'future' OR (start_date IS NOT NULL AND end_date IS NOT NULL AND started_at IS NOT NULL)),
    CHECK ((state = 'closed') = (closed_at IS NOT NULL))
);

CREATE UNIQUE INDEX sprint_one_active_per_board ON sprint (board_id) WHERE state = 'active';             -- D13
CREATE INDEX sprint_board_idx ON sprint (board_id, id);

-- D32: deleting a (future) sprint returns its issues to the backlog in the same statement.
ALTER TABLE issue
    ADD CONSTRAINT issue_sprint_fk FOREIGN KEY (sprint_id) REFERENCES sprint (id) ON DELETE SET NULL;
```

Run: `sqlx migrate run --source crates/santi-server/migrations`
Expected: `Applied 7/migrate sprints`.

- [ ] **Step 2: Write the failing tests**

Unit tests at the bottom of `crates/santi-server/src/sprints/domain.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;
    use santi_types::issues::IssueType;
    use santi_types::sprints::{Sprint, SprintState};

    fn date(text: &str) -> NaiveDate {
        text.parse().unwrap()
    }

    fn sprint(state: SprintState) -> Sprint {
        Sprint {
            id: 1, name: "Sprint 1".into(), goal: String::new(), state,
            start_date: Some(date("2026-10-01")), end_date: Some(date("2026-10-14")),
            started_at: None, closed_at: None, overdue: false,
        }
    }

    #[test]
    fn kanban_boards_have_no_sprints() {
        assert!(require_scrum(BoardType::Scrum).is_ok());
        assert_eq!(require_scrum(BoardType::Kanban).unwrap_err().to_problem().problem_type, "urn:santi:error:kanban-has-no-sprints");
    }

    #[test]
    fn default_name_uses_the_board_counter() {
        assert_eq!(sprint_name(None, 4).unwrap(), "Sprint 4");
        assert_eq!(sprint_name(Some(" Launch "), 4).unwrap(), "Launch");
        assert!(sprint_name(Some("  "), 4).is_err());
    }

    #[test]
    fn end_date_cannot_precede_start_date() {
        assert!(check_dates(Some(date("2026-10-02")), Some(date("2026-10-01"))).is_err());
        assert!(check_dates(Some(date("2026-10-01")), Some(date("2026-10-01"))).is_ok());
        assert!(check_dates(None, Some(date("2026-10-01"))).is_ok());
    }

    #[test]
    fn edits_depend_on_the_sprint_state() {
        let same = (Some(date("2026-10-01")), Some(date("2026-10-14")));
        assert!(check_sprint_edit(&sprint(SprintState::Future), None, None).is_ok());
        assert!(check_sprint_edit(&sprint(SprintState::Active), None, same.1).is_err());
        assert!(check_sprint_edit(&sprint(SprintState::Active), same.0, Some(date("2026-10-20"))).is_ok());
        assert!(check_sprint_edit(&sprint(SprintState::Closed), same.0, same.1).is_ok());
        assert!(check_sprint_edit(&sprint(SprintState::Closed), same.0, Some(date("2026-10-20"))).is_err());
    }

    #[test]
    fn only_parents_change_sprint_and_closed_sprints_take_nothing() {
        assert!(check_issue_can_change_sprint(IssueType::Story).is_ok());
        assert!(check_issue_can_change_sprint(IssueType::Subtask).is_err());
        assert!(check_issue_can_change_sprint(IssueType::Epic).is_err());
        assert!(check_sprint_open(SprintState::Active).is_ok());
        assert!(check_sprint_open(SprintState::Closed).is_err());
    }

    #[test]
    fn new_subtasks_inherit_the_parent_sprint() {
        assert_eq!(sprint_for_new_issue(IssueType::Subtask, Some(5), None).unwrap(), Some(5));
        assert!(sprint_for_new_issue(IssueType::Subtask, Some(5), Some(6)).is_err());
        assert_eq!(sprint_for_new_issue(IssueType::Story, None, Some(6)).unwrap(), Some(6));
        assert!(sprint_for_new_issue(IssueType::Epic, None, Some(6)).is_err());
        assert_eq!(sprint_for_new_issue(IssueType::Epic, None, None).unwrap(), None);
    }
}
```

Add to `crates/santi-server/tests/common/mod.rs`:

```rust
impl TestApp {
    pub async fn create_sprint(&self, key: &str) -> Value {
        let (status, sprint) = self.post(&format!("/api/projects/{key}/sprints"), json!({})).await;
        assert_eq!(status, StatusCode::CREATED, "{sprint}");
        sprint
    }
}
```

`crates/santi-server/tests/sprints.rs`:

```rust
mod common;

use axum::http::StatusCode;
use common::TestApp;
use serde_json::{Value, json};
use sqlx::PgPool;

async fn scrum(pool: PgPool) -> TestApp {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    ana
}

async fn issue(app: &TestApp, number: i64) -> Value {
    app.get(&format!("/api/projects/SANTI/issues/{number}")).await.1
}

async fn move_to_sprint(app: &TestApp, number: i64, sprint_id: Value) -> (StatusCode, Value) {
    app.post(&format!("/api/projects/SANTI/issues/{number}/move"), json!({ "sprint_id": sprint_id })).await
}

#[sqlx::test]
async fn default_names_count_every_sprint_ever_created(pool: PgPool) {
    let ana = scrum(pool).await;
    ana.create_sprint("SANTI").await;
    let second = ana.create_sprint("SANTI").await;
    ana.delete(&format!("/api/projects/SANTI/sprints/{}", second["id"])).await;

    let next = ana.create_sprint("SANTI").await;
    let (_, sprints) = ana.get("/api/projects/SANTI/sprints").await;

    assert_eq!(next["name"], "Sprint 3");
    assert_eq!(next["state"], "future");
    let names: Vec<&str> = sprints.as_array().unwrap().iter().map(|sprint| sprint["name"].as_str().unwrap()).collect();
    assert_eq!(names, ["Sprint 1", "Sprint 3"]);
}

#[sqlx::test]
async fn custom_name_and_goal(pool: PgPool) {
    let ana = scrum(pool).await;

    let (_, sprint) = ana.post("/api/projects/SANTI/sprints", json!({ "name": "Launch", "goal": "Ship v1" })).await;

    assert_eq!(sprint["name"], "Launch");
    assert_eq!(sprint["goal"], "Ship v1");
    assert_eq!(sprint["overdue"], false);
}

#[sqlx::test]
async fn kanban_projects_have_no_sprints(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("FLOW", "kanban").await;

    let (status, problem) = ana.post("/api/projects/FLOW/sprints", json!({})).await;

    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(problem["type"], "urn:santi:error:kanban-has-no-sprints");
}

#[sqlx::test]
async fn sprint_edits_validate_dates(pool: PgPool) {
    let ana = scrum(pool).await;
    let sprint = ana.create_sprint("SANTI").await;
    let url = format!("/api/projects/SANTI/sprints/{}", sprint["id"]);

    let (_, edited) = ana.put(&url, json!({ "name": "Renamed", "goal": "g", "start_date": "2026-11-01", "end_date": "2026-11-14" })).await;
    let (backwards, problem) = ana.put(&url, json!({ "name": "Renamed", "start_date": "2026-11-14", "end_date": "2026-11-01" })).await;
    let (unknown, _) = ana.put("/api/projects/SANTI/sprints/999999", json!({ "name": "x" })).await;

    assert_eq!(edited["name"], "Renamed");
    assert_eq!(edited["end_date"], "2026-11-14");
    assert_eq!(backwards, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "end_date");
    assert_eq!(unknown, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn issues_move_into_a_sprint_and_back_keeping_rank(pool: PgPool) {
    let ana = scrum(pool).await;
    let sprint = ana.create_sprint("SANTI").await;
    let created = ana.create_issue("SANTI", json!({ "summary": "x" })).await;

    let (_, planned) = move_to_sprint(&ana, 1, sprint["id"].clone()).await;
    let (_, kept) = ana.post("/api/projects/SANTI/issues/1/move", json!({})).await;
    let (_, unplanned) = move_to_sprint(&ana, 1, Value::Null).await;

    assert_eq!(planned["sprint_id"], sprint["id"]);
    assert_eq!(kept["sprint_id"], sprint["id"]);
    assert_eq!(unplanned["sprint_id"], Value::Null);
    assert_eq!(unplanned["rank"], created["rank"]);
}

#[sqlx::test]
async fn deleting_a_future_sprint_returns_its_issues_to_the_backlog(pool: PgPool) {
    let ana = scrum(pool).await;
    let sprint = ana.create_sprint("SANTI").await;
    let created = ana.create_issue("SANTI", json!({ "summary": "x", "sprint_id": sprint["id"] })).await;

    let (status, _) = ana.delete(&format!("/api/projects/SANTI/sprints/{}", sprint["id"])).await;
    let after = issue(&ana, 1).await;

    assert_eq!(created["sprint_id"], sprint["id"]);
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(after["sprint_id"], Value::Null);
    assert_eq!(after["rank"], created["rank"]);
    assert_eq!(ana.delete(&format!("/api/projects/SANTI/sprints/{}", sprint["id"])).await.0, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn subtasks_always_share_their_parent_sprint(pool: PgPool) {
    let ana = scrum(pool).await;
    let sprint = ana.create_sprint("SANTI").await;
    ana.create_issue("SANTI", json!({ "summary": "Story" })).await;
    ana.create_issue("SANTI", json!({ "summary": "Early sub", "issue_type": "subtask", "parent": "SANTI-1" })).await;

    move_to_sprint(&ana, 1, sprint["id"].clone()).await;
    let late = ana.create_issue("SANTI", json!({ "summary": "Late sub", "issue_type": "subtask", "parent": "SANTI-1" })).await;
    let (direct, problem) = move_to_sprint(&ana, 2, Value::Null).await;
    let (explicit, _) = ana.post("/api/projects/SANTI/issues", json!({ "summary": "s", "issue_type": "subtask", "parent": "SANTI-1", "sprint_id": sprint["id"] })).await;

    assert_eq!(issue(&ana, 2).await["sprint_id"], sprint["id"]);
    assert_eq!(late["sprint_id"], sprint["id"]);
    assert_eq!(direct, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "sprint_id");
    assert_eq!(explicit, StatusCode::UNPROCESSABLE_ENTITY);
}

#[sqlx::test]
async fn epics_and_foreign_sprints_are_refused(pool: PgPool) {
    let ana = scrum(pool).await;
    ana.create_project("OTHER", "scrum").await;
    let foreign = ana.create_sprint("OTHER").await;
    ana.create_issue("SANTI", json!({ "summary": "Epic", "issue_type": "epic" })).await;
    ana.create_issue("SANTI", json!({ "summary": "Story" })).await;
    let own = ana.create_sprint("SANTI").await;

    let (epic, _) = move_to_sprint(&ana, 1, own["id"].clone()).await;
    let (other_board, problem) = move_to_sprint(&ana, 2, foreign["id"].clone()).await;
    let (create_foreign, _) = ana.post("/api/projects/SANTI/issues", json!({ "summary": "x", "sprint_id": foreign["id"] })).await;

    assert_eq!(epic, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(other_board, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "sprint_id");
    assert_eq!(create_foreign, StatusCode::UNPROCESSABLE_ENTITY);
}

#[sqlx::test]
async fn sprint_and_rank_change_in_one_move(pool: PgPool) {
    let ana = scrum(pool).await;
    let sprint = ana.create_sprint("SANTI").await;
    ana.create_issue("SANTI", json!({ "summary": "one" })).await;
    ana.create_issue("SANTI", json!({ "summary": "two" })).await;

    let (_, moved) = ana.post("/api/projects/SANTI/issues/2/move", json!({ "sprint_id": sprint["id"], "before": "SANTI-1" })).await;

    assert_eq!(moved["sprint_id"], sprint["id"]);
    assert!(moved["rank"].as_str().unwrap() < issue(&ana, 1).await["rank"].as_str().unwrap());
}

#[sqlx::test]
async fn openapi_lists_sprint_routes(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let (_, api) = app.get("/openapi.json").await;

    assert!(api["paths"]["/api/projects/{key}/sprints"]["post"].is_object());
    assert!(api["paths"]["/api/projects/{key}/sprints/{id}"]["delete"].is_object());
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cargo test -p santi-server --lib sprints && cargo test -p santi-server --test sprints`
Expected: compile errors — unresolved `crate::sprints`, `no method named create_sprint`.

- [ ] **Step 4: Minimal implementation**

`crates/santi-types/src/lib.rs`: add `pub mod sprints;`.

`crates/santi-types/src/sprints.rs`:

```rust
use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[cfg_attr(feature = "sqlx", derive(sqlx::Type), sqlx(type_name = "text", rename_all = "snake_case"))]
#[serde(rename_all = "snake_case")]
pub enum SprintState {
    Future,
    Active,
    Closed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct Sprint {
    pub id: i64,
    pub name: String,
    pub goal: String,
    pub state: SprintState,
    pub start_date: Option<NaiveDate>,
    pub end_date: Option<NaiveDate>,
    pub started_at: Option<DateTime<Utc>>,
    pub closed_at: Option<DateTime<Utc>>,
    /// Active and past its end date; it stays active until completed (D15).
    pub overdue: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, ToSchema)]
pub struct CreateSprint {
    /// Defaults to `Sprint N`, N counting every sprint ever created on the board (D12).
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub goal: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, ToSchema)]
pub struct UpdateSprint {
    pub name: String,
    #[serde(default)]
    pub goal: String,
    #[serde(default)]
    pub start_date: Option<NaiveDate>,
    #[serde(default)]
    pub end_date: Option<NaiveDate>,
}
```

`crates/santi-types/src/issues.rs`: add to `CreateIssue`

```rust
    /// Plan the issue into this sprint; subtasks always take their parent's sprint (D6).
    #[serde(default)]
    pub sprint_id: Option<i64>,
```

and to `MoveIssue`

```rust
    /// Absent keeps the sprint; `null` sends the issue (and its subtasks) to the backlog.
    #[serde(default, deserialize_with = "crate::nullable_field", skip_serializing_if = "Option::is_none")]
    #[schema(value_type = Option<i64>)]
    pub sprint_id: Option<Option<i64>>,
```

`crates/santi-server/src/sprints/domain.rs` (above the tests):

```rust
use chrono::NaiveDate;
use santi_types::issues::IssueType;
use santi_types::projects::BoardType;
use santi_types::sprints::{Sprint, SprintState};

use crate::error::AppError;

/// SP-1: sprints exist only on scrum boards.
pub fn require_scrum(board_type: BoardType) -> Result<(), AppError> {
    if board_type == BoardType::Kanban {
        return Err(AppError::conflict("kanban-has-no-sprints", "Kanban boards have no sprints."));
    }
    Ok(())
}

pub fn check_sprint_name(name: &str) -> Result<String, AppError> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 100 {
        return Err(AppError::invalid("name", "must have 1 to 100 characters"));
    }
    Ok(name.to_string())
}

/// D12: `Sprint N` unless a name is given.
pub fn sprint_name(custom: Option<&str>, number: i64) -> Result<String, AppError> {
    match custom {
        Some(name) => check_sprint_name(name),
        None => Ok(format!("Sprint {number}")),
    }
}

pub fn check_dates(start: Option<NaiveDate>, end: Option<NaiveDate>) -> Result<(), AppError> {
    if let (Some(start), Some(end)) = (start, end)
        && end < start
    {
        return Err(AppError::invalid("end_date", "must be on or after the start date"));
    }
    Ok(())
}

/// SP-11: future sprints edit freely, active ones keep both dates set, closed ones keep their dates.
pub fn check_sprint_edit(current: &Sprint, start: Option<NaiveDate>, end: Option<NaiveDate>) -> Result<(), AppError> {
    check_dates(start, end)?;
    match current.state {
        SprintState::Future => Ok(()),
        SprintState::Active if start.is_none() || end.is_none() => {
            Err(AppError::invalid("end_date", "an active sprint needs a start and an end date"))
        }
        SprintState::Active => Ok(()),
        SprintState::Closed if (start, end) != (current.start_date, current.end_date) => {
            Err(AppError::invalid("start_date", "a closed sprint keeps its dates"))
        }
        SprintState::Closed => Ok(()),
    }
}

/// D6: subtasks follow their parent; D10: epics are not planned into sprints.
pub fn check_issue_can_change_sprint(issue_type: IssueType) -> Result<(), AppError> {
    match issue_type {
        IssueType::Subtask => Err(AppError::invalid("sprint_id", "a subtask always shares its parent's sprint")),
        IssueType::Epic => Err(AppError::invalid("sprint_id", "epics are not planned into sprints")),
        _ => Ok(()),
    }
}

pub fn check_sprint_open(state: SprintState) -> Result<(), AppError> {
    if state == SprintState::Closed {
        return Err(AppError::conflict("sprint-closed", "A closed sprint takes no more issues."));
    }
    Ok(())
}

pub fn sprint_for_new_issue(issue_type: IssueType, parent_sprint: Option<i64>, requested: Option<i64>) -> Result<Option<i64>, AppError> {
    if requested.is_some() {
        check_issue_can_change_sprint(issue_type)?;
    }
    if issue_type == IssueType::Subtask {
        return Ok(parent_sprint);
    }
    Ok(requested)
}
```

`crates/santi-server/src/sprints/repo.rs`:

```rust
use santi_types::sprints::{Sprint, SprintState};
use sqlx::PgConnection;

/// D12: the board counter behind `Sprint N`; never reused.
pub async fn take_sprint_number(conn: &mut PgConnection, board_id: i64) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!(
        r#"UPDATE board SET next_sprint_number = next_sprint_number + 1
           WHERE id = $1 RETURNING next_sprint_number - 1 AS "number!""#,
        board_id
    )
    .fetch_one(&mut *conn)
    .await
}

pub async fn insert_sprint(conn: &mut PgConnection, board_id: i64, name: &str, goal: &str) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!("INSERT INTO sprint (board_id, name, goal) VALUES ($1, $2, $3) RETURNING id", board_id, name, goal)
        .fetch_one(&mut *conn)
        .await
}

pub async fn find_sprint(conn: &mut PgConnection, board_id: i64, sprint_id: i64) -> Result<Option<Sprint>, sqlx::Error> {
    sqlx::query_as!(
        Sprint,
        r#"SELECT id, name, goal, state AS "state: SprintState", start_date, end_date, started_at, closed_at,
                  (state = 'active' AND end_date < current_date) AS "overdue!"
           FROM sprint WHERE board_id = $1 AND id = $2"#,
        board_id,
        sprint_id
    )
    .fetch_optional(&mut *conn)
    .await
}

pub async fn find_sprint_for_update(conn: &mut PgConnection, board_id: i64, sprint_id: i64) -> Result<Option<Sprint>, sqlx::Error> {
    sqlx::query_as!(
        Sprint,
        r#"SELECT id, name, goal, state AS "state: SprintState", start_date, end_date, started_at, closed_at,
                  (state = 'active' AND end_date < current_date) AS "overdue!"
           FROM sprint WHERE board_id = $1 AND id = $2
           FOR UPDATE"#,
        board_id,
        sprint_id
    )
    .fetch_optional(&mut *conn)
    .await
}

pub async fn list_sprints(conn: &mut PgConnection, board_id: i64) -> Result<Vec<Sprint>, sqlx::Error> {
    sqlx::query_as!(
        Sprint,
        r#"SELECT id, name, goal, state AS "state: SprintState", start_date, end_date, started_at, closed_at,
                  (state = 'active' AND end_date < current_date) AS "overdue!"
           FROM sprint WHERE board_id = $1 ORDER BY id"#,
        board_id
    )
    .fetch_all(&mut *conn)
    .await
}

pub async fn update_sprint(conn: &mut PgConnection, sprint_id: i64, name: &str, goal: &str, start_date: Option<chrono::NaiveDate>, end_date: Option<chrono::NaiveDate>) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE sprint SET name = $2, goal = $3, start_date = $4, end_date = $5 WHERE id = $1",
        sprint_id,
        name,
        goal,
        start_date,
        end_date
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// D32: the guard is in the statement; false means nothing was deleted.
pub async fn delete_future_sprint(conn: &mut PgConnection, board_id: i64, sprint_id: i64) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!(
        "DELETE FROM sprint WHERE board_id = $1 AND id = $2 AND state = 'future'",
        board_id,
        sprint_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(result.rows_affected() == 1)
}
```

`crates/santi-server/src/sprints/service.rs`:

```rust
use santi_types::sprints::{CreateSprint, Sprint, UpdateSprint};
use sqlx::PgPool;

use super::{domain, repo};
use crate::error::AppError;
use crate::members::Member;

pub async fn create_sprint(pool: &PgPool, member: &Member, input: CreateSprint) -> Result<Sprint, AppError> {
    domain::require_scrum(member.board_type)?;
    let goal = input.goal.unwrap_or_default();
    let mut tx = pool.begin().await?;
    let number = repo::take_sprint_number(&mut tx, member.board_id).await?;
    let name = domain::sprint_name(input.name.as_deref(), number)?;
    let sprint_id = repo::insert_sprint(&mut tx, member.board_id, &name, goal.trim()).await?;
    tx.commit().await?;
    get_sprint(pool, member, sprint_id).await
}

pub async fn get_sprint(pool: &PgPool, member: &Member, sprint_id: i64) -> Result<Sprint, AppError> {
    let mut conn = pool.acquire().await?;
    repo::find_sprint(&mut conn, member.board_id, sprint_id).await?.ok_or(AppError::NotFound)
}

pub async fn list_sprints(pool: &PgPool, member: &Member) -> Result<Vec<Sprint>, AppError> {
    let mut conn = pool.acquire().await?;
    Ok(repo::list_sprints(&mut conn, member.board_id).await?)
}

pub async fn update_sprint(pool: &PgPool, member: &Member, sprint_id: i64, input: UpdateSprint) -> Result<Sprint, AppError> {
    let name = domain::check_sprint_name(&input.name)?;
    let mut tx = pool.begin().await?;
    let current = repo::find_sprint_for_update(&mut tx, member.board_id, sprint_id).await?;
    let current = current.ok_or(AppError::NotFound)?;
    domain::check_sprint_edit(&current, input.start_date, input.end_date)?;
    repo::update_sprint(&mut tx, sprint_id, &name, input.goal.trim(), input.start_date, input.end_date).await?;
    tx.commit().await?;
    get_sprint(pool, member, sprint_id).await
}

pub async fn delete_sprint(pool: &PgPool, member: &Member, sprint_id: i64) -> Result<(), AppError> {
    let mut conn = pool.acquire().await?;
    if repo::delete_future_sprint(&mut conn, member.board_id, sprint_id).await? {
        return Ok(());
    }
    let exists = repo::find_sprint(&mut conn, member.board_id, sprint_id).await?.is_some();
    if !exists {
        return Err(AppError::NotFound);
    }
    Err(AppError::conflict("sprint-not-future", "Only future sprints can be deleted; complete an active sprint instead."))
}
```

`crates/santi-server/src/sprints/handler.rs` — Task 2 handler pattern:

```rust
pub async fn create_sprint(State(state): State<AppState>, member: Member, JsonBody(input): JsonBody<CreateSprint>) -> Result<(StatusCode, Json<Sprint>), AppError>
pub async fn list_sprints(State(state): State<AppState>, member: Member) -> Result<Json<Vec<Sprint>>, AppError>
pub async fn update_sprint(State(state): State<AppState>, member: Member, PathParams((_key, sprint_id)): PathParams<(String, i64)>, JsonBody(input): JsonBody<UpdateSprint>) -> Result<Json<Sprint>, AppError>
pub async fn delete_sprint(State(state): State<AppState>, member: Member, PathParams((_key, sprint_id)): PathParams<(String, i64)>) -> Result<StatusCode, AppError>

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(create_sprint, list_sprints))
        .routes(routes!(update_sprint, delete_sprint))
}
```

`crates/santi-server/src/issues/repo.rs`, add:

```rust
/// D6: a subtask's sprint always equals its parent's, so both change in one statement.
pub async fn set_sprint(conn: &mut PgConnection, issue_id: i64, sprint_id: Option<i64>) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE issue SET sprint_id = $2 WHERE id = $1 OR (parent_id = $1 AND issue_type = 'subtask')",
        issue_id,
        sprint_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}
```

`crates/santi-server/src/issues/service.rs` (add `use crate::sprints;`):

In `create_issue`, replace `sprint_id: None,` by `sprint_id,` and add, right after `let parent = resolve_parent(…)`:

```rust
    let parent_sprint = parent.as_ref().and_then(|parent| parent.sprint_id);
    let sprint_id = sprints::domain::sprint_for_new_issue(input.issue_type, parent_sprint, input.sprint_id)?;
    if let Some(requested) = input.sprint_id {
        require_open_sprint(&mut tx, member, requested).await?;
    }
```

In `move_issue`, right after `let issue = issue.ok_or(AppError::NotFound)?;`:

```rust
    if let Some(target) = input.sprint_id {
        change_sprint(&mut tx, member, &issue, target).await?;
    }
```

New functions:

```rust
pub async fn change_sprint(conn: &mut PgConnection, member: &Member, issue: &Position, target: Option<i64>) -> Result<(), AppError> {
    sprints::domain::check_issue_can_change_sprint(issue.issue_type)?;
    if let Some(sprint_id) = target {
        require_open_sprint(conn, member, sprint_id).await?;
    }
    repo::set_sprint(conn, issue.id, target).await?;
    Ok(())
}

async fn require_open_sprint(conn: &mut PgConnection, member: &Member, sprint_id: i64) -> Result<(), AppError> {
    let sprint = sprints::repo::find_sprint(conn, member.board_id, sprint_id).await?;
    let sprint = sprint.ok_or_else(|| AppError::invalid("sprint_id", "no such sprint on this board"))?;
    sprints::domain::check_sprint_open(sprint.state)
}
```

`crates/santi-server/src/lib.rs`: add `pub mod sprints;` and `.merge(sprints::handler::router())`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cargo test -p santi-server`
Expected: `test result: ok.` everywhere, 0 failed.

- [ ] **Step 6: Offline data and gate**

Run: `cargo sqlx prepare --workspace`, then the gate. Expected: all clean, coverage above 90%.

- [ ] **Step 7: Commit**

```bash
git add crates/santi-server/migrations/0007_sprints.sql crates/santi-types/src/lib.rs crates/santi-types/src/sprints.rs \
  crates/santi-types/src/issues.rs crates/santi-server/src/lib.rs crates/santi-server/src/sprints \
  crates/santi-server/src/issues/repo.rs crates/santi-server/src/issues/service.rs \
  crates/santi-server/tests/common/mod.rs crates/santi-server/tests/sprints.rs .sqlx
git commit -m "feat: add sprints and planning issues into them"
```

---

### Task 8: Sprint start, completion and scope facts

**Branch:** `feat/SAN-<card>-sprint-lifecycle`

**Files:**
- Create: `crates/santi-server/migrations/0008_sprint_facts.sql`, `crates/santi-server/tests/sprint_lifecycle.rs`
- Modify: `crates/santi-types/src/sprints.rs`, `crates/santi-server/src/sprints/{domain.rs,repo.rs,service.rs,handler.rs}`, `crates/santi-server/src/issues/service.rs`, `.sqlx/`

**Interfaces:**
- Consumes: everything from Task 7; `issues::service::change_sprint`, `create_issue` (Tasks 5–7).
- Produces:
  - `santi_server::sprints::repo::find_active(conn, board_id) -> Result<Option<Sprint>, sqlx::Error>` (Task 9 reads the board's sprint header with it)
  - `santi_server::sprints::repo::{record_join(conn, sprint_id, issue_id) -> Result<(), sqlx::Error>, record_leave(conn, sprint_id, issue_id) -> Result<(), sqlx::Error>}` (no-ops unless the sprint is active)
  - `santi_types::sprints::{StartSprint { start_date: Option<NaiveDate>, end_date: Option<NaiveDate> }, CompleteSprint { open_issues: OpenIssuesDestination }, OpenIssuesDestination::{Backlog, Sprint { sprint_id: i64 }, NewSprint}}` — JSON `{"open_issues": {"to": "backlog"}}`, `{"to": "sprint", "sprint_id": 5}`, `{"to": "new_sprint"}`

Routes:

| Method | Path | Body | Success |
|---|---|---|---|
| POST | `/api/projects/{key}/sprints/{id}/start` | `StartSprint` | 200 `Sprint` (start defaults to today, end to start + 14 days); 409 `sprint-not-future`, `sprint-already-active`, `sprint-empty` (D13) |
| POST | `/api/projects/{key}/sprints/{id}/complete` | `CompleteSprint` | 200 `Sprint` (closed); open issues move together (D13); a subtask follows its parent (SP-17 cut); 409 `sprint-not-active` |

Facts (sprint-lifecycle cut, SP-25/26): `sprint_issue` gets one row per issue in the sprint at start, one per issue added while it runs (`added_after_start`), `removed` when an issue leaves it while active, and `completed` / `not_completed` plus `points_at_close` at close. No read endpoint in E2 (reports are out of v1).

- [ ] **Step 1: Migration and apply it**

`crates/santi-server/migrations/0008_sprint_facts.sql`:

```sql
-- Written while a sprint runs and at close, so later edits never rewrite a closed sprint.
CREATE TABLE sprint_issue (
    sprint_id         bigint NOT NULL REFERENCES sprint (id) ON DELETE CASCADE,
    issue_id          bigint NOT NULL REFERENCES issue (id) ON DELETE CASCADE,
    added_after_start boolean NOT NULL,
    points_at_start   double precision,
    outcome           text CHECK (outcome IN ('completed', 'not_completed', 'removed')),
    points_at_close   double precision,
    PRIMARY KEY (sprint_id, issue_id)
);

CREATE INDEX sprint_issue_issue_idx ON sprint_issue (issue_id);
```

Run: `sqlx migrate run --source crates/santi-server/migrations`
Expected: `Applied 8/migrate sprint facts`.

- [ ] **Step 2: Write the failing tests**

Unit tests appended to the test module of `crates/santi-server/src/sprints/domain.rs`:

```rust
    #[test]
    fn start_window_defaults_to_today_and_two_weeks() {
        let today = date("2026-10-15");
        assert_eq!(start_window(today, None, None).unwrap(), (today, date("2026-10-29")));
        assert_eq!(start_window(today, Some(date("2026-10-20")), None).unwrap(), (date("2026-10-20"), date("2026-11-03")));
        assert!(start_window(today, Some(date("2026-10-20")), Some(date("2026-10-19"))).is_err());
    }

    #[test]
    fn start_guards() {
        let slug = |result: Result<(), AppError>| result.unwrap_err().to_problem().problem_type;
        assert!(check_can_start(SprintState::Future, false, 1).is_ok());
        assert_eq!(slug(check_can_start(SprintState::Active, false, 1)), "urn:santi:error:sprint-not-future");
        assert_eq!(slug(check_can_start(SprintState::Future, true, 1)), "urn:santi:error:sprint-already-active");
        assert_eq!(slug(check_can_start(SprintState::Future, false, 0)), "urn:santi:error:sprint-empty");
    }

    #[test]
    fn only_the_active_sprint_completes() {
        assert!(check_can_complete(SprintState::Active).is_ok());
        assert!(check_can_complete(SprintState::Future).is_err());
        assert!(check_can_complete(SprintState::Closed).is_err());
    }

    #[test]
    fn destination_must_be_another_future_sprint() {
        assert!(check_destination(9, &sprint(SprintState::Future)).is_ok());
        assert!(check_destination(1, &sprint(SprintState::Future)).is_err());
        assert!(check_destination(9, &sprint(SprintState::Closed)).is_err());
    }
```

`crates/santi-server/tests/sprint_lifecycle.rs`:

```rust
mod common;

use axum::http::StatusCode;
use common::TestApp;
use serde_json::{Value, json};
use sqlx::PgPool;

async fn scrum(pool: PgPool) -> TestApp {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    ana
}

async fn sprint_with_issues(app: &TestApp, summaries: &[&str]) -> Value {
    let sprint = app.create_sprint("SANTI").await;
    for summary in summaries {
        app.create_issue("SANTI", json!({ "summary": summary, "sprint_id": sprint["id"] })).await;
    }
    sprint
}

async fn start(app: &TestApp, sprint: &Value, body: Value) -> (StatusCode, Value) {
    app.post(&format!("/api/projects/SANTI/sprints/{}/start", sprint["id"]), body).await
}

async fn complete(app: &TestApp, sprint: &Value, open_issues: Value) -> (StatusCode, Value) {
    app.post(&format!("/api/projects/SANTI/sprints/{}/complete", sprint["id"]), json!({ "open_issues": open_issues })).await
}

async fn move_issue(app: &TestApp, number: i64, body: Value) {
    let (status, moved) = app.post(&format!("/api/projects/SANTI/issues/{number}/move"), body).await;
    assert_eq!(status, StatusCode::OK, "{moved}");
}

async fn sprint_of(app: &TestApp, number: i64) -> Value {
    app.get(&format!("/api/projects/SANTI/issues/{number}")).await.1["sprint_id"].clone()
}

#[sqlx::test]
async fn start_defaults_to_today_and_two_weeks(pool: PgPool) {
    let ana = scrum(pool).await;
    let sprint = sprint_with_issues(&ana, &["x"]).await;
    let today = chrono::Utc::now().date_naive();

    let (status, started) = start(&ana, &sprint, json!({})).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(started["state"], "active");
    assert_eq!(started["start_date"], today.to_string());
    assert_eq!(started["end_date"], (today + chrono::Days::new(14)).to_string());
    assert!(started["started_at"].is_string());
}

#[sqlx::test]
async fn start_guards_are_enforced(pool: PgPool) {
    let ana = scrum(pool).await;
    let empty = ana.create_sprint("SANTI").await;
    let first = sprint_with_issues(&ana, &["a"]).await;
    let second = sprint_with_issues(&ana, &["b"]).await;

    let (_, empty_problem) = start(&ana, &empty, json!({})).await;
    let (backwards, _) = start(&ana, &first, json!({ "start_date": "2026-11-10", "end_date": "2026-11-01" })).await;
    start(&ana, &first, json!({})).await;
    let (_, again) = start(&ana, &first, json!({})).await;
    let (_, second_active) = start(&ana, &second, json!({})).await;
    let (unknown, _) = ana.post("/api/projects/SANTI/sprints/999999/start", json!({})).await;

    assert_eq!(empty_problem["type"], "urn:santi:error:sprint-empty");
    assert_eq!(backwards, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(again["type"], "urn:santi:error:sprint-not-future");
    assert_eq!(second_active["type"], "urn:santi:error:sprint-already-active");
    assert_eq!(unknown, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn an_overdue_sprint_stays_active_and_is_flagged(pool: PgPool) {
    let ana = scrum(pool).await;
    let sprint = sprint_with_issues(&ana, &["x"]).await;

    let (_, started) = start(&ana, &sprint, json!({ "start_date": "2026-01-01", "end_date": "2026-01-15" })).await;

    assert_eq!(started["state"], "active");
    assert_eq!(started["overdue"], true);
}

#[sqlx::test]
async fn completing_sends_open_issues_to_the_backlog(pool: PgPool) {
    let ana = scrum(pool).await;
    let sprint = sprint_with_issues(&ana, &["done", "open"]).await;
    let done = ana.status_id("SANTI", "Done").await;
    move_issue(&ana, 1, json!({ "status_id": done })).await;
    start(&ana, &sprint, json!({})).await;

    let (status, closed) = complete(&ana, &sprint, json!({ "to": "backlog" })).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(closed["state"], "closed");
    assert!(closed["closed_at"].is_string());
    assert_eq!(sprint_of(&ana, 1).await, sprint["id"]);
    assert_eq!(sprint_of(&ana, 2).await, Value::Null);
}

#[sqlx::test]
async fn completing_into_a_future_or_a_new_sprint(pool: PgPool) {
    let ana = scrum(pool).await;
    let first = sprint_with_issues(&ana, &["a"]).await;
    let next = ana.create_sprint("SANTI").await;
    start(&ana, &first, json!({})).await;

    complete(&ana, &first, json!({ "to": "sprint", "sprint_id": next["id"] })).await;
    start(&ana, &next, json!({})).await;
    let (_, closed) = complete(&ana, &next, json!({ "to": "new_sprint" })).await;
    let (_, sprints) = ana.get("/api/projects/SANTI/sprints").await;

    assert_eq!(closed["state"], "closed");
    let newest = sprints.as_array().unwrap().last().unwrap().clone();
    assert_eq!(newest["name"], "Sprint 3");
    assert_eq!(newest["state"], "future");
    assert_eq!(sprint_of(&ana, 1).await, newest["id"]);
}

#[sqlx::test]
async fn completion_guards(pool: PgPool) {
    let ana = scrum(pool).await;
    let active = sprint_with_issues(&ana, &["a"]).await;
    let future = ana.create_sprint("SANTI").await;
    start(&ana, &active, json!({})).await;

    let (itself, _) = complete(&ana, &active, json!({ "to": "sprint", "sprint_id": active["id"] })).await;
    let (unknown_target, _) = complete(&ana, &active, json!({ "to": "sprint", "sprint_id": 999999 })).await;
    let (_, not_active) = complete(&ana, &future, json!({ "to": "backlog" })).await;
    let (bad_body, _) = complete(&ana, &active, json!({ "to": "somewhere" })).await;

    assert_eq!(itself, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(unknown_target, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(not_active["type"], "urn:santi:error:sprint-not-active");
    assert_eq!(bad_body, StatusCode::BAD_REQUEST);
}

#[sqlx::test]
async fn subtasks_follow_their_parent_at_completion(pool: PgPool) {
    let ana = scrum(pool).await;
    let sprint = sprint_with_issues(&ana, &["open parent", "done parent"]).await;
    ana.create_issue("SANTI", json!({ "summary": "done child", "issue_type": "subtask", "parent": "SANTI-1" })).await;
    ana.create_issue("SANTI", json!({ "summary": "open child", "issue_type": "subtask", "parent": "SANTI-2" })).await;
    let done = ana.status_id("SANTI", "Done").await;
    move_issue(&ana, 2, json!({ "status_id": done })).await;
    move_issue(&ana, 3, json!({ "status_id": done })).await;
    start(&ana, &sprint, json!({})).await;

    complete(&ana, &sprint, json!({ "to": "backlog" })).await;

    assert_eq!(sprint_of(&ana, 1).await, Value::Null);
    assert_eq!(sprint_of(&ana, 3).await, Value::Null);
    assert_eq!(sprint_of(&ana, 2).await, sprint["id"]);
    assert_eq!(sprint_of(&ana, 4).await, sprint["id"]);
}

#[sqlx::test]
async fn scope_facts_are_recorded(pool: PgPool) {
    let ana = scrum(pool.clone()).await;
    let sprint = ana.create_sprint("SANTI").await;
    ana.create_issue("SANTI", json!({ "summary": "planned", "points": 3, "sprint_id": sprint["id"] })).await;
    ana.create_issue("SANTI", json!({ "summary": "dropped", "sprint_id": sprint["id"] })).await;
    start(&ana, &sprint, json!({})).await;
    ana.create_issue("SANTI", json!({ "summary": "added", "sprint_id": sprint["id"] })).await;
    move_issue(&ana, 2, json!({ "sprint_id": null })).await;
    let done = ana.status_id("SANTI", "Done").await;
    move_issue(&ana, 1, json!({ "status_id": done })).await;

    complete(&ana, &sprint, json!({ "to": "backlog" })).await;

    let facts: Vec<(i64, bool, Option<f64>, Option<String>, Option<f64>)> = sqlx::query_as(
        "SELECT i.number, si.added_after_start, si.points_at_start, si.outcome, si.points_at_close
         FROM sprint_issue si JOIN issue i ON i.id = si.issue_id ORDER BY i.number",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(facts, [
        (1, false, Some(3.0), Some("completed".to_string()), Some(3.0)),
        (2, false, None, Some("removed".to_string()), None),
        (3, true, None, Some("not_completed".to_string()), None),
    ]);
}

#[sqlx::test]
async fn closed_and_active_sprints_are_protected(pool: PgPool) {
    let ana = scrum(pool).await;
    let sprint = sprint_with_issues(&ana, &["a"]).await;
    ana.create_issue("SANTI", json!({ "summary": "late" })).await;
    let url = format!("/api/projects/SANTI/sprints/{}", sprint["id"]);
    let (_, started) = start(&ana, &sprint, json!({})).await;

    let (_, active_delete) = ana.delete(&url).await;
    complete(&ana, &sprint, json!({ "to": "backlog" })).await;
    let (closed_dates, _) = ana.put(&url, json!({ "name": "x", "start_date": "2026-01-01", "end_date": "2026-01-02" })).await;
    let (_, renamed) = ana.put(&url, json!({ "name": "Renamed", "start_date": started["start_date"], "end_date": started["end_date"] })).await;
    let (into_closed, problem) = ana.post("/api/projects/SANTI/issues/2/move", json!({ "sprint_id": sprint["id"] })).await;

    assert_eq!(active_delete["type"], "urn:santi:error:sprint-not-future");
    assert_eq!(closed_dates, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(renamed["name"], "Renamed");
    assert_eq!(into_closed, StatusCode::CONFLICT);
    assert_eq!(problem["type"], "urn:santi:error:sprint-closed");
}

#[sqlx::test]
async fn openapi_lists_lifecycle_routes(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let (_, api) = app.get("/openapi.json").await;

    assert!(api["paths"]["/api/projects/{key}/sprints/{id}/start"]["post"].is_object());
    assert!(api["paths"]["/api/projects/{key}/sprints/{id}/complete"]["post"].is_object());
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cargo test -p santi-server --lib sprints && cargo test -p santi-server --test sprint_lifecycle`
Expected: compile errors — `cannot find function start_window`; once compiled, the HTTP tests fail with 405 on `/start`.

- [ ] **Step 4: Minimal implementation**

`crates/santi-types/src/sprints.rs`, add:

```rust
#[derive(Debug, Clone, Default, Serialize, Deserialize, ToSchema)]
pub struct StartSprint {
    /// Defaults to today.
    #[serde(default)]
    pub start_date: Option<NaiveDate>,
    /// Defaults to two weeks after the start (D12).
    #[serde(default)]
    pub end_date: Option<NaiveDate>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct CompleteSprint {
    pub open_issues: OpenIssuesDestination,
}

/// Where every unfinished issue goes when the sprint closes (D13).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(tag = "to", rename_all = "snake_case")]
pub enum OpenIssuesDestination {
    Backlog,
    Sprint { sprint_id: i64 },
    NewSprint,
}
```

`crates/santi-server/src/sprints/domain.rs`, add:

```rust
use chrono::Days;

pub const DEFAULT_SPRINT_DAYS: u64 = 14;

pub fn start_window(today: NaiveDate, start: Option<NaiveDate>, end: Option<NaiveDate>) -> Result<(NaiveDate, NaiveDate), AppError> {
    let start = start.unwrap_or(today);
    let end = end.unwrap_or(start + Days::new(DEFAULT_SPRINT_DAYS));
    check_dates(Some(start), Some(end))?;
    Ok((start, end))
}

/// D13 and SP-9: one active sprint per board, and never an empty one.
pub fn check_can_start(state: SprintState, another_is_active: bool, issue_count: i64) -> Result<(), AppError> {
    if state != SprintState::Future {
        return Err(AppError::conflict("sprint-not-future", "Only a future sprint can start."));
    }
    if another_is_active {
        return Err(AppError::conflict("sprint-already-active", "Complete the active sprint before starting another."));
    }
    if issue_count == 0 {
        return Err(AppError::conflict("sprint-empty", "Add at least one issue before starting the sprint."));
    }
    Ok(())
}

pub fn check_can_complete(state: SprintState) -> Result<(), AppError> {
    if state != SprintState::Active {
        return Err(AppError::conflict("sprint-not-active", "Only the active sprint can be completed."));
    }
    Ok(())
}

pub fn check_destination(closing_sprint_id: i64, target: &Sprint) -> Result<(), AppError> {
    if target.id == closing_sprint_id || target.state != SprintState::Future {
        return Err(AppError::invalid("open_issues", "pick a future sprint of this board"));
    }
    Ok(())
}
```

`crates/santi-server/src/sprints/repo.rs`, add:

```rust
pub async fn find_active(conn: &mut PgConnection, board_id: i64) -> Result<Option<Sprint>, sqlx::Error> {
    sqlx::query_as!(
        Sprint,
        r#"SELECT id, name, goal, state AS "state: SprintState", start_date, end_date, started_at, closed_at,
                  (state = 'active' AND end_date < current_date) AS "overdue!"
           FROM sprint WHERE board_id = $1 AND state = 'active'"#,
        board_id
    )
    .fetch_optional(&mut *conn)
    .await
}

pub async fn count_issues(conn: &mut PgConnection, sprint_id: i64) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!(r#"SELECT count(*) AS "count!" FROM issue WHERE sprint_id = $1"#, sprint_id)
        .fetch_one(&mut *conn)
        .await
}

pub async fn mark_started(conn: &mut PgConnection, sprint_id: i64, start_date: chrono::NaiveDate, end_date: chrono::NaiveDate) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE sprint SET state = 'active', start_date = $2, end_date = $3, started_at = now() WHERE id = $1",
        sprint_id,
        start_date,
        end_date
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// The scope at start: every issue in the sprint, with its points.
pub async fn snapshot_scope(conn: &mut PgConnection, sprint_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "INSERT INTO sprint_issue (sprint_id, issue_id, added_after_start, points_at_start)
         SELECT $1, id, false, points FROM issue WHERE sprint_id = $1",
        sprint_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// An issue (and its subtasks) that joined the sprint after it started; no-op unless the sprint is active.
pub async fn record_join(conn: &mut PgConnection, sprint_id: i64, issue_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "INSERT INTO sprint_issue (sprint_id, issue_id, added_after_start, points_at_start)
         SELECT s.id, i.id, true, i.points
         FROM sprint s JOIN issue i ON i.sprint_id = s.id
         WHERE s.id = $1 AND s.state = 'active'
           AND (i.id = $2 OR (i.parent_id = $2 AND i.issue_type = 'subtask'))
         ON CONFLICT (sprint_id, issue_id) DO UPDATE SET outcome = NULL",
        sprint_id,
        issue_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// An issue (and its subtasks) that left the sprint while it ran; no-op unless the sprint is active.
pub async fn record_leave(conn: &mut PgConnection, sprint_id: i64, issue_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE sprint_issue si SET outcome = 'removed'
         FROM sprint s, issue i
         WHERE si.sprint_id = $1 AND s.id = $1 AND s.state = 'active'
           AND si.issue_id = i.id
           AND (i.id = $2 OR (i.parent_id = $2 AND i.issue_type = 'subtask'))",
        sprint_id,
        issue_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// Outcome per issue still in the sprint; a subtask takes its parent's outcome (SP-17 cut).
pub async fn record_outcomes(conn: &mut PgConnection, sprint_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE sprint_issue si
         SET outcome = CASE WHEN owner_status.category = 'done' THEN 'completed' ELSE 'not_completed' END,
             points_at_close = i.points
         FROM issue i
         JOIN issue owner ON owner.id = CASE WHEN i.issue_type = 'subtask' THEN i.parent_id ELSE i.id END
         JOIN status owner_status ON owner_status.id = owner.status_id
         WHERE si.sprint_id = $1 AND si.issue_id = i.id AND i.sprint_id = $1",
        sprint_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// D13: one statement moves every unfinished issue; subtasks go wherever their parent goes.
pub async fn move_open_issues(conn: &mut PgConnection, sprint_id: i64, destination: Option<i64>) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE issue i SET sprint_id = $2
         FROM issue owner JOIN status owner_status ON owner_status.id = owner.status_id
         WHERE i.sprint_id = $1
           AND owner.id = CASE WHEN i.issue_type = 'subtask' THEN i.parent_id ELSE i.id END
           AND owner_status.category <> 'done'",
        sprint_id,
        destination
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

pub async fn mark_closed(conn: &mut PgConnection, sprint_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query!("UPDATE sprint SET state = 'closed', closed_at = now() WHERE id = $1", sprint_id)
        .execute(&mut *conn)
        .await?;
    Ok(())
}
```

`crates/santi-server/src/sprints/service.rs`, add (plus imports `chrono::Utc`, `sqlx::PgConnection`, `santi_types::sprints::{CompleteSprint, OpenIssuesDestination, StartSprint}`):

```rust
pub async fn start_sprint(pool: &PgPool, member: &Member, sprint_id: i64, input: StartSprint) -> Result<Sprint, AppError> {
    let (start_date, end_date) = domain::start_window(Utc::now().date_naive(), input.start_date, input.end_date)?;
    let mut tx = pool.begin().await?;
    let sprint = repo::find_sprint_for_update(&mut tx, member.board_id, sprint_id).await?.ok_or(AppError::NotFound)?;
    let active = repo::find_active(&mut tx, member.board_id).await?;
    let issue_count = repo::count_issues(&mut tx, sprint.id).await?;
    domain::check_can_start(sprint.state, active.is_some(), issue_count)?;
    repo::mark_started(&mut tx, sprint.id, start_date, end_date).await?;
    repo::snapshot_scope(&mut tx, sprint.id).await?;
    tx.commit().await?;
    get_sprint(pool, member, sprint_id).await
}

pub async fn complete_sprint(pool: &PgPool, member: &Member, sprint_id: i64, input: CompleteSprint) -> Result<Sprint, AppError> {
    let mut tx = pool.begin().await?;
    let sprint = repo::find_sprint_for_update(&mut tx, member.board_id, sprint_id).await?.ok_or(AppError::NotFound)?;
    domain::check_can_complete(sprint.state)?;
    let destination = resolve_destination(&mut tx, member, &sprint, input.open_issues).await?;
    repo::record_outcomes(&mut tx, sprint.id).await?;
    repo::move_open_issues(&mut tx, sprint.id, destination).await?;
    repo::mark_closed(&mut tx, sprint.id).await?;
    tx.commit().await?;
    get_sprint(pool, member, sprint_id).await
}

/// None means the backlog.
async fn resolve_destination(conn: &mut PgConnection, member: &Member, closing: &Sprint, destination: OpenIssuesDestination) -> Result<Option<i64>, AppError> {
    match destination {
        OpenIssuesDestination::Backlog => Ok(None),
        OpenIssuesDestination::Sprint { sprint_id } => {
            let target = repo::find_sprint(conn, member.board_id, sprint_id).await?;
            let target = target.ok_or_else(|| AppError::invalid("open_issues", "pick a future sprint of this board"))?;
            domain::check_destination(closing.id, &target)?;
            Ok(Some(target.id))
        }
        OpenIssuesDestination::NewSprint => {
            let number = repo::take_sprint_number(conn, member.board_id).await?;
            let name = domain::sprint_name(None, number)?;
            Ok(Some(repo::insert_sprint(conn, member.board_id, &name, "").await?))
        }
    }
}
```

`crates/santi-server/src/sprints/handler.rs`, add two handlers (Task 2 pattern) and extend the router:

```rust
pub async fn start_sprint(State(state): State<AppState>, member: Member, PathParams((_key, sprint_id)): PathParams<(String, i64)>, JsonBody(input): JsonBody<StartSprint>) -> Result<Json<Sprint>, AppError>
pub async fn complete_sprint(State(state): State<AppState>, member: Member, PathParams((_key, sprint_id)): PathParams<(String, i64)>, JsonBody(input): JsonBody<CompleteSprint>) -> Result<Json<Sprint>, AppError>

// in router():
        .routes(routes!(start_sprint))
        .routes(routes!(complete_sprint))
```

`crates/santi-server/src/issues/service.rs` — record scope changes:

`change_sprint` becomes:

```rust
pub async fn change_sprint(conn: &mut PgConnection, member: &Member, issue: &Position, target: Option<i64>) -> Result<(), AppError> {
    sprints::domain::check_issue_can_change_sprint(issue.issue_type)?;
    if let Some(sprint_id) = target {
        require_open_sprint(conn, member, sprint_id).await?;
    }
    repo::set_sprint(conn, issue.id, target).await?;
    if let Some(old_sprint) = issue.sprint_id {
        sprints::repo::record_leave(conn, old_sprint, issue.id).await?;
    }
    if let Some(new_sprint) = target {
        sprints::repo::record_join(conn, new_sprint, issue.id).await?;
    }
    Ok(())
}
```

In `create_issue`, replace `repo::insert_issue(&mut tx, &new_issue).await?;` by:

```rust
    let issue_id = repo::insert_issue(&mut tx, &new_issue).await?;
    if let Some(sprint_id) = new_issue.sprint_id {
        sprints::repo::record_join(&mut tx, sprint_id, issue_id).await?;
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cargo test -p santi-server`
Expected: `test result: ok.` everywhere, 0 failed.

- [ ] **Step 6: Offline data and gate**

Run: `cargo sqlx prepare --workspace`, then the gate. Expected: all clean, coverage above 90%.

- [ ] **Step 7: Commit**

```bash
git add crates/santi-server/migrations/0008_sprint_facts.sql crates/santi-types/src/sprints.rs \
  crates/santi-server/src/sprints crates/santi-server/src/issues/service.rs \
  crates/santi-server/tests/sprint_lifecycle.rs .sqlx
git commit -m "feat: add sprint start and completion with recorded scope facts"
```

---

### Task 9: Board and backlog reads

**Branch:** `feat/SAN-<card>-board-backlog-reads`

**Files:**
- Create: `crates/santi-server/tests/board_view.rs`, `crates/santi-server/tests/backlog.rs`
- Modify: `crates/santi-types/src/boards.rs`, `crates/santi-server/src/boards/{domain.rs,repo.rs,service.rs,handler.rs}`, `crates/santi-server/src/sprints/repo.rs`, `.sqlx/`

No migration: every path below is covered by indexes from Tasks 4–7 (`issue (project_id, rank)` unique, `issue_parent_idx`, `status_column_idx`, `sprint_board_idx`).

**Interfaces:**
- Consumes: `IssueFilter` (Task 6); `sprints::repo::find_active` (Task 8); `boards::repo::list_columns`, `ColumnRow` (Task 4).
- Produces:
  - `santi_types::boards::{Card, BoardColumnView, BoardView, BacklogSection, Backlog, EpicSummary}`
  - `santi_server::boards::domain::{matches_filter(&Card, &IssueFilter) -> bool, build_board_columns(Vec<ColumnRow>, Vec<Card>, &IssueFilter) -> Vec<BoardColumnView>, build_backlog_sections(Vec<Sprint>, Vec<Card>, &IssueFilter) -> Vec<BacklogSection>, require_backlog(BoardType) -> Result<(), AppError>}`
  - `santi_server::sprints::repo::list_open(conn, board_id) -> Result<Vec<Sprint>, sqlx::Error>` (active first, then future by id)

Routes:

| Method | Path | Query | Success |
|---|---|---|---|
| GET | `/api/projects/{key}/board` | `IssueFilter` | 200 `BoardView`: every column left to right; scrum shows the active sprint only (SB-9/10) with its header (SB-11, D15); kanban hides done issues past the window (D33); counts and WIP flags ignore quick filters (D7, KB-15) |
| GET | `/api/projects/{key}/backlog` | `IssueFilter` | 200 `Backlog`: active sprint, future sprints by id, then no-sprint (BL-1); parents only, not done, mapped (BL-2, D6, D10); totals ignore quick filters (D11); epic panel (D10); 409 `kanban-has-no-backlog` (D9) |

Query budget per read: board = 3 (active sprint, columns, cards), backlog = 3 (open sprints, cards, epics); cards always come from one ranked query; quick filters are applied in Rust over that one result so counts and totals stay unfiltered.

- [ ] **Step 1: Write the failing tests**

Unit tests at the bottom of the test module of `crates/santi-server/src/boards/domain.rs`:

```rust
    use santi_types::boards::Card;
    use santi_types::issues::{IssueFilter, IssueType, Priority};
    use santi_types::sprints::{Sprint, SprintState};

    fn card(id: i64, column_id: i64, sprint_id: Option<i64>, points: Option<f64>) -> Card {
        Card {
            id, key: format!("SANTI-{id}"), summary: format!("Card {id}"), issue_type: IssueType::Story,
            priority: Priority::Medium, status_id: 1, column_id, assignee_id: None, points, labels: vec![],
            parent_key: None, sprint_id, open_subtasks: 0, total_subtasks: 0, rank: format!("{id}"),
        }
    }

    fn open_sprint(id: i64) -> Sprint {
        Sprint {
            id, name: format!("Sprint {id}"), goal: String::new(), state: SprintState::Future,
            start_date: None, end_date: None, started_at: None, closed_at: None, overdue: false,
        }
    }

    #[test]
    fn filter_kinds_are_and_ed_and_values_or_ed() {
        let mut bug = card(1, 1, None, None);
        bug.issue_type = IssueType::Bug;
        bug.labels = vec!["ui".into()];
        bug.assignee_id = Some(7);
        bug.parent_key = Some("SANTI-9".into());
        let either = IssueFilter { issue_type: vec![IssueType::Bug, IssueType::Task], ..IssueFilter::default() };
        let narrowed = IssueFilter { label: vec!["docs".into()], ..either.clone() };

        assert!(matches_filter(&bug, &IssueFilter::default()));
        assert!(matches_filter(&bug, &either));
        assert!(!matches_filter(&bug, &narrowed));
        assert!(matches_filter(&bug, &IssueFilter { assignee: vec![7, 8], ..IssueFilter::default() }));
        assert!(!matches_filter(&bug, &IssueFilter { assignee: vec![8], ..IssueFilter::default() }));
        assert!(matches_filter(&bug, &IssueFilter { parent: vec!["SANTI-9".into()], ..IssueFilter::default() }));
        assert!(matches_filter(&bug, &IssueFilter { q: Some(" CARD ".into()), ..IssueFilter::default() }));
        assert!(!matches_filter(&bug, &IssueFilter { q: Some("login".into()), ..IssueFilter::default() }));
    }

    #[test]
    fn board_columns_count_every_card_but_show_filtered_ones() {
        let columns = vec![
            ColumnRow { id: 1, name: "To Do".into(), position: 0, wip_limit: Some(1) },
            ColumnRow { id: 2, name: "Done".into(), position: 1, wip_limit: None },
        ];
        let mut assigned = card(2, 1, None, None);
        assigned.assignee_id = Some(7);
        let cards = vec![card(1, 1, None, None), assigned];
        let mine = IssueFilter { assignee: vec![7], ..IssueFilter::default() };

        let view = build_board_columns(columns, cards, &mine);

        assert_eq!(view[0].issue_count, 2);
        assert!(view[0].over_limit);
        assert_eq!(view[0].cards.len(), 1);
        assert_eq!(view[1].issue_count, 0);
        assert!(!view[1].over_limit);
    }

    #[test]
    fn backlog_sections_follow_sprint_order_with_unfiltered_totals() {
        let cards = vec![card(1, 1, Some(5), Some(3.0)), card(2, 1, Some(5), None), card(3, 1, None, Some(5.0))];
        let only_ui = IssueFilter { label: vec!["ui".into()], ..IssueFilter::default() };

        let sections = build_backlog_sections(vec![open_sprint(5), open_sprint(6)], cards, &only_ui);

        assert_eq!(sections.len(), 3);
        assert_eq!(sections[0].issue_count, 2);
        assert_eq!(sections[0].total_points, 3.0);
        assert!(sections[0].cards.is_empty());
        assert_eq!(sections[1].issue_count, 0);
        assert!(sections[2].sprint.is_none());
        assert_eq!(sections[2].total_points, 5.0);
    }

    #[test]
    fn kanban_boards_have_no_backlog() {
        assert!(require_backlog(BoardType::Scrum).is_ok());
        assert!(require_backlog(BoardType::Kanban).is_err());
    }
```

`crates/santi-server/tests/board_view.rs`:

```rust
mod common;

use axum::http::StatusCode;
use common::TestApp;
use serde_json::{Value, json};
use sqlx::PgPool;

async fn project(pool: PgPool, board_type: &str) -> TestApp {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("SANTI", board_type).await;
    ana
}

fn column_keys(board: &Value, column: usize) -> Vec<String> {
    board["columns"][column]["cards"].as_array().unwrap().iter().map(|card| card["key"].as_str().unwrap().to_string()).collect()
}

#[sqlx::test]
async fn scrum_board_without_an_active_sprint_shows_empty_columns(pool: PgPool) {
    let ana = project(pool, "scrum").await;
    ana.create_issue("SANTI", json!({ "summary": "backlog item" })).await;

    let (status, board) = ana.get("/api/projects/SANTI/board").await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(board["sprint"], Value::Null);
    assert_eq!(board["columns"].as_array().unwrap().len(), 3);
    assert!(column_keys(&board, 0).is_empty());
}

#[sqlx::test]
async fn scrum_board_shows_the_active_sprint_by_status_and_rank(pool: PgPool) {
    let ana = project(pool, "scrum").await;
    let (_, sprint) = ana.post("/api/projects/SANTI/sprints", json!({ "goal": "Ship" })).await;
    let done = ana.status_id("SANTI", "Done").await;
    ana.create_issue("SANTI", json!({ "summary": "first", "sprint_id": sprint["id"] })).await;
    ana.create_issue("SANTI", json!({ "summary": "finished", "sprint_id": sprint["id"], "status_id": done })).await;
    ana.create_issue("SANTI", json!({ "summary": "second", "sprint_id": sprint["id"] })).await;
    ana.create_issue("SANTI", json!({ "summary": "not planned" })).await;
    ana.post(&format!("/api/projects/SANTI/sprints/{}/start", sprint["id"]), json!({})).await;
    ana.post("/api/projects/SANTI/issues/3/move", json!({ "before": "SANTI-1" })).await;

    let (_, board) = ana.get("/api/projects/SANTI/board").await;

    assert_eq!(board["sprint"]["goal"], "Ship");
    assert_eq!(column_keys(&board, 0), ["SANTI-3", "SANTI-1"]);
    assert_eq!(column_keys(&board, 2), ["SANTI-2"]);
}

#[sqlx::test]
async fn unmapped_statuses_and_epics_stay_off_the_board(pool: PgPool) {
    let ana = project(pool, "kanban").await;
    let doing = ana.status_id("SANTI", "In Progress").await;
    ana.create_issue("SANTI", json!({ "summary": "Epic", "issue_type": "epic" })).await;
    ana.create_issue("SANTI", json!({ "summary": "Hidden", "status_id": doing })).await;
    ana.create_issue("SANTI", json!({ "summary": "Visible" })).await;
    ana.put(&format!("/api/projects/SANTI/statuses/{doing}"), json!({ "name": "In Progress" })).await;

    let (_, board) = ana.get("/api/projects/SANTI/board").await;

    assert_eq!(column_keys(&board, 0), ["SANTI-3"]);
    assert!(column_keys(&board, 1).is_empty());
}

#[sqlx::test]
async fn subtasks_are_flat_cards_and_parents_count_them(pool: PgPool) {
    let ana = project(pool, "kanban").await;
    let done = ana.status_id("SANTI", "Done").await;
    ana.create_issue("SANTI", json!({ "summary": "Story" })).await;
    ana.create_issue("SANTI", json!({ "summary": "Open sub", "issue_type": "subtask", "parent": "SANTI-1" })).await;
    ana.create_issue("SANTI", json!({ "summary": "Done sub", "issue_type": "subtask", "parent": "SANTI-1", "status_id": done })).await;

    let (_, board) = ana.get("/api/projects/SANTI/board").await;

    let story = &board["columns"][0]["cards"][0];
    assert_eq!(story["open_subtasks"], 1);
    assert_eq!(story["total_subtasks"], 2);
    assert_eq!(board["columns"][0]["cards"][1]["parent_key"], "SANTI-1");
    assert_eq!(column_keys(&board, 2), ["SANTI-3"]);
}

#[sqlx::test]
async fn kanban_hides_done_issues_past_the_window(pool: PgPool) {
    let ana = project(pool.clone(), "kanban").await;
    let done = ana.status_id("SANTI", "Done").await;
    ana.create_issue("SANTI", json!({ "summary": "old", "status_id": done })).await;
    ana.create_issue("SANTI", json!({ "summary": "recent", "status_id": done })).await;
    sqlx::query("UPDATE issue SET done_at = now() - interval '20 days' WHERE number = 1").execute(&pool).await.unwrap();

    let (_, windowed) = ana.get("/api/projects/SANTI/board").await;
    ana.put("/api/projects/SANTI/board/settings", json!({ "done_window_days": null })).await;
    let (_, never) = ana.get("/api/projects/SANTI/board").await;

    assert_eq!(column_keys(&windowed, 2), ["SANTI-2"]);
    assert_eq!(column_keys(&never, 2), ["SANTI-1", "SANTI-2"]);
}

#[sqlx::test]
async fn wip_counts_ignore_quick_filters(pool: PgPool) {
    let ana = project(pool, "kanban").await;
    let doing_column = ana.column_id("SANTI", "In Progress").await;
    let doing = ana.status_id("SANTI", "In Progress").await;
    ana.put(&format!("/api/projects/SANTI/board/columns/{doing_column}"), json!({ "name": "In Progress", "wip_limit": 1 })).await;
    ana.create_issue("SANTI", json!({ "summary": "mine", "status_id": doing, "assignee_id": ana.user_id })).await;
    ana.create_issue("SANTI", json!({ "summary": "nobody's", "status_id": doing })).await;

    let (_, board) = ana.get(&format!("/api/projects/SANTI/board?assignee={}", ana.user_id)).await;

    let column = &board["columns"][1];
    assert_eq!(column["issue_count"], 2);
    assert_eq!(column["over_limit"], true);
    assert_eq!(column_keys(&board, 1), ["SANTI-1"]);
}

#[sqlx::test]
async fn board_quick_filters_combine(pool: PgPool) {
    let ana = project(pool, "kanban").await;
    ana.create_issue("SANTI", json!({ "summary": "Login bug", "issue_type": "bug", "labels": ["ui"] })).await;
    ana.create_issue("SANTI", json!({ "summary": "Docs task", "issue_type": "task", "labels": ["docs"] })).await;
    ana.create_issue("SANTI", json!({ "summary": "UI story", "labels": ["ui"] })).await;

    let (_, either) = ana.get("/api/projects/SANTI/board?type=bug&type=task").await;
    let (_, narrowed) = ana.get("/api/projects/SANTI/board?type=bug&type=task&label=ui").await;
    let (_, text) = ana.get("/api/projects/SANTI/board?q=login").await;
    let (bad, _) = ana.get("/api/projects/SANTI/board?type=feature").await;

    assert_eq!(column_keys(&either, 0), ["SANTI-1", "SANTI-2"]);
    assert_eq!(column_keys(&narrowed, 0), ["SANTI-1"]);
    assert_eq!(column_keys(&text, 0), ["SANTI-1"]);
    assert_eq!(bad, StatusCode::BAD_REQUEST);
}

#[sqlx::test]
async fn strangers_cannot_read_the_board(pool: PgPool) {
    let ana = project(pool, "kanban").await;
    let bob = ana.another_user("bob@example.com").await;

    assert_eq!(bob.get("/api/projects/SANTI/board").await.0, StatusCode::NOT_FOUND);
    assert_eq!(bob.get("/api/projects/SANTI/backlog").await.0, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn openapi_lists_board_and_backlog(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let (_, api) = app.get("/openapi.json").await;

    assert!(api["paths"]["/api/projects/{key}/board"]["get"].is_object());
    assert!(api["paths"]["/api/projects/{key}/backlog"]["get"].is_object());
}
```

`crates/santi-server/tests/backlog.rs`:

```rust
mod common;

use axum::http::StatusCode;
use common::TestApp;
use serde_json::{Value, json};
use sqlx::PgPool;

fn section_keys(backlog: &Value, section: usize) -> Vec<String> {
    backlog["sections"][section]["cards"].as_array().unwrap().iter().map(|card| card["key"].as_str().unwrap().to_string()).collect()
}

#[sqlx::test]
async fn backlog_lists_active_then_future_sprints_then_the_rest(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    let future = ana.create_sprint("SANTI").await;
    let active = ana.create_sprint("SANTI").await;
    let done = ana.status_id("SANTI", "Done").await;
    ana.create_issue("SANTI", json!({ "summary": "Epic", "issue_type": "epic" })).await;
    ana.create_issue("SANTI", json!({ "summary": "a", "points": 3, "sprint_id": active["id"], "parent": "SANTI-1" })).await;
    ana.create_issue("SANTI", json!({ "summary": "b", "sprint_id": active["id"] })).await;
    ana.create_issue("SANTI", json!({ "summary": "c", "points": 2, "sprint_id": future["id"] })).await;
    ana.create_issue("SANTI", json!({ "summary": "d", "points": 5 })).await;
    ana.create_issue("SANTI", json!({ "summary": "shipped", "status_id": done, "parent": "SANTI-1" })).await;
    ana.create_issue("SANTI", json!({ "summary": "sub", "issue_type": "subtask", "parent": "SANTI-5" })).await;
    ana.post(&format!("/api/projects/SANTI/sprints/{}/start", active["id"]), json!({})).await;

    let (status, backlog) = ana.get("/api/projects/SANTI/backlog").await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(backlog["sections"][0]["sprint"]["id"], active["id"]);
    assert_eq!(section_keys(&backlog, 0), ["SANTI-2", "SANTI-3"]);
    assert_eq!(backlog["sections"][0]["total_points"], 3.0);
    assert_eq!(backlog["sections"][0]["issue_count"], 2);
    assert_eq!(section_keys(&backlog, 1), ["SANTI-4"]);
    assert_eq!(backlog["sections"][2]["sprint"], Value::Null);
    assert_eq!(section_keys(&backlog, 2), ["SANTI-5"]);
    assert_eq!(backlog["sections"][2]["cards"][0]["total_subtasks"], 1);
    let epic = &backlog["epics"][0];
    assert_eq!(epic["key"], "SANTI-1");
    assert_eq!(epic["child_count"], 2);
    assert_eq!(epic["done_child_count"], 1);
    assert_eq!(epic["done"], false);
}

#[sqlx::test]
async fn quick_filters_hide_rows_but_not_totals(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    ana.create_issue("SANTI", json!({ "summary": "story", "points": 5 })).await;
    ana.create_issue("SANTI", json!({ "summary": "bug", "issue_type": "bug", "points": 1 })).await;

    let (_, backlog) = ana.get("/api/projects/SANTI/backlog?type=bug").await;

    assert_eq!(section_keys(&backlog, 0), ["SANTI-2"]);
    assert_eq!(backlog["sections"][0]["total_points"], 6.0);
    assert_eq!(backlog["sections"][0]["issue_count"], 2);
}

#[sqlx::test]
async fn reopened_issue_of_a_closed_sprint_returns_to_the_backlog(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    let sprint = ana.create_sprint("SANTI").await;
    let done = ana.status_id("SANTI", "Done").await;
    let todo = ana.status_id("SANTI", "To Do").await;
    ana.create_issue("SANTI", json!({ "summary": "x", "sprint_id": sprint["id"], "status_id": done })).await;
    ana.post(&format!("/api/projects/SANTI/sprints/{}/start", sprint["id"]), json!({})).await;
    ana.post(&format!("/api/projects/SANTI/sprints/{}/complete", sprint["id"]), json!({ "open_issues": { "to": "backlog" } })).await;
    ana.post("/api/projects/SANTI/issues/1/move", json!({ "status_id": todo })).await;

    let (_, backlog) = ana.get("/api/projects/SANTI/backlog").await;

    assert_eq!(backlog["sections"].as_array().unwrap().len(), 1);
    assert_eq!(section_keys(&backlog, 0), ["SANTI-1"]);
}

#[sqlx::test]
async fn kanban_projects_have_no_backlog(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("FLOW", "kanban").await;

    let (status, problem) = ana.get("/api/projects/FLOW/backlog").await;

    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(problem["type"], "urn:santi:error:kanban-has-no-backlog");
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p santi-server --lib boards && cargo test -p santi-server --test board_view --test backlog`
Expected: compile errors — unresolved `santi_types::boards::Card`, `cannot find function matches_filter`.

- [ ] **Step 3: Minimal implementation**

`crates/santi-types/src/boards.rs`, add (plus `use crate::issues::{IssueType, Priority}; use crate::sprints::Sprint;`):

```rust
/// One issue as the board and the backlog draw it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct Card {
    pub id: i64,
    pub key: String,
    pub summary: String,
    pub issue_type: IssueType,
    pub priority: Priority,
    pub status_id: i64,
    pub column_id: i64,
    pub assignee_id: Option<i64>,
    pub points: Option<f64>,
    pub labels: Vec<String>,
    /// Shown as a chip on subtasks and children of epics (D6).
    pub parent_key: Option<String>,
    pub sprint_id: Option<i64>,
    pub open_subtasks: i64,
    pub total_subtasks: i64,
    pub rank: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct BoardColumnView {
    pub id: i64,
    pub name: String,
    pub wip_limit: Option<i32>,
    /// Every card in the column, quick filters ignored (D7, KB-15).
    pub issue_count: i64,
    pub over_limit: bool,
    /// The cards that pass the quick filters, in rank order.
    pub cards: Vec<Card>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct BoardView {
    pub board_type: BoardType,
    /// The active sprint on a scrum board (SB-11); always null on kanban.
    pub sprint: Option<Sprint>,
    pub columns: Vec<BoardColumnView>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct BacklogSection {
    /// Null for the no-sprint section, which is always last.
    pub sprint: Option<Sprint>,
    /// Quick filters ignored (D11).
    pub issue_count: i64,
    pub total_points: f64,
    pub cards: Vec<Card>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct EpicSummary {
    pub key: String,
    pub summary: String,
    pub child_count: i64,
    pub done_child_count: i64,
    pub done: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct Backlog {
    pub sections: Vec<BacklogSection>,
    pub epics: Vec<EpicSummary>,
}
```

`crates/santi-server/src/boards/domain.rs`, add (plus `use santi_types::boards::{BacklogSection, BoardColumnView, Card}; use santi_types::issues::IssueFilter; use santi_types::sprints::Sprint;`):

```rust
/// D9: the kanban board's first column is its backlog.
pub fn require_backlog(board_type: BoardType) -> Result<(), AppError> {
    if board_type == BoardType::Kanban {
        return Err(AppError::conflict("kanban-has-no-backlog", "Kanban boards have no backlog; the first column is the intake list."));
    }
    Ok(())
}

/// D3: each filter kind matches when empty or when any of its values matches; kinds are AND-ed.
pub fn matches_filter(card: &Card, filter: &IssueFilter) -> bool {
    let assignee_matches = filter.assignee.is_empty() || card.assignee_id.is_some_and(|id| filter.assignee.contains(&id));
    let type_matches = filter.issue_type.is_empty() || filter.issue_type.contains(&card.issue_type);
    let label_matches = filter.label.is_empty() || card.labels.iter().any(|label| filter.label.contains(label));
    let parent_matches = filter.parent.is_empty() || card.parent_key.as_ref().is_some_and(|key| filter.parent.contains(key));
    let text = filter.q.as_deref().map(str::trim).filter(|text| !text.is_empty());
    let text_matches = text.is_none_or(|text| card.summary.to_lowercase().contains(&text.to_lowercase()));
    assignee_matches && type_matches && label_matches && parent_matches && text_matches
}

/// Cards arrive in rank order; each column keeps that order.
pub fn build_board_columns(columns: Vec<ColumnRow>, cards: Vec<Card>, filter: &IssueFilter) -> Vec<BoardColumnView> {
    columns
        .into_iter()
        .map(|column| {
            let in_column: Vec<&Card> = cards.iter().filter(|card| card.column_id == column.id).collect();
            let issue_count = in_column.len() as i64;
            BoardColumnView {
                over_limit: column.wip_limit.is_some_and(|limit| issue_count > i64::from(limit)),
                cards: in_column.into_iter().filter(|card| matches_filter(card, filter)).cloned().collect(),
                id: column.id,
                name: column.name,
                wip_limit: column.wip_limit,
                issue_count,
            }
        })
        .collect()
}

/// BL-1: the given sprints in order, then the no-sprint section.
pub fn build_backlog_sections(sprints: Vec<Sprint>, cards: Vec<Card>, filter: &IssueFilter) -> Vec<BacklogSection> {
    let mut sections: Vec<BacklogSection> = sprints.into_iter().map(|sprint| backlog_section(Some(sprint), &cards, filter)).collect();
    sections.push(backlog_section(None, &cards, filter));
    sections
}

fn backlog_section(sprint: Option<Sprint>, cards: &[Card], filter: &IssueFilter) -> BacklogSection {
    let sprint_id = sprint.as_ref().map(|sprint| sprint.id);
    let in_section: Vec<&Card> = cards.iter().filter(|card| card.sprint_id == sprint_id).collect();
    BacklogSection {
        issue_count: in_section.len() as i64,
        total_points: in_section.iter().filter_map(|card| card.points).sum(),
        cards: in_section.into_iter().filter(|card| matches_filter(card, filter)).cloned().collect(),
        sprint,
    }
}
```

`crates/santi-server/src/boards/repo.rs`, add (plus `use santi_types::boards::{Card, EpicSummary}; use santi_types::issues::{IssueType, Priority};`):

```rust
/// Every card the board can show, in rank order — one query (SB-9, D30, D10, D33).
pub async fn board_cards(conn: &mut PgConnection, project_id: i64, active_sprint_id: Option<i64>) -> Result<Vec<Card>, sqlx::Error> {
    sqlx::query_as!(
        Card,
        r#"SELECT i.id, p.key || '-' || i.number AS "key!", i.summary,
                  i.issue_type AS "issue_type: IssueType", i.priority AS "priority: Priority",
                  i.status_id, s.column_id AS "column_id!", i.assignee_id, i.points, i.labels,
                  p.key || '-' || parent.number AS parent_key, i.sprint_id,
                  sub.open_count AS "open_subtasks!", sub.total_count AS "total_subtasks!", i.rank
           FROM issue i
           JOIN project p ON p.id = i.project_id
           JOIN board b ON b.project_id = p.id
           JOIN status s ON s.id = i.status_id AND s.column_id IS NOT NULL
           LEFT JOIN issue parent ON parent.id = i.parent_id
           CROSS JOIN LATERAL (
               SELECT count(*) AS total_count, count(*) FILTER (WHERE child_status.category <> 'done') AS open_count
               FROM issue child JOIN status child_status ON child_status.id = child.status_id
               WHERE child.parent_id = i.id AND child.issue_type = 'subtask'
           ) sub
           WHERE i.project_id = $1
             AND i.issue_type <> 'epic'
             AND (b.board_type = 'kanban' OR i.sprint_id = $2)
             AND (b.board_type = 'scrum' OR i.done_at IS NULL OR b.done_window_days IS NULL
                  OR i.done_at > now() - make_interval(days => b.done_window_days))
           ORDER BY i.rank"#,
        project_id,
        active_sprint_id
    )
    .fetch_all(&mut *conn)
    .await
}

/// Open parent rows for the backlog, in rank order — one query (BL-2, D6, D10).
/// An issue left in a closed sprint (reopened after close) shows in the no-sprint section.
pub async fn backlog_cards(conn: &mut PgConnection, project_id: i64) -> Result<Vec<Card>, sqlx::Error> {
    sqlx::query_as!(
        Card,
        r#"SELECT i.id, p.key || '-' || i.number AS "key!", i.summary,
                  i.issue_type AS "issue_type: IssueType", i.priority AS "priority: Priority",
                  i.status_id, s.column_id AS "column_id!", i.assignee_id, i.points, i.labels,
                  p.key || '-' || parent.number AS parent_key,
                  CASE WHEN sprint.state = 'closed' THEN NULL ELSE i.sprint_id END AS sprint_id,
                  sub.open_count AS "open_subtasks!", sub.total_count AS "total_subtasks!", i.rank
           FROM issue i
           JOIN project p ON p.id = i.project_id
           JOIN status s ON s.id = i.status_id AND s.column_id IS NOT NULL
           LEFT JOIN sprint ON sprint.id = i.sprint_id
           LEFT JOIN issue parent ON parent.id = i.parent_id
           CROSS JOIN LATERAL (
               SELECT count(*) AS total_count, count(*) FILTER (WHERE child_status.category <> 'done') AS open_count
               FROM issue child JOIN status child_status ON child_status.id = child.status_id
               WHERE child.parent_id = i.id AND child.issue_type = 'subtask'
           ) sub
           WHERE i.project_id = $1
             AND i.issue_type NOT IN ('epic', 'subtask')
             AND s.category <> 'done'
           ORDER BY i.rank"#,
        project_id
    )
    .fetch_all(&mut *conn)
    .await
}

/// D10: the epic panel in one aggregate query.
pub async fn epic_summaries(conn: &mut PgConnection, project_id: i64) -> Result<Vec<EpicSummary>, sqlx::Error> {
    sqlx::query_as!(
        EpicSummary,
        r#"SELECT p.key || '-' || epic.number AS "key!", epic.summary,
                  count(child.id) AS "child_count!",
                  count(child.id) FILTER (WHERE child_status.category = 'done') AS "done_child_count!",
                  (epic_status.category = 'done') AS "done!"
           FROM issue epic
           JOIN project p ON p.id = epic.project_id
           JOIN status epic_status ON epic_status.id = epic.status_id
           LEFT JOIN issue child ON child.parent_id = epic.id
           LEFT JOIN status child_status ON child_status.id = child.status_id
           WHERE epic.project_id = $1 AND epic.issue_type = 'epic'
           GROUP BY epic.id, p.key, epic_status.category
           ORDER BY epic.rank"#,
        project_id
    )
    .fetch_all(&mut *conn)
    .await
}
```

`crates/santi-server/src/sprints/repo.rs`, add:

```rust
/// BL-1: the active sprint first, then future sprints in creation order.
pub async fn list_open(conn: &mut PgConnection, board_id: i64) -> Result<Vec<Sprint>, sqlx::Error> {
    sqlx::query_as!(
        Sprint,
        r#"SELECT id, name, goal, state AS "state: SprintState", start_date, end_date, started_at, closed_at,
                  (state = 'active' AND end_date < current_date) AS "overdue!"
           FROM sprint WHERE board_id = $1 AND state <> 'closed'
           ORDER BY state = 'future', id"#,
        board_id
    )
    .fetch_all(&mut *conn)
    .await
}
```

`crates/santi-server/src/boards/service.rs`, add (plus `use santi_types::boards::{Backlog, BoardView}; use santi_types::issues::IssueFilter; use crate::sprints;`):

```rust
pub async fn board_view(pool: &PgPool, member: &Member, filter: IssueFilter) -> Result<BoardView, AppError> {
    let mut conn = pool.acquire().await?;
    let sprint = sprints::repo::find_active(&mut conn, member.board_id).await?;
    let columns = repo::list_columns(&mut conn, member.board_id).await?;
    let cards = repo::board_cards(&mut conn, member.project_id, sprint.as_ref().map(|sprint| sprint.id)).await?;
    Ok(BoardView { board_type: member.board_type, sprint, columns: domain::build_board_columns(columns, cards, &filter) })
}

pub async fn backlog(pool: &PgPool, member: &Member, filter: IssueFilter) -> Result<Backlog, AppError> {
    domain::require_backlog(member.board_type)?;
    let mut conn = pool.acquire().await?;
    let sprints = sprints::repo::list_open(&mut conn, member.board_id).await?;
    let cards = repo::backlog_cards(&mut conn, member.project_id).await?;
    let epics = repo::epic_summaries(&mut conn, member.project_id).await?;
    Ok(Backlog { sections: domain::build_backlog_sections(sprints, cards, &filter), epics })
}
```

`crates/santi-server/src/boards/handler.rs`, add two handlers (Task 2 pattern, `params(("key" = String, Path), IssueFilter)`) and extend the router:

```rust
pub async fn board_view(State(state): State<AppState>, member: Member, QueryParams(filter): QueryParams<IssueFilter>) -> Result<Json<BoardView>, AppError>
pub async fn backlog(State(state): State<AppState>, member: Member, QueryParams(filter): QueryParams<IssueFilter>) -> Result<Json<Backlog>, AppError>

// in router():
        .routes(routes!(board_view))
        .routes(routes!(backlog))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test -p santi-server`
Expected: `test result: ok.` everywhere, 0 failed.

- [ ] **Step 5: Offline data and gate**

Run: `cargo sqlx prepare --workspace`, then the gate. Expected: all clean, coverage above 90%.
Run: `cargo run -p santi-server`, open `http://127.0.0.1:8080/docs/` — expected: every route of Tasks 1–9 listed, schemas for `Problem`, `BoardView`, `Backlog`.

- [ ] **Step 6: Commit**

```bash
git add crates/santi-types/src/boards.rs crates/santi-server/src/boards crates/santi-server/src/sprints/repo.rs \
  crates/santi-server/tests/board_view.rs crates/santi-server/tests/backlog.rs .sqlx
git commit -m "feat: add board and backlog views with quick filters"
```

---

## Coverage of the binding inputs

| Requirement | Task |
|---|---|
| PostgreSQL compose on 5440 / OrbStack, embedded migrations at startup, CI Postgres + `sqlx prepare --check` (D27) | 1 |
| problem+json (D24), OpenAPI at `/docs` (utoipa), gzip/br compression (D34) | 1 |
| Register/login/logout, DB sessions + HttpOnly cookie, API tokens, one extractor for cookie or Bearer, same-origin writes (D22, D23) | 2 |
| Projects, members, invite links, membership extractor, 404 for strangers, admin checks (D28, D31) | 3 |
| Default columns (SB-1), status mapping and unmapped pool (D30), strict done column (D2), column delete by status remap (D16), WIP limit warn-only (D7), done window setting (D8) | 4 |
| Issues, `KEY-N` counter (D20), fractional rank (D21), inline-create defaults (D5), subtask rules and no points (D6, D11), parent rules, `done_at` (D8) | 5 |
| Moves next to one anchor (D4), done timer on status change (D8), keyset search with quick filters (D3, D29), comments | 6 |
| Sprints, `Sprint N` counter (D12), creation order (D13), future-only delete with `ON DELETE SET NULL` (D14, D32), subtasks share the parent's sprint (D6) | 7 |
| Start guards and defaults (D12, D13), completion destinations (D13, SP-18), subtask follows parent (SP-17 cut), overdue stays active (D15), scope facts (SP-25/26 cut) | 8 |
| Board and backlog reads in one card query each, URL filters (D3, D18), done hiding (D33), unpaged (D29), epic panel (D10), totals (D11), kanban has no backlog (D9), no real-time push (D17) | 9 |
