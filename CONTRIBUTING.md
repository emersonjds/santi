# Contributing to santi

Thanks for helping. santi is a free agile tracker in Rust; the v1 design lives in
[`docs/specs/2026-10-15-santi-v1-design.md`](docs/specs/2026-10-15-santi-v1-design.md).

## Clean room

santi recreates how agile boards *behave*, never how a proprietary product is *written*.
Do not paste code, UI text, icons or screenshots from Jira or any other proprietary
tracker into this repository. Describe behavior in your own words in
`docs/specs/behavior/`.

## Workflow

- `main` is the release branch; `developer` is integration and stays green.
- Branch from `developer`: `feat/`, `fix/`, `docs/`, `chore/`, `ci/` or `refactor/` plus a short summary.
- Open pull requests against `developer`.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/) in English, one concern per commit.
- Write the test first, watch it fail, then make it pass.

## Development setup

You need the latest stable Rust (1.97 or newer), Node 24+ with pnpm, and Docker (Docker Desktop)
for PostgreSQL.

```bash
docker compose up -d postgres                      # PostgreSQL only, on localhost:5440
export DATABASE_URL=postgres://santi:santi@localhost:5440/santi
cargo run -p santi-server                          # API on http://127.0.0.1:8080, runs migrations
cd web && pnpm install && pnpm dev                 # UI on http://localhost:5173, proxies /api to 8080
```

SQL queries are checked at compile time. With `DATABASE_URL` set, `cargo` checks them against
your database, so after pulling new migrations either apply them first
(`sqlx migrate run --source crates/santi-server/migrations`) or build with `SQLX_OFFLINE=true`,
which uses the committed `.sqlx/` query data instead.

## Database

santi needs PostgreSQL 17. Start only the database from `compose.yaml` and point the tools at it:

    docker compose up -d --wait postgres
    export DATABASE_URL=postgres://santi:santi@localhost:5440/santi
    cargo install sqlx-cli --version 0.9.0 --locked --no-default-features --features postgres,rustls
    sqlx migrate run --source crates/santi-server/migrations

`docker compose up -d` without a service name also starts the published santi image on 8080, which
then holds the port `cargo run -p santi-server` wants. To run your checkout in a container, add the
build override: `docker compose -f compose.yaml -f compose.build.yaml up -d --build`.

Tests create a throwaway database per test (`#[sqlx::test]`). After changing any SQL, refresh the
offline query data with `scripts/sqlx-prepare.sh` (a fresh empty database, the same plans CI sees;
never `cargo sqlx prepare` against your dev database) and commit `.sqlx/`. The Docker build and
CI compile with `SQLX_OFFLINE=true`, so a stale `.sqlx/` breaks them. Locally, after pulling new
migrations, run `sqlx migrate run` before building, or build with `SQLX_OFFLINE=true`.

Migrations after release: once a version ships, a migration runs against tables full of data on
servers that are still serving. Backfill large tables in batches rather than one `UPDATE`, add
constraints `NOT VALID` and `VALIDATE` them in a later step, and build indexes on big tables with
`CREATE INDEX CONCURRENTLY` in a migration of its own, since it cannot run inside a transaction.

## Quality gate

CI runs these on every push; run them locally first.

Server, from the repository root:

```bash
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace -- --test-threads=4
scripts/sqlx-prepare.sh --check
```

Coverage must stay at or above 90% for lines, regions and functions (stable toolchain)
and branches (nightly). Locally, with [cargo-llvm-cov](https://github.com/taiki-e/cargo-llvm-cov):

```bash
cargo llvm-cov --workspace --ignore-filename-regex '/main\.rs$'
```

On a Homebrew Rust toolchain (no rustup), point it at Homebrew's LLVM matching rustc's major version (`rustc -vV`, LLVM 22 for Rust 1.97):

```bash
LLVM_COV="$(brew --prefix llvm@22)/bin/llvm-cov" \
LLVM_PROFDATA="$(brew --prefix llvm@22)/bin/llvm-profdata" \
cargo llvm-cov --workspace --ignore-filename-regex '/main\.rs$'
```

Web UI, from `web/` (Node 24+, pnpm; component tests run in Chromium, install it
once with `pnpm exec playwright install chromium`):

```bash
pnpm typecheck && pnpm lint && pnpm test:coverage && pnpm build && pnpm size && pnpm audit --prod
```

End to end, Playwright against a running server that serves the build (any port; the tests
register their own users and projects):

```bash
(cd web && pnpm build)
SANTI_ADDR=127.0.0.1:8089 SANTI_IP_LIMITS=off cargo run -p santi-server &   # e2e users all sign up from one address (D44)
cd web && pnpm e2e                                    # E2E_BASE_URL, default http://localhost:8089
```

The image must build too: `docker build -t santi:local .`

## Web UI

The UI is the React SPA in `web/`; the server serves its build from `SANTI_WEB_DIR`
(default `web/dist`).

```bash
cargo run -p santi-server                  # API on 127.0.0.1:8080
cd web && pnpm install && pnpm dev         # Vite on http://localhost:5173, proxying /api to 8080
```

`pnpm gen:api` regenerates the API types from `web/openapi.json`; a server test rewrites that
snapshot with `UPDATE_OPENAPI=1 cargo test -p santi-server --test openapi`. More in
[`web/README.md`](web/README.md).

## Release

1. Move the `Unreleased` entries in [CHANGELOG.md](CHANGELOG.md) under the new version.
2. Bump `version` in the root `Cargo.toml` and in `web/package.json` (semver; before 1.0 a minor
   bump may change the API).
3. Merge `developer` into `main` through a pull request, then tag `vX.Y.Z` on `main`.

## Deploy

See [Self-hosting](docs/self-hosting.md): `docker compose up -d`. On any host other than
`localhost`, terminate HTTPS in a reverse proxy (the session cookie is `Secure`) and forward the
original `Host` header (nginx: `proxy_set_header Host $host;`); the cross-site write check compares
it with `Origin`.

## Conduct and security

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).
Report vulnerabilities as described in [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions are licensed under the
[GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0-only), the project's license. The name
and logo are covered by the [trademark policy](TRADEMARK.md).
