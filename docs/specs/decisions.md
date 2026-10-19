# santi v1 — decisions

Date: 2026-10-15.

Protocol: the `product`, `ux` and `ia` agents each vote on every open question (per-card panels live in `docs/specs/cards/`), grounded in how agile tools on the market behave. The `architect` then challenges every vote on complexity, data model, performance, testability and readability, and may replace it with another option only if that option still serves the UX. The winner is recorded with the reason it won and the trade-off accepted; when the votes differ, the option that keeps both UX quality and a clean architecture wins. D19 onward are architecture-only questions (product vote `n/a`). The design spec points here instead of repeating rationale.

## D1 — Web UI stack (superseded by D37)
Context: design.md already names Leptos CSR/WASM; goal is code readable in 10s by non-Rust devs, fast, clean UI.
Options: A) Leptos CSR/WASM B) server-rendered HTML (askama + htmx + vanilla JS drag/drop) C) Leptos SSR
Market: Linear/Plane/YouTrack ship heavy JS SPAs; small self-hosted OSS boards lean htmx+SortableJS for DnD.
Product vote: B — htmx templates read in seconds by any HTML/JS-literate contributor, no WASM payload, faster first paint; native HTML5 DnD design note fits server-rendered pages as well as Leptos.
Architecture vote: B — `cargo build` builds everything (no wasm32 target, trunk or npm for contributors), askama templates are type-checked at compile time, and a board renders in one round trip with no client state to keep in sync.
Winner: B — readable templates, fast first paint and zero extra toolchain beat Leptos' richer client; accepted: the server keeps a second front door (HTML next to JSON, D25) and client behavior is limited to htmx swaps plus one small `app.js` for drag and drop.

## D2 — What counts as done
Context: SB-7/8 (position) vs KB-3 (status category); spec flags column-position ambiguity (SB OQ-4).
Options: A) status category `done` B) rightmost/column position C) both must agree
Market: Linear/YouTrack use an explicit done-type/isResolved flag independent of column; Jira mixes both per board type; Trello has no category, position only.
Product vote: C — category `done` decides, and v1 requires the rightmost column to hold only `done` statuses, so category and position never disagree (matches both specs' adopted cut).
Architecture vote: C, strict — a `done` status may map only to the rightmost column and the rightmost column only to `done` statuses, checked by one domain function on every mapping edit; every query then tests `category = 'done'`, never column position.
Winner: C, strict — one predicate serves sprint close, backlog hiding and kanban hiding on both board types; accepted: no "done but awaiting deploy" middle column in v1.

## D3 — Quick filter combination
Context: SB OQ-3, filters by assignee/parent/label/type/free text.
Options: A) AND across all B) AND across kinds, OR within one kind C) fully user-configurable
Product vote: B — standard faceted-search behavior (Linear, GitHub Projects): picking two assignees is "either", adding a type filter narrows further. Predictable, no settings screen.
Architecture vote: B — compiles to one `WHERE` in the board query: each kind is `= ANY($n)` (OR within), kinds are AND-ed, free text is `ILIKE` on summary.
Winner: B — the market's mental model with the simplest SQL; accepted: no saved or query-based filters.
Amended (SAN-47): free text also matches the issue key, not only the summary.

## D4 — Drop position and rank
Context: SB OQ-6/7, BL OQ-3/11/12; design.md defines rank as one fractional-index order.
Options: A) card takes the drop position B) card keeps its old rank, ignores drop point
Market: Jira (rank field, instance-wide); Linear (sort order); Trello breaks this — position is per list, not shared.
Product vote: A — drop position wins, one total order shared by board and backlog per project; matches BL-5 and avoids Trello's per-list fragmentation.
Architecture vote: A — a move names one anchor (`after` or `before` an issue; none keeps the rank, BL-6) and the server places the issue right next to it in the full project order, so rows hidden by filters never make a drop ambiguous (BL OQ-11); one row written (D21).
Winner: A — matches intent and BL-5 with a one-row write; accepted: a drop into another column or sprint also changes the issue's place in the backlog.

## D5 — Inline create on board/backlog
Context: SB OQ-11, BL OQ-1, KB OQ-8.
Options: A) bottom of section/column, type Story, status = section's/column's implied status B) open full form every time
Market: Linear inline create defaults to Backlog state, current grouping; Jira lands at top/bottom of list or sprint.
Product vote: A — bottom of target, type Story, status = project's first `todo` status (backlog) or the column's status (board), rank = bottom; zero modal for the common case.
Architecture vote: A — "bottom" is always one key after the project's max rank, which is the bottom of every column and section because they are projections of one order; on the scrum board the issue joins the active sprint (SB OQ-11), in a sprint section it joins that sprint.
Winner: A — zero-modal create with one rank rule; accepted: type and other fields are fixed in the issue view, and subtasks are never created inline (SB-23).

## D6 — Parent/subtask moves to done
Context: SB OQ-10/12, KB OQ-6, BL OQ-10, SP OQ-5.
Options: A) block parent until subtasks done B) silent move, no cascade C) prompt to close subtasks too
Market: Jira prompts (SB-22); Linear optionally auto-closes sub-issues; YouTrack keeps subtask state independent.
Product vote: B — silent, no modal; subtasks render nested on both board types and inside sprint sections regardless of status, open-subtask count is visible on the parent card instead of a popup.
Architecture vote: B, flat — silent move, but subtasks render as ordinary cards in their own status column with a parent-key chip (Linear's model) and the parent shows `open/total`; nesting across columns needs tree layout, nested drag rules and special WIP counts. Backlog rows stay parents only (BL-2) with the same count; a subtask's `sprint_id` always equals its parent's, set in the same `UPDATE`.
Winner: B, flat — no prompt, no cascade, and each column stays a plain ranked list; accepted: children are linked by a chip and a count, not grouped visually under the parent.

## D7 — Column limits
Context: KB OQ-1/7.
Options: A) max only, warn (never block) B) min+max, block drops over max C) min+max, warn only
Product vote: A — max per column, header color warns past it, drops never refused; min limits add a concept nobody in the market blocks on (Jira, Trello, YouTrack all warn-only).
Architecture vote: A — one nullable `wip_limit` per column; the count is a `GROUP BY` over the unfiltered column (KB-15), no stored counter.
Winner: A — the warn-only behavior every tool ships, for one integer column; accepted: no min limit and no counting modes.

## D8 — Done issues leaving the Kanban board
Context: KB OQ-2/3/4.
Options: A) fixed window, counts from entering `done` B) window resets on any edit (Jira's behavior) C) no auto-hide
Product vote: A — per-board window (7/14/30 days or never, default 14), timer starts when the status becomes `done`-category and never resets on edit; avoids Jira's confusing "editing a comment resurfaces the card" quirk (KB-24).
Architecture vote: A — costs one nullable `issue.done_at`, set by the domain on entering a `done` status and cleared on leaving (re-entry restarts it, KB OQ-4), plus `board.done_window_days` (NULL = never); hiding is a live `WHERE` (D33). C lets the done column grow forever and slows every board load.
Winner: A — predictable timer and a bounded board for two nullable columns; accepted: a hidden issue never resurfaces on edit, it is reached through search.

## D9 — Kanban backlog
Context: none vs optional separate list.
Options: A) none, first column is the backlog B) optional dedicated backlog slot (Jira-style)
Market: Linear/YouTrack/Trello have no separate kanban-backlog view; only Jira does.
Product vote: A — one fewer concept and one fewer setting; the first column already serves as the intake list.
Architecture vote: A — no extra entity, view or setting; the kanban board query is the scrum one without the sprint filter.
Winner: A — simplest model, matches most tools; accepted: no separate planning list before work reaches the board.

## D10 — Epics in backlog
Context: BL OQ-6/7.
Options: A) epics as backlog rows B) side panel only, not rows
Market: Jira panel shows name, color, progress bar; Linear's Projects panel shows issue count and % complete.
Product vote: B — panel only; each entry shows key, summary, child count, and an open/closed progress bar. Keeps backlog rows to actionable work only.
Architecture vote: B — the panel is one aggregate query (children and `done` children grouped by `parent_id`); backlog rows stay a flat projection of rank; epic done = `done` status, no separate flag (BL-21 cut).
Winner: B — actionable rows plus progress at a glance; accepted: epics are edited from the panel and issue view, never dragged among stories.

## D11 — Estimation display
Context: BL OQ-8/9, SP OQ-10.
Options: A) point totals on sprint/no-sprint section headers only B) also on board columns C) no totals, count only
Market: Linear shows estimate progress per cycle; Jira sums per backlog section; neither totals on board columns by default.
Product vote: A — section headers (sprint + no-sprint) show summed points; unestimated issues count toward issue count but not the sum; subtasks never carry points, never roll up (no time tracking in v1). Board column totals: later.
Architecture vote: A — totals come from the backlog query (`SUM(points)` per section, NULL ignored); a DB `CHECK` keeps points NULL on subtasks, so no rollup code exists.
Winner: A — the totals planning needs, nothing on the board; accepted: board columns show card counts only.

## D12 — Sprint naming, durations, dates
Context: SP OQ-1/2/4.
Options: A) auto name "Sprint N" (never reused), duration presets 1/2/3/4 weeks + custom, default 2 weeks B) user must name every sprint manually
Market: Jira offers the same presets; Linear fixes cycle length per team instead of per sprint.
Product vote: A — zero-typing default path; N = count of sprints ever created on the board + 1, so deleting one never reuses a number. End date before start date is rejected inline, no modal.
Architecture vote: A — `board.next_sprint_number` incremented with `UPDATE … RETURNING` in the create transaction (same pattern as D20); dates are `date` columns with `CHECK (end_date >= start_date)` and native `<input type="date">`.
Winner: A — zero typing, numbers never reused, one counter; accepted: the name is free text after creation, so a renamed sprint loses its number.
Amended by D48: start and end are instants (`starts_at`/`ends_at`); presets 4 hours, 1 day, 1 week, 2 weeks, 1 month, custom; default the board's last length, else 2 weeks.

## D13 — Starting/completing edge cases
Context: SP OQ-3/6/13.
Options: A) refuse empty-sprint start; skip destination step when fully done; one shared destination for all open issues; new sprint lands as future, last in the list B) allow empty start; always show destination step
Product vote: A — fewer prompts: an empty sprint can't start (inline message, no server round trip surprise), a fully-done sprint closes with no extra step, and open issues move together to one picked destination.
Architecture vote: A — guards in sprint `domain.rs`: empty start refused (409, D24; button disabled in the page), destination step only when the open count is > 0, open issues moved by one `UPDATE`; a partial unique index allows one active sprint per board; sprints list by id (creation order, D19).
Winner: A — fewer prompts and a one-statement completion; accepted: open issues can't be split across destinations at close (move them beforehand).

