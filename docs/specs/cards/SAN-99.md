# SAN-99 — Backups without a paid plan, slice 1: restore a project from a santi export

Railway backups need the Pro plan. The owner's stopgap saves `GET /api/me/export` every night, but santi cannot read its own export back. Slice 1 closes that loop; slice 2 (scheduled database backups for self-hosters, `SANTI_BACKUP_*`) gets its own card.

## Decisions (orchestrator, architect role; no screen in this slice)

- `POST /api/projects/restore` takes one `ProjectExport` (the shape inside `AccountExport.projects`, `crates/santi-types/src/auth.rs:172`) and creates a new project from it: same key, name and board type; board columns, statuses and their mapping, WIP limits and done window; sprints with their state, dates, goal and start/close times; issues with the same numbers and keys, type, priority, status (matched by name to the recreated statuses), summary, description, labels, points, rank, parent, sprint, done time and created/updated times; comments with their times.
- Idempotent by key: a project with that key already exists → 409 `project-exists` naming the key, nothing written. One transaction per project.
- People (amended after qa, D58): the caller is the only member, as admin; nobody else is added (D55: people join through invite links). Any assignee who is not the caller is cleared; any reporter, comment author or editor who is not the caller becomes the caller. Each change is listed in `problems` with the original person's name from the file, so the admin knows whom to invite and reassign. No user ids from the file reach the database except the caller's.
- Validation parity: every field passes the same validators as a normal write (summary, description, comment body, sprint name and goal, window, column and status names, points, labels normalised, board shape and done mapping, ranks base-62 and unique, D6 sprint rules for subtasks and epics, sprint state vs its times, `done_at` vs the status category), each error naming its field (`issues[3].summary`). Comments and sprints are capped too.
- Work runs off the async workers (parse and checks in one blocking task) and at most one restore runs at a time per server.
- Not in the export, so not restored: attachments, notifications, issue history, sprint report facts beyond what the issue state gives (closed sprints restore as closed; their report shows current state). The answer says so in one line.
- Body limit: 50 MB on this route. Limits checked before writing: at most 50,000 issues and 500 statuses per project, otherwise 422.
- Rate limit: the same action budget as an import.
- CLI: `santi restore <export.json> [--project KEY]` reads an `AccountExport` file and restores each project (or the one named), printing per project "restored KEY (N issues, M sprints)" or the server's refusal, plus problems; `--json` prints the answers. MCP: none in this slice (bulk restore stays a human action).
- Web: none in this slice.

## Acceptance

- Export a project with a board of 4 columns, an unmapped status, a closed and an active sprint, an epic with a story and a subtask, comments and labels; erase nothing; restore it under the same key after deleting the original → the board, backlog, sprints, issue keys, parents, comments and labels match the original (integration test comparing the two exports, ignoring ids and `exported_at`).
- Restoring again → 409, nothing changed.
- A file naming other users (existing or not) → only the caller is a member; those users get 404 on the project; assignees cleared, reporters and authors become the caller, all listed in problems.
- Non-JSON or wrong shape → 422 naming the field; oversized → 413.
- CLI restores every project of an account export file and prints the summary.
