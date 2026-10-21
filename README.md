<p align="center">
  <img src="web/public/brand/icon-512.png" alt="santi logo" width="112" height="112">
</p>

<h1 align="center">santi</h1>

<p align="center">
  <strong>A free, open-source agile tracker you host yourself.</strong><br>
  Scrum and Kanban boards, backlog, sprints and reports, from the web, the command line or an AI agent.
</p>

<p align="center">
  <a href="https://github.com/emersonjds/santi/actions/workflows/ci.yml"><img src="https://github.com/emersonjds/santi/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
  <a href="https://github.com/emersonjds/santi/releases/latest"><img src="https://img.shields.io/github/v/release/emersonjds/santi?label=release" alt="Latest release"></a>
  <a href="#license"><img src="https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue" alt="License: MIT OR Apache-2.0"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#features">Features</a> ·
  <a href="#cli-and-mcp">CLI and MCP</a> ·
  <a href="#api">API</a> ·
  <a href="docs/deploy/railway.md">Deploy</a> ·
  <a href="CHANGELOG.md">Changelog</a> ·
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

santi gives a team everything it needs to plan and ship work: boards, a backlog, sprints, epics
and sprint reports, behind a fast web UI and a documented JSON API. The server is written in Rust
(axum, PostgreSQL), the UI in React, and the whole thing ships as one container image. No
per-seat pricing, no telemetry. santi's own backlog runs on santi.

