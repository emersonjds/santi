# Changelog

All notable changes to santi are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). Until 1.0.0 the HTTP API may change between minor
versions.

This file covers the server and the web UI together; `web/CHANGELOG.md` points here until the
UI moves to its own repository.

## [Unreleased]

## [0.7.0] - 2026-10-16

### Added

- **Sidebar project row:** a chevron expands or collapses any project's Board, Backlog and
  Settings (the current project starts open; the choice is remembered per project), and a "…"
  menu offers Copy link, Settings, Archive project, Delete project and Leave project.

## [0.6.0] - 2026-10-16

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

### Changed

- **Code comments:** comments that narrated the code were removed or turned into names; the
  rationale moved to `docs/specs/decisions.md` (D18, D37, D39). No behavior change.

## [0.5.0] - 2026-10-16

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

### Added

- **Labels picker:** the Labels field in the issue view and the create dialog opens a searchable
  list: the issue's labels, then the project's, then common defaults (bug, feature, frontend,
  backend, mobile, infra, design, docs, tech-debt, security, performance, blocked). Pick or create
  a label; chosen labels sit side by side as chips, removed with x or Backspace. Board cards and
  backlog rows show up to two label chips and "+k".

## [0.3.0] - 2026-10-16

### Changed

- **People's names:** shown by first and last name on one line ("Emerson Silva"), with the full
  name on hover and for screen readers; a name typed all in capitals is shown in title case;
  avatar initials use the first and last name. The members page and the account menu keep the
  full name. CLI board and backlog lines use the short form.

## [0.2.0] - 2026-10-16

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

[Unreleased]: https://github.com/emersonjds/santi/compare/v0.7.0...HEAD
[0.7.0]: https://github.com/emersonjds/santi/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/emersonjds/santi/compare/v0.5.1...v0.6.0
[0.5.1]: https://github.com/emersonjds/santi/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/emersonjds/santi/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/emersonjds/santi/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/emersonjds/santi/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/emersonjds/santi/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/emersonjds/santi/releases/tag/v0.1.0
