# santi

Free, open-source agile tracker in Rust: Scrum/Kanban boards, backlog, sprints; web, CLI and MCP.
Design: `docs/specs/2026-10-15-santi-v1-design.md`. Plans: `docs/plans/`.

## Backlog: santi runs on santi

- Cards live in project `SAN` on https://getsanti.app (the old tracker is a read-only archive; do not create or move cards there).
- Read and move cards through the `santi` MCP (local scope) or the CLI (`santi backlog SAN`, `santi issues create SAN …`, `santi issues edit|move SAN-<n> …`); both use the token saved by `santi login`.
- Card flow: To Do → In Progress when a branch starts → Done after the merge to `developer`. Branches keep `SAN-<n>`.
- Gaps found while using it become cards in `SAN`. Labels come only from the standard set: `frontend`, `backend`, `cli`, `ux`, `documentation`, `testing`, `performance`, `security`, `ci`, `tech-debt`, `community`, `good-first-issue`, `help-wanted`.

## Card flow (one card at a time)

1. Card → In Progress; worktree `../santi-<n>` on `feat|fix|chore/SAN-<n>-<summary>` from `developer`.
2. Behavior unknown → `investigator` first (REA, `docs/specs/behavior/`).
3. Design panel for any card a user sees (screen, copy, CLI/MCP output): `product`, `ux` and `ia` each vote on every open question, `architect` challenges on data, performance and readability; winner, trade-off and acceptance criteria (every state in `ux.md`) go to `docs/specs/cards/SAN-<n>.md`. Cross-cutting outcomes also get a D-entry in `decisions.md`. Implementers never decide UX alone: an open question found mid-build goes back to the panel. The REA behavior specs (`docs/specs/behavior/`) are the baseline: votes may improve on a rule (speed, clarity, fewer clicks) but never drop or contradict one without the owner; a mechanic with no spec yet goes to `investigator` before the panel.
4. Build: `backend` → `web` / `cli-mcp`, TDD, prompt names the model file to copy and the card brief.
5. Review: `qa` when risky (auth, migration, contract, tenant, > ~200 lines); `ux` checks screenshots (1440 and 375, light and dark) against the brief. Findings fixed on the same branch by a fresh agent.
6. Merge to `developer`; bump semver (minor feat, patch fix/chore) in `Cargo.toml`, `web/package.json` and `CHANGELOG.md`; PR `developer` → `main`, merged when CI is green, tag `vX.Y.Z` (Railway deploys `main`), then publish the GitHub release: `gh release create vX.Y.Z --verify-tag --title "$(scripts/release-notes.py X.Y.Z --title)" --notes "$(scripts/release-notes.py X.Y.Z)"`. Each CHANGELOG version starts with `> Headline: one-line summary` and has `### Upgrade notes` for migrations or contract changes; bumping the version needs `UPDATE_OPENAPI=1 cargo test -p santi-server --test openapi`. Card → Done with a comment: what shipped, deviations, follow-up cards.
7. Code comments: only facts the code cannot show; rationale lives in the card brief or `decisions.md`.

## Clean room (non-negotiable)

- Only the `investigator` agent has REA (inline `mcpServers` in its definition). Nothing else registers it.
- Raw captures go to `/research` (git-ignored) and never leave it. The repo only gets behavior specs in `docs/specs/behavior/`: rules, states, edge cases — no code, copied text, screenshots or icons from Atlassian.
- Implementing agents read `docs/specs/` only and never open `/research`.
- Known limit: the separation is by process and tool lists, not OS-enforced. A stronger room needs a separate OS user or container.
- "Jira" appears only in importer docs (E5). UI copy and identifiers never use Atlassian names.

## Layout

- `crates/santi-types`: shared DTOs. `crates/santi-server`: axum + sqlx, vertical slices (`domain.rs` pure rules, `repo.rs` sqlx, `service.rs` use cases taking `&Member`, `handler.rs` JSON API); it also serves the SPA build from `SANTI_WEB_DIR` (default `web/dist`) at `/`. `crates/santi-cli`: `santi` binary and `santi mcp`.
- `web/`: React SPA on shadcn-admin (D37), FSD in `web/src` (`app → pages → widgets → features → entities → shared`), calls `/api/*` only through `openapi-fetch`. Self-contained for a later split (D38): never import across `web/` and `crates/`; the contract is the committed `web/openapi.json`.
- Web commands (pnpm, from `web/`): `pnpm dev` (Vite on 5173, proxies `/api` to the server on 8080), `pnpm gen:api` (types from `openapi.json`), `pnpm typecheck`, `pnpm lint`, `pnpm test:coverage` (> 90% on 4 metrics), `pnpm e2e` (Playwright), `pnpm build` (`web/dist`, served via `SANTI_WEB_DIR`), `pnpm size` (≤ 170 KB initial JS per route, D39).
- Product and architecture decisions, with votes and winners: `docs/specs/decisions.md`. Read it before planning or coding.
- `main.rs` files hold wiring only; they are excluded from coverage.

## Gitflow and gate

- `main` = release, `developer` = integration (always green). Work branches from `developer`: `feat|fix|chore|docs|ci|refactor/SAN-<n>-<summary>`.
- Gate before merge: `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`, `scripts/sqlx-prepare.sh --check` (never prepare against the dev database), CI coverage ≥ 90% (lines, regions, functions on stable; branches on nightly).
- Local coverage without rustup: `LLVM_COV=$(brew --prefix llvm@22)/bin/llvm-cov LLVM_PROFDATA=$(brew --prefix llvm@22)/bin/llvm-profdata cargo llvm-cov --workspace --ignore-filename-regex '/main\.rs$'`.
- Agents commit on each green step; only the orchestrating session merges, pushes or opens PRs.
- Adversarial review (`qa`) for auth, migrations, API contract changes and diffs over ~200 lines.