## D14 — Deleting sprints / removing issues mid-sprint
Context: SP OQ-7/8/9/12.
Options: A) only future sprints deletable, issues return to no-sprint section with rank kept; active sprint must be completed, not deleted; closed-sprint deletion out of v1 B) allow deleting active/closed sprints too
Market: Jira only lets you delete future/active sprints (never a clean closed-sprint delete from backlog); Linear returns removed issues to backlog keeping sort order.
Product vote: A — matches the already-adopted cut; mid-sprint removal (scope change) also returns the issue to the no-sprint section with rank kept, same rule as a sprint delete.
Architecture vote: A — one guarded `DELETE … WHERE state = 'future'`, with `ON DELETE SET NULL` returning issues atomically (D32); rank is global, so it is kept for free.
Winner: A — no orphan handling and closed-sprint history stays intact; accepted: a closed sprint created by mistake stays in v1.

## D15 — Overdue active sprint
Context: SP OQ-11.
Options: A) stays active, header shows an overdue badge, no auto-close B) auto-complete at end date C) block new work until closed
Market: Jira/Linear/YouTrack all leave it active past end date; none auto-close (data-loss risk).
Product vote: A — overdue badge/color on the sprint header, user closes explicitly; never auto-close on their behalf.
Architecture vote: A — overdue is computed at render (`end_date < current_date`), no stored state, no scheduler.
Winner: A — no data-loss risk and no background job; accepted: closing stays the user's job.
Amended by D48: overdue is `ends_at <= now()`, to the minute and zone-free.

## D16 — Column/status mapping edits
Context: SB OQ-1/5/8/9, BL OQ-5, KB OQ-10.
Options: A) deleting a column with mapped issues requires picking a target column first (Jira kanban behavior); empty columns (zero statuses) stay and simply refuse drops B) deleted column's statuses always fall to the unmapped pool, issues silently vanish from board/backlog
Product vote: A — never let issues disappear invisibly; forcing a target column on delete is one extra click but prevents the exact silent-loss edge case both specs flag as undocumented risk.
Architecture vote: A, by status remap — the deleted column's statuses move to the chosen column (one `UPDATE` on statuses); issues keep their status, so no issue row or `done_at` changes. The rightmost column can't be deleted and every remap passes the D2 check.
Winner: A, by status remap — nothing vanishes and the delete writes config rows only; accepted: cards in the target column keep showing the old status names.

## D17 — Real-time updates in v1
Context: none / SSE / websockets.
Options: A) none, manual refresh B) SSE push on board/backlog changes C) websockets
Market: Linear/Trello treat live sync as a core differentiator; Jira/YouTrack use polling or a pub/sub add-on; small self-hosted boards rarely need it.
Product vote: A — skip it; manual refresh is fine for a small self-hosted team, avoids reconnect/pubsub infra for a boards-first v1. Revisit if multi-viewer conflicts become a real complaint.
Architecture vote: A — no pub/sub, reconnect or fan-out code; concurrent moves are serialized per project (D21), so the last write wins cleanly. Upgrade path: axum SSE fed by PostgreSQL `LISTEN/NOTIFY`, swapped in by htmx.
Winner: A — no infrastructure for an unproven need; accepted: viewers see others' changes on reload.

## D18 — Quick filter persistence
Context: SB OQ-13.
Options: A) per user, per board, server-side B) per user, local-storage only C) not persisted D) URL query params, not stored (architecture)
Market: Jira and Linear both persist filter toggles per viewer across sessions/devices.
Product vote: A — store per user per board server-side; trivial given the existing member/board relation, and follows the user across devices unlike local storage.
Architecture vote: D — filters live in the board URL (`?assignee=…&type=…`, htmx `hx-push-url`): bookmarkable, shareable in a standup chat, back/forward work, read by the server on render. A needs a table, a write per toggle, a URL-vs-stored precedence rule, and silently restores filters the user forgot (cards look missing).
Winner: D — visible, shareable state with zero schema; accepted: opening the board from navigation shows it unfiltered on any device. Upgrade path: store the last query string per member if users ask.
Amended (SAN-33): the predefined "recently updated" filter (SB-26) is `?recently_updated=true` on board, backlog and search, matching issues whose `updated_at` falls in the last 24 hours. `issue.updated_at` is kept by triggers (migration 0009): any change to the row, a comment, or a child added under or moved between parents bumps it; a write that sets `updated_at` itself wins (imports). Triggers over service code so no write path, FK cascade or sprint close can forget it, at zero extra round trips (D39). Board and backlog filter in Rust after their one query, so no index; search adds one predicate to its project-scoped keyset scan.
Amended (SAN-92): `parseBoardSearch` keeps only well-formed params, so a hand-edited link never breaks the board.

## D19 — Primary keys
Context: every table needs an id; issues are addressed publicly by `KEY-N` (D20), the rest by id.
Options: A) UUIDv7 B) `bigint generated always as identity` (standard form of bigserial)
Product vote: n/a
Architecture vote: B — 8 bytes, fastest indexes and joins, plain `i64` in Rust, readable in logs and URLs; PostgreSQL 17 has no native `uuidv7()`, so A adds a crate and app-side generation for a one-database app.
Winner: B — simplest and fastest for a single self-hosted database; accepted: ids are guessable and reveal counts, harmless because every lookup is scoped by membership and non-members get 404 (D28).

## D20 — Issue numbering
Context: `KEY-N` must be unique, never reused, and survive concurrent creates.
Options: A) `max(number) + 1` B) one sequence object per project C) `project.next_issue_number` counter
Product vote: n/a
Architecture vote: C — `UPDATE project SET next_issue_number = next_issue_number + 1 … RETURNING` inside the create transaction; the row lock serializes concurrent creates and `UNIQUE (project_id, number)` backs it. A races and reuses after deletes; B needs DDL per project.
Winner: C — one statement, no duplicates, never reused; accepted: creates within one project are serialized (irrelevant at human speed).

## D21 — Rank encoding (open-ended keys amended by D39)
Context: one total order per project (D4); a move must rewrite one row.
Options: A) fractional index string B) integer with gaps C) LexoRank-like buckets
Product vote: n/a
Architecture vote: A — a pure `rank_between(before, after)` over a base-62 ASCII alphabet in `issues/domain.rs`, property-tested; column `rank text COLLATE "C"` so PostgreSQL sorts bytewise like Rust; moves lock the project row (as D20) and `UNIQUE (project_id, rank)` catches bugs. B and C both need a rebalancing path.
Winner: A — one-row moves and no rebalancing code; accepted: keys grow about one character per repeated insert into the same gap (ceiling ~64 chars; upgrade: one re-spread migration).

## D22 — Session storage
Context: web login with email and password (argon2).
Options: A) server-side `auth_token` table + HttpOnly cookie B) signed JWT cookie
Product vote: n/a
Architecture vote: A — 32 random bytes in a `HttpOnly; Secure; SameSite=Lax` cookie, only the SHA-256 stored; logout, password change and member removal revoke with one `DELETE`; fixed 30-day expiry, new token per login; non-GET requests also need a same-origin `Origin`. B can't revoke without a denylist (a session table again) and adds key rotation.
Winner: A — instant revocation, nothing to sign; accepted: one indexed lookup per request.
Accepted: `POST /api/auth/register` answers 409 for a taken email, so it reveals that an account exists; revisit when email verification lands.

## D23 — API token format and storage
Context: CLI and MCP act as a user through a personal token.
Options: A) opaque random token, hash stored B) JWT
Product vote: n/a
Architecture vote: A — `santi_` + 32 random bytes, shown once, stored as SHA-256 only (high-entropy tokens need no argon2 and the hash stays indexable), in the D22 table with `kind = api`, a name and no expiry; revoke = delete the row. One extractor reads the cookie or `Authorization: Bearer`; the prefix lets secret scanners flag leaks.
Winner: A — one auth path for web, CLI and MCP; accepted: a token carries its user's full rights (no scopes in v1).

## D24 — Error format
Context: one error body for REST, CLI and MCP.
Options: A) RFC 9457 `application/problem+json` B) ad hoc `{code, message}`
Product vote: n/a
Architecture vote: A — one `AppError` enum maps to `type` (`urn:santi:error:<slug>`, stable for clients), `title`, `status`, `detail`, plus `errors: [{field, message}]` for validation; documented once in OpenAPI. CLI and MCP print `detail` and branch on `type`; HTML routes render the same error as inline messages.
Winner: A — a standard every HTTP client already understands; accepted: slightly more fields than an ad hoc body.
Amended (SAN-51): text input never holds U+0000 (PostgreSQL text cannot): every text validator and the search `q`/`label` answer 422 on the field, and SQLSTATE 22021 maps to 422 as a net. Descriptions are capped at 65,536 characters (domain rule plus a CHECK in migration 0013), next to summaries (255) and comments (20,000); an import cuts longer ones and reports a problem row.
Amended (SAN-97): request bodies refuse unknown fields (every request DTO denies them; MCP tools check arguments against their schema). Valid JSON of the wrong shape answers 422 `validation` with serde's reason in `detail` and in `errors[0].message`; `errors[0].field` names the unknown or missing field, else `body`; a non-object body reads "expected a JSON object", never a Rust type name. Malformed JSON and a wrong content type stay 400.

## D25 — Crate and slice layout (consequence of D1; `web.rs` and `templates/` go away at the D37 cutover)
Context: D1 drops Leptos, so `santi-web` has no WASM to hold.
Options: A) keep a `santi-web` crate for templates B) pages live in `santi-server`
Product vote: n/a
Architecture vote: B — three crates (`santi-types`, `santi-server`, `santi-cli`). Each slice: `domain.rs` (pure rules), `repo.rs` (sqlx), `service.rs` (use cases: membership, transaction, domain + repo), `handler.rs` (JSON + utoipa), `web.rs` (askama HTML); both front doors call `service.rs` only, so no rule is written twice. Templates in `templates/` by FSD layer (`app → widgets → features → entities → shared`, includes only downward).
Winner: B — handler → service → domain/repo reads the same for HTML and JSON; accepted: one more file per slice.

## D26 — Web asset budget (replaces the WASM bundle question; superseded by D37)
Context: D1 removes WASM; the browser still needs htmx, drag and drop and CSS.
Options: A) npm bundler pipeline B) vendored files embedded in the binary
Product vote: n/a
Architecture vote: B — vendored `htmx.min.js`, one `app.js` (drag and drop, "move to…" fallback), one `app.css`, embedded with `include_str!` and served under `/static/<version>/` with immutable caching; budget under 50 KB gzipped JS + CSS; no runtime CDN (self-hosted instances may be offline).
Winner: B — no Node toolchain, first paint from one HTML response; accepted: no TypeScript or CSS preprocessing for the little client code there is.

## D27 — Migrations and SQL checking
Context: schema changes ship inside the one binary.
Options: A) `sqlx migrate` B) refinery or diesel migrations
Product vote: n/a
Architecture vote: A — plain `.sql` files in `crates/santi-server/migrations/`, embedded with `sqlx::migrate!()` and applied at startup, forward-only; `sqlx::test` applies them per test database. Queries use the checked `query_as!` macros with committed `.sqlx/` offline data, so a build needs no database; CI runs `cargo sqlx prepare --check`.
Winner: A — same tool as the queries, SQL anyone reads; accepted: whoever changes SQL needs `sqlx-cli` and a running database to refresh `.sqlx/`.

