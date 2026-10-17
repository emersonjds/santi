# Changelog

All notable changes to santi are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). Until 1.0.0 the HTTP API may change between minor
versions.

This file covers the server and the web UI together; `web/CHANGELOG.md` points here until the
UI moves to its own repository.

## [Unreleased]

## [0.12.0] - 2026-10-17

> Sprints with a clock: start and end times, presets from 4 hours to a month, and a countdown to the minute.

### Added

- **Sprints:** starting a sprint remembers its length for the board's next one (`length` on
  sprint start, `sprint_length` on the backlog).
- **Sprints:** presets from 4 hours to 1 month with date and time pickers, times in your own zone,
  and a countdown that turns into "Overdue by …" at the minute the sprint ends.
- **CLI:** `santi sprints start` takes `--for 4h|1d|1w|2w|1m` and local `--start`/`--end` times;
  sprint lines show local times with the UTC offset.

### Changed

- **Sprints:** start and end are times, not dates. The API fields `start_date`/`end_date` are now
  `starts_at`/`ends_at` (RFC 3339) on sprints, sprint edits and sprint start; the old names are
  refused. An active sprint is overdue from the minute its end passes.

### Fixed

- **CI:** the statement budget check no longer fails at random. Status, type, priority and the other
  text-backed fields now bind as plain text, so a fresh database connection skips an extra type
  lookup query.

### Upgrade notes

- Migration 0020 turns existing sprint dates into 00:00 (start) and 23:59 (end) in the
  database's `timezone` setting, UTC when unset. Before deploying, run
  `ALTER DATABASE <db> SET timezone TO '<zone>'` (for example `'America/Sao_Paulo'`) so old
  sprints keep their day boundaries.
- API clients: send `starts_at`/`ends_at` as instants with an offset instead of dates.
- During the deploy, sprint endpoints on the old instance fail for a few seconds after the
  migration runs; open tabs need a reload to pick up the new fields.

## [0.11.0] - 2026-10-17

> Story points and priority stand out in purple and are edited right on the board card.

### Added

- **Board cards:** the story points pill is always shown (`–` when empty) and opens a number
  field on click: Enter or leaving the field saves, Esc cancels, an empty field clears the
  estimate. The priority glyph opens the platform's priority picker. Both update the card at once
  and roll back if the server refuses. Archived projects show them read-only.
- **Backlog rows:** the same priority picker next to the points pill.
- **Issue details:** the priority glyph beside the Priority field.

### Changed

- **Priority glyphs:** double chevron up (Urgent), chevron up (High), equals (Medium) and chevron
  down (Low), in the purple scale for Urgent and High; red is kept for bugs only.

### Fixed

- Typing an unreadable estimate (for example `-`) in a points field no longer clears the points.
- On phones, a card with labels no longer pushes the column wider than the screen.
- The issue dialog shows the new points or priority right after a card or row edit.

### Upgrade notes

- None: no migration and no API change.

## [0.10.0] - 2026-10-17

> Sprint reports: every past sprint, its report and the team's velocity, on the web, CLI and MCP.

### Added

- **Reports tab** (Scrum projects): velocity of the last 7 sprints (committed vs completed points,
  with the average, and a "View as table" alternative), and the list of every started sprint,
  newest first, with dates, goal and totals. The running sprint is listed first as "In progress".
- **Sprint report:** open any sprint from the list to see its issues grouped as Completed, Not
  completed and Removed from sprint, with points at the start and at the end, an "Added" marker
  for issues that joined after the start, and a "Deleted issues" line. Move between sprints with
  the picker or the Previous and Next arrows. Totals with no estimate show "—", not 0.
- **API:** `GET /api/projects/{key}/reports/sprints`, `GET /api/projects/{key}/reports/velocity`
  and `GET /api/projects/{key}/sprints/{id}/report`.
- **CLI and MCP:** `santi sprints report <PROJECT> <SPRINT_ID>` (text, or `--json`) and the
  read-only MCP tool `get_sprint_report`.

### Fixed

- Component tests no longer open a browser window when run locally.

### Upgrade notes

- Migration `0019_imported_sprint_facts` runs at startup: closed sprints created by the CSV
  importer get their sprint facts (completed issues with their points), so their reports and
  velocity are not empty. Sprints closed in santi are not touched. It is idempotent.
