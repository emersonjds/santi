# SAN-99 — Backups without a paid plan, slice 1: restore a project from a santi export

Railway backups need the Pro plan. The owner's stopgap saves `GET /api/me/export` every night, but santi cannot read its own export back. Slice 1 closes that loop; slice 2 (scheduled database backups for self-hosters, `SANTI_BACKUP_*`) gets its own card.

## Decisions (orchestrator, architect role; no screen in this slice)

- `POST /api/projects/restore` takes one `ProjectExport` (the shape inside `AccountExport.projects`, `crates/santi-types/src/auth.rs:172`) and creates a new project from it: same key, name and board type; board columns, statuses and their mapping, WIP limits and done window; sprints with their state, dates, goal and start/close times; issues with the same numbers and keys, type, priority, status (matched by name to the recreated statuses), summary, description, labels, points, rank, parent, sprint, done time and created/updated times; comments with their times.
- Idempotent by key: a project with that key already exists → 409 `project-exists` naming the key, nothing written. One transaction per project.
- People: the caller becomes admin. Members, assignees, reporters and comment authors are kept only when that user id still exists and is not erased on this instance; otherwise assignee is cleared, reporter and comment author become the caller, and each such change is listed in the answer's `problems` (same `RowProblem`-style list the importer returns, keyed by issue key).
- Not in the export, so not restored: attachments, notifications, issue history, sprint report facts beyond what the issue state gives (closed sprints restore as closed; their report shows current state). The answer says so in one line.
- Body limit: 50 MB on this route. Limits checked before writing: at most 50,000 issues and 500 statuses per project, otherwise 422.
- Rate limit: the same action budget as an import.
- CLI: `santi restore <export.json> [--project KEY]` reads an `AccountExport` file and restores each project (or the one named), printing per project "restored KEY (N issues, M sprints)" or the server's refusal, plus problems; `--json` prints the answers. MCP: none in this slice (bulk restore stays a human action).
- Web: none in this slice.

## Acceptance

- Export a project with a board of 4 columns, an unmapped status, a closed and an active sprint, an epic with a story and a subtask, comments and labels; erase nothing; restore it under the same key after deleting the original → the board, backlog, sprints, issue keys, parents, comments and labels match the original (integration test comparing the two exports, ignoring ids and `exported_at`).
- Restoring again → 409, nothing changed.
- A member who no longer exists → assignee cleared, reporter becomes the caller, listed in problems.
- Non-JSON or wrong shape → 422 naming the field; oversized → 413.
- CLI restores every project of an account export file and prints the summary.
