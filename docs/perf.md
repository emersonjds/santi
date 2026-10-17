# Performance

Budgets and the reasoning behind them: D39 in `docs/specs/decisions.md`.

## Run the load test

Needs the compose PostgreSQL (port 5440), `sqlx-cli` and `oha` (`brew install oha`).

```sh
export DATABASE_URL=postgres://santi:santi@localhost:5440/santi_perf
sqlx database create                      # a separate database; never seed the dev one
cargo run --release -p santi-server --bin seed -- --issues 5000 --users 50 --sprints 20
SANTI_ADDR=127.0.0.1:8089 cargo run --release -p santi-server &
scripts/perf.sh                           # DURATION=10s CONNECTIONS=10 SANTI_URL=http://127.0.0.1:8089
```

The seed makes `PERF` (scrum: 18 closed sprints, one active, one future, backlog, epics, subtasks) and `FLOW` (kanban, 14-day done window), 4/5 and 1/5 of the issues, plus comments; everyone signs in as `owner@perf.santi.test` / `santi-perf-password`. Reseed with `sqlx database drop -y && sqlx database create` first. Run `VACUUM ANALYZE` between runs: the move endpoint rewrites one row thousands of times and its dead tuples slow later runs.

The script signs in, then hits each endpoint with the session cookie and `Accept-Encoding: gzip, br`, printing p50/p95/p99 in ms.

## CI guard

`crates/santi-server/tests/perf_budget.rs` seeds 1k issues and asserts, per hot endpoint, the number of SQL statements (counted through sqlx's `sqlx::query` log target) and a 250 ms ceiling. It runs with `cargo test --workspace`. When a change legitimately adds a statement, raise the budget in the test and say why in the PR.

## Baseline (SAN-43)

5k issues / 50 users / 20 sprints, release build, 10 connections, 8 s per endpoint, Apple laptop, PostgreSQL 17 in OrbStack. Before = `developer` at 55c131c; after = this branch. Both databases vacuumed before the run.

| Endpoint | p50 before | p50 after | p95 before | p95 after | p99 before | p99 after | req/s before | req/s after |
|---|---|---|---|---|---|---|---|---|
| scrum board (105 cards) | 6.44 | 4.74 | 8.70 | 6.68 | 9.96 | 7.72 | 1517 | 2052 |
| kanban board (290 cards) | 7.74 | 6.30 | 10.75 | 8.98 | 12.21 | 10.36 | 1259 | 1545 |
| backlog (1243 cards) | 19.48 | 14.38 | 25.55 | 18.92 | 28.83 | 21.41 | 503 | 681 |
| issue detail | 2.07 | 1.32 | 2.50 | 1.69 | 2.79 | 1.93 | 4782 | 7433 |
| search `q` | 3.51 | 2.64 | 4.56 | 3.64 | 5.17 | 4.25 | 2788 | 3688 |
| search type + label | 2.88 | 2.07 | 3.53 | 2.68 | 3.88 | 3.01 | 3425 | 4752 |
| move | 9.96 | 10.90 | 12.12 | 12.23 | 14.15 | 13.15 | 1010 | 921 |

Payloads: the backlog went from 906 KB raw (32 KB gzip) to 375 KB (26 KB gzip); the scrum board from 66 KB to 32 KB. Rank keys went from up to 667 characters to 5.

Move is bound by the D21 project lock: ten concurrent moves in one project queue behind each other (one move alone takes about 2.3 ms), so the change did not move it. Laptop numbers drift by 20–50% once the machine heats up under sustained load; compare runs taken back to back after a pause.

## Sprint reports (SAN-105)

`EXPLAIN (ANALYZE, BUFFERS)` on the 5k seed (`--issues 5000 --users 50 --sprints 20`: 19 started sprints on `PERF`, 2795 `sprint_issue` facts), vacuumed, warm cache, third run of each, PostgreSQL 17 in OrbStack.

| Query | Endpoint | Execution | Plan |
|---|---|---|---|
| history page (limit 50) | `GET /reports/sprints` | 2.70 ms | seq scan of the board's 20 sprints, then per sprint `sprint_issue_sprint_issue_key` and `issue_pkey` (2795 lookups), hash aggregate |
| history with cursor | `GET /reports/sprints?cursor=10` | 1.62 ms | same, the cursor sprint read once (InitPlan) |
| velocity (limit 7 + 1) | `GET /reports/velocity` | 0.86 ms | same, 8 sprints |
| report header | `GET /sprints/{id}/report` | 0.03 ms | `lag`/`lead` over the board's 19 started sprints |
| report rows, closed sprint (210 facts, 105 rows) | `GET /sprints/{id}/report` | 0.75 ms | `sprint_issue_sprint_issue_key`, hash join to `issue` (seq scan of 5k rows), memoized project and status |
| report rows, active sprint | `GET /sprints/{id}/report` | 0.62 ms | same |

All well under the 50 ms p95 budget (D39); no new index. The history aggregate grows with a board's facts (every started sprint's issues); the upgrade past thousands of sprints per board is the index on `(board_id, coalesce(closed_at, 'infinity') DESC, id DESC)` noted in the SAN-105 brief. The rows query hashes the whole `issue` table at this size; a larger table should tip the planner to `issue_pkey` lookups per fact (not measured).