- New API routes are additive; no existing response changed.

## [0.9.2] - 2026-10-17

> Landing page scores 100: it paints in about a second on a phone, with lighter screenshots.

### Fixed

- **Landing page:** its stylesheet is now inside the page, so the first paint no longer waits for
  a second request (speed index on a phone went from 4.6 s to about 1 s). Screenshots come in
  640, 1000 and full widths, so a phone downloads about 144 KB less. The GitHub star button is
  named by its visible text for screen readers. Lighthouse gives 100 in performance,
  accessibility, best practices and SEO on mobile and desktop.

### Added

- **`/llms.txt`:** a short plain-text summary of santi with links to the API docs, the OpenAPI
  document and the source, for AI agents and crawlers.

## [0.9.1] - 2026-10-17

> Drafts that stay: text typed in a new issue or new epic form survives the page finishing loading.

### Fixed

- **Backlog and board:** the inline "Create issue" form lost its summary and type, and the new
  epic form closed, when the drag layer finished loading right after the page opened. Both now
  keep what was typed.

## [0.9.0] - 2026-10-17

> Archived projects are read-only in place: every write control is visible but disabled.

### Changed

- **Archived projects:** on the board, backlog, issue page, sprint header, board settings, members
  and import, every write control now stays where it is but is disabled and points at the
  archived banner, instead of failing with an error when used. Drag and drop is off, fields are
  read-only, and Create issue, More actions and Import issues show as disabled.

### Fixed

- **Notifications:** a confirmation sent right after a page opened (for example "Archived SAN"
  just after opening settings) could be lost before the notification area loaded. It now waits
  and shows.

## [0.8.2] - 2026-10-16

> Top bar stays on top: rows no longer scroll over the header.

### Fixed

- **Top bar:** scrolling the backlog or board, a row's points, avatar and menu painted over the
  sticky top bar (search and Create). The top bar now stays above page content.

## [0.8.1] - 2026-10-16

> Editors that stay open: an inline edit no longer closes when the page finishes loading.

### Fixed

- **Backlog and board:** a summary, points or column-limit editor opened while the drag layer was
  still loading closed by itself and lost the text typed so far (the rows were rebuilt when the
  drag layer arrived). The open editor and its draft now survive that, and opening or closing an
  editor re-renders only that editor.

## [0.8.0] - 2026-10-16

> Create sprint stands out: the backlog's Create sprint is now its primary action.

### Changed

- **Backlog:** Create sprint is a filled purple button with a + icon, the primary action of the
  backlog section (each sprint section keeps its own Start or Complete as primary).

## [0.7.0] - 2026-10-16

> Sidebar project menu: expand any project and reach Copy link, Settings, Archive, Delete or Leave from its row.

### Added

- **Sidebar project row:** a chevron expands or collapses any project's Board, Backlog and
  Settings (the current project starts open; the choice is remembered per project), and a "…"
  menu offers Copy link, Settings, Archive project, Delete project and Leave project.

## [0.6.0] - 2026-10-16

> Archive and trash projects: read-only archive, a 60-day trash with restore, Active/Archived/Trash tabs, and leaving a project.

### Upgrade notes

- Migration `0018_project_lifecycle.sql` runs on start. Trashed projects are purged 60 days after trashing.

### Added

- **Archive and trash projects:** a danger zone at the end of project Settings lets admins
  archive a project (read-only for everyone, hidden from lists and search, still open by link
  with a banner and Unarchive) or delete it to the trash (type the key to confirm; restorable
  for 60 days, then purged; Undo for a few seconds after). `/projects` has Active, Archived and
  Trash tabs with Unarchive, Restore and Delete forever. Any member can leave a project; the last
  admin cannot. API `POST /api/projects/{key}/archive|unarchive|trash|restore`,
  `DELETE /api/projects/{key}`, `GET /api/projects?state=`; CLI `santi projects archive|unarchive|
  trash|restore|purge`; matching MCP tools. Keys stay reserved while archived or trashed.
  Migration 0018.

## [0.5.1] - 2026-10-16

> Quieter code: narrating comments removed or turned into names; reasons moved to the decision log.

### Changed