## D28 — Authorization model
Context: every project-scoped action must check membership, and admin-only actions the role.
Options: A) checks inside each handler B) one membership extractor
Product vote: n/a
Architecture vote: B — project routes carry `/projects/{key}/`; one extractor loads project and caller membership in one query and yields `Member`; every service function takes `&Member`, so no use case runs unchecked; non-members get 404; admin-only rules check `member.role` in domain; repo queries always filter by the member's project, so ids from another project never resolve.
Winner: B — one place to audit; accepted: every project-scoped URL carries the project key.
Amendment (SAN-70): the same extractor applies the project lifecycle. A trashed project resolves to no membership (404 for everyone, admins included); restore and purge reach it through their own lookup by key, admins only. An archived project lets reads through and answers every other method with 409 `project-archived`, except an allow-list by route template (unarchive, visit, issue view) and a member deleting their own membership (leaving); stars live under `/api/me` and check only that the project is not trashed. A new write route is guarded by default; a new read-like POST must join the allow-list. Accepted: the allow-list matches route templates, so renaming one of those routes must update it (tests cover each).

## D29 — Pagination
Context: board and backlog are bounded views; search and lists grow without bound.
Options: A) offset/limit B) keyset cursor C) none
Product vote: n/a
Architecture vote: C for board and backlog (one ranked query each), B for `search_issues` and other lists: `limit` (default 50, max 200) + opaque `cursor` (last id), response carries `next_cursor`.
Winner: C + B — stable pages under concurrent inserts at constant cost; accepted: the backlog loads unpaged (ceiling ~2k open issues; upgrade: lazy no-sprint section).

## D30 — Unmapped status storage
Context: a status sits in one column or in the unmapped pool (SB-2/3).
Options: A) nullable `status.column_id` B) sentinel "unmapped" column row
Product vote: n/a
Architecture vote: A — NULL means unmapped; column queries need no exclusion and the board's inner join drops unmapped issues for free (SB-3). B makes every column query remember to skip a fake row.
Winner: A — the schema says what it means; accepted: the unmapped pool is a list in board settings, not a column.

## D31 — One board per project
Context: v1 has exactly one board per project; more may come later.
Options: A) `UNIQUE (project_id)` on board B) board fields on project C) app-level check
Product vote: n/a
Architecture vote: A — the database enforces it now; relaxing later means dropping the constraint and moving the status→column mapping into a join table, one migration. Keeping the mapping on `status.column_id` (D30) avoids a speculative join table today.
Winner: A — enforced and cheaply reversible; accepted: multiple boards will need a mapping migration.

## D32 — Sprint deletion cascade
Context: deleting a future sprint must return all its issues atomically (D14).
Options: A) loop in Rust B) explicit `UPDATE` then `DELETE` in one transaction C) FK `issue.sprint_id … ON DELETE SET NULL`
Product vote: n/a
Architecture vote: C — atomic by construction, nothing to forget; the guard is in the statement (`WHERE state = 'future'`, 0 rows → 409).
Winner: C — one statement; accepted: the reassignment rule lives in the schema, named in the migration, not in Rust.

## D33 — Done-hiding window query
Context: kanban hides `done` issues older than the board window (D8).
Options: A) live `WHERE` on `done_at` B) cached or materialized "hidden" flag
Product vote: n/a
Architecture vote: A — `done_at IS NULL OR done_window_days IS NULL OR done_at > now() - make_interval(days => done_window_days)` in the kanban board query; B needs a scheduler and is stale between runs.
Winner: A — always correct, no job; accepted: the predicate runs on every board load (cheap: rows are already narrowed to one project).

## D34 — Data transport: JSON over HTTP vs gRPC
Context: the API serves the web UI, the CLI, the MCP server and third-party scripts; E2 fixes the wire format.
Options: A) JSON over HTTP (REST + OpenAPI) B) gRPC with protobuf C) both
Market: Linear, GitHub, GitLab and YouTrack expose JSON over HTTP (REST or GraphQL) as their public API; none ships gRPC to integrators.
Product vote: A — integrations and scripts speak HTTP + JSON natively (curl, any language's standard library); gRPC raises the contribution bar with protoc, generated code and a second toolchain.
Architecture vote: A — JSON REST described by OpenAPI (D24 errors included) with gzip/br response compression (`tower-http`); the browser gets HTML through htmx anyway (D1), payloads are a few KB so serialization cost is negligible next to the database and the network, and every call stays debuggable with curl and browser devtools. B would need grpc-web or a proxy for the browser and protoc in every build.
Winner: A — one wire format for UI, CLI, MCP and scripts; accepted: the contract is typed by OpenAPI plus the shared `santi-types` DTOs instead of protobuf schemas, and gRPC is reconsidered only for high-volume service-to-service traffic, which santi does not have.

## D35 — CSS with Tailwind (amends D26; superseded by D37)
Context: the hand-written `app.css` slowed down the tracker-style layout pass; the owner asked for Tailwind.
Options: A) keep hand-written CSS B) Tailwind v4 standalone CLI, output committed C) Tailwind through npm
Product vote: B — utility classes in the askama templates make layout changes fast and readable next to the markup.
Architecture vote: B — the standalone binary needs no Node; `static/app.css` is generated (minified) and committed, so `cargo build` still needs nothing extra; CI downloads the binary, regenerates and fails when the committed file is stale. JS stays vendored as in D26, same 50 KB gzip budget.
Winner: B — fast styling with no Node toolchain; accepted: contributors who change styles install one binary (`brew install tailwindcss`).

## D36 — Visual identity: light theme, brand purple, teal for done (amended 2026-10-15)
Context: first screens shipped dark with a teal accent. The owner reviewed two mockups: A (dark warm-stone surfaces #0F0F0E / #1A1918 / #262422, teal #2DD4BF accent, deep-teal status button in a light issue modal) and B (light canvas, #FAFAFB sidebar, #F4F5F7 columns, brand purple #4C35D2 from the owner's other product), liked both, and settled on the purple.
Options: A) dark + teal accent B) light + purple, teal dropped C) hybrid — light + purple as the only brand color, teal kept as the semantic color for done/success, and a dark theme built from A's stone surfaces with the purple shifted lighter
Market: the reference tracker is light with a blue brand and grey/blue/green status lozenges; Linear brands with a violet accent and ships light and dark from one token set; GitHub marks finished work purple and open work green. Purple is free in the category; blue is taken.
Product vote: C — light + dense rows is what tracker users expect on day one (B); purple is santi's identity and is never blue; teal survives where the owner liked it, as the "done" signal (status chip, status button, success toast), so done reads as a reward color and not as a second brand.
UX vote: C — contrast decides the roles. Purple #4C35D2 is 7.64:1 on white both ways (text on white, white on purple; hover #3F2CB0 9.55, pressed #34258F 11.62), AAA for text and buttons. Teal #2DD4BF is 1.86:1 on white, so it can never be text or a button fill on light; teal-700 #0F766E (5.47 on white, white on it 5.47) is the light-theme teal. On dark, #4C35D2 drops to 2.30 on #1A1918 (fails), so dark uses brand-300 #B8ABF1 for text (8.47) and brand-400 #8B78E9 for fills and focus (4.98; dark label #1B1348 on it 4.83). The old subtle grey #8A8F9C is 3.24 on white and fails body text: replaced by #6B7080 (4.94 on white, 4.52 on #F4F5F7). Colour-blind simulation (Machado 2009, full severity): the status trio grey/purple/teal keeps its closest pair at ΔE 15 (protan) and 16 (deutan), to-do vs done, and 27 under tritan; in progress vs done stays above 70 under red-green deficiency. An amber/green trio scores no better (16 under protan), so the trio is safe enough with the glyphs doing the main work. Issue types and priorities are told by glyph first: bug red vs epic amber is only ΔE 9.8 under deutan, so color never carries meaning alone; of the priorities only urgent is colored.
UI vote: C — one solid purple per view (the primary action), purple tint for selection and the active nav item, teal only for done/success, red only for danger. Board headers uppercase 12px with letter spacing, counts and keys in tabular numerals. Dark theme = A's warm stone surfaces with the purple scale shifted up two steps, so the dark story is the mockup the owner liked, minus the teal accent.
Architecture vote: C — the Tailwind `@theme` declares the brand scale plus semantic tokens (`--color-canvas`, `--color-primary`, `--color-status-done`, …); templates use semantic tokens only, never raw hex or scale steps. Dark redefines the same semantic tokens under `@media (prefers-color-scheme: dark)` and `[data-theme=dark]`, so no template carries a `dark:` variant and turning dark on later is a CSS-only change.
Winner: C — light + purple ships with SAN-32; teal is the done/success color; dark tokens are defined now and switched on in a later pass. Accepted: two accent hues to keep apart (purple = act/select, teal = done), done chips need the darker teal-800 text on light (#115E59), and dark-mode QA of every screen is deferred.

Tokens (contrast is against the surface the token sits on; ≥ 4.5 text, ≥ 3 icons and control borders):

| Group | Token | Light | Dark |
|---|---|---|---|
| Brand scale | `brand-50…950` | #F3F1FD #ECE8FB #D7D0F7 #B8ABF1 #8B78E9 #5A42E0 #4C35D2 #3F2CB0 #34258F #2C2075 #1B1348 | same scale |
| Neutral | canvas (page) | #FFFFFF | #0F0F0E |
| | surface (sidebar) | #FAFAFB | #1A1918 |
| | sunken (columns, backlog sections) | #F4F5F7 | #1A1918 |
| | raised (cards, modal, menus) | #FFFFFF | #262422 |
| | hover row | #EEF0F3 | #33302D |
| | border (dividers, card edge) | #E4E5E9 | #3A3734 |
| | control border (inputs, checkboxes) | #8A8F9C (3.24) | #78716C (3.22) |
| | text | #172033 (16.3) | #EDEBE8 (13.0 on raised) |
| | text muted | #5E6475 (5.91) | #A8A29E (6.13) |
| | text subtle (meta, placeholder) | #6B7080 (4.52 on sunken) | #948F8A (4.83) |
| Primary | fill / label | #4C35D2 / #FFFFFF (7.64) | #8B78E9 / #1B1348 (4.83) |
| | hover, pressed | #3F2CB0, #34258F | #B8ABF1, #D7D0F7 |
| | link, active nav text | #4C35D2 | #B8ABF1 (8.47) |
| | selected / active nav bg | #F3F1FD, strong #ECE8FB | #2C2075 (#B8ABF1 on it 6.45) |
| | focus ring (2px, 2px offset) | #4C35D2 | #8B78E9 (5.44) |
| Status | to do — `circle` | #3D4354 on #EEF0F3 (8.64) | #D6D3D1 on #33302D (8.80) |
| | in progress — `circle-dot` | #3F2CB0 on #ECE8FB (7.96) | #C4B8F5 on #2C2075 (7.34) |
| | done — `circle-check` | #115E59 on #CCFBF1 (6.73) | #5EEAD4 on #134E4A (6.41) |
| Issue type | story — `book-open` | #0F766E | #2DD4BF |
| | task — `clipboard-check` | #475569 | #94A3B8 |
| | bug — `bug` | #B42318 | #F97066 |
| | epic — `layers` | #B45309 | #FBBF24 |
| | subtask — `list-tree` | #5E6475 | #A8A29E |
| Priority | urgent — `circle-alert` | #B42318 | #F97066 |
| | high — `signal-high` | #172033 | #EDEBE8 |
| | medium — `signal-medium` | #5E6475 | #A8A29E |
| | low — `signal-low` | #6B7080 | #948F8A |
| Feedback | danger text / fill / tint | #B42318 / #B42318 + white (6.57) / #FEF3F2 | #F97066 / #F97066 + #0F0F0E (6.88) / #3B1512 |
| | warning text / icon / tint | #92400E on #FEF3C7 (6.37) / #B45309 | #FBBF24 / #FBBF24 / #3A2A0A (8.30) |
| | success text / tint | #0F766E (5.47) / #CCFBF1 | #2DD4BF (9.43) / #134E4A |

Rules: status, type and priority always show glyph and text; color is the second cue. Warning (WIP over limit, overdue sprint) shares amber with the epic glyph; they never appear in the same slot.

Amendment (SAN-35, 2026-10-16, visual pass, `visual-review.md`): tokens added, contrast against the token's own background.

| Token | Light | Dark | Use |
|---|---|---|---|
| `primary-pressed` | #34258F | #D7D0F7 | pressed primary button (the "pressed" step of the table above, now a token) |
| `hover` | #EEF0F3 | #33302D | hover of rows, menu items, ghost and outline buttons, skeletons (the "hover row" neutral, now a token); the purple tint stays for selection only |
| `avatar-1…6` / `-foreground` | #ECE8FB/#3F2CB0 (7.96), #ECFCCB/#3F6212 (6.52), #FEF3C7/#92400E (6.37), #FFE4E6/#9F1239 (6.68), #EEF0F3/#3D4354 (8.64), #FCE7F3/#9D174D (6.71) | #2C2075/#C4B8F5 (7.34), #1A2E05/#BEF264 (11.19), #3A2A0A/#FBBF24 (8.30), #4C0519/#FDA4AF (8.27), #33302D/#D6D3D1 (8.80), #500724/#F9A8D4 (8.29) | initials avatars, tone picked from the name (`avatarTone`); no teal (done) and no blue |
| `select-chevron` | chevron in #5E6475 | chevron in #A8A29E | the one arrow every native select draws |

Motion: menus, popovers and selects 150 ms, dialogs and sheets 200 ms, ease-out; `prefers-reduced-motion: reduce` collapses every animation and transition. Board columns flex between 18rem and 26rem.

## D37 — Web UI: React SPA on shadcn-admin (supersedes D1, D26, D35 for the web UI)
Context: the owner decided (binding) to replace the askama + htmx UI with a React SPA built on satnaing/shadcn-admin (MIT, v2.2.1, checked 2026-10-15 at `e16c87f`). The owner maintains React and shadcn daily, and the next screens need rich client behavior that htmx makes awkward: dnd-kit drag and drop with keyboard sensors, optimistic moves, a command palette, stacked dialogs and sheets. The JSON API (D34) already covers every page, so the server keeps one front door after the cutover.
Options: A) keep htmx (D1) B) React SPA on shadcn-admin C) React SPA from scratch on the shadcn CLI
Market: Linear, Plane and Height ship React SPAs over their own API; Plane and Twenty are open-source React + Tailwind and are self-hosted as API plus static bundle.
Product vote: B — the owner ships it fastest, and the template already has the sidebar shell, header, command menu (cmdk), data table, dialogs, sheets, toasts (sonner) and auth screens the IA (`information-architecture.md`) lists; C rebuilds those.
Architecture vote: B, with the template trimmed — reuse its components as they are; delete what santi has no use for (Clerk, faker data, axios, the demo pages, the JS-readable token cookie in `stores/auth-store.ts`). One contract: the SPA calls `/api/*` only, typed from the server's OpenAPI. A loses the interactions above; C pays again for what the template already tested.
Winner: B — accepted: a Node toolchain (pnpm) for anyone touching the UI, a second gate (typecheck, lint, Vitest coverage, Playwright), and two UIs in the tree until parity. The htmx UI keeps serving production until the SPA reaches parity; the cutover PR removes `web.rs` files, `templates/`, `static/`, `styles/` and `scripts/css.sh` together.

