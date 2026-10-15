# santi

Free, open-source agile tracker in Rust: Scrum/Kanban boards, backlog, sprints; web, CLI and MCP.
Design: `docs/specs/2026-10-15-santi-v1-design.md`. Plans: `docs/plans/`. Jira: project `SAN` (`.jira`).

## Clean room (non-negotiable)

- Only the `investigator` agent has REA (inline `mcpServers` in its definition). Nothing else registers it.
- Raw captures go to `/research` (git-ignored) and never leave it. The repo only gets behavior specs in `docs/specs/behavior/`: rules, states, edge cases — no code, copied text, screenshots or icons from Atlassian.
- Implementing agents read `docs/specs/` only and never open `/research`.
- Known limit: the separation is by process and tool lists, not OS-enforced. A stronger room needs a separate OS user or container.
- "Jira" appears only in importer docs (E5). UI copy and identifiers never use Atlassian names.

## Layout

- `crates/santi-types`: shared DTOs. `crates/santi-server`: axum + sqlx, vertical slices (`domain.rs` pure rules, `repo.rs` sqlx, `service.rs` use cases taking `&Member`, `handler.rs` JSON API, `web.rs` HTML pages); web UI is askama templates + htmx + vanilla `app.js`, embedded (decisions D1, D25, D26). `crates/santi-cli`: `santi` binary and `santi mcp`.
- Product and architecture decisions, with votes and winners: `docs/specs/decisions.md`. Read it before planning or coding.
- `main.rs` files hold wiring only; they are excluded from coverage.

## Gitflow and gate

- `main` = release, `developer` = integration (always green). Work branches from `developer`: `feat|fix|chore|docs|ci|refactor/SAN-<n>-<summary>`.
- Gate before merge: `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`, CI coverage ≥ 90% (lines, regions, functions on stable; branches on nightly).
- Local coverage without rustup: `LLVM_COV=$(brew --prefix llvm@22)/bin/llvm-cov LLVM_PROFDATA=$(brew --prefix llvm@22)/bin/llvm-profdata cargo llvm-cov --workspace --ignore-filename-regex 'main\.rs$'`.
- Agents commit on each green step; only the orchestrating session merges, pushes or opens PRs.
- Adversarial review (`qa`) for auth, migrations, API contract changes and diffs over ~200 lines.
