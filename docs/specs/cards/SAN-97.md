# SAN-97 — CLI and API gaps found by dogfooding

## Questions

| # | Question | product | ux | ia | Winner (architect) |
|---|---|---|---|---|---|
| 1 | Names instead of ids | API adds names | show names | flat `_name` fields | **The issue response gains `status_name`, `assignee_name`, `reporter_name`, `sprint_name`** (flat, like `Card.assignee_name`), joined in the same query: the issue GET keeps its budget of 2 statements (D39). |
| 2 | Unknown request fields | 422 naming the field | 422, exit code of other API errors | — | **Every request DTO denies unknown fields**; the JSON extractor answers 422 problem+json with the serde message (``unknown field `parent_key` ``); the CLI prints it with its usual API-error exit code. |
| 3 | Command tree | aliases, keep top level | aliases, group help by noun | aliases; MCP names follow the verb | **`santi issues plan`, `santi issues comment`, `santi issues comments` added; top-level `plan` and `comment` stay.** `santi issues edit --sprint <id|none>` (id; `none` like `--parent none`). MCP gains `list_comments`. |
| 4 | Comments listing | block, newest last | one line each | — | **Block per comment, oldest first**: `Emerson Silva · 2 hours ago` then the body, blank line between; `--json` prints the API array. |

## Acceptance

- `santi issues show SAN-n` prints Status, Assignee (short name or "Unassigned"), Reporter, Sprint (name or "Backlog"), Points, Parent, Labels, then the description.
- PATCH/POST with an unknown field → 422; the SPA, CLI and MCP send no unknown fields (vitest + e2e + CLI tests green).
- `issues comments` and MCP `list_comments` page through comments the way the API does.
- OpenAPI regenerated; `docs/mcp.md` and the README CLI section list the new commands and tool.