Stack (template versions, `package.json` at `e16c87f`): Vite ^8.0.8, React ^19.2.5, TypeScript ~6.0.3, TanStack Router ^1.168.22 (file routes, `@tanstack/router-plugin`), TanStack Query ^5.99.0, react-hook-form ^7.72.1 + zod ^4.3.6 (`@hookform/resolvers` ^5.2.2), zustand ^5.0.12, Radix + shadcn components (`new-york`, lucide icons), Tailwind ^4.2.2 via `@tailwindcss/vite`, sonner, cmdk 1.1.1, Vitest ^4.1.4. Added by santi: `@dnd-kit/core` 6.3.1 + `@dnd-kit/sortable` 10.0.0 (stable line; `@dnd-kit/react` 0.5 is pre-1.0), `openapi-typescript` 7.13.0 + `openapi-fetch` 0.17.0, `@playwright/test`. Package manager pnpm (template lockfile). Node ^20.19 or >= 22.12 (Vite 8).

State: server data lives only in TanStack Query; client UI state (sidebar, open dialogs, drag preview) lives in component state and the URL. zustand was dropped as unused (SAN-52): add it when needed, for client UI state only, never server data or credentials. Filters stay in the URL (D18) as TanStack Router search params validated by zod. Optimistic writes: `onMutate` patches the board/backlog cache, `onError` rolls back and toasts the D24 `detail`, `onSettled` invalidates; a move sends the D4 anchor (`before`/`after`), never a computed rank.

Testing: Vitest + Testing Library queries. Component tests run in Vitest browser mode (template default: real Chromium through Playwright, `vitest-browser-react`, whose `getByRole`/`getByText` follow Testing Library semantics), because Radix portals and dnd-kit pointer sensors need real layout that jsdom lacks; pure logic in `entities`/`shared` runs in the same suite. API calls are stubbed by passing a `fetch` to the `openapi-fetch` client, no mock server. Playwright end to end for the key flows only, against the real server, Postgres and the built SPA: sign in, create issue, drag a card across columns (and the keyboard "Move to…" path), plan and start a sprint, complete a sprint with open issues. Coverage gate > 90% on statements, branches, functions and lines with `coverage.include: ['src/**']`, so untested files count as 0%; excluded: generated files (`routeTree.gen.ts`, `shared/api/schema.d.ts`), unmodified shadcn primitives in `shared/ui`, and route files (thin, like `main.rs`).

FSD inside `web/src` (`app → pages → widgets → features → entities → shared`, imports only downward, enforced by ESLint `no-restricted-imports` per layer; no extra plugin). Template folders map as:

