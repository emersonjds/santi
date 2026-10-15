# E0 Open-source foundation — implementation plan

> For agentic workers: execute task by task, one agent at a time. Steps use checkbox (`- [ ]`) syntax.

**Goal:** a buildable, CI-guarded Cargo workspace plus the project's agents, REA registration and community files, so E1 and E2 can start on solid ground.

**Architecture:** workspace with `santi-types`, `santi-server` and `santi-cli` (the `santi-web` crate arrives in E4). The server exposes only `GET /health`; the CLI only `--version`. CI enforces fmt, clippy and coverage from the first commit.

**Tech stack:** Rust 1.97 (edition 2024), axum 0.8, tokio 1.53, serde 1, clap 4.6, GitHub Actions, cargo-llvm-cov.

## Global constraints

- Spec: `docs/specs/2026-10-15-santi-v1-design.md`.
- License `MIT OR Apache-2.0` on every crate.
- Coverage > 90% for lines, regions and functions (stable) and branches (nightly).
- `main.rs` files contain wiring only and are excluded from coverage (`--ignore-filename-regex 'main\.rs$'`).
- No `unsafe` code (`unsafe_code = "forbid"`).
- Conventional Commits in English, author `Emerson Silva <emerson_jdss@hotmail.com>`, no tool or AI trailers.
- Work branches come out of `developer`.
- PostgreSQL / `compose.yaml` moves to E2, its first consumer.

---

### Task 1: Cargo workspace with health endpoint and CLI version

**Branch:** `chore/<card>-workspace-skeleton`

**Files:**
- Create: `Cargo.toml`
- Create: `crates/santi-types/Cargo.toml`, `crates/santi-types/src/lib.rs`
- Create: `crates/santi-server/Cargo.toml`, `crates/santi-server/src/lib.rs`, `crates/santi-server/src/main.rs`, `crates/santi-server/tests/health.rs`
- Create: `crates/santi-cli/Cargo.toml`, `crates/santi-cli/src/lib.rs`, `crates/santi-cli/src/main.rs`, `crates/santi-cli/tests/cli.rs`

**Interfaces:**
- Produces: `santi_types::Health { status: String, version: String }`;
  `santi_server::app() -> axum::Router`;
  `santi_cli::Cli` (clap `Parser`, binary name `santi`).

- [ ] **Step 1: Workspace manifests**

`Cargo.toml`:

```toml
[workspace]
resolver = "3"
members = ["crates/santi-types", "crates/santi-server", "crates/santi-cli"]

[workspace.package]
version = "0.1.0"
edition = "2024"
rust-version = "1.97"
license = "MIT OR Apache-2.0"
repository = "https://github.com/emersonjds/santi"

[workspace.dependencies]
santi-types = { path = "crates/santi-types" }
axum = "0.8.9"
tokio = { version = "1.53", features = ["macros", "rt-multi-thread", "net"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
clap = { version = "4.6", features = ["derive"] }
tower = { version = "0.5", features = ["util"] }
http-body-util = "0.1"

[workspace.lints.rust]
unsafe_code = "forbid"
unexpected_cfgs = { level = "warn", check-cfg = ["cfg(coverage,coverage_nightly)"] }
```

`crates/santi-types/Cargo.toml`:

```toml
[package]
name = "santi-types"
version.workspace = true
edition.workspace = true
rust-version.workspace = true
license.workspace = true
repository.workspace = true

[dependencies]
serde.workspace = true

[dev-dependencies]
serde_json.workspace = true

[lints]
workspace = true
```

`crates/santi-server/Cargo.toml`:

```toml
[package]
name = "santi-server"
version.workspace = true
edition.workspace = true
rust-version.workspace = true
license.workspace = true
repository.workspace = true

[dependencies]
santi-types.workspace = true
axum.workspace = true
tokio.workspace = true

[dev-dependencies]
tower.workspace = true
http-body-util.workspace = true
serde_json.workspace = true

[lints]
workspace = true
```

`crates/santi-cli/Cargo.toml`:

