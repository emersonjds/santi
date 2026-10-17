# SAN-96 — Sprint start and end become timestamps

Owner, 2026-10-16: a sprint can last hours, a day, weeks or a month (the SAN board ran a sprint until 22:00 and santi only had dates). Panel: `product`, `ux`, `ia` voted, `architect` challenged; owner decided time zone, presets and migration on 2026-10-17. Cross-cutting part: D48 (amends D12 and D15). Behavior baseline: SP-5, SP-7, SP-11 (`docs/specs/behavior/sprint-lifecycle.md`) kept.

Facts the panel corrected: there is no burndown (D46), so nothing buckets by day; `CreateSprint` takes no dates; today overdue is `end_date < current_date` in the database session zone (UTC), so an "ends Oct 16" sprint turns overdue at 21:00 in UTC−3.

## Decisions

| # | Question | Winner | Trade-off accepted |
|---|---|---|---|
| 1 | Time zone (Q1) | Store `timestamptz`. Web, CLI and MCP show and take times in the viewer's own zone (browser, OS), always with the zone name: web `Intl` short name ("EDT", "GMT-3"), CLI the UTC offset ("-03:00", chrono has no zone names), MCP RFC 3339 with offset. No time zone setting anywhere. | People in different zones see different day boundaries for the same sprint; the board zone arrives with the working calendar (follow-up). |
| 2 | Presets (Q2) | Start dialog list: 4 hours, 1 day, 1 week, 2 weeks, 1 month, Custom. 1 day = until 23:59 of the start day; 1 month = same day next month, clamped to the month's last day (Jan 31 → Feb 28); weeks keep the wall clock across DST; 4 hours is exact. Default: the board's remembered length, else 2 weeks (D12). | 3 and 4 weeks leave the list (D12 amended): Custom covers them, 1 month covers SP-5's four weeks. |
| 3 | Default start (Q3) | Now, to the minute, every time (SP-7: the start is the moment of starting). A planned end after now is kept and selects Custom. | A planned start is replaced, as SP-7 says. |
| 4 | Time left (Q4) | ≥ 1 day "3 days left" / "1 day left"; < 1 day "5h 20m left" ("5h left" on the hour); < 1 hour "20m left" (minutes round up, so 30 s reads "1m left"). Overdue badge: "Overdue" in its first minute, "Overdue by 20m", "Overdue by 2h", "Overdue by 1 day", "Overdue by 3 days". Ticks on each minute boundary without refetching. Same component on the board strip and the active backlog section header. | The backlog header gains the time left; one word, "Overdue", everywhere (IA). |
| 5 | Countdown accessibility (Q4, ux) | The text sits in `role="timer"` (never live per tick); a visually hidden `role="status"` says "{sprint} is overdue" only when the sprint turns overdue while the page is open. | A static `aria-label` would hide the value from screen readers, so the timer role carries the visible text instead. |
| 6 | Ranges (Q5) | One shared range formatter for backlog header, board, reports, history. Whole days (start 00:00, end 23:59 local): "Oct 1 – Oct 14", one day "Oct 16". Same day: "Oct 16, 09:00 – 22:00 EDT". Otherwise "Oct 16, 09:00 – Oct 17, 22:00 EDT". 12 h or 24 h follows the viewer's locale; month names stay English like the rest of the UI. | Migrated sprints read as before only in the zone they were migrated in (row 8). |
| 7 | Inputs (Q6) | Edit and start dialogs: a "Starts" pair and an "Ends" pair, each a native `date` input plus a native `time` input (not `datetime-local`). An empty time means 00:00 for the start and 23:59 for the end. A line under the pairs: "Times use your time zone (EDT)." The create dialog keeps name and goal only. | Two inputs per bound cost one more tab stop, in exchange for consistent labels and keyboard order on every browser. |
| 8 | Contract (Q7) | Rename `start_date`/`end_date` to `starts_at`/`ends_at` (RFC 3339) in the database, `Sprint`, `UpdateSprint`, `StartSprint`, OpenAPI, CLI help and MCP schema. Old names are refused (unknown field), not silently ignored. CLI flags stay `--start`/`--end` ("maps to starts_at"), plus `--for 4h|1d|1w|2w|1m`. | Breaking change for API clients: upgrade note. |
| 9 | Migration (Q8) | Dates become 00:00 start and 23:59:00 end in the database's own `timezone` setting (default UTC). sqlx opens every session with `TimeZone=UTC`, so the migration reads the database-level setting (`pg_db_role_setting`) and applies it for its own transaction. CHECK becomes `ends_at > starts_at`. Upgrade note: run `ALTER DATABASE <db> SET timezone TO '<zone>'` before deploying. | Irreversible; a deploy without the note anchors old sprints in UTC. |
| 10 | Overdue (D15 amended) | Server: `state = 'active' AND ends_at <= now()`, zone-free, flips at the exact minute. Web derives it from `ends_at` on its minute tick. Never auto-closed (D15). | — |
| 11 | Remembered length (Q10) | `board.sprint_length` holds a preset token or custom minutes (`4h`, `1d`, `1w`, `2w`, `1m`, `90`), one `SprintLength` type in `santi-types`. Written when `POST …/start` sends `length`; returned as `Backlog.sprint_length`. A custom length reopens as Custom with that exact duration from now. `length` without `ends_at` is refused. CLI without flags keeps the server default (2 weeks) and does not read the remembered length. | One extra primary-key read on `GET …/backlog` (budget 4 → 5 statements, D39): the board row is not read there today, and folding it into the member query would mix board data into auth. |
| 12 | Burndown (Q9) | Nothing to change: no burndown exists (D46). | Sub-day buckets go to the burndown card. |
| 13 | Imported sprints | Closed sprints from CSV keep day precision: 00:00 to 23:59 UTC. | Their times show shifted for viewers outside UTC. |