| FSD layer | Holds | From the template |
|---|---|---|
| `app/` | entry, providers, router, query client, global CSS, file routes (`app/routes/`, `routeTree.gen.ts`) | `main.tsx`, `context/*`, `styles/*`, `routes/*` (plugin `routesDirectory: ./src/app/routes`) |
| `pages/` | one folder per IA page (board, backlog, issue, search, settings, account, login, register, join, home, new project) | `features/*/index.tsx` (the template's "features" are pages) |
| `widgets/` | shell (sidebar, top bar, project header), filter bar, board columns, backlog sections, epic panel | `components/layout/*`, `command-menu.tsx`, `components/data-table/*` |
| `features/` | user actions: move issue (dnd-kit), create issue, edit field, start/complete sprint, sign in/out, invite | form and dialog parts of `features/*/components`, `confirm-dialog.tsx`, `sign-out-dialog.tsx` |
| `entities/` | issue, sprint, project, member, user: query options and display pieces (card, status chip, type glyph) | none, written for santi |
| `shared/` | `ui/` (shadcn primitives), `lib/` (utils, hooks), `api/` (client + generated types), `config/` | `components/ui/*`, `lib/*`, `hooks/*` |

`components.json` aliases point at `@/shared/ui` and `@/shared/lib/utils`, so `shadcn add` lands in the right layer. Route files only validate params and search, call `ensureQueryData` in the loader and render the page.

Tokens: the D36 semantic tokens fill the shadcn CSS variables in `app/styles` (`--background` canvas, `--sidebar` surface, `--muted` sunken, `--card`/`--popover` raised, `--border`, `--input` control border, `--primary` #4C35D2, `--ring` focus, `--destructive` danger) plus santi tokens in `@theme` (`--color-status-*`, `--color-type-*`, `--color-success`). Components use tokens, never raw hex; the template's theme switch stays hidden until dark QA (D36).

API client: `openapi-typescript` generates one types file from the server's `openapi.json`; `openapi-fetch` (about 6 KB) types every call by path, method, params, body and responses, including the D24 problem bodies. Chosen over orval because it emits no runtime code (nothing generated to cover or exclude beyond one `.d.ts`), it reads OpenAPI 3.1 as utoipa emits it, and query keys and hooks stay hand-written in `entities/*/api.ts` next to the cache patches the optimistic moves need. Accepted: no generated hooks; one `queryOptions` per read is written by hand. `openapi-typescript` 7 declares `typescript ^5` as a peer while the template pins ~6.0.3; it runs only as a codegen CLI, so the peer warning is accepted unless generation fails.

Session: unchanged D22. Login posts to `/api/auth/login`, the server sets the `HttpOnly` `__Host-santi_session` cookie, and the SPA never sees a token. The `_authenticated` layout route's `beforeLoad` runs `ensureQueryData(me)` (`GET /api/me`): 200 caches the user, 401 redirects to `/login?redirect=…`; any later 401 clears the query cache and does the same. Logout posts `/api/auth/logout` and clears the cache.

CSRF: unchanged D22 middleware (`reject_cross_site_writes`). The SPA is served by the same server, so every `fetch` is same-origin, sends `Sec-Fetch-Site: same-origin` and passes; no token, no CORS. In dev, Vite (port 5173) proxies `/api`, `/openapi.json` and `/health` to the server (8080) with `changeOrigin: false`, so the browser stays on one origin and the `Origin`/`Host` fallback also matches. Dev runs in Chromium or Firefox, which accept `Secure` cookies on `http://localhost`.

Serving: until parity the SPA runs from Vite in dev only, and production keeps the htmx UI. At cutover the server keeps `/api/*`, `/openapi.json`, `/docs`, `/health`, serves the built `web/dist` (hashed `/assets/*` immutable), and answers every other GET with `index.html`; unknown `/api/*` stays a D24 404.

License: shadcn-admin is MIT (Copyright (c) 2024 Sat Naing). `web/LICENSE-shadcn-admin` keeps its notice verbatim and `web/README.md` credits the template; santi's own code stays MIT OR Apache-2.0.

Done at cutover (SAN-42, 2026-10-16): the SPA serves from `/` (Vite `base` and router basepath `/`); the `web.rs` files, `templates/`, `static/`, `styles/`, `scripts/css.sh`, the `css` CI job, the askama dependency and the htmx tests are deleted. Slices keep `domain.rs`, `repo.rs`, `service.rs` and `handler.rs` (D25 without `web.rs`).

Amendment (SAN-61, 2026-10-16, landing page): the public landing page is a second Vite entry, `web/landing.html` — static HTML styled by its own Tailwind entry (`app/styles/landing.css`, D36 tokens, shadcn button and card classes ported) with no React; its only script is the copy button (< 1 KB gzip; budgets in `pnpm size`: JS ≤ 10 KB, CSS ≤ 10 KB, hero image ≤ 60 KB). The server answers `GET /` with `landing.html` when the request carries no `__Host-santi_session` cookie and with `index.html` when it does (the SPA still redirects to `/login` if that session is invalid), with `Vary: Cookie` so a browser never revalidates one page against the other; `/about` is always the landing page. Both stay `no-cache` under the D22 security headers and CSP. Chosen over a React route because the landing needs none of the SPA's 128–147 KB of first-visit JS and must paint under 1 s on a throttled phone. Its absolute URLs (canonical, Open Graph, `robots.txt`, `sitemap.xml`) come from `VITE_SITE_URL` at build time (Docker `--build-arg`), default `http://localhost:8080`.

Amended (SAN-73): the sidebar feeds `GET /api/me/recent` and `GET /api/me/starred` are one statement each after the token lookup (budget 2), offset paging as the home lists; they read by `user_id` prefixes (`issue_activity`, `issue_star` primary keys, `member_user_idx`), no new index. No new visit tracking: a project's time is `greatest(member.visited_at, newest view or work on its issues)`, shared with `/api/me/projects`. The More projects flyout filters the cached `/api/me/projects` list without a request.

Amended (SAN-92, rationale moved out of code comments): `useOptimisticWrite` refetches only when the last pending write under its key settles; the settling write still counts in `isMutating`, and a refetch under a later pending write would undo that write on screen. A rollback writes a fresh object, since the drag layer drops its pending order only when its view changes identity. After a deploy, an open tab whose lazy `import()` fails reloads once per tab session onto the new build (`sessionStorage` guard; without storage, no reload, so no loop).

## D38 — Repository layout: monorepo now, split-ready
Context: D37 puts the SPA in `web/`, and the owner plans to move it to its own repository later. The question is where it lives now, how self-hosters run it, and what keeps the later move cheap.
Options: A) monorepo, `web/` next to `crates/`, independent toolchains, no split rules B) separate `santi-web` repository now C) monorepo now with split boundaries and a written split procedure
Market: Gitea and Plane keep API and web UI in one repository and ship one deployable; Mattermost merged its separate webapp repository back into its server monorepo in 2023 because cross-repo changes were too slow; Twenty is an Nx monorepo. Teams split when the front gets its own release train or team.
Product vote: C — one PR carries the API change and the screen that uses it, so MVP features land in one review; contributors clone one repository; self-hosters pull one image. The split stays a mechanical step for later.
Architecture vote: C — A drifts: nothing stops shared imports, one mixed CI job and one mixed changelog, and the split becomes a refactor. B now doubles every feature into two lockstep PRs while the API still changes weekly, and two deployables push toward two origins: cross-origin needs CORS with credentials and `SameSite=None` cookies, which drops D22's `__Host-` + `Lax` cookie and makes every SPA write `Sec-Fetch-Site: cross-site`, rejected by the D22 middleware, or else a reverse proxy just to get one origin back. C keeps one origin and makes the move a command.
Winner: C — accepted: two toolchains in one repository (cargo, pnpm) and a contract snapshot to keep fresh in every API PR.

Boundaries (what makes the split mechanical):
- Nothing under `web/` imports or reads outside `web/`; no crate reads `web/` source. The only shared artifact is the contract.
- Contract: `web/openapi.json` is a committed snapshot of the server's OpenAPI. A server test renders the spec (from a DB-free `santi_server::openapi()`) and fails when the snapshot differs (`UPDATE_OPENAPI=1` rewrites it); the web job regenerates `src/shared/api/schema.d.ts` from the snapshot and fails on a diff. An API change and its regenerated types land in the same PR.
- `web/` owns its `package.json`, `pnpm-lock.yaml`, `CHANGELOG.md`, `README.md`, `LICENSE-shadcn-admin` and version; CI gets a separate `web` job (`working-directory: web`: typecheck, lint, Vitest coverage, build) plus an `e2e` job (server + Postgres + built SPA + Playwright).
- Commits touching `web/` touch only `web/` (scope `web`, e.g. `feat(web): …`), except the contract PR that changes the server and `web/openapi.json` + generated types together.
- The server serves the built SPA at runtime from `SANTI_WEB_DIR` (default `web/dist`) through `tower-http` `ServeDir` with an `index.html` fallback; it does not embed it at compile time, so `cargo build` and `cargo test` need no Node and survive the split unchanged. Upgrade: embed the build (`rust-embed`) when a single-file binary release is wanted.

Packaging: one image, one service, one origin. A multi-stage `Dockerfile` builds `web/dist` with Node, the server with cargo, and copies both into the final image with `SANTI_WEB_DIR` set; `compose.yaml` stays server + Postgres. One release tag `vX.Y.Z` for the image; `web/CHANGELOG.md` lists UI changes separately. After a split the image still bundles a pinned `santi-web` release build, so the origin and D22 do not change.

Split procedure: `git subtree split --prefix=web -b web-split`, push `web-split` to the new `santi-web` repository as `main`, move the `web` CI job there, delete `web/` here, keep the snapshot test writing `openapi.json` at this repository's root, and have the image build download the `santi-web` release `dist` by pinned version. The web repository updates its snapshot from server releases.

Split trigger: never before the cutover (htmx removed) and v1.0.0 (API under semver). After that, split at the first of: a UI change needs a release without a server release; regular contributors work only in `web/`; the SPA build gets a second consumer (CDN-hosted or desktop shell).

## D39 — Performance budgets (SAN-43)
Context: the owner asked for extreme performance: the copy must beat the tracker it replaces on every screen. Budgets need numbers, a dataset to measure them on, and a guard that fails CI before a regression ships.
Options: A) no budgets, profile when someone complains B) budgets measured by hand once C) written budgets, a repeatable seed + load script, and a CI guard on statement counts and a latency ceiling
Product vote: C — speed is a feature only while it lasts; the boards and the backlog are opened hundreds of times a day.
Architecture vote: C — wall-clock numbers flake in CI, statement counts do not: the guard counts SQL statements per request (no N+1 can hide) and keeps a generous latency ceiling for pathological regressions; the tight latency budget is checked with the load script on a laptop.
Winner: C — accepted: the load numbers are laptop numbers, rerun by hand (`docs/perf.md`) when a hot query changes.

API budgets, at 5k issues / 50 users / 20 sprints (`seed`), release build, 10 concurrent connections on a laptop (`scripts/perf.sh`):
- p95 < 30 ms and p99 < 60 ms for board (scrum and kanban), backlog, issue detail, search and move.
- One SQL round trip per read model where possible, never one per row; statement budgets per request are pinned in `tests/perf_budget.rs` (board and backlog 4, issue and search 2, move 9, delete 5).
- Every hot query backed by an index, checked with `EXPLAIN ANALYZE` on generic plans (sqlx prepares statements). At 5k issues the planner seq-scans `issue` for board and backlog because one project fills most of a small table; the `issue_project_*` indexes take over as the table grows.
- Response compression on (gzip and br through `tower-http`, br at quality 4).
- Connection pool sized: twice the cores, clamped 10–50, `SANTI_DB_POOL` overrides; sqlx's default of 10 capped throughput at 50 concurrent clients.

Fixes that came out of the first measurement:
- Rank keys (amends D21): an open-ended `rank_between` halved the gap to the edge, so every append (new issue, move after the last) added a character every ~6 issues; 5k issues carried 667-char keys into every card and the backlog weighed 906 KB. Open-ended keys now step one unit with escape levels (`level` leading 'z' or '0' digits, then a `level + 1` digit counter), staying ≤ 5 chars for 10k appends or moves to the top. Keys already stored keep working; data seeded before the change keeps its long keys (no re-spread migration while v1 is unreleased).
- Token and membership resolve in one query (`members::repo::find_member_by_token`), one round trip less on every project-scoped request.

Known ceilings: the backlog loads unpaged (D29) and is the endpoint closest to budget (~1.2k cards, 375 KB raw, 26–28 KB compressed); upgrade: lazy no-sprint section. Moves in one project are serialized by the D21 project lock, so concurrent moves in one project queue.

SPA budgets (enforced by the SPA cards): initial JS < 170 KB gzip (`size-limit`, SAN-38); LCP < 1.0 s; INP < 100 ms; writes optimistic (D37); lists over 200 rows virtualized; no layout shift (CLS 0: skeletons and reserved sizes).

Amended (SAN-62): `POST /api/sample-project` writes a whole sample project through the use cases (2 sprints, 15 issues, 3 comments, sprint start) once per user: budget 150 statements and 1 s in `tests/perf_budget.rs` (148 measured); a repeat call only looks the project up (3).

Amended (SAN-72): the home reads in one statement per list after the token lookup (budget 2 in `tests/perf_budget.rs`): `GET /api/me/projects`, `GET /api/me/issues?view=…`, `POST /api/me/stars` and `DELETE /api/me/stars/{key}`. Create, edit, move and comment record the caller's work in the CTE of the write they already run, so move (9) keeps its budget. Views and visits are not recorded by any GET: the router preloads loaders on hover (`defaultPreload: 'intent'`) and the CLI and MCP read with API tokens, so a GET cannot tell a person opening a page from a prefetch or a script. The issue page (and dialog) and the project layout post `POST /api/projects/{key}/issues/{number}/view` and `POST /api/projects/{key}/visit` once mounted (204, members only, 404 otherwise, budget 2 each); both ignore Bearer callers and write at most once a minute per row. All five lists are one query whose unused branches drop out as one-time filters; paging is by offset (ceiling: the caller's own history; keyset on `(at, id)` if it grows past a few thousand rows). Indexes (EXPLAIN on 20k issues, 160k activity rows): the lists use the `(user_id, issue_id)` primary keys of `issue_activity` and `issue_star`, Assigned uses a partial `issue (assignee_id) WHERE assignee_id IS NOT NULL`; per-time indexes on the activity were dropped as unused.

