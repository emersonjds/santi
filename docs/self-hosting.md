# Self-hosting santi

santi is one container image (`ghcr.io/emersonjds/santi`, server and web UI) plus PostgreSQL 17.
Migrations run every time the server starts. The server answers `GET /health` with its status and
version.

The published image is built for `linux/amd64`. On an ARM machine (Apple Silicon, Graviton), pull
it once with `docker pull --platform linux/amd64 ghcr.io/emersonjds/santi:latest` to run it under
emulation, or build it from the checkout (see below).

## Docker Compose

You need Docker with Compose ([Docker Desktop](https://www.docker.com/products/docker-desktop/) on
macOS and Windows). `compose.yaml` starts the published image and its PostgreSQL.

```bash
git clone https://github.com/emersonjds/santi.git
cd santi
docker compose up -d        # pulls the published image
```

Open <http://localhost:8080>, choose **Create account**, then **New project**. The database lives
in the `santi-postgres` volume, attachments in `santi-attachments`.

```bash
docker compose logs -f santi    # server logs
docker compose down             # stop (data kept)
docker compose down -v          # stop and delete the data
```

Change the ports with `SANTI_PORT` (default 8080) and `SANTI_DB_PORT` (default 5440); both are
bound to localhost only, so a server puts an HTTPS reverse proxy in front (see
[Running on another host](#running-on-another-host)), e.g. `SANTI_PORT=9000 docker compose up -d`.
Pin a release with `SANTI_VERSION=0.25.0`; build from the checkout with
`docker compose -f compose.yaml -f compose.build.yaml up -d --build`.

## Docker with your own PostgreSQL

Point `DATABASE_URL` at an existing PostgreSQL 17 database:

```bash
docker run -d --name santi --restart unless-stopped \
  -p 127.0.0.1:8080:8080 \
  -e DATABASE_URL=postgres://santi:PASSWORD@db.example.com:5432/santi \
  -v santi-attachments:/data \
  ghcr.io/emersonjds/santi:latest
curl http://localhost:8080/health
```

A database on the same machine is reachable from the container as `host.docker.internal` on
Docker Desktop. The `santi-attachments` volume keeps uploaded files; without it, or an S3 bucket
(see [Configuration](#configuration)), they are lost when the container is replaced.

## Railway

[Deploy on Railway](deploy/railway.md) covers the service, database, bucket and domain.

## Browsers

The session cookie is `Secure`. Chrome, Edge and Firefox accept it on `http://localhost`; Safari
does not, so on plain HTTP sign in with one of the others or put HTTPS in front.

## Running on another host

Any address other than `localhost` needs HTTPS, or the browser drops the session cookie. Put a
reverse proxy (Caddy, nginx, Traefik) in front of port 8080, terminate TLS there and forward the
original `Host` header (nginx: `proxy_set_header Host $host;`); santi compares it with `Origin` to
block cross-site writes. Behind a proxy that appends `X-Forwarded-For`, set
`SANTI_TRUSTED_PROXIES=1` so rate limits count the client's address, not the proxy's.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | required | PostgreSQL 17 connection string |
| `SANTI_ADDR` | `127.0.0.1:8080` (`0.0.0.0:8080` in the image) | address the server listens on |
| `SANTI_WEB_DIR` | `web/dist` (`/srv/santi/web` in the image) | built web UI to serve at `/` |
| `SANTI_DB_POOL` | twice the cores, 10–50 | database connections |
| `SANTI_REQUEST_TIMEOUT_SECS` | `30` | an API request still running after this answers 503 `busy` with `Retry-After: 1`; attachment uploads and downloads, imports and restore are exempt |
| `SANTI_DB_STATEMENT_TIMEOUT_MS` | `15000` | `statement_timeout` of every database connection; a statement cut by it answers 503 `busy`. Imports and restore raise it to 5 minutes inside their transactions; migrations run without it |
| `SANTI_DB_ACQUIRE_TIMEOUT_MS` | `5000` | how long a request waits for a free database connection before answering 503 `busy` with `Retry-After: 1` |
| `RUST_LOG` | `info` | log filter, e.g. `warn` or `info,santi_server=debug` |
| `SANTI_LOG_FORMAT` | `json` | `json` writes one JSON object per line to stdout (one per request: method, route template, status, `latency_ms`, request id, user id); `pretty` writes readable lines |
| `SANTI_ATTACHMENTS_DIR` | `./data/attachments` (`/data/attachments` in the image, the `santi-attachments` volume in compose) | where attachments are stored when no bucket is set |
| `SANTI_S3_BUCKET`, `SANTI_S3_ENDPOINT`, `SANTI_S3_REGION`, `SANTI_S3_ACCESS_KEY_ID`, `SANTI_S3_SECRET_ACCESS_KEY` | unset | store attachments in an S3-compatible bucket (S3, R2, MinIO, Railway) with path-style requests; set all five or none, a partial set stops the server at startup. `SANTI_S3_ENDPOINT` is an origin such as `https://storage.example.com`; the web app's image policy allows it. Add a bucket lifecycle rule that aborts incomplete multipart uploads after 1 day (`AbortIncompleteMultipartUpload`) |
| `SANTI_TRUSTED_PROXIES` | `0` (`1` on Railway) | proxy hops in front of the server; the client address is the `X-Forwarded-For` entry the outermost one appended |
| `SANTI_LEGAL_PAGES` | on | `off` removes `/privacy`, `/terms` and the sign-up checkboxes that link to them, for instances that publish no legal pages |

Visitors without a session see the landing page at `/` (also at `/about`); signed-in users get the
app. Its canonical and social links, `robots.txt` and `sitemap.xml` use the public address set at
build time with `VITE_SITE_URL` (default `http://localhost:8080`), e.g.
`docker build --build-arg VITE_SITE_URL=https://santi.example.com .`.

## Upgrades

Pull the new image and restart; migrations run on start.

```bash
docker compose pull && docker compose up -d
```

Read the version's `Upgrade notes` in [CHANGELOG.md](../CHANGELOG.md) first: they list migrations,
new settings and API changes. Until 1.0 the HTTP API may change between minor versions. Back up
before upgrading.

## Backups and restore

santi does not back itself up yet. Dump PostgreSQL on a schedule and copy the attachments volume
(or rely on the bucket's own durability):

```bash
docker compose exec -T postgres pg_dump -U santi -d santi > santi.sql
docker run --rm -v santi_santi-attachments:/data -v "$PWD":/backup busybox \
  tar czf /backup/attachments.tgz -C /data .
```

Compose prefixes volume names with the project name, the checkout's directory (`santi` above).
To restore into an empty database, start PostgreSQL alone, load the dump and the files, then start
santi:

```bash
docker compose up -d --wait postgres
docker compose exec -T postgres psql -q -U santi -d santi < santi.sql
docker run --rm -v santi_santi-attachments:/data -v "$PWD":/backup busybox \
  tar xzf /backup/attachments.tgz -C /data
docker compose up -d
```

`GET /api/me/export` (or **Export my data** in the account menu) downloads the account and every
project it administers as JSON, which works as an extra copy. `santi restore <export.json>
[--project KEY]` (or `POST /api/projects/restore`) recreates a project from it: board, statuses,
sprints, issues with their keys and comments. The restorer is the only member; other people are
listed so you can invite them again. Attachments, notifications and history are not in an export.

## Importing from Jira or Linear

Project admins can bring existing work into a new or existing project from **Settings → Import
issues**. Export your issues as CSV from Jira Cloud ("CSV (all fields)") or Linear, upload the
file, then review the mapping: statuses to board statuses, people to members (matched by email),
sprints or cycles to future, closed or skipped, and issue types. One click imports it.

![Import mapping review](screenshots/import.webp)

What comes across: summary, description, type, status, priority, assignee, reporter, created and
updated dates, labels, sprint, parent and epic, story points, and (from Jira) comments. Attachments,
history, components, versions and custom fields other than points stay behind. Running the same
file again skips the issues it already imported. Files are limited to 10 MB. The CLI does the same
with `santi import <PROJECT> <CSV>` (preview, then confirm).

## API

Everything the UI does goes through the JSON API, so scripts can do it too.

- Interactive docs: <http://localhost:8080/docs>; the OpenAPI 3.1 document is at `/openapi.json`.
- Errors are RFC 9457 `application/problem+json`; lists page with `limit` and `cursor`.
- **API tokens:** open the account menu → **API tokens**, create one and copy it (it is shown
  once). Send it as a bearer token; it acts with your rights until you revoke it.

```bash
curl -H "Authorization: Bearer santi_…" http://localhost:8080/api/projects
```

## CLI

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
[mcp.md](mcp.md).

## Performance

santi is built to stay fast on real backlogs. Budgets, measured with 5,000 issues, 50 users and
20 sprints on a laptop (release build, 10 concurrent connections):

- p95 under 30 ms and p99 under 60 ms for the board, backlog, issue, search and move endpoints.
- A fixed number of SQL statements per request (board and backlog 4, issue and search 2), checked
  in CI so an N+1 query fails the build.
- Under 170 KB of gzipped JavaScript on the first visit to any page; long lists virtualized.

Numbers, method and the load script: [perf.md](perf.md).
