# Scale strategy (SAN-102)

santi must serve one person online, a self-hosted team and a company of 50,000 people from the same codebase. This document sets the targets for each tier, records where santi stands today (2026-10-21, v0.22.0), and lists the gaps in order of risk with the smallest change that closes each one. The owner reviews it before any large architecture change.

Rules that hold for every tier:

- One codebase and one binary. Scale comes from configuration (replicas, pool size, storage) and from measured fixes, never from a separate edition (D56).
- PostgreSQL is the only stateful dependency. A new piece of infrastructure (cache, queue, search engine) needs a measurement that Postgres cannot meet.
- Every fix is measured before and after with the same seed and script (`docs/perf.md`).

## 1. Tiers and targets

Latency targets are server-side p95, measured with `scripts/perf.sh` against the tier's seed. "Writes" covers create, edit, move and comment.

| | T1: online, solo or small team | T2: self-hosted team of 50 | T3: company of 50,000 |
|---|---|---|---|
| Deployment | hosted Free and Team (D56), one instance for all workspaces | one server and one Postgres on the team's machine | 2+ server replicas behind a load balancer, Postgres primary with a standby |
| Registered users | 10,000 across workspaces | 50 | 50,000 |
| Concurrent sessions | 300 | 30 | 10,000 (about 1,200 requests/s at peak) |
| Projects | 3,000 (Free: 1 per workspace) | 50 | 100,000 |
| Issues | 300,000 total, 5,000 per project | 100,000 total, 100,000 in the largest project, 20,000 open | 10,000,000 total, 200,000 in the largest project |
| Board p95 | 30 ms | 30 ms | 50 ms |
| Backlog p95 | 30 ms | 50 ms (first page) | 100 ms (first page) |
| Issue view p95 | 30 ms | 30 ms | 30 ms |
| Search p95 | 30 ms | 50 ms | 150 ms (one project), 300 ms (across projects) |
| Writes p95 | 50 ms | 50 ms | 100 ms |
| Availability | 99.5% | 99.5% (one machine) | 99.9% |
| Recovery point / time | 24 h / 4 h | 24 h / 4 h (SAN-205) | 5 min / 1 h |
| Postgres | 1 vCPU, 1 GB | 2 vCPU, 4 GB (shared with the server) | 16 vCPU, 64 GB, SSD; standby for failover |

Notes:

- T1 and T2 targets equal or improve on D39 (p95 < 30 ms at 5k issues). T3 relaxes board, backlog and search because a single project can hold 40 times more issues.
- T3 data volume: 10M issues at about 1 KB each plus indexes and about 30M comments add up to roughly 40 GB, which fits one primary with the working set in memory. Partitioning is not needed at this size.
- T3 load: 10,000 sessions making about one request every 10 s, plus the notification poll every 60 s per open tab. One laptop process served 1,500–7,000 requests/s per endpoint at 5k issues (`docs/perf.md`), so 2–4 replicas leave room; the database is the limit to watch.

## 2. Where santi stands today