Amended (SAN-92, rationale moved out of code comments): an open-ended rank counter that reaches the edge opens the next escape level. Backlog subtask counts come from one aggregate per project, cheaper than a per-row lookup at backlog size. Board, backlog and search pages read the open issue apart from the rest of their search params, so opening an issue does not re-render the view underneath (INP). The sample project goes through the use cases so it always obeys the current rules.

## D40 — Issue delete (SAN-49; lifts IA resolved #5)
Context: UI-25 and UI-31 put Delete in the row and issue menus; duplicates and typos could only be parked in Done. Who may delete, and what happens to children, comments and sprint facts?
Options: A) admins only B) admins and the issue's reporter C) any member
Market: most trackers let the reporter and admins delete, and ask for confirmation that names what goes with it; Linear soft-deletes to a trash.
Product vote: B — the person who filed a duplicate fixes it without asking an admin; other members' work is safe. A confirm dialog names the subtasks and comments that go with it; no trash in v1.
Architecture vote: B — one pure check (`issues::domain::check_delete`: admin or `reporter_id`); hard delete in one transaction: lock the row, mark its removal in the running sprint (`record_leave`, issue and subtasks), then one `DELETE` of the issue and its subtasks. The schema does the rest (migration 0011): comments cascade, an epic's children get `parent_id` NULL (`ON DELETE SET NULL`), `sprint_issue.issue_id` becomes NULL so a running sprint keeps its `removed` facts and points; the D20 counter is never decremented, so a number is never reused. A soft delete would add a `deleted_at` predicate to every read model (D39).
Winner: B, hard delete — accepted: no undo; a deleted issue's sprint facts lose the issue they named (the counts stay); 404 for unknown issues and non-members (D28), 403 for members who are neither admin nor reporter; delete budget 5 statements (D39).

## D41 — Importing from Jira and Linear CSV (SAN-29, E5)
Context: the real need behind the old compatibility idea is migration (design spec, E5). A team leaving Jira Cloud or Linear needs its open work, history dates, parents and sprints in santi without retyping. Both tools export issues as CSV without admin API keys.
Options: A) CSV import of each tool's own export B) importers that read each tool's REST/GraphQL API with a token C) A now, B later on the same mapping step
Market: Atono imports Linear's CSV export, matching people by email and statuses by name; most other importers read the source's API with a user token. Jira Cloud and Linear both let a user export issues as CSV.
Product vote: C — a file the admin already knows how to produce, a preview that shows what will happen (statuses, people, sprints, types, problem rows), one confirm. API importers bring comments and attachments later without changing that screen.
Architecture vote: C — CSV keeps the importer offline, credential-free and testable with hand-written fixtures; an API importer later only produces the same `Export` rows. One slice (`imports/`): pure parsing and planning in `domain.rs`, a handful of batched SQL statements in `repo.rs`. B now means OAuth or token storage, pagination and rate limits for a one-off job.
Winner: C, CSV only in v1 — accepted: the export is the ceiling (no attachments, no history, no links other than parent, Linear exports carry no comments), the file's times without an offset are read as UTC, and the source is told from the header row only.

Format (public interop docs only: Atlassian's "Export issues from Jira Cloud in CSV format" and "Common CSV file questions and known issues" support pages, which give the default `dd/MMM/yy h:mm a` date format; Linear's "Exporting data" docs, which list the columns; Atono's "Import from Linear" guide, which notes creator and assignee are emails). Jira "CSV (all fields)" repeats one column per value for multi-value fields (Labels, Sprint, Comment), so columns are read by position, never by a header-keyed map.

| santi | Jira CSV | Linear CSV |
|---|---|---|
| detected by | `Issue key` + `Summary` | `ID` + `Title` |
| external key | Issue key (Issue id resolves numeric parent refs) | ID |
| type | Issue Type (Epic, Story, Task, Bug, Sub-task; others → story, editable in the mapping) | none: `Issue`, or `Sub-issue` when it has a parent |
| summary, description | Summary, Description (wiki text kept as is) | Title, Description (markdown kept) |
| status | Status, with Status Category as the suggestion | Status; category guessed from the name |
| priority | Highest/Blocker/Critical → urgent, High/Major → high, Medium, Low/Lowest/Minor/Trivial → low | Urgent, High, Medium, Low; No priority → medium |
| people | Assignee, Reporter | Assignee, Creator |
| dates | Created, Updated | Created, Updated (ISO 8601 and JavaScript date strings) |
| labels | every Labels column | Labels, comma-joined; spaces → `-`, 50 chars, 20 per issue |
| sprint | last Sprint column (closed if an issue moved on from it) | Cycle Name or `Cycle N` (closed once Cycle End passed) |
| parent | Parent / Parent id / Parent key / Epic Link | Parent issue |
| points | Story Points / Story point estimate | Estimate |
| comments | every Comment column (`date;author;body`), authored by the importing admin | not exported |

Dropped: components, fix versions, resolution, due dates, time tracking, attachments, watchers, custom fields other than points, Linear projects, milestones and initiatives, comment authors.

Flow: `POST /api/projects/{key}/imports/preview` and `POST /api/projects/{key}/imports`, admins only (403 for members, 404 for strangers), `multipart/form-data` with the file (≤ 10 MB, else 422) and, for the import, a JSON `mapping`: status name → status id (unlisted statuses fail their rows), person → member id or none (default: nobody; reporter: the admin), sprint name → `future` / `closed` / `skip` (scrum only; a sprint of the same name on the board is reused), type name → santi type. Every id must belong to the project (422, field `mapping.<kind>.<name>`).
- Rules that keep the schema's invariants: a subtask whose parent is not a story, task or bug becomes a task; a parent santi does not allow is dropped with a problem row; epics and subtasks never join a sprint directly (D6); a closed sprint keeps only issues in a `done` status, others land in the backlog; subtasks carry no points (D11).
- Idempotent: migration 0012 adds `issue.external_source` + `external_key` with a unique index per project; rows whose key was imported from the same source are skipped, and the insert is `ON CONFLICT DO NOTHING` on that index, so two imports racing never duplicate.
- Writes: numbers reserved for the whole file in one statement (D20, file order), sprints in the same transaction; issues in batches of 500 per transaction, inserted tier by tier (epics, children, subtasks) with parents joined by original key; a last transaction ranks the new issues after the project's last rank in file order (D21 open-ended keys) and restores the export's `updated_at`, which the 0009 triggers bumped when children and comments arrived.
- D39: 5k rows (50 epics, 3,950 stories, 1,000 subtasks, 5k comments) import in ~1.3 s on a laptop (debug build, `tests/imports.rs`), budget 10 s.
- Known ceilings: an import cut off mid-way leaves its committed batches ranked by tier and with bumped `updated_at` (re-running it imports the rest); the whole file is held in memory (10 MB).

Amended (SAN-51, adversarial review):
- Limits, refused with 422 on `file` before planning: 1,000 columns per row, 100,000 rows, 3,000,000 fields, 500 different statuses, types, people or sprints each. Parsing, preview and planning run in `spawn_blocking` with no pool connection held, counting through hash maps; 40k rows with 400 of each preview in ~0.5 s (debug build).
- Rows the schema would refuse fail alone as problem rows before any insert (a NUL anywhere in the row, a key over 255 characters), so they never fail their batch; sprint names are cut to 100 characters.
- A mapped status must sit in a board column (`mapping.statuses.<name>`), like issue creation.
- Dates later than the import (created, updated, done, comments) are clamped to its time.
- Sprint reuse: a sprint of the same name is reused only when it is future (mapping `future`) or closed (mapping `closed`); a running sprint is never reused, so a new one is made. Imported issues that still land in a running sprint (subtasks following their parent) are recorded as added after its start, as planning does.

## D43 — Logo (SAN-60)
Context: santi had no logo, only a placeholder favicon (a bold "s" on a purple tile). The owner likes the hand-drawn engraving app-icon style (ink cross-hatching on a flat brand-color tile) and the brand purple is #4C35D2 (D36). Two Stitch rounds produced raster-only 512 px candidates; none has a vector source. The logo must work as app icon, favicon, top-bar mark, README header and social card, read at 16 px, and not be confused with the reference tracker family, Linear or ClickUp.
Options (score UI / UX / IA, 1–5):

| Candidate | UI | UX | IA | Total |
|---|---|---|---|---|
| 1 Fanned checklist cards with a pushpin | 3 — cream block survives at 32, checklists and pin vanish at 16 | 2 — reads as a notes/to-do app; pinned cards on a board is the category cliché; no motion | 3 — fills the tile; no tie to the name | 8 |
| 2 Spec sheet (icon trio, serif "santi" wordmark, lockups) | — | — | — | not a mark; its icon is candidate 3 |
| 3 Hummingbird carrying a card | 2 — thin wings and beak; a fuzzy bird at 32, a speck at 16; tile drawn inset on a purple field | 4 — speed plus a card in the beak is "move work forward"; memorable; no tracker uses a bird | 3 — strong README/social hero, weak favicon, no letter link | 9 |
| 4 Fox beside a kanban easel | 1 — two objects, board detail gone below 64 | 3 — memorable, but a still scene; foxes are common in dev tools | 2 — a scene, not a mark; needs a separate favicon | 6 |
| A Heron holding a card | 2 — tall thin figure uses a third of the tile; a smear at 16 | 3 — calm and distinct, but standing still is the opposite of flow | 2 — vertical scene, poor favicon | 7 |
| B Compass rose with a card needle | 2 — sixteen spikes turn into a starburst at 32 and 16 | 3 — direction fits, but a compass is a stock browser/maps icon | 3 — radial, survives round masks; no letter link | 8 |
| C Three task cards forming a lowercase "s" | 5 — the only one that reads at 16: a bold cream "s" on purple; cream #F4ECD8 on #4C35D2 is 6.5:1 | 4 — cards flowing through an "s" is work moving through the board, and it spells the name; a white S on a purple tile also marks a payments brand, so the stacked middle card must stay | 5 — a monogram: favicon, top bar, app icon and the mark-plus-wordmark lockup are the same shape; the engraving carries README and social | 14 |

Market: the reference tracker family brands in blue with abstract geometric marks; Linear uses a circle of diagonal lines in violet; ClickUp a colored chevron. A letter built from cards in an engraved purple tile is free in the category.
UI vote: C — legibility decides at favicon size, and only C keeps its shape at 16 and 32; one engraved rendering for 64 px and up, one flat hand-built mark for 32 and below and inline UI. Its tile matches D36 after a small shift (the export was #4032BD). On dark canvases the tile is ~2.5:1 against #0F0F0E, so the cream "s" carries the mark; no dark variant.
UX vote: C — recognizable by its letter, memorable by the engraving, and the meaning (cards moving through) matches the product; runner-up 3, the strongest metaphor but illegible small.
IA vote: C — one shape across every slot. Lockup: mark on the left at the wordmark's line height, 8 px gap, lowercase "santi" in the UI font; a custom wordmark is out of scope.
Winner: C, runner-up 3 (kept as a candidate illustration for README or empty states, not adopted). Assets in `web/public/brand/` (wiring is the next card): `icon-1024/512/192.png`, `apple-touch-icon.png` (180), `favicon-32/16.png` (tighter crop, rounded transparent corners) from the export, recolored to #4C35D2 and flattened to a full-bleed square for OS masks (the "s" sits inside the maskable safe zone); `mark.svg`, a hand-built flat version (two rounded hooks plus a tilted card in #4C35D2 and cream #F4ECD8), for the top bar and `favicon.svg`. Accepted: raster-only source, so `icon-1024.png` is a 2× upscale and soft (needs a vector redraw or a 1024 re-export); two renderings of one logo (engraved and flat) to keep in sync; the S-on-purple likeness to a payments brand, mitigated by the card shape and the engraving.

## D44 — Rate limits and login lockout (SAN-62; amends D22)
Context: santi goes to outside testers on a public Railway URL. Sign-up is open, login guesses cost one argon2 verify each, and token creation, invite accept and imports are the other writes worth abusing. One container, no Redis.
Options: A) nothing until real abuse B) in-memory token buckets per client address and per account, plus a per-email lockout C) a shared store (Redis or a PostgreSQL table) for counters
Product vote: B — testers share office NATs, so per-address numbers stay generous; a locked account says "try again in N seconds", never "wrong email".
Architecture vote: B — `rate_limit.rs`: a `Mutex<HashMap>` of buckets keyed by (action, address or user id); each table is capped at 100k entries (a full one evicts an arbitrary entry) and a one-minute timer drops idle ones, never the request path; no new infrastructure and no SQL on the hot path. C only pays off with more than one replica.
Winner: B — accepted: counters live in one process (a restart or a second replica resets them); someone sharing the owner's /24 (IPv4) or /64 (IPv6) can lock that email there for up to 15 minutes; a guesser spread over many networks gets 5 tries per network, still behind the per-address bucket.
Numbers (burst, then one more per interval):

