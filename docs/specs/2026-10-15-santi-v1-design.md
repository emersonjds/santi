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

Cargo workspace with four crates:

| Crate | Role |
|---|---|
| `santi-types` | Request/response DTOs (serde), shared by every other crate |
| `santi-server` | HTTP API (axum), persistence (sqlx + PostgreSQL 17), serves the embedded web bundle |
| `santi-cli` | `santi` binary: subcommands and `santi mcp` (stdio MCP server, `rmcp`) |
| `santi-web` | Web UI (Leptos, client-side rendered to WASM) |

### Server

Vertical slices: `projects/`, `members/`, `auth/`, `issues/`, `boards/`, `sprints/`.
Each slice holds:

- `domain.rs`: pure rules (status transitions, ranking, sprint lifecycle), unit tested
  without a database;
- `repo.rs`: sqlx queries;
- `handler.rs`: axum routes, annotated for OpenAPI (utoipa), served at `/docs`.

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

Leptos CSR organized in Feature-Sliced Design modules
(`app → widgets → features → entities → shared`, imports only downward).
Mobile first at 375px, 44px touch targets, form fields at 16px or larger.
Drag and drop uses the native HTML5 API, with a keyboard-accessible "move to…" action
as the equivalent path.

### Auth

Email and password (argon2) with a session cookie for the web; personal API tokens for
CLI and MCP. New members join through a copyable invite link (no SMTP in v1).

## Domain (v1)

Fine-grained rules are confirmed by the behavior specs from the investigation epic.

- **Project**: unique key (e.g. `SANTI`); issues are numbered `KEY-N`, never reused.
- **Member**: user in a project with role `admin` or `member`.
- **Issue type**: Epic, Story, Task, Bug, Subtask.
- **Status**: name plus category `todo`, `in_progress` or `done`. Transitions are free
  between any statuses of the project.
- **Issue**: summary, markdown description, type, status, priority, assignee, reporter,
  story points, labels, parent (epic or parent of a subtask), rank.
- **Rank**: total order of issues in a project, stored as a fractional index string so
  moving one issue rewrites one row.
- **Board**: one per project, `scrum` or `kanban`. Columns map to one or more statuses;
  Kanban columns may have a WIP limit.
- **Sprint**: name, goal, start and end dates, state `future`, `active` or `closed`.
  At most one active sprint per board. Completing a sprint moves unfinished issues to
  the backlog or to a chosen future sprint.

## Quality

- TDD per slice: tests first, one red run, implementation, one green run.
- Integration tests use `sqlx::test` against a real PostgreSQL.
- CI: `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`,
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
| `web` | `santi-web` |
| `qa` | Adversarial review, coverage, clean-room contamination check |
| `oss` | README, CONTRIBUTING, CODE_OF_CONDUCT, issue/PR templates, release notes |

Work runs one agent at a time, one card at a time.

## Epics (in order)

1. **E0 Open-source foundation**: gitflow branches, license, CI, agents, REA
   registration, compose file, community files.
2. **E1 Clean-room investigation**: behavior specs for Scrum board, Kanban board,
   backlog and ranking, sprint lifecycle.
3. **E2 Domain and API**: auth, projects, members, issues, statuses, boards, sprints.
4. **E3 CLI and MCP**: after this epic santi can track its own work.
5. **E4 Web boards**.
6. **E5 Jira importer**.