| Area | Today | Evidence | T1 | T2 | T3 |
|---|---|---|---|---|---|
| Measured size | budgets measured at 5k issues, 50 users, 20 sprints; CI guard seeds 1k issues and pins statement counts | `docs/perf.md`, `tests/perf_budget.rs` | ok | unmeasured | unmeasured |
| Data model | `bigint` identity keys, every table keyed by project; hot paths indexed: `issue (project_id, id)`, `(project_id, rank)` unique, `(project_id, issue_type)`, `(project_id, assignee_id)`, `sprint_id`, `parent_id`, GIN on `labels`, trigram GIN on `summary`; comments keyset `(issue_id, id)`; notifications `(recipient_id, id DESC)` | migrations 0005, 0006, 0017, 0027 | ok | ok | ok |
| Read models | one SQL round trip per read model (board and backlog 4 statements, issue and search 2) | D39 | ok | ok | ok |
| Board | scrum: active sprint only; kanban: open issues plus a done window; one query in rank order | `boards/repo.rs` | ok | suspect | suspect |
| Backlog | every open issue of the project in one response, unpaged | D29, D39 known ceiling | ok | gap | gap |
| Search | one project at a time, keyset by id, `summary ILIKE` OR `key ILIKE`; the OR keeps it off the trigram index | `issues/repo.rs` | ok | gap | gap |
| Home lists | offset paging; project filter by `ILIKE` without an index | `home/repo.rs`, D39 (SAN-72) | ok | ok | watch |
| Writes | moves serialized per project by the D21 lock (about 2.3 ms each, roughly 400 moves/s per project) | `docs/perf.md` | ok | ok | ok |
| Tenancy | the project is the only boundary; no organizations (SAN-63..69) | D56, SAN-63 | ok | ok | gap |
| Server state | stateless except the rate limiter: buckets and login failures in a per-process map | `rate_limit.rs`, D44 | ok | ok | gap |
| Background jobs | one hourly task per process: expired sessions and invites, trash (with attachment objects), notifications over 90 days; each is one unbounded `DELETE` | `main.rs`, `lib.rs` | ok | ok | gap |
| Pool | `SANTI_DB_POOL`, default twice the cores clamped 10–50, per process | `main.rs`, D39 | ok | ok | gap with replicas |
| Timeouts | none on requests or statements; only the upload body has a deadline | `attachments/handler.rs` | ok | watch | gap |
| Sessions | in Postgres, SHA-256 of the token, unique index; one query resolves token and membership | migration 0002, D39 | ok | ok | ok |
| Notifications | the SPA polls every 60 s while the tab is visible | `notification-queries.ts` | ok | ok | ok |
| Attachments | one storage port: S3-compatible bucket or local disk; local disk warns on hosted deploys | `storage.rs`, D53 | ok | ok | needs S3 |
| Observability | `/health` checks the database; job failures go to stderr; no access log, latency, request id or metrics | `lib.rs`, `main.rs` | watch | gap | gap |
| Migrations | forward-only, run at startup under the migrator's advisory lock, each one inside a transaction | `lib.rs` `migrate` | ok | ok | gap on big tables |
| Backups | export and restore of a project (SAN-99, D58); scheduled database dumps pending (SAN-205); hosted relies on the platform's daily backups | `docs/deploy/railway.md` | ok | SAN-205 | needs point-in-time recovery |
| Web bundle | ~120 KB gzip shared base against the 170 KB budget, lists over 200 rows virtualized (D39); headroom work in SAN-204 | D39, SAN-204 | ok | ok | ok |

What already scales: stateless request handling, one statement per read model, keyset paging for comments, search and notifications, indexed foreign keys, sessions in the database, compressed responses, and a storage port that already speaks S3.

## 3. Gaps by risk

Ordered by risk across the tiers. Each gap names the smallest change and how it is measured; the card holds the detail.