| Endpoint | Per address | Per account |
|---|---|---|
| `POST /api/auth/login` | 10, then 1 per 6 s | per email: lockout below |
| `POST /api/auth/register` | 10, then 1 per 6 min | — |
| `POST /api/tokens` | 10, then 1 per 6 min | same |
| `POST /api/invites/{token}/accept` | 10, then 1 per min | same |
| `POST /api/projects/{key}/imports[/preview]` (one shared bucket) | 20, then 1 per 30 s | same |
| `DELETE /api/me` (password check) | — | 5, then 1 per min |
| `POST /api/me/legal` (records nothing when already accepted) | — | 10, then 1 per min |
| `POST /api/projects` and `POST /api/sample-project` (one shared bucket) | — | 20, then 1 per 3 min |

- Lockout (amended after the SAN-62 review): counted per (email, client network: the /24 of an IPv4 address, the /64 of an IPv6 one), so failures from elsewhere never lock the owner out. Every login attempt counts before the password is checked (parallel guesses count too); from the 5th attempt without a success that pair is locked for 30 s, doubling per further attempt, never longer than 15 min; a success clears the count; an idle hour forgets it. Unknown emails count the same way, so a 429 never tells whether an account exists. The email is normalized first; anything that is not an email address (or longer than 254 bytes) answers 401 without an entry, and entries hold its SHA-256, not the input. The `DELETE /api/me` password check has its own per-account bucket and never shares the lockout.
- Answer: 429 RFC 9457 problem (`urn:santi:error:rate-limited`, D24) with `Retry-After` in seconds.
- Client address: the TCP peer, or behind `SANTI_TRUSTED_PROXIES` proxies the `X-Forwarded-For` entry the internet-facing one appended (the N-th from the right); entries to its left are client-controlled and ignored. Default 1 when `RAILWAY_PROJECT_ID` is set, else 0. IPv6 clients count per /64; IPv4-mapped addresses as IPv4.
- `SANTI_IP_LIMITS=off` turns the per-address buckets off (e2e and load runs where every user comes from one address); per-account limits and the lockout stay on.
- D22 behind Railway: the edge keeps the public `Host` and adds `X-Forwarded-Host`/`-Proto`/`-For`; the `Origin` check keeps comparing against `Host` and never reads `X-Forwarded-Host`.

## D45 — Account export and deletion, privacy policy and terms (SAN-62)
Context: outside testers sign up on a public instance. Brazil's LGPD (Lei 13.709/2018, art. 18) and the EU GDPR (arts. 15–20) give them access, correction, deletion and portability; they must be able to act on them without writing to the operator, and to see in plain words what santi stores.
Options for deletion: A) hard delete the user row with everything they touched B) delete what is only theirs and de-identify the rest C) refuse while the user is the last admin of a shared project
Market: most trackers delete the account, keep the content the team still needs and show it under a placeholder name.
Product vote: B — a teammate's board must not lose the issues and comments that person wrote; the person must not stay identifiable.
Architecture vote: B — one transaction (`auth::service::delete_account`): lock the user's projects; delete projects nobody else belongs to (everything cascades); where the user is the last living admin, the remaining living member with the oldest account becomes admin (a project no other living account belongs to is deleted, so none ends without a living admin); drop memberships, invites they created, sessions and API tokens; unassign their issues; overwrite the `app_user` row (email `erased:<id>`, `deleted_at` set, name "Deleted user", unusable password hash). The row stays because `issue.reporter_id` and `issue_comment.author_id` point at it. Amended after the SAN-62 review (migration 0015): the erased email has no `@`, which sign-up can never produce (a CHECK ties `deleted_at` to it, and sign-up also refuses the reserved `.invalid` domain), so nobody can pre-register the address and block a deletion; erased accounts are never found by email (login, adding a member) nor chosen as heirs. A refuses for any shared work; C blocks a legal right behind an admin chore.
Winner: B — accepted: text the person wrote in shared projects stays (it is the team's work, now anonymous); the email is free to sign up again at once.
- Re-authentication: `DELETE /api/me` takes the password (422 on `password` when wrong); attempts count in its own D44 per-account bucket (5, then 1 per minute), apart from the login lockout.
- Export: `GET /api/me/export` returns JSON: the account, API token names (never secrets or hashes), the legal acceptance record, and every project the caller administers in full (members, board, sprints, issues, comments); projects where the caller is a plain member are only named (their admins own them). Issues are read in pages of 200 through the search use case; comments in one query per project. Not a hot path, so no D39 budget.
- Pages: `/privacy` and `/terms` are static pages next to the landing (plain language, original text, marked "not legal advice"); operator name, privacy contact, hosting region and venue are build-time placeholders (`VITE_OPERATOR_NAME`, `VITE_PRIVACY_EMAIL`, `VITE_HOSTING_REGION`, `VITE_LEGAL_VENUE`) the owner sets on Railway.
- Terms acceptance (amended after the LGPD/GDPR review, same card): sign-up requires `accept_terms` and `confirm_age` (18+) when the instance requires its documents (422 on the field otherwise); the checkboxes start unticked. Migration 0014 creates `legal_acceptance` (user, document `terms` / `privacy` / `age`, version, SHA-256 of the served English page, time), append only: triggers refuse UPDATE, DELETE and TRUNCATE (the last one added in migration 0016) and `erase_user` leaves it, tied to the de-identified row (kept 5 years per the privacy policy). Versions are `auth::domain::TERMS_VERSION` / `PRIVACY_VERSION`; bumping one makes every account accept again: `GET /api/me/legal` says `accepted`, the SPA shows a gate before the app, `POST /api/me/legal` records it. Creating an API token, accepting an invite and being added to a project by email answer 409 `terms-not-accepted` until then (for the last one, the target account's acceptance counts; the admin is told to send an invite link); tokens and sessions made before keep working (documented in OpenAPI). `GET /api/legal` is public and tells sign-up whether to ask.
- Pages in English and Brazilian Portuguese: `/privacy` and `/terms`, `?lang=pt-BR` for the translation (links switch between them); the footer names the operator. `SANTI_LEGAL_PAGES=off` (self-hosting) answers 404 on both and on any spelling of their files (percent-encoded, `./`, `//`, other case), and drops the checkboxes, the gate and the app's links to them; the landing page drops its links when built with `VITE_LEGAL_PAGES=off`. The privacy policy lists every cookie and storage key, sub-processors (Railway), legal bases and retention per data type, the international transfer, rights with how and how fast (15 days), the ANPD, and that MCP/API agents send what they read to the user's AI provider (also in `docs/mcp.md`). Its retention claims for platform access logs (6 months, Marco Civil art. 15) and backups (30 days) are operator commitments to verify on Railway.
- Home data (SAN-72): the export carries `home`: starred and visited projects (`starred_at`, `visited_at`) and every issue the caller starred, opened or worked on (`starred_at`, `viewed_at`, `worked_at`). Removing a member (or leaving) deletes their issue stars and history in that project in the same statement; the project star and visit live on the membership row and go with it. The privacy pages list this data: stars and work under contract, opened issues and visited projects under legitimate interest, kept until the person leaves the project or deletes the account.
- Purge: an hourly task (`purge_expired`) deletes expired sessions and invites used or expired more than 7 days ago (a recent link still answers 410).

## D46 — Sprint report read model (SAN-105)
Context: the sprint report and velocity (RP-23..RP-37) need each sprint's scope at start, outcome at close and points. `sprint_issue` facts (migration 0008) already hold them for sprints started in santi; there is no history log, and imported closed sprints (D41) have issues but no facts.
Options: A) compute on read from `sprint_issue` + `issue` B) a report table written at close C) an event log replayed per chart
Product vote: A — every number the report and velocity show is already stored; the active sprint must read live.
Architecture vote: A — one query per read (history page, velocity, report header, report rows) over the facts, with group, end points and RP-26 totals decided by pure `reports::domain` functions; B duplicates the facts and goes stale for the active sprint; C is what burndown, burnup, CFD and control chart need and belongs to their card.
Winner: A — accepted: no burndown family until a history log exists; removed issues show no end points (OQ-9) and there is no "completed outside" group (RP-24) until their facts are written.
- Order: started sprints by `coalesce(closed_at, 'infinity')` then `id`, newest first, so the one active sprint leads; keyset cursor = last sprint id (D29). Velocity: the 7 latest closed, oldest first; committed = start points of issues present at start, completed = close points of completed issues; the average counts a sprint with no estimated completed work as 0 and is absent when every shown sprint is.
- Active sprint: rows without an outcome take their group from the issue's current status (done → completed) and their end points from its current points.
- Deleted issues (D40) lost their key and type, so each group sums them into one "deleted issues" line; subtasks never appear as rows (RP-5, RP-30).
- Imported closed sprints: migration 0019 and the importer write completed facts (start = close = the issue's points, not added after start) for issues sitting in a closed sprint, so their report and velocity are not empty.
- Budgets (D39): history and velocity 2 statements, report 3; no new index (facts by `(sprint_id, issue_id)`, sprints by `(board_id, id)`).

## D47 — Priority and points in purple (SAN-95; amends D36)
Context: D36 colored only the urgent priority, in the bug red, with signal-bar glyphs. The owner asked for priority and story points to stand out on the card the way the reference board does, in santi's purple.
Options: A) keep D36 (only urgent colored) B) purple scale for urgent and high, neutral medium and low, chevron glyphs C) a color per priority
Product vote: B — the owner's call; purple is the brand and is free in the category, red stays for bugs and errors.
Architecture vote: B — two tokens and a glyph map, no new component; C needs four hues that survive colour-blind simulation, and glyphs already tell priorities apart.
Winner: B. Glyphs: double chevron up (urgent), chevron up (high), equals (medium), chevron down (low); glyph and name first, color second.
- Tokens: `--priority-urgent` light #4C35D2 (7.64:1 on white) / dark #B8ABF1 (7.46:1 on card #262422); `--priority-high` #8B78E9 in both themes (3.52:1 on white, 4.39:1 on dark card, icons need 3:1). Medium uses the muted foreground, low the subtle one.
- Points: `--points` on `--points-bg`, light #3F2CB0 on #ECE8FB (7.96:1), dark #C4B8F5 on #2C2075 (7.34:1).

