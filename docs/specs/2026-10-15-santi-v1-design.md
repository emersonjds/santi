# santi v1 — design

Status: approved 2026-10-15.

## Goal

A free, open-source agile tracker that teams can self-host: Scrum and Kanban boards,
backlog, and sprints that behave the way agile teams already expect, without the long
tail of enterprise features. Everything a person does by hand must also be possible
from the CLI and from any agent through MCP. No billing; adding people and projects is free.

## Scope decisions

The three candidate directions are layers, not alternatives:

- **Own domain and API (base).** santi defines its own contract. It is simpler than
  Atlassian's and evolves freely.
- **Boards first (v1 delivery).** The first release is the Scrum/Kanban experience on
  top of that base.
- **Jira compatibility (reduced to an importer, last epic).** A full `/rest/api/3`
  compatibility layer costs too much for what it buys. The real need is migration, so
  santi ships an importer that reads a Jira project through Atlassian's public REST API
  and recreates it.

Out of v1: JQL (replaced by filters on assignee, type, label and free text), reports,
automation, notifications, attachments, custom fields, permission schemes, multiple
boards per project, email delivery.

## Clean-room process

santi recreates *behavior*, never code or assets.

1. The `investigator` agent is the only one with the REA MCP server. It observes Jira's
   board, backlog and sprint behavior on the maintainer's own Jira site and in Atlassian's
   public documentation, and writes behavior specs in `docs/specs/behavior/`: rules,
   states, transitions, edge cases. No code, no copied text, no screenshots, no icons.
2. Raw captures live outside the repository (`/research` is git-ignored).
3. Implementing agents read only `docs/specs/`. They never receive raw captures.
4. The `qa` agent checks every branch for contamination: Atlassian strings, product
   names in UI copy, copied assets.

The name "Jira" appears only in documentation that describes the importer.

## Architecture

Cargo workspace with three crates (see `decisions.md` D1, D25; every `Dn` in this spec points to `docs/specs/decisions.md`), plus the React SPA in `web/` (D37, D38):

| Crate | Role |
|---|---|
| `santi-types` | Request/response DTOs (serde), shared by every other crate |
| `santi-server` | HTTP API (axum), persistence (sqlx + PostgreSQL 17), serves the web UI: the built React SPA from `SANTI_WEB_DIR` (D37, D38) and, until the cutover, the askama + htmx pages |
| `santi-cli` | `santi` binary: subcommands and `santi mcp` (stdio MCP server, `rmcp`) |

### Server

Vertical slices: `projects/`, `members/`, `auth/`, `issues/`, `boards/`, `sprints/`.
Each slice holds:

- `domain.rs`: pure rules (status transitions, ranking, sprint lifecycle), unit tested
  without a database;
- `repo.rs`: sqlx queries;
- `service.rs`: use cases (membership, transaction, domain + repo), the only thing routes call;
- `handler.rs`: JSON routes, annotated for OpenAPI (utoipa), served at `/docs`;
- `web.rs`: HTML routes rendering askama templates.

Ids are `bigint` identity (D19). Errors are RFC 9457 problem+json (D24). Migrations are
`sqlx migrate`, embedded and applied at startup (D27). Membership is checked once, by an
extractor (D28). Lists use keyset pagination; board and backlog are unpaged (D29).

One binary serves API and UI, so self-hosting means one process plus PostgreSQL.
Local development runs PostgreSQL through `docker compose` on OrbStack.

### CLI and MCP

The CLI and the MCP server are HTTP clients of the API, authenticated with a personal
API token. The same MCP server therefore works against a local or a remote instance.
Every manual action maps to an MCP tool and a CLI subcommand:

`create_project`, `add_member`, `create_issue`, `update_issue`, `move_issue`
(status and rank), `comment`, `search_issues`, `get_board`, `get_backlog`,
`create_sprint`, `start_sprint`, `complete_sprint`.

### Web

React SPA in `web/` on shadcn-admin (D37, superseding D1, D26, D35 for the UI): Vite, TanStack
Router and Query, react-hook-form + zod, Tailwind with the D36 tokens, Feature-Sliced Design
(`app → pages → widgets → features → entities → shared`, imports only downward). It calls
`/api/*` only, through `openapi-fetch` typed from the committed `web/openapi.json` snapshot.
The repository stays one monorepo with split boundaries (D38): the server serves the build from
`SANTI_WEB_DIR` at runtime, so `cargo` needs no Node. Until parity the SPA is mounted at `/app`
and the askama + htmx pages (`web.rs`, `templates/`) keep serving the other paths; the cutover
removes them.
Mobile first at 375px, 44px touch targets, form fields at 16px or larger.
Drag and drop uses the native HTML5 API, with a keyboard-accessible "move to…" action
as the equivalent path. Quick filters live in the URL (D3, D18); no real-time push in v1 (D17).