| # | Gap | Tier | Rating | Smallest change | Measured by | Card |
|---|---|---|---|---|---|---|
| 1 | Nothing is measured above 5k issues | T2, T3 | high | bulk mode in the seed binary (SQL `generate_series`/`COPY`), a table per tier in `docs/perf.md` | `scripts/perf.sh` and `EXPLAIN (ANALYZE, BUFFERS)` on the T2 and T3 seeds | SAN-208 |
| 2 | No access log, latency or request id: production p95 is invisible | T2, T3 | high | `tower-http` trace layer with `tracing` JSON lines to stdout; slow requests over 500 ms at warn | one structured line per request in a test; p95 per route computable from logs | SAN-209 |
| 3 | Backlog unpaged: a 20k-open project returns megabytes | T2, T3 | high | keyset pages by rank for the no-sprint section on the existing `(project_id, rank)` index; sprint sections stay whole; design panel first | backlog p95 < 50 ms and first response < 100 KB gzip on the T2 seed | SAN-210 |
| 4 | Hourly purge runs in every replica, as unbounded deletes | T3 | medium | `pg_try_advisory_lock` per job; deletes in batches of 10,000 | two concurrent purges, one works; no statement over 1 s on 1M rows | SAN-211 |
| 5 | Login lockout and auth limits are per process: N replicas give N times the attempts | T3 | medium | login failures and auth buckets in one Postgres table (single UPSERT); cheap buckets stay in memory | two app instances on one pool lock together on the fifth failure | SAN-212 |
| 6 | No request, statement or pool timeouts: slow queries starve the pool | T2, T3 | medium | `TimeoutLayer` on API routes, `statement_timeout` per connection, pool acquire timeout mapped to 503 | a query over the limit returns 503 and frees its connection; `/health` answers under saturation | SAN-213 |
| 7 | Search ORs a key match the trigram index cannot serve | T2, T3 | medium | split the predicate: summary through the trigram index, key branch only for key-shaped text | bitmap scan on `issue_summary_trgm_idx` in the plan; p95 < 50 ms on the T2 seed | SAN-214 |
| 8 | No operator rules for replicas: pool versus `max_connections`, local storage, migrations on big tables, point-in-time recovery | T3 | medium | one deploy page: `replicas x pool <= max_connections - 10` or a pooler in transaction mode; S3 above one replica; expand/contract migrations; `CREATE INDEX CONCURRENTLY` in `-- no-transaction` migrations; WAL archiving | two-replica compose run with a rolling restart under load: zero failed requests | SAN-215 |
| 9 | No single sign-on, provisioning or audit log | T3 | medium | spec after the organizations model (SAN-63); SSO gated by the license key (SAN-191); audit log as an append-only table written in the action's transaction | spec with panel votes | SAN-216 |
| 10 | No organizations: 100k projects with no admin boundary | T3 | medium | already planned | SAN-63..69 acceptance | SAN-63..69 |
| 11 | Scheduled database dumps for self-hosters | T2 | medium | already planned | restore drill from a dump | SAN-205 |
| 12 | Board queries filter the whole project (board type OR, done window) | T2, T3 | low until measured | measured by SAN-208 first; a partial index on open issues only if the plan shows a full project scan over budget | board p95 on the T2 seed | via SAN-208 |
| 13 | Home lists page by offset and filter projects by unindexed `ILIKE` | T3 | low | keyset on `(at, id)` and a trigram index on project name when a caller's history passes a few thousand rows (D39, SAN-72) | home p95 on the T3 seed | none yet |
| 14 | Notification polling: about 170 requests/s at T3 | T3 | low | none; the count query is indexed | requests/s share of `/notifications` in the access log | none yet |

Order of work: SAN-208 and SAN-209 first, since every other gap is measured with them. Then SAN-210 (the only gap a T2 team can hit), then the replica group (SAN-211, SAN-212, SAN-213, SAN-215), then SAN-214. SAN-216 and the organizations cards follow the product roadmap.

### What breaks with 2+ replicas today

| Piece | Effect | Fix |
|---|---|---|
| Rate limiter and login lockout | limits multiply by the replica count | SAN-212 |
| Hourly purge | runs N times at once, races on trash and attachment deletes | SAN-211 |
| Local attachment storage | each replica sees its own files | S3 storage (D53), SAN-215 |
| Pool | N x 50 connections can exceed `max_connections` | SAN-215 |
| Migrations at startup | safe to run concurrently (advisory lock), but old replicas serve the new schema during a rollout | expand/contract rule, SAN-215 |
| Sessions, notifications, everything else | already shared through Postgres | none |

## 4. Not now

| Do not build | Why not | Trigger that justifies it |
|---|---|---|
| Read replicas | the primary has headroom at T3 sizes; replica lag complicates read-after-write in an optimistic SPA | primary CPU above 60% at peak with the access log showing reads dominate, after SAN-208 fixes |
| Table partitioning | 10M issues fit one table with indexes in memory | a single table past ~100M rows or a purge that cannot keep up |
| Cache layer (in-process or external) | reads are one indexed statement; a cache adds invalidation bugs to every write | a hot read over budget after its query and index are fixed |
| External search engine | trigram indexes cover summary and key search | full-text over descriptions and comments across projects over the 300 ms target |
| Server-sent events or websockets for notifications | polling every 60 s costs ~170 requests/s at T3 | live board updates in a spec, or polling above 20% of requests |
| Metrics endpoint and distributed tracing | structured logs give p95 per route for one service | the first T3 operator asks, or a second service appears |
| Job queue | three hourly deletes; email delivery brings its own outbox (SAN-68) | a job that must retry or run longer than a minute |
| Multi-region | one region meets every tier | a paying customer requires data residency (D56) |
| Sharding by organization | one primary holds T3 | T3 times ten, measured |