```toml
[package]
name = "santi-cli"
version.workspace = true
edition.workspace = true
rust-version.workspace = true
license.workspace = true
repository.workspace = true

[[bin]]
name = "santi"
path = "src/main.rs"

[dependencies]
clap.workspace = true

[lints]
workspace = true
```

- [ ] **Step 2: Write the failing tests**

`crates/santi-types/src/lib.rs` (test module only for now, the type does not exist yet):

```rust
#[cfg(test)]
mod tests {
    use super::Health;

    #[test]
    fn health_serializes_status_and_version() {
        let health = Health { status: "ok".into(), version: "0.1.0".into() };
        let json = serde_json::to_value(&health).unwrap();
        assert_eq!(json, serde_json::json!({ "status": "ok", "version": "0.1.0" }));
    }
}
```

`crates/santi-server/tests/health.rs`:

```rust
use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use tower::ServiceExt;

#[tokio::test]
async fn health_returns_ok_and_package_version() {
    let response = santi_server::app()
        .oneshot(Request::get("/health").body(Body::empty()).unwrap())
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(json["status"], "ok");
    assert_eq!(json["version"], env!("CARGO_PKG_VERSION"));
}

#[tokio::test]
async fn unknown_route_returns_not_found() {
    let response = santi_server::app()
        .oneshot(Request::get("/nope").body(Body::empty()).unwrap())
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}
```

`crates/santi-cli/tests/cli.rs`:

```rust
use clap::{CommandFactory, Parser, error::ErrorKind};
use santi_cli::Cli;

#[test]
fn command_definition_is_valid() {
    Cli::command().debug_assert();
}

#[test]
fn version_flag_prints_version() {
    let error = Cli::try_parse_from(["santi", "--version"]).unwrap_err();
    assert_eq!(error.kind(), ErrorKind::DisplayVersion);
}

#[test]
fn binary_is_named_santi() {
    assert_eq!(Cli::command().get_name(), "santi");
}
```

Placeholder `src/lib.rs` for server and CLI are empty files so the crates compile up to the tests.

- [ ] **Step 3: Run tests to verify they fail**

Run: `cargo test --workspace`
Expected: compile errors `cannot find type Health`, `cannot find function app`, `unresolved import santi_cli::Cli`.

- [ ] **Step 4: Minimal implementation**

`crates/santi-types/src/lib.rs` (above the test module):

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Health {
    pub status: String,
    pub version: String,
}
```

`crates/santi-server/src/lib.rs`:

```rust
use axum::{Json, Router, routing::get};
use santi_types::Health;

pub fn app() -> Router {
    Router::new().route("/health", get(health))
}

async fn health() -> Json<Health> {
    Json(Health { status: "ok".into(), version: env!("CARGO_PKG_VERSION").into() })
}
```

`crates/santi-server/src/main.rs`:

```rust
#[tokio::main]
async fn main() -> std::io::Result<()> {
    let address = std::env::var("SANTI_ADDR").unwrap_or_else(|_| "127.0.0.1:8080".into());
    let listener = tokio::net::TcpListener::bind(address).await?;
    axum::serve(listener, santi_server::app()).await
}
```

`crates/santi-cli/src/lib.rs`:

```rust
use clap::Parser;

#[derive(Debug, Parser)]
#[command(name = "santi", version, about = "Agile tracker: boards, backlog and sprints")]
pub struct Cli {}
```

`crates/santi-cli/src/main.rs`:

```rust
use clap::Parser;

fn main() {
    santi_cli::Cli::parse();
}
```

- [ ] **Step 5: Run tests and quality gates**

Run: `cargo test --workspace` — expected: 6 passed.
Run: `cargo fmt --all --check` and `cargo clippy --workspace --all-targets -- -D warnings` — expected: clean.
Run: `cargo run -p santi-cli -- --version` — expected: `santi 0.1.0`.

- [ ] **Step 6: Commit**

```bash
git add Cargo.toml Cargo.lock crates/
git commit -m "chore: scaffold cargo workspace with health endpoint and cli version"
```

---

### Task 2: Continuous integration

**Branch:** `ci/<card>-pipeline`

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Workflow**

```yaml
name: ci

