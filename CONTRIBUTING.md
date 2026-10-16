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

## Database

santi needs PostgreSQL 17. Start it on OrbStack and point the tools at it:

    docker --context orbstack compose up -d --wait
    export DATABASE_URL=postgres://santi:santi@localhost:5440/santi
    cargo install sqlx-cli --version 0.9.0 --locked --no-default-features --features postgres,rustls
    sqlx migrate run --source crates/santi-server/migrations

Tests create a throwaway database per test (`#[sqlx::test]`). After changing any SQL, refresh the
offline query data with `scripts/sqlx-prepare.sh` (fresh empty database, the same plans CI sees) and commit `.sqlx/`.

Migrations after release: once a version ships, a migration runs against tables full of data on
servers that are still serving. Backfill large tables in batches rather than one `UPDATE`, add
constraints `NOT VALID` and `VALIDATE` them in a later step, and build indexes on big tables with
`CREATE INDEX CONCURRENTLY` in a migration of its own, since it cannot run inside a transaction.

## Quality gate

CI runs these on every push; run them locally first:

```bash
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
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

## Web UI

The UI is the React SPA in `web/` (Node ^20.19 or >= 22.12, pnpm); the server serves its build.

```bash
cargo run -p santi-server                  # API on 127.0.0.1:8080, SPA from web/dist (SANTI_WEB_DIR)
cd web && pnpm install && pnpm build       # build once, then open http://localhost:8080
cd web && pnpm dev                         # or: Vite on http://localhost:5173, proxying /api to 8080
```

Its gate (`typecheck`, `lint`, `test:coverage`, `build`, `size`, `e2e`) is in [`web/README.md`](web/README.md).

## Deploy

Behind a reverse proxy, forward the original `Host` header (nginx: `proxy_set_header Host $host;`); the cross-site write check compares it with `Origin`.

## Conduct and security

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).
Report vulnerabilities as described in [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions are dual-licensed under
[MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE), at the user's option.