- **Code comments:** comments that narrated the code were removed or turned into names; the
  rationale moved to `docs/specs/decisions.md` (D18, D37, D39). No behavior change.

## [0.5.0] - 2026-10-16

> CLI and API clean-up from using santi on santi: names instead of ids, issue commands where you look for them, unknown fields refused.

### Upgrade notes

- API: a body with an unknown field or of the wrong shape answers 422 with the reason (it was ignored or 400). Malformed JSON stays 400.

### Added

- **CLI:** `santi issues plan`, `santi issues comment` and `santi issues comments` (lists every
  comment, oldest first; `--json` for the raw list); `santi issues edit --sprint <id|none>`.
  `santi issues show` prints status, assignee, reporter and sprint by name.
- **MCP:** `list_comments` tool.
- **API:** issue answers carry `status_name`, `assignee_name`, `reporter_name` and `sprint_name`;
  comments carry `author_name`.

### Changed

- **API:** request bodies refuse unknown fields; a body of the wrong shape answers 422 with the
  reason in `detail` and the field at fault (malformed JSON stays 400).

## [0.4.0] - 2026-10-16

> Labels picker: search, defaults, create, chips on cards and backlog rows.

### Added

- **Labels picker:** the Labels field in the issue view and the create dialog opens a searchable
  list: the issue's labels, then the project's, then common defaults (bug, feature, frontend,
  backend, mobile, infra, design, docs, tech-debt, security, performance, blocked). Pick or create
  a label; chosen labels sit side by side as chips, removed with x or Backspace. Board cards and
  backlog rows show up to two label chips and "+k".

## [0.3.0] - 2026-10-16

> Names that fit on one line: first and last name in tight places, full name on hover.

### Changed

- **People's names:** shown by first and last name on one line ("Emerson Silva"), with the full
  name on hover and for screen readers; a name typed all in capitals is shown in title case;
  avatar initials use the first and last name. The members page and the account menu keep the
  full name. CLI board and backlog lines use the short form.

## [0.2.0] - 2026-10-16

> A personal home, a CLI and an MCP server: For you home, `santi` CLI, MCP for AI assistants, landing page and logo.

### Upgrade notes

- Migration `0017_home.sql` runs on start. Privacy policy version 2026-10-16.2: signed-in people accept it again.

### Added

- **For you home:** recommended project cards (star, open issues assigned to you linking to your
  board), tabs Recommended, Assigned to me, Starred, Worked on and Viewed with rows grouped by day
  and a status on every row; stars on projects and issues. A `/projects` page lists every project.
  Views and visits are recorded only when you open an issue or project. The account export
  includes stars and history, and leaving a project removes them. The privacy policy (version
  2026-10-16.2) lists this data.
- **Landing page:** a static page at `/` for visitors without a session (and at `/about` for
  everyone): product tour with screenshots, performance numbers, self-hosting, roadmap and FAQ,
  no JavaScript beyond a copy button. Ships `robots.txt` and `sitemap.xml` built from
  `VITE_SITE_URL`.
- **Brand:** the santi logo in the top bar, sign-in pages and error pages; favicons, app icons,
  a web manifest and a social card image.
- **CLI:** the `santi` binary: `login` (URL and token saved to `~/.config/santi/config.toml`,
  mode 0600), `whoami`, `projects`, `issues list|show|create|edit|move|delete`, `board`, `backlog`,
  `sprints list|create|start|complete`, `plan`, `search`, `comment` and `import` (preview, then
  confirm). `--json` on every command; API errors print the server's message with distinct exit
  codes. URL and token from flags, `SANTI_URL`/`SANTI_TOKEN` or the config file.
- **MCP server:** `santi mcp` over stdio, or Streamable HTTP with `--http` (bearer token required
  on every request, passed through to the API). 16 tools for projects, boards, backlog, search,
  issues, comments, sprints and epics, with JSON Schemas, read-only and destructive hints, and
  tool errors carrying the server's message. Client setup in `docs/mcp.md`.

### Fixed

- **Sign-in:** a wrong email or password now says so ("Email or password is incorrect.") instead of
  asking for an API token.

## [0.1.0] - 2026-10-16

> First release: Scrum and Kanban boards, backlog, sprints, epics and subtasks, CSV import, self-hosting.

First release: the MVP, self-hosted with `docker compose up -d`.