> **Status:** pre-1.0, released often (see [Releases](https://github.com/emersonjds/santi/releases)).
> It runs well for a team on one machine or one small cloud instance; public hosting needs HTTPS
> in front of it (see [Running on another host](#running-on-another-host)). The HTTP API may still
> change between minor versions until 1.0.

![Board with an active sprint](docs/screenshots/board.webp)

| Backlog with the epic panel | Issue dialog |
|---|---|
| ![Backlog with sprints and the epic panel](docs/screenshots/backlog.webp) | ![Issue dialog over the board](docs/screenshots/issue.webp) |

## Features

**Plan and track**

- **Boards:** Scrum boards show the running sprint; Kanban boards show the flow and hide done work
  after a set number of days. Columns hold one or more statuses and take WIP limits; cards move by
  drag and drop or a keyboard "Move to…" menu, and points and priority are edited on the card.
- **Backlog and sprints:** plan sprints by dragging issues between sections and edit rows in place.
  Sprints start and end at a set time (presets from 4 hours to a month, with a countdown); open
  work at completion goes to the backlog, a future sprint or a new one.
- **Issues:** epics, stories, tasks, bugs and subtasks with status, assignee, priority, points,
  labels (search, create, colors on cards), parent, comments and a full issue page.
- **Epics:** a panel on the backlog to create epics, assign issues to them and filter by them.
- **Reports:** every completed sprint keeps its report (completed, not completed, added and
  removed work) and the team's velocity chart, on the web, CLI and MCP.

**Find your way**

- **For you:** a personal home with Worked on, Viewed, Assigned to me and Starred tabs.
- **Sidebar:** Recent and Starred panels, starred and recent projects, a More projects search and
  a width you drag to fit.
- **Filters and search:** assignee, "only my issues", recently updated, type, label, epic and
  text, all kept in the URL; a project search page and a search field in the top bar.
- **Keyboard:** `c` creates an issue, `j`/`k` move between issues, `o` opens one, `g b` / `g l`
  jump to the board or backlog, `?` lists the rest.
- **Phones:** the UI works down to 375 px wide; the board shows one column at a time.

**Run a team**

- **Projects and people:** admin and member roles, invite links with a preview, a members page,
  board settings for columns and statuses.
- **Project lifecycle:** archive a project read-only, move it to a 60-day trash with restore, or
  leave it.
- **Your data:** export your account and every project you administer as JSON from the account
  menu; import CSV exports from other trackers.
- **Automation:** API tokens for scripts, the `santi` CLI and `santi mcp`, an MCP server for AI
  agents.

On the way: rich text with @mentions, personal settings (language, theme, time zone), issue
history and links, organizations, email invites and restore from an export. Each release is
described on the [Releases](https://github.com/emersonjds/santi/releases) page.

## Quick start

You need Docker with Compose ([Docker Desktop](https://www.docker.com/products/docker-desktop/) on macOS and Windows).

```bash
git clone https://github.com/emersonjds/santi.git
cd santi
docker compose up -d        # pulls the published image
```

Open <http://localhost:8080>, choose **Create account**, then **New project**. The database lives
in the `santi-postgres` volume; migrations run every time the server starts.

```bash
docker compose logs -f santi    # server logs
docker compose down             # stop (data kept)
docker compose down -v          # stop and delete the data
```

To host it for a team, see [Deploy on Railway](docs/deploy/railway.md).

Change the ports with `SANTI_PORT` (default 8080) and `SANTI_DB_PORT` (default 5440); both are
bound to localhost only, so a server puts an HTTPS reverse proxy in front (see below), e.g.
`SANTI_PORT=9000 docker compose up -d`. Pin a release with `SANTI_VERSION=0.23.0`; build from the
checkout with `docker compose -f compose.yaml -f compose.build.yaml up -d --build`.

**Browsers:** the session cookie is `Secure`. Chrome, Edge and Firefox accept it on
`http://localhost`; Safari does not, so on plain HTTP sign in with one of the others or put HTTPS
in front.

### Running on another host

Any address other than `localhost` needs HTTPS, or the browser drops the session cookie. Put a
reverse proxy (Caddy, nginx, Traefik) in front of port 8080, terminate TLS there and forward the
original `Host` header (nginx: `proxy_set_header Host $host;`); santi compares it with `Origin` to
block cross-site writes. Back up the PostgreSQL volume (`pg_dump`) on a schedule; santi does not
do it for you yet. `GET /api/me/export` (or **Export my data** in the account menu) downloads
the account and every project it administers as JSON, which works as an extra copy.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | required | PostgreSQL 17 connection string |
| `SANTI_ADDR` | `127.0.0.1:8080` (`0.0.0.0:8080` in the image) | address the server listens on |
| `SANTI_WEB_DIR` | `web/dist` (`/srv/santi/web` in the image) | built web UI to serve at `/` |
| `SANTI_DB_POOL` | twice the cores, 10–50 | database connections |
| `SANTI_ATTACHMENTS_DIR` | `./data/attachments` (`/data/attachments` in the image, the `santi-attachments` volume in compose) | where attachments are stored when no bucket is set |
| `SANTI_S3_BUCKET`, `SANTI_S3_ENDPOINT`, `SANTI_S3_REGION`, `SANTI_S3_ACCESS_KEY_ID`, `SANTI_S3_SECRET_ACCESS_KEY` | unset | store attachments in an S3-compatible bucket (S3, R2, MinIO, Railway) with path-style requests; set all five or none, a partial set stops the server at startup. `SANTI_S3_ENDPOINT` is an origin such as `https://storage.example.com`; the web app's image policy allows it. Add a bucket lifecycle rule that aborts incomplete multipart uploads after 1 day (`AbortIncompleteMultipartUpload`) |

Visitors without a session see the landing page at `/` (also at `/about`); signed-in users get the
app. Its canonical and social links, `robots.txt` and `sitemap.xml` use the public address set at
build time with `VITE_SITE_URL` (default `http://localhost:8080`), e.g.
`docker build --build-arg VITE_SITE_URL=https://santi.example.com .`.

## Importing from Jira or Linear

Project admins can bring existing work into a new or existing project from **Settings → Import
issues**. Export your issues as CSV from Jira Cloud ("CSV (all fields)") or Linear, upload the
file, then review the mapping: statuses to board statuses, people to members (matched by email),
sprints or cycles to future, closed or skipped, and issue types. One click imports it.

![Import mapping review](docs/screenshots/import.webp)

What comes across: summary, description, type, status, priority, assignee, reporter, created and
updated dates, labels, sprint, parent and epic, story points, and (from Jira) comments. Attachments,
history, components, versions and custom fields other than points stay behind. Running the same
file again skips the issues it already imported. Files are limited to 10 MB.

## API

Everything the UI does goes through the JSON API, so scripts can do it too.

- Interactive docs: <http://localhost:8080/docs>; the OpenAPI 3.1 document is at `/openapi.json`.
- Errors are RFC 9457 `application/problem+json`; lists page with `limit` and `cursor`.
- **API tokens:** open the account menu → **API tokens**, create one and copy it (it is shown
  once). Send it as a bearer token; it acts with your rights until you revoke it.

```bash
curl -H "Authorization: Bearer santi_…" http://localhost:8080/api/projects
```

## CLI and MCP

The `santi` binary is a client of the same API, authenticated with an API token.

```bash
cargo install --path crates/santi-cli
santi login --url http://localhost:8080       # asks for the token, saves ~/.config/santi/config.toml (0600)
santi projects list
santi issues create WEB --summary "Fix login" --type bug
santi issues move WEB-12 --status "In Progress"
santi board WEB
santi sprints start WEB 3 --for 1w             # or 4h, 1d (until 23:59), 2w, 1m
santi sprints start WEB 3 --end '2026-10-16 22:00'   # local time; sprint lines show the UTC offset
santi search WEB "login" --status in_progress --json
santi issues edit WEB-12 --sprint none          # back to the backlog; --sprint <ID> plans it
santi issues comments WEB-12                    # every comment, oldest first, with its #id
santi issues comment-edit WEB-12 7 "Fixed in 1.2"   # author or admin; comment-delete asks first
santi issues attach WEB-12 shot.png notes.md [--comment 7]   # up to 10 files, 25 MB each
santi issues attachments WEB-12                 # id, name, size, uploader, date, "in comment N"
santi issues attachments WEB-12 --download 4 [-o dir/]   # never overwrites without --force
santi issues attachments WEB-12 --delete 4      # asks first; --yes skips the question
```

Commands: `login`, `whoami`, `projects create <KEY> --name <NAME> [--type scrum|kanban]|list [--state archived|trashed]|archive|unarchive|trash|restore|purge`,
`issues list|show|create|edit|move|delete|plan|comment|comments|comment-edit|comment-delete|attach|attachments`, `board`, `backlog`, `members`, `invites [revoke <KEY> <ID>]`,
`notifications [--unread]|read <ID>|read --all`,
`sprints list|create|start|complete`, `plan <ISSUE> --sprint <ID>|--backlog`, `search`, `comment`,
`import <PROJECT> <CSV>` (preview, then confirm) and `mcp`; `issues plan` and `issues comment` are
the top-level `plan` and `comment` under `issues`. `issues show` names the status, assignee,
reporter and sprint. `issues attach` checks size, type and count before sending anything;
`--download` follows the storage redirect and saves under the file's own name, without directory
parts or a leading dot, in the current directory (or `-o`). Descriptions and comments are Markdown; mention someone with
`[@Name](mention:<user_id>)` (`santi members <KEY>` lists the ids). Text output shows a mention as
`@Name`; `--json` keeps the token. `santi help <command>` has the flags. `--json` prints the API's JSON. URL and token come from `--url`/`--token`, then
`SANTI_URL`/`SANTI_TOKEN`, then the config file. Errors print the server's message; exit codes are
2 usage, 3 auth, 4 not found, 5 rejected input or conflict, 6 server unreachable, 10 confirmation
declined (stdout stays empty, so `--json` output is still valid JSON), 1 anything else.

`santi mcp` serves the same actions as MCP tools for agents, over stdio or Streamable HTTP
(`santi mcp --http 127.0.0.1:8765`). Setup for Claude Code, VS Code, Zed, Cursor, Windsurf,
JetBrains, Claude Desktop, Codex, Gemini CLI, Cline, Continue and remote connectors:
[docs/mcp.md](docs/mcp.md).

## Performance

santi is built to stay fast on real backlogs. Budgets, measured with 5,000 issues, 50 users and
20 sprints on a laptop (release build, 10 concurrent connections):

- p95 under 30 ms and p99 under 60 ms for the board, backlog, issue, search and move endpoints.
- A fixed number of SQL statements per request (board and backlog 4, issue and search 2), checked
  in CI so an N+1 query fails the build.
- Under 170 KB of gzipped JavaScript on the first visit to any page; long lists virtualized.

Numbers, method and the load script: [docs/perf.md](docs/perf.md).

## Development

You need the latest stable Rust (1.97 or newer), Node 24+ with pnpm, and Docker (Docker Desktop) for PostgreSQL.

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

[CONTRIBUTING.md](CONTRIBUTING.md) has the full setup, the quality gate and the workflow. Please
read the [Code of Conduct](CODE_OF_CONDUCT.md); report vulnerabilities as described in
[SECURITY.md](SECURITY.md). Changes are listed in [CHANGELOG.md](CHANGELOG.md).

## License

Licensed under either of [Apache License 2.0](LICENSE-APACHE) or [MIT](LICENSE-MIT), at your
option. The web UI started from [shadcn-admin](https://github.com/satnaing/shadcn-admin) (MIT);
its notice is in [web/LICENSE-shadcn-admin](web/LICENSE-shadcn-admin).