## Acceptance

- Start dialog: Duration select lists exactly "4 hours", "1 day", "1 week", "2 weeks", "1 month", "Custom". Choosing a preset or changing the start recomputes the end; editing the end selects Custom. Starting sends `starts_at`, `ends_at` and `length` (preset token, or minutes for Custom).
- A sprint started for 4 hours at 18:00 shows "4h left" on the board; at 21:59 "1m left"; at 22:00, without reload, the badge "Overdue" and one "{sprint} is overdue" announcement; at 22:20 "Overdue by 20m".
- Reopening the start dialog on the same board selects the last length used; a custom 1 h 30 m reopens as Custom ending 90 minutes after now; a board that never started one defaults to 2 weeks.
- Ranges render as row 6 on the backlog header, sprint report header and sprint history; a migrated sprint (00:00 to 23:59) shows dates only.
- CLI: `santi sprints start SAN 3 --for 4h`, `--end '2026-10-16 22:00'`, `--end 2026-10-16` (23:59 local), `--start 2026-10-16T09:00:00-03:00`; `--for` with `--end` is refused by the parser; a local time that does not exist or happens twice (DST) is refused naming the flag. `santi sprints list` prints `2026-10-16 09:00 → 2026-10-16 22:00 -03:00`.
- MCP `start_sprint` takes `starts_at`, `ends_at` (RFC 3339 with offset) and `length`; `list_sprints` returns `starts_at`/`ends_at`.
- API: `start_date` in a request is refused with 422; `ends_at` equal to or before `starts_at` is refused on field `ends_at`; SP-11 kept (future free, active keeps both set, closed keeps its times).
- Migration: with the database zone `America/Sao_Paulo`, a sprint of 2026-10-01 to 2026-10-14 becomes `2026-10-01T03:00:00Z` to `2026-10-15T02:59:00Z`; with no setting, `2026-10-01T00:00:00Z` to `2026-10-14T23:59:00Z`; null dates stay null.
- States:
  - Empty: no remembered length → 2 weeks; start prefilled with now.
  - Loading: submit disabled with spinner, inputs stay editable.
  - Error with retry: a refusal lands under the date input of the pair it names (`starts_at`, `ends_at`), values kept, resubmit without re-entry.
  - Partial data: a sprint without times shows "Add dates" (backlog) or nothing (board, reports), never a blank range.
  - Long text: goal textarea scrolls; the range never wraps sideways.
  - No permission: archived project hides start and edit triggers (SAN-104 `WriteLock`).
  - Phone 375px: pairs stack in one column under `sm`, 44 px targets (`h-11`), 16 px inputs (`text-base`), no horizontal scroll.
  - Dark theme: overdue badge and zone line on `warning-bg`/`warning` and muted tokens pass contrast.
  - Keyboard: name → duration → start date → start time → end date → end time → goal → Cancel → submit; Esc returns focus to the trigger (`useReturnFocus`).
  - Countdown: never announced per tick; announced once on the overdue transition.

## Out of scope

- Sub-day burndown buckets: no burndown exists (D46). Follow-up card.
- Board time zone and working calendar (RP-6): follow-up card.
- Zone names in the CLI (needs a time zone database); the CLI prints offsets.
- Dates in the create dialog.

## Deviations