on:
  push:
    branches: [main, developer]
  pull_request:

env:
  CARGO_TERM_COLOR: always
  COVERAGE_IGNORE: 'main\.rs$'

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt, clippy, llvm-tools-preview
      - uses: Swatinem/rust-cache@v2
      - uses: taiki-e/install-action@cargo-llvm-cov
      - run: cargo fmt --all --check
      - run: cargo clippy --workspace --all-targets -- -D warnings
      - run: >
          cargo llvm-cov --workspace --ignore-filename-regex "$COVERAGE_IGNORE"
          --fail-under-lines 90 --fail-under-functions 90 --fail-under-regions 90

  branch-coverage:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: dtolnay/rust-toolchain@nightly
        with:
          components: llvm-tools-preview
      - uses: Swatinem/rust-cache@v2
      - uses: taiki-e/install-action@cargo-llvm-cov
      - run: >
          cargo llvm-cov --workspace --branch --ignore-filename-regex "$COVERAGE_IGNORE"
          --json --summary-only --output-path coverage.json
      - name: Enforce 90% branch coverage
        run: jq -e '.data[0].totals.branches | .count == 0 or .percent >= 90' coverage.json
```

- [ ] **Step 2: Verify**

Push the branch, open nothing yet; check `gh run list --branch <branch>` shows both jobs green.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: enforce fmt, clippy and 90% coverage on every push"
```

---

### Task 3: Project agents and REA registration

**Branch:** `chore/<card>-agents`

**Files:**
- Create: `.claude/CLAUDE.md`
- Create: `.claude/agents/{investigator,architect,backend,cli-mcp,web,qa,oss}.md`
- Create: `.mcp.json`

Content rules:
- `.mcp.json` registers only REA, pinned: `npx -y rea-agents@6.5.0 mcp`.
- Only `investigator` lists `mcp__rea__*` in `tools:`. Every other agent omits it and is told never to read `/research`.
- Every agent: `model: opus`, minimal `tools:`, body under ~25 lines, subagent discipline in at most 5 lines.
- `.claude/CLAUDE.md` states the clean-room rule, the gitflow, the quality gate and the known limit: separation is by process and tool lists, not OS-enforced.

- [ ] **Step 1:** write the files.
- [ ] **Step 2:** validate `.mcp.json` with `jq . .mcp.json` and every agent frontmatter parses (`head -8`).
- [ ] **Step 3: Commit**

```bash
git add .claude/CLAUDE.md .claude/agents .mcp.json
git commit -m "chore: add project agents and clean-room reverse engineering setup"
```

---

### Task 4: Community files

**Branch:** `docs/<card>-community-files`

**Files:**
- Modify: `README.md`
- Create: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), `SECURITY.md`
- Create: `.github/ISSUE_TEMPLATE/bug_report.md`, `.github/ISSUE_TEMPLATE/feature_request.md`, `.github/pull_request_template.md`

`CONTRIBUTING.md` covers: gitflow (`developer` integration, `main` release), Conventional Commits, TDD, quality gate commands, local coverage on a Homebrew toolchain (`LLVM_COV`/`LLVM_PROFDATA` from `brew --prefix llvm`), and the clean-room rule for contributors (never paste Atlassian code, text or assets).

- [ ] **Step 1:** write the files.
- [ ] **Step 2:** check links resolve (`grep -o '](.*)' *.md`).
- [ ] **Step 3: Commit**

```bash
git add README.md CONTRIBUTING.md CODE_OF_CONDUCT.md SECURITY.md .github/ISSUE_TEMPLATE .github/pull_request_template.md
git commit -m "docs: add contributing guide, code of conduct and templates"
```

---

### Task 5: Jira marker and backlog

Requires the `SANTI` Jira project (created by the maintainer).

- [ ] Create `.jira` (`JIRA_PROJECT_KEY=SANTI`, `JIRA_SITE=emersonsilvan.atlassian.net`, `JIRA_BOARDS=`).
- [ ] Create epics E0–E5 and the E0/E1 stories through the Atlassian MCP.
- [ ] Commit: `chore: link repository to its jira project`.