### Auth

Email and password (argon2) with a server-side session (hashed token, HttpOnly cookie) for
the web; personal API tokens (`santi_…`, hash stored) for CLI and MCP (D22, D23).
New members join through a copyable invite link (no SMTP in v1).

## Domain (v1)

Fine-grained rules are confirmed by the behavior specs from the investigation epic.

- **Project**: unique key (e.g. `SANTI`); issues are numbered `KEY-N` from a per-project
  counter, never reused (D20).
- **Member**: user in a project with role `admin` or `member`.
- **Issue type**: Epic, Story, Task, Bug, Subtask.
- **Status**: name plus category `todo`, `in_progress` or `done`. Transitions are free
  between any statuses of the project. Done means category `done`; `done` statuses map
  only to the rightmost column, which holds only them (D2). A status with no column is
  unmapped and its issues are hidden (D30).
- **Issue**: summary, markdown description, type, status, priority, assignee, reporter,
  story points, labels, parent (epic or parent of a subtask), rank, `done_at` (D8).
  Subtasks carry no points and always share their parent's sprint; they render as flat
  cards with a parent chip (D6, D11). Epics show in a side panel, not as rows (D10).
- **Rank**: total order of issues in a project, stored as a fractional index string so
  moving one issue rewrites one row. A move places the issue next to one anchor issue;
  inline create appends at the end (D4, D5, D21).
- **Board**: one per project, `scrum` or `kanban` (D31). Columns map to one or more statuses;
  Kanban columns may have a max WIP limit that only warns (D7). Kanban hides `done` issues
  after a per-board window counted from `done_at` (D8, D33) and has no separate backlog (D9).
  Deleting a column moves its statuses to a chosen column (D16).
- **Sprint**: name (default `Sprint N`), goal, start and end dates, state `future`, `active`
  or `closed` (D12). At most one active sprint per board. Completing a sprint moves unfinished
  issues to the backlog or to a chosen future sprint (D13). Only future sprints can be
  deleted (D14, D32); an overdue sprint stays active (D15).

## Quality

- TDD per slice: tests first, one red run, implementation, one green run.
- Integration tests use `sqlx::test` against a real PostgreSQL.
- CI: `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo sqlx prepare --check` (D27), `cargo test`,
  `cargo llvm-cov` failing under 90% for lines, regions and functions on stable.
  Branch coverage only exists on nightly (`--branch`), so a separate nightly job
  enforces the 90% branch threshold.
- Adversarial review on auth, migrations, API contract changes and diffs over ~200 lines.

## Agents (`.claude/agents/`)

| Agent | Delivers |
|---|---|
| `investigator` | Behavior specs from REA observation (only agent with REA) |
| `architect` | Technical specs and implementation plans |
| `backend` | `santi-server` and `santi-types` slices |
| `cli-mcp` | `santi-cli` subcommands and MCP tools |
| `web` | Templates, `web.rs` routes and static assets in `santi-server` (D25) |
| `qa` | Adversarial review, coverage, clean-room contamination check |
| `oss` | README, CONTRIBUTING, CODE_OF_CONDUCT, issue/PR templates, release notes |
| `product` | Product/UX votes grounded in how agile tools on the market behave (sonnet; recommendations only) |

Decisions: `product` votes on product/UX, `architect` challenges on architecture; both votes,
the winner and the reason are recorded in `docs/specs/decisions.md`.

Work runs one agent at a time, one card at a time.

## Epics (in order)

1. **E0 Open-source foundation**: gitflow branches, license, CI, agents, REA
   registration, community files.
2. **E1 Clean-room investigation**: behavior specs for Scrum board, Kanban board,
   backlog and ranking, sprint lifecycle.
3. **E2 Domain and API**: PostgreSQL compose file, auth, projects, members, issues, statuses, boards, sprints.
4. **E3 CLI and MCP**: after this epic santi can track its own work.
5. **E4 Web boards**.
6. **E5 Jira importer**.
