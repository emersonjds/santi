# santi v1 — decisions

Date: 2026-10-15.

Protocol: the `product` agent votes first on each open question, grounded in how agile tools on the market behave. The `architect` then challenges every vote on complexity, data model, performance, testability and readability, and may replace it with another option only if that option still serves the UX. The winner is recorded with the reason it won and the trade-off accepted; when the votes differ, the option that keeps both UX quality and a clean architecture wins. D19 onward are architecture-only questions (product vote `n/a`). The design spec points here instead of repeating rationale.

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

## D21 — Rank encoding
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

## D37 — Web UI: React SPA on shadcn-admin (supersedes D1, D26, D35 for the web UI)
Context: the owner decided (binding) to replace the askama + htmx UI with a React SPA built on satnaing/shadcn-admin (MIT, v2.2.1, checked 2026-10-15 at `e16c87f`). The owner maintains React and shadcn daily, and the next screens need rich client behavior that htmx makes awkward: dnd-kit drag and drop with keyboard sensors, optimistic moves, a command palette, stacked dialogs and sheets. The JSON API (D34) already covers every page, so the server keeps one front door after the cutover.
Options: A) keep htmx (D1) B) React SPA on shadcn-admin C) React SPA from scratch on the shadcn CLI
Market: Linear, Plane and Height ship React SPAs over their own API; Plane and Twenty are open-source React + Tailwind and are self-hosted as API plus static bundle.
Product vote: B — the owner ships it fastest, and the template already has the sidebar shell, header, command menu (cmdk), data table, dialogs, sheets, toasts (sonner) and auth screens the IA (`information-architecture.md`) lists; C rebuilds those.
Architecture vote: B, with the template trimmed — reuse its components as they are; delete what santi has no use for (Clerk, faker data, axios, the demo pages, the JS-readable token cookie in `stores/auth-store.ts`). One contract: the SPA calls `/api/*` only, typed from the server's OpenAPI. A loses the interactions above; C pays again for what the template already tested.
Winner: B — accepted: a Node toolchain (pnpm) for anyone touching the UI, a second gate (typecheck, lint, Vitest coverage, Playwright), and two UIs in the tree until parity. The htmx UI keeps serving production until the SPA reaches parity; the cutover PR removes `web.rs` files, `templates/`, `static/`, `styles/` and `scripts/css.sh` together.

Stack (template versions, `package.json` at `e16c87f`): Vite ^8.0.8, React ^19.2.5, TypeScript ~6.0.3, TanStack Router ^1.168.22 (file routes, `@tanstack/router-plugin`), TanStack Query ^5.99.0, react-hook-form ^7.72.1 + zod ^4.3.6 (`@hookform/resolvers` ^5.2.2), zustand ^5.0.12, Radix + shadcn components (`new-york`, lucide icons), Tailwind ^4.2.2 via `@tailwindcss/vite`, sonner, cmdk 1.1.1, Vitest ^4.1.4. Added by santi: `@dnd-kit/core` 6.3.1 + `@dnd-kit/sortable` 10.0.0 (stable line; `@dnd-kit/react` 0.5 is pre-1.0), `openapi-typescript` 7.13.0 + `openapi-fetch` 0.17.0, `@playwright/test`. Package manager pnpm (template lockfile). Node ^20.19 or >= 22.12 (Vite 8).

State: server data lives only in TanStack Query; zustand holds client UI state only (sidebar, open dialogs, drag preview), never server data or credentials. Filters stay in the URL (D18) as TanStack Router search params validated by zod. Optimistic writes: `onMutate` patches the board/backlog cache, `onError` rolls back and toasts the D24 `detail`, `onSettled` invalidates; a move sends the D4 anchor (`before`/`after`), never a computed rank.

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