## D48 — Sprint start and end are instants (SAN-96; amends D12 and D15)
Context: sprints ran on `date` columns; the owner runs sprints of hours and a day (one ended at 22:00). Overdue was `end_date < current_date` in the database session zone (UTC), so it flipped at 21:00 in UTC−3. santi has no time zone setting anywhere.
Options: A) `timestamptz`, shown and entered in the viewer's zone with the zone name B) a board IANA time zone setting C) keep dates
Product vote: A — the owner's call; per-viewer zones are what trackers do, a board zone belongs to the working calendar (RP-6).
Architecture vote: A — overdue `ends_at <= now()` needs no zone; "1 day" and "1 month" are computed by the client in its own zone and sent as RFC 3339, so the server never handles zones. B adds a column, validation and a settings field and still cannot migrate correctly.
Winner: A — accepted: viewers in different zones see different day boundaries; a breaking rename for API clients.
- Columns `sprint.starts_at`/`ends_at` (`timestamptz`), `CHECK (ends_at > starts_at)`; API, OpenAPI, CLI help and MCP use the same names; CLI flags stay `--start`/`--end` plus `--for`.
- Presets: 4 hours (exact), 1 day (until 23:59 of the start day), 1 week, 2 weeks (calendar days, wall clock kept), 1 month (same day next month, clamped), custom. 3 and 4 weeks go through custom.
- Remembered length: `board.sprint_length` (`4h`, `1d`, `1w`, `2w`, `1m` or custom minutes), written by a start that sends `length`, returned on the backlog; null means 2 weeks.
- Migration: dates become 00:00 and 23:59:00 in the database's `timezone` setting, read from `pg_db_role_setting` because sqlx connects with `TimeZone=UTC`. Upgrade note: `ALTER DATABASE <db> SET timezone TO '<zone>'` before deploying.
- Display: one range formatter (whole days collapse to dates), time left ticking on the minute, zone name next to times (web `Intl` short name, CLI UTC offset).

## D49 — Viewer UI preferences in web storage until personal settings (SAN-73)
Context: the sidebar gains a width (UI-52) and a Projects view (UI-62) per viewer; the reference keeps both in the account's navigation settings on the server. santi has no personal settings yet (SAN-93).
Options: A) `localStorage` now, server later B) a settings table and endpoint now C) no persistence
Product vote: A — the owner asked for the mechanics now; losing them on another device is minor next to losing them on reload.
Architecture vote: A — one guarded helper, same as `last-project.ts` and the shortcuts switch; B builds the SAN-93 model ahead of its card; C breaks UI-52 (width survives reload).
Winner: A — accepted: preferences do not follow the viewer across browsers; SAN-93 moves them server-side.
- Keys: `sidebar-width` (200–500, default 320) and `sidebar-projects-view` (`recent-starred` default, `starred`, `latest`); unreadable or out-of-range values fall back to the default; storage that throws keeps the choice until reload.
- Row expansion is not a preference: the current project opens, a hand-opened row closes on reload (UI-65); `sidebar-expanded:<KEY>` goes away.

## D50 — Rich text is Markdown; mentions are links (SAN-135; amends ED-15/ED-46 baseline)
Context: description and comments get a toolbar, rendering and @mentions. The baseline stores rich text as a document tree and sends it over the API (ED-15, ED-46); santi stores plain text, the CLI and MCP read and write it as text, and the issue page has ~24 KB of D39 headroom.
Options: A) CommonMark + GFM string B) a document tree (JSON) with Markdown as CLI/MCP import/export
Product vote: A — CLI and MCP users write text with their own tools; no JSON tree to hand-build.
UX vote: B — a re-serialized Markdown string reflows under the cursor.
IA vote: A — a tree makes every text surface carry a tree renderer.
Architecture vote: A — the reflow only happens when an editor re-serializes a tree; a source editor (CodeMirror 6) stores the typed bytes. B adds a schema, a migration of every body and a Rust tree→text renderer, and a WYSIWYG editor over Markdown would destroy what its schema lacks (a CLI-written table). Plain text is already valid Markdown, so nothing migrates.
Winner: A — accepted: old bodies with Markdown characters now format; screen readers read Markdown markers in the editor.
- Format: CommonMark + GFM (tables, task lists, strikethrough, autolinks); a single newline is a line break. Stored, returned and accepted byte for byte in DB, API, OpenAPI, CLI and MCP; fields stay `description` and `body`.
- Mention: `[@Display Name](mention:<user_id>)`, a plain link; `user_id` is `app_user.id`; `[`, `]`, `\` in the name are backslash-escaped. The name is captured at insert and never rewritten; the web shows the member's current name by id, and the captured name as muted text when the id is not a project member. CLI text prints `@Display Name`; JSON and MCP return the token.
- Safety lives in the one HTML renderer (web `MarkdownView`: React elements, raw HTML as text, safe URL protocols, images as links); the server does not sanitize, it only refuses NUL and oversize bodies.
- One cap for description and comment: 65,536 characters (`MAX_RICH_TEXT`).
- Budgets (D39): editor and renderer are lazy chunks (≤ 120 KB and ≤ 50 KB gzip, `size-limit`); initial JS per route unchanged.

**D50 amendment (build, 2026-10-18):** the editor chunk measures 143.3 KB gzip counted honestly
(CodeMirror ~110 KB plus the Radix menu code the toolbar's dropdown menus pull in when the issue
menu has not loaded it). Budget for that lazy chunk is 150 KB; it loads on idle and never counts
toward the D39 first-visit budget (issue page initial JS 153.2 KB). Rejected: measuring beside the
issue menu (only admins and reporters load that menu, so it hid ~28 KB from everyone else) and
dropping Radix from the toolbar menus (a second menu implementation). Description save waits for
the server (Save busy, editor read-only, draft kept with the message on error) instead of closing
optimistically: a lost rich-text draft costs more than one round trip under the 30 ms p95 budget.

## D51 — Label colors from the name, eight label tokens (SAN-151; amends D36)
Context: label chips are all gray (`bg-muted`); labels are plain strings per issue, label entities with a chosen color are SAN-103.
Options: A) hue hashed from the name over new label tokens B) reuse the six avatar tones C) wait for SAN-103
UX vote: B — tokens already exist in both themes. UI and IA votes: A — 8–10 hues, tinted background + strong text.
Architecture vote: A — avatar tones hold the progress purple (`avatar-1`) and the To Do gray (`avatar-5`), leaving four hues, and a chip would match a person's avatar; C leaves the owner's complaint open for a backlog card.
Winner: A — accepted: 13 standard labels share 8 hues; the name stays the identity, SAN-103 lets the owner pick.
- Tokens `--label-{hue}` (text) on `--label-{hue}-bg`, as `bg-label-{hue}-bg text-label-{hue}`, `font-medium`, no dot or border. Light / dark, text on background:
  red #B42318/#FEE2E2 5.38:1, #F87171/#450A0A 5.84:1 · orange #9A3412/#FFEDD5 6.38:1, #FB923C/#431407 6.92:1 · amber #92400E/#FEF3C7 6.37:1, #FBBF24/#3A2A0A 8.30:1 · lime #3F6212/#ECFCCB 6.52:1, #BEF264/#1A2E05 11.19:1 · sky #075985/#E0F2FE 6.59:1, #38BDF8/#082F49 6.48:1 · blue #1D4ED8/#DBEAFE 5.49:1, #93C5FD/#172554 8.15:1 · fuchsia #86198F/#FAE8FF 7.08:1, #E879F9/#4A044E 6.02:1 · pink #9D174D/#FCE7F3 6.71:1, #F9A8D4/#500724 8.29:1.
- Excluded: violet/indigo (primary, In Progress, points), gray (To Do, empty), teal and cyan (Done and success).
- Mapping: `labelTone(name)` hashes the lowercased name with the avatar hash (`pickByName`) into a fixed hue order; reordering the list recolors every label. It is the only color source, so SAN-103 replaces its body (stored hue, hash as fallback) without touching call sites.

## D52 — Comment edit and delete (SAN-136; closes the comment-edit item of SAN-76)
Context: the API had create and list only; the baseline gives edit-own/edit-all and delete-own/delete-all rights (ED-35, ED-37), an edited marker with who and when (ED-34), and a confirm before delete (ED-36). santi has two roles; every web action also ships in the CLI and MCP.
Options: A) author only now, admin rights in SAN-76 B) author or admin now, one rule C) a menu shell now, API later
Product and UX votes: A — admin rights are a permissions concern. IA vote: C, with CLI and MCP in the same card later.
Architecture vote: B — "admin or the person who wrote it" already exists on both sides (`issues::domain::check_delete`, web `mayDelete`) for issue delete (D40), so B costs no code and A would defer a baseline rule without the owner; C ships dead UI.
Winner: B — accepted: an admin may rewrite another member's words; the marker names who.
- Routes: `PATCH` and `DELETE /api/projects/{key}/issues/{number}/comments/{id}`; `UpdateComment { body }` → 200 `Comment`; delete → 204, hard (no replies exist; replies decide tombstones, OQ-12).
- `Comment` adds `edited_at`, `edited_by_id`, `edited_by_name`, null until a save changes the text (OQ-13); earlier bodies are not kept.
- Statuses: outsider or unknown project 404, archived 409, issue or comment not found under that issue 404 (a comment id from another issue or project is never 403), neither author nor admin 403, bad body 422.
- Both writes bump `issue.updated_at`; edit records `worked_at` like a new comment.
- Migration 0022: nullable `edited_at`, `edited_by` (FK `app_user`), CHECK both null or both set.
- CLI `santi issues comment-edit|comment-delete`, MCP `edit_comment`, `delete_comment`; comment ids show in `santi issues comments`.
- Later: reactions are a child table with `ON DELETE CASCADE`; replies add a nullable `parent_id` and revisit hard delete.