### Added

- **Accounts:** sign up, sign in and sign out with a server session cookie (`HttpOnly`,
  `Secure`, `SameSite=Lax`); passwords hashed with Argon2id.
- **Projects:** Scrum and Kanban projects with a short key (`WEB-12`), a project list on the home
  page and a new-project form.
- **Members and invites:** admin and member roles, invite links with a preview before joining,
  a members page for admins to change roles or remove people.
- **Board:** columns that hold one or more statuses, WIP limits with warnings, drag and drop
  across and within columns (optimistic, with a keyboard "Move to…" path), inline create at the
  foot of each column, a card menu (move, assign, priority, copy key, delete), one column at a
  time on phones. Kanban hides done work after a set number of days.
- **Board settings:** add, rename, reorder and delete columns; add, rename and delete statuses;
  map statuses to columns; the rightmost column means done.
- **Backlog:** sprint sections and the backlog in one list, drag and drop or "Move to…" to plan,
  inline create per section, in-place edit of summary, points and assignee, virtualized long
  lists.
- **Sprints:** create, edit, delete, start and complete; completing moves open work to the
  backlog, a future sprint or a new one and keeps the sprint's scope facts.
- **Issues:** epics, stories, tasks, bugs and subtasks; an issue dialog over the board and a full
  issue page with per-field edits, comments, labels, points, priority, assignee, parent and
  epic; delete for admins and the reporter, with a confirm that names what goes with it.
- **Epics:** an epic panel on the backlog to filter by, create and assign epics.
- **Filters:** assignee, "only my issues", recently updated, type, label, epic and text, kept in
  the URL; a filter sheet on phones.
- **Search:** a project search page with URL filters and a search field in the top bar.
- **Keyboard:** `c` to create, `j`/`k` to move between issues, `o` or Enter to open, `?` for
  the full list; shortcuts can be turned off per browser.
- **API tokens:** personal tokens for scripts (`Authorization: Bearer santi_…`), created and
  revoked from the account page.
- **Import:** preview and import CSV exports from Jira Cloud and Linear (statuses, people,
  sprints or cycles, types, parents, labels, points, comments), idempotent on re-run.
- **API:** JSON over HTTP with an OpenAPI 3.1 document at `/openapi.json`, interactive docs at
  `/docs`, RFC 9457 problem errors, cursor pagination.
- **Packaging:** a multi-stage `Dockerfile` (distroless, non-root, healthcheck) and a
  `compose.yaml` that runs santi with PostgreSQL 17; migrations run on start.

### Performance

- Budgets at 5k issues / 50 users / 20 sprints: p95 under 30 ms for board, backlog, issue,
  search and move on a laptop; SQL statement counts per request guarded in CI.
- Short rank keys, one-query token and membership lookup, database pool sized from the core
  count, gzip and Brotli responses.
- Under 170 KB of gzipped JavaScript on a first visit to any page, with menus and popovers loaded
  after first paint.

### Security

- Cross-site write protection (`Sec-Fetch-Site`, with an `Origin`/`Host` fallback).
- Content-Security-Policy, `nosniff` and referrer policy headers on every response.
- Import limits on file size, rows, columns and distinct values; parsing runs off the async
  workers.
- Hashed API tokens and sessions; non-members get 404 for a project, members without the right
  role get 403.

[Unreleased]: https://github.com/emersonjds/santi/compare/v0.11.0...HEAD
[0.11.0]: https://github.com/emersonjds/santi/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/emersonjds/santi/compare/v0.9.2...v0.10.0
[0.9.2]: https://github.com/emersonjds/santi/compare/v0.9.1...v0.9.2
[0.9.1]: https://github.com/emersonjds/santi/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/emersonjds/santi/compare/v0.8.2...v0.9.0
[0.8.2]: https://github.com/emersonjds/santi/compare/v0.8.1...v0.8.2
[0.8.1]: https://github.com/emersonjds/santi/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/emersonjds/santi/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/emersonjds/santi/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/emersonjds/santi/compare/v0.5.1...v0.6.0
[0.5.1]: https://github.com/emersonjds/santi/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/emersonjds/santi/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/emersonjds/santi/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/emersonjds/santi/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/emersonjds/santi/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/emersonjds/santi/releases/tag/v0.1.0
