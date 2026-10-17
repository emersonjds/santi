# SAN-96 Sprint timestamps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** sprint start and end become instants (`starts_at`/`ends_at`), with presets from 4 hours to 1 month, a remembered length per board, a countdown that flips to overdue at the minute, and the same in API, CLI and MCP.

**Architecture:** migration 0020 retypes and renames the sprint columns and adds `board.sprint_length`; the server stays zone-free (overdue `ends_at <= now()`); every client computes "1 day" / "1 month" in its own zone and sends RFC 3339. Brief: `docs/specs/cards/SAN-96.md`; decision D48.

**Tech Stack:** axum 0.8 + utoipa 6, sqlx 0.9 (PostgreSQL 17), chrono 0.4.45 (`clock`, `serde`, `std`), clap, rmcp + schemars 1; React + react-hook-form + zod, openapi-fetch, vitest 4 browser (Playwright provider), Playwright e2e. No new dependency.

## Global Constraints

- Branch `feat/SAN-96-sprint-timestamps`, worktree `/Users/emerson/Documents/workspace/open-source/santi-96`. Commit each green step (Conventional Commits, English, no AI mention, no Co-Authored-By); never merge or push.
- TDD per task (skill `tdd`): the task's tests together, one red run, the code, one green run; report red and green.
- Rust gate: `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`, `scripts/sqlx-prepare.sh --check` (prepare with `scripts/sqlx-prepare.sh`, never against the dev database).
- Contract change: `UPDATE_OPENAPI=1 cargo test -p santi-server --test openapi`, then `pnpm gen:api` in `web/`.
- Web gate (from `web/`): `pnpm typecheck`, `pnpm lint`, `pnpm test:coverage` (> 90% on 4 metrics), `pnpm size`.
- Names: `starts_at`, `ends_at`, `length`, `sprint_length`, `SprintLength`. Tokens `4h`, `1d`, `1w`, `2w`, `1m`, or custom minutes `1`..`9999999` as digits.
- Copy exactly as in the brief (Decisions 4–7, Acceptance). Theme tokens only. "Overdue" is the only word for it.
- Overdue: server `state = 'active' AND ends_at <= now()`; web `now >= Date.parse(ends_at)`.
- Never open `/research`. Comments only for facts the code cannot show.

## Tasks

| # | Agent | Deliverable |
|---|---|---|
| 1 | backend | `SprintLength` type in `santi-types` |
| 2 | backend | migration 0020 + instants through server, reports, importer, seed; CLI compiles (bridge); OpenAPI; upgrade note — `qa` review |
| 3 | backend | remembered length: `StartSprint.length`, `board.sprint_length`, `Backlog.sprint_length` |
| 4 | cli-mcp | CLI `--start`/`--end` local times, `--for`, local output; MCP schema and description; docs |
| 5 | web | contract regen, test zone pin, `sprintWindow`, edit and start dialogs with date + time pairs |
| 6 | web | range formatter, minute tick, `SprintCountdown` on board and backlog, reports, e2e and screenshots |

---

### Task 1: `SprintLength` (backend)

**Files:**
- Modify: `crates/santi-types/src/sprints.rs` (type + unit tests at the bottom, next to `destinations_keep_their_wire_format`)

**Model:** `OpenIssuesDestination` in the same file (derives, wire-format tests).

**Interfaces (produces):**
```rust
/// D48: a start-dialog preset, or a custom length in minutes. Wire form: `4h`, `1d`, `1w`, `2w`, `1m` or digits.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub enum SprintLength { FourHours, OneDay, OneWeek, TwoWeeks, OneMonth, Minutes(u32) }

impl std::str::FromStr for SprintLength { type Err = String; }   // minutes 1..=9_999_999, no sign, no leading zero
impl std::fmt::Display for SprintLength {}                        // the token
impl TryFrom<String> for SprintLength { type Error = String; }    // via FromStr
impl From<SprintLength> for String {}                             // via Display
```
No `ToSchema`/`JsonSchema` on the type: fields that hold it carry `#[schema(value_type = Option<String>, example = "2w")]` and `#[cfg_attr(feature = "schemars", schemars(with = "Option<String>"))]` (Task 3).

- [ ] **Step 1: failing tests**
```rust
#[test]
fn lengths_round_trip_through_their_tokens() {
    for (token, length) in [
        ("4h", SprintLength::FourHours), ("1d", SprintLength::OneDay), ("1w", SprintLength::OneWeek),
        ("2w", SprintLength::TwoWeeks), ("1m", SprintLength::OneMonth), ("90", SprintLength::Minutes(90)),
        ("9999999", SprintLength::Minutes(9_999_999)),
    ] {
        assert_eq!(token.parse::<SprintLength>().unwrap(), length);
        assert_eq!(length.to_string(), token);
        assert_eq!(serde_json::to_value(length).unwrap(), json!(token));
        assert_eq!(serde_json::from_value::<SprintLength>(json!(token)).unwrap(), length);
    }
}

#[test]
fn lengths_refuse_anything_else() {
    for token in ["", "0", "090", "-5", "1.5", "3w", "2W", "10000000", " 4h"] {
        assert!(token.parse::<SprintLength>().is_err(), "{token}");
        assert!(serde_json::from_value::<SprintLength>(json!(token)).is_err(), "{token}");
    }
}
```
- [ ] **Step 2:** `cargo test -p santi-types` → FAIL (`SprintLength` not found).
- [ ] **Step 3: code**
```rust
impl FromStr for SprintLength {
    type Err = String;
    fn from_str(text: &str) -> Result<Self, Self::Err> {
        match text {
            "4h" => Ok(Self::FourHours),
            "1d" => Ok(Self::OneDay),
            "1w" => Ok(Self::OneWeek),
            "2w" => Ok(Self::TwoWeeks),
            "1m" => Ok(Self::OneMonth),
            _ if !text.starts_with('0') && (1..=7).contains(&text.len())
                && text.bytes().all(|byte| byte.is_ascii_digit()) =>
                Ok(Self::Minutes(text.parse().expect("1 to 7 digits fit in u32"))),
            _ => Err(format!("`{text}` is not 4h, 1d, 1w, 2w, 1m or a number of minutes")),
        }
    }
}
```
`Display` writes the same tokens (`Minutes(n)` → `n`).
- [ ] **Step 4:** `cargo test -p santi-types` → PASS; Rust gate.
- [ ] **Step 5:** commit `feat(types): sprint length presets and custom minutes`.

---

### Task 2: instants end to end (backend, `qa` review: migration + contract)

**Files:**
- Create: `crates/santi-server/migrations/0020_sprint_instants.sql`
- Modify: `crates/santi-types/src/sprints.rs` (`Sprint`, `UpdateSprint`, `StartSprint` fields)
- Modify: `crates/santi-server/src/sprints/{domain,repo,service}.rs`
- Modify: `crates/santi-server/src/reports/repo.rs` (lines 18, 27, 29, 39, 56–57, 81, 83, 104–105), `reports/domain.rs:142-143`, `boards/domain.rs:484-485` (fixtures)
- Modify: `crates/santi-server/src/imports/repo.rs:52-70` (`insert_closed_sprint`)
- Modify: `crates/santi-server/src/seed.rs:270-280` (`add_sprints`)
- Modify (bridge, replaced in Task 4): `crates/santi-cli/src/commands.rs:283-286` and `sprint_line` (604), fixture at 902
- Test: `sprints/domain.rs` unit tests; `crates/santi-server/tests/sprint_lifecycle.rs` (lines 69–71, 88, 116, 283, 286 + new tests), `tests/sprints.rs:83-97`, `tests/sprint_reports.rs:333`
- Regenerate: `.sqlx/`, `web/openapi.json`
- Modify: `CHANGELOG.md` (`[Unreleased]`)

**Models:** migration replay test `tests/account.rs::migration_0015_marks_accounts_erased_before_it`; repo functions as they are, column names swapped.

**Interfaces (produces):**
```rust
// santi-types/src/sprints.rs
pub struct Sprint { /* … */ pub starts_at: Option<DateTime<Utc>>, pub ends_at: Option<DateTime<Utc>>, /* started_at, closed_at, overdue */ }
pub struct UpdateSprint { pub name: String, pub goal: String, pub starts_at: Option<DateTime<Utc>>, pub ends_at: Option<DateTime<Utc>> } // #[serde(default)] as today
pub struct StartSprint {
    /// Defaults to now.
    pub starts_at: Option<DateTime<Utc>>,
    /// Defaults to two weeks after the start (D12).
    pub ends_at: Option<DateTime<Utc>>,
}
// sprints/domain.rs
pub const DEFAULT_SPRINT_DAYS: i64 = 14;
pub fn check_window(start: Option<DateTime<Utc>>, end: Option<DateTime<Utc>>) -> Result<(), AppError>; // replaces check_dates
pub fn check_sprint_edit(current: &Sprint, start: Option<DateTime<Utc>>, end: Option<DateTime<Utc>>) -> Result<(), AppError>;
pub fn start_window(now: DateTime<Utc>, start: Option<DateTime<Utc>>, end: Option<DateTime<Utc>>)
    -> Result<(DateTime<Utc>, DateTime<Utc>), AppError>;
// sprints/repo.rs
pub async fn update_sprint(conn, sprint_id: i64, name: &str, goal: &str, starts_at: Option<DateTime<Utc>>, ends_at: Option<DateTime<Utc>>);
pub async fn mark_started(conn, sprint_id: i64, starts_at: DateTime<Utc>, ends_at: DateTime<Utc>);
```
Refusals (field, message): `("ends_at", "must be after the start")`; active edit without both `("ends_at", "an active sprint needs a start and an end")`; closed edit changing either `("starts_at", "a closed sprint keeps its times")`.

- [ ] **Step 1: migration file** (check the CHECK's name first: `psql … -c '\d sprint'`; the unnamed `end_date >= start_date` one is `sprint_check`)
```sql
-- D48: dates become instants. The day boundary is the database's `timezone` setting
-- (ALTER DATABASE … SET timezone); sqlx opens every session with TimeZone=UTC, so read the catalog.
SELECT set_config('TimeZone', coalesce((
    SELECT substring(setting FROM '=(.*)$')
    FROM pg_db_role_setting, unnest(setconfig) AS setting
    WHERE setdatabase = (SELECT oid FROM pg_database WHERE datname = current_database())
      AND setrole = 0
      AND setting ILIKE 'timezone=%'
), 'UTC'), true);

ALTER TABLE sprint
    DROP CONSTRAINT sprint_check,
    ALTER COLUMN start_date TYPE timestamptz USING start_date + time '00:00',
    ALTER COLUMN end_date TYPE timestamptz USING end_date + time '23:59';
ALTER TABLE sprint RENAME COLUMN start_date TO starts_at;
ALTER TABLE sprint RENAME COLUMN end_date TO ends_at;
ALTER TABLE sprint ADD CONSTRAINT sprint_ends_after_start CHECK (ends_at > starts_at);

ALTER TABLE board ADD COLUMN sprint_length text
    CHECK (sprint_length ~ '^(4h|1d|1w|2w|1m|[1-9][0-9]{0,6})$');
```
- [ ] **Step 2: failing tests**
  - `sprints/domain.rs`: `window_must_end_after_it_starts` (equal → `ends_at` refusal; one side None → Ok); `edits_depend_on_the_sprint_state` with instants (fixture `Some("2026-10-01T00:00:00Z".parse().unwrap())`); `start_window_defaults_to_now_and_two_weeks` (`now` = `2026-10-16T21:30:00Z` → end `2026-10-30T21:30:00Z`; explicit start keeps it; end before start refused).
  - `tests/sprint_lifecycle.rs` (migration tests copy `account.rs:292-330`; split files at `"0020"`):
```rust
async fn sprint_rows_after_0020(pool: &PgPool, zone: Option<&str>) -> Vec<(String, Option<DateTime<Utc>>, Option<DateTime<Utc>>)>
// on a #[sqlx::test(migrations = false)] pool: runs files < "0020", then:
//   INSERT INTO project (key, name) VALUES ('MIG', 'm');
//   INSERT INTO board (project_id, board_type) SELECT id, 'scrum' FROM project;
//   INSERT INTO sprint (board_id, name, state, start_date, end_date, started_at, closed_at)
//   SELECT id, 'Old', 'closed', '2026-10-01', '2026-10-14', '2026-10-01', '2026-10-14' FROM board;
//   INSERT INTO sprint (board_id, name) SELECT id, 'Later' FROM board;
// zone Some(z): ALTER DATABASE "<current_database()>" SET timezone TO '<z>' (sqlx::AssertSqlSafe(format!(…)))
// then 0020, then SELECT name, starts_at, ends_at FROM sprint ORDER BY id
```
    `migration_0020_anchors_days_in_the_database_time_zone` (`America/Sao_Paulo` → `2026-10-01T03:00:00Z` / `2026-10-15T02:59:00Z`; `Later` stays `(None, None)`; `UPDATE sprint SET ends_at = starts_at WHERE name = 'Old'` errors; `UPDATE board SET sprint_length = '3w'` errors, `'90'` passes); `migration_0020_uses_utc_without_a_database_zone` (`2026-10-01T00:00:00Z` / `2026-10-14T23:59:00Z`).
  - `tests/sprint_lifecycle.rs`: `start_takes_offsets_and_answers_utc` (`{"starts_at":"2026-10-16T09:00:00-03:00","ends_at":"2026-10-16T22:00:00-03:00"}` → `"2026-10-16T12:00:00Z"`, `"2026-10-17T01:00:00Z"`); `overdue_flips_at_the_minute` (start with `ends_at` = now + 1 h → `overdue` false; `UPDATE sprint SET ends_at = now() - interval '1 second'` via runtime `sqlx::query` → GET says true; PUT `ends_at` = now + 2 min → false); `old_date_fields_are_refused` (POST start `{"start_date":"2026-10-16"}` → 422); update existing asserts at 69–71 to `starts_at`/`ends_at` (start defaults to the request time, end = start + 14 days).
  - `tests/sprints.rs:83-97`: same edit with instants; refusal field `ends_at`.
  - `tests/sprint_reports.rs:333`: runtime insert uses `starts_at, ends_at` with `'2026-01-01T00:00:00Z', '2026-01-14T23:59:00Z'`.
- [ ] **Step 3:** `cargo test -p santi-server --test sprint_lifecycle` and the domain tests → FAIL.
- [ ] **Step 4: code**
  - `sqlx migrate run --source crates/santi-server/migrations` on the dev database (needed by the query macros).
  - Types as in Interfaces (`NaiveDate` import goes away).
  - Domain:
```rust
pub fn check_window(start: Option<DateTime<Utc>>, end: Option<DateTime<Utc>>) -> Result<(), AppError> {
    if let (Some(start), Some(end)) = (start, end)
        && end <= start
    {
        return Err(AppError::invalid("ends_at", "must be after the start"));
    }
    Ok(())
}

pub fn start_window(now: DateTime<Utc>, start: Option<DateTime<Utc>>, end: Option<DateTime<Utc>>)
    -> Result<(DateTime<Utc>, DateTime<Utc>), AppError> {
    let start = start.unwrap_or(now);
    let end = end.unwrap_or(start + TimeDelta::days(DEFAULT_SPRINT_DAYS));
    check_window(Some(start), Some(end))?;
    Ok((start, end))
}
```
  - Repo: every `SELECT … start_date, end_date …` becomes `starts_at, ends_at`, and the overdue column `(state = 'active' AND ends_at <= now()) AS "overdue!"` (5 in `sprints/repo.rs`, 2 in `reports/repo.rs` with their `page.`/`s.` prefixes and the `GROUP BY`). `update_sprint`/`mark_started` write `starts_at`/`ends_at`.
  - Service: `domain::start_window(Utc::now(), input.starts_at, input.ends_at)?`; `check_sprint_edit(&current, input.starts_at, input.ends_at)`.
  - Importer keeps day precision (brief row 13):
```sql
INSERT INTO sprint (board_id, name, state, starts_at, ends_at, started_at, closed_at)
VALUES ($1, $2, 'closed', ($3::date + time '00:00') AT TIME ZONE 'UTC',
        ($4::date + time '23:59') AT TIME ZONE 'UTC', $3::date, $4::date)
RETURNING id
```
  - Seed: `let now = Utc::now();` `let start = now - Duration::weeks(weeks_back) - Duration::days(7);` `mark_started(conn, id, start, start + Duration::days(14))`.
  - CLI bridge (Task 4 replaces it): `starts_at: start.map(|day| day.and_time(NaiveTime::MIN).and_utc())`, `ends_at: end.map(|day| day.and_hms_opt(23, 59, 0).expect("23:59 exists").and_utc())`; `sprint_line` prints `start.format("%Y-%m-%d %H:%M")` → same for end; fixture at 902 to `"starts_at": "2026-10-01T00:00:00Z", "ends_at": "2026-10-14T23:59:00Z"`, expected line `#3 Sprint 3 (closed) 2026-10-01 00:00 → 2026-10-14 23:59`.
  - `CHANGELOG.md` under `## [Unreleased]`:
```markdown
### Changed

- **Sprints:** start and end are times, not dates. The API fields `start_date`/`end_date` are now
  `starts_at`/`ends_at` (RFC 3339) on sprints, sprint edits and sprint start; the old names are
  refused. An active sprint is overdue from the minute its end passes.

### Upgrade notes

- Migration 0020 turns existing sprint dates into 00:00 (start) and 23:59 (end) in the
  database's `timezone` setting, UTC when unset. Before deploying, run
  `ALTER DATABASE <db> SET timezone TO '<zone>'` (for example `'America/Sao_Paulo'`) so old
  sprints keep their day boundaries.
- API clients: send `starts_at`/`ends_at` as instants with an offset instead of dates.
```
- [ ] **Step 5:** green: `cargo test --workspace`; `scripts/sqlx-prepare.sh`; `UPDATE_OPENAPI=1 cargo test -p santi-server --test openapi`; Rust gate.
- [ ] **Step 6:** commit `feat(server)!: sprint start and end are instants`.

---

### Task 3: remembered length (backend)

**Files:**
- Modify: `crates/santi-types/src/sprints.rs` (`StartSprint.length`), `crates/santi-types/src/boards.rs:171` (`Backlog.sprint_length`)
- Modify: `crates/santi-server/src/sprints/{domain,repo,service}.rs`, `crates/santi-server/src/boards/service.rs:65-78`
- Modify: `crates/santi-cli/src/commands.rs` (`StartSprint { …, length: None }` until Task 4)
- Test: `sprints/domain.rs`, `tests/sprint_lifecycle.rs`, `tests/perf_budget.rs:89-95` (backlog 4 → 5)
- Regenerate: `.sqlx/`, `web/openapi.json`

**Models:** `boards/repo.rs::find_done_window` (one-column board read), `set_done_window` (board write).

**Interfaces (produces):**
```rust
// santi-types
pub struct StartSprint {
    // starts_at, ends_at as in Task 2
    /// Remembered as the board's next default (D48): `4h`, `1d`, `1w`, `2w`, `1m`, or minutes. Needs `ends_at`.
    #[serde(default)]
    #[schema(value_type = Option<String>, example = "2w")]
    #[cfg_attr(feature = "schemars", schemars(with = "Option<String>"))]
    pub length: Option<SprintLength>,
}
pub struct Backlog {
    pub sections: Vec<BacklogSection>,
    pub epics: Vec<EpicSummary>,
    /// Length of the board's last started sprint (D48); null means two weeks.
    #[schema(value_type = Option<String>, example = "2w")]
    pub sprint_length: Option<SprintLength>,
}
// sprints/domain.rs
pub fn check_length(length: Option<SprintLength>, ends_at: Option<DateTime<Utc>>) -> Result<(), AppError>; // ("length", "needs ends_at")
// sprints/repo.rs
pub async fn remember_length(conn: &mut PgConnection, board_id: i64, length: SprintLength) -> Result<(), sqlx::Error>;
pub async fn sprint_length(conn: &mut PgConnection, board_id: i64) -> Result<Option<SprintLength>, sqlx::Error>;
```

- [ ] **Step 1: failing tests**
  - domain: `length_needs_an_end` (`Some(OneDay)` + `None` → `length` refusal; with an end or without a length → Ok).
  - `tests/sprint_lifecycle.rs`: `start_remembers_the_length_for_the_board` (new board backlog `sprint_length` null; start with `starts_at`, `ends_at`, `"length": "1d"` → backlog says `"1d"`; complete, start the next without `length` → still `"1d"`; next with `"90"` → `"90"`); `length_without_an_end_is_refused` (422, `errors[0].field == "length"`, sprint still future); `unknown_length_is_refused` (`"3w"` → 422).
  - `tests/perf_budget.rs`: backlog budget 5.
- [ ] **Step 2:** red run (`cargo test -p santi-server --test sprint_lifecycle`, domain tests).
- [ ] **Step 3: code**
```rust
pub async fn remember_length(conn: &mut PgConnection, board_id: i64, length: SprintLength) -> Result<(), sqlx::Error> {
    sqlx::query!("UPDATE board SET sprint_length = $2 WHERE id = $1", board_id, length.to_string())
        .execute(&mut *conn)
        .await?;
    Ok(())
}

/// The CHECK in migration 0020 keeps every stored token parseable.
pub async fn sprint_length(conn: &mut PgConnection, board_id: i64) -> Result<Option<SprintLength>, sqlx::Error> {
    let token = sqlx::query_scalar!("SELECT sprint_length FROM board WHERE id = $1", board_id)
        .fetch_one(&mut *conn)
        .await?;
    Ok(token.and_then(|token| token.parse().ok()))
}
```
  Service `start_sprint`: `domain::check_length(input.length, input.ends_at)?;` before the window; after `mark_started`: `if let Some(length) = input.length { repo::remember_length(&mut tx, member.board_id, length).await?; }`. `boards::service::backlog`: `let sprint_length = sprints::repo::sprint_length(&mut conn, member.board_id).await?;` into `Backlog`.
  - `CHANGELOG.md` `[Unreleased]` `### Added`: `- **Sprints:** starting a sprint remembers its length for the board's next one (\`length\` on sprint start, \`sprint_length\` on the backlog).`
- [ ] **Step 4:** green; `scripts/sqlx-prepare.sh`; OpenAPI regen; Rust gate.
- [ ] **Step 5:** commit `feat(server): remember each board's last sprint length`.

---

### Task 4: CLI and MCP (cli-mcp)

**Files:**
- Create: `crates/santi-cli/src/sprint_time.rs`; modify `crates/santi-cli/src/lib.rs` (`pub mod sprint_time;`)
- Modify: `crates/santi-cli/src/cli.rs:243-251` (`SprintsCommand::Start`), parsers next to `destination` (281)
- Modify: `crates/santi-cli/src/commands.rs` (`Start` arm, `sprint_line`, fixture test)
- Modify: `crates/santi-cli/src/mcp.rs:540-543` (`start_sprint` description)
- Modify: `README.md:129`, `docs/mcp.md:67`, `CHANGELOG.md`
- Test: unit tests in `sprint_time.rs` and `cli.rs`; `crates/santi-cli/tests/cli.rs` (copy the test around line 409); `crates/santi-cli/tests/mcp.rs` (copy the `start_sprint` call at 185)

**Model:** `cli.rs::destination` (clap value parser + its tests); `commands.rs::sprint_line`.

**Interfaces (produces):**
```rust
// sprint_time.rs — pure, generic over the zone so tests use FixedOffset, never the TZ env
pub fn end_of_day() -> NaiveTime;                                     // 23:59
pub fn now_to_the_minute() -> DateTime<Local>;                        // Local::now().duration_trunc(TimeDelta::minutes(1))
pub fn parse_moment<Tz: TimeZone>(text: &str, zone: &Tz, day_time: NaiveTime, flag: &str) -> Result<DateTime<Tz>, String>;
pub fn single<T>(result: MappedLocalTime<T>, flag: &str) -> Result<T, String>;
pub fn sprint_window<Tz: TimeZone>(start: &DateTime<Tz>, length: SprintLength) -> Result<DateTime<Tz>, String>;
pub fn custom_length<Tz: TimeZone>(start: &DateTime<Tz>, end: &DateTime<Tz>) -> Option<SprintLength>; // Minutes(1..=9_999_999)
pub fn window_text<Tz: TimeZone>(start: DateTime<Utc>, end: DateTime<Utc>, zone: &Tz) -> String where Tz::Offset: Display;
// cli.rs
Start {
    project: ProjectKey,
    sprint: i64,
    /// `YYYY-MM-DD HH:MM` or `YYYY-MM-DD` (00:00) in your time zone, or RFC 3339; default now. Maps to starts_at
    #[arg(long, value_parser = start_moment)]
    start: Option<DateTime<Local>>,
    /// `YYYY-MM-DD HH:MM` or `YYYY-MM-DD` (23:59) in your time zone, or RFC 3339. Maps to ends_at
    #[arg(long, value_parser = end_moment)]
    end: Option<DateTime<Local>>,
    /// 4h, 1d (until 23:59 that day), 1w, 2w or 1m (same day next month)
    #[arg(long = "for", value_parser = preset, conflicts_with = "end")]
    length: Option<SprintLength>,
}
```
Start help line: "Start a sprint: now and two weeks later unless --start, --end or --for say otherwise".

- [ ] **Step 1: failing tests**
  - `sprint_time.rs` (zone `FixedOffset::west_opt(3 * 3600)` unless noted):
    - `local_text_reads_in_the_given_zone`: `"2026-10-16 22:00"` → `2026-10-17T01:00:00Z`; `"2026-10-16"` with `end_of_day()` → `2026-10-17T02:59:00Z`, with `NaiveTime::MIN` → `2026-10-16T03:00:00Z`; `"2026-10-16T22:00:00Z"` stays that instant; `"tomorrow"` → Err containing `--end` and `YYYY-MM-DD`.
    - `clock_changes_are_refused_naming_the_flag`: `single(MappedLocalTime::<i32>::None, "--end")` Err contains `--end` and `does not exist`; `Ambiguous(1, 2)` Err contains `happens twice`; `Single(1)` → Ok(1).
    - `presets_end_where_the_brief_says`: start `2026-10-16 18:00 -03:00`: 4h → 22:00; 1d → `2026-10-16 23:59 -03:00`; 1w → `2026-10-23 18:00`; 2w → `2026-10-30 18:00`; 1m → `2026-11-16 18:00`; `Minutes(90)` → 19:30; start `2027-01-31 09:00` 1m → `2027-02-28 09:00`.
    - `one_day_ends_on_the_local_day_at_zone_edges`: start `2026-10-16 22:00` at `+14:00` → end `2026-10-16T09:59:00Z`; at `-12:00` → `2026-10-17T11:59:00Z`.
    - `custom_length_counts_minutes`: 90 min → `Some(Minutes(90))`; 0 or negative → None.
    - `window_text_shows_local_times_and_offset`: `2026-10-16T12:00Z`..`2026-10-17T01:00Z` at -03:00 → `"2026-10-16 09:00 → 2026-10-16 22:00 -03:00"`.
  - `cli.rs`: `for_takes_presets_only` (`--for 4h` → `Some(FourHours)`; `--for 90` and `--for 3w` → parse error mentioning `--end`); `for_conflicts_with_end` (`--for 1d --end 2026-10-16` → clap error).
  - `commands.rs` fixture test: expected first line `format!("#3 Sprint 3 (closed) {}", window_text(start, end, &Local))`.
  - `tests/cli.rs`: `sprints_start_for_four_hours` (`sprints start SPR <id> --for 4h --json` → `ends_at - starts_at == 4h`; `backlog SPR --json` → `sprint_length == "4h"`); `sprints_start_end_day_only_ends_at_2359_local`.
  - `tests/mcp.rs`: `start_sprint` with `{"starts_at":"2026-10-16T09:00:00-03:00","ends_at":"2026-10-16T22:00:00-03:00","length":"1d"}` → `starts_at == "2026-10-16T12:00:00Z"`; `tools/list` schema of `start_sprint` has `starts_at`, `ends_at`, `length` and no `start_date`.
- [ ] **Step 2:** red: `cargo test -p santi-cli`.
- [ ] **Step 3: code**
```rust
pub fn parse_moment<Tz: TimeZone>(text: &str, zone: &Tz, day_time: NaiveTime, flag: &str) -> Result<DateTime<Tz>, String> {
    if let Ok(moment) = DateTime::parse_from_rfc3339(text) {
        return Ok(moment.with_timezone(zone));
    }
    let local = NaiveDateTime::parse_from_str(text, "%Y-%m-%d %H:%M")
        .or_else(|_| NaiveDate::parse_from_str(text, "%Y-%m-%d").map(|day| day.and_time(day_time)))
        .map_err(|_| format!("{flag} takes YYYY-MM-DD, 'YYYY-MM-DD HH:MM' or RFC 3339, not `{text}`"))?;
    single(zone.from_local_datetime(&local), flag)
}

pub fn single<T>(result: MappedLocalTime<T>, flag: &str) -> Result<T, String> {
    match result {
        MappedLocalTime::Single(moment) => Ok(moment),
        MappedLocalTime::Ambiguous(..) => Err(format!("{flag}: that local time happens twice (clock change); add an offset")),
        MappedLocalTime::None => Err(format!("{flag}: that local time does not exist (clock change)")),
    }
}

pub fn sprint_window<Tz: TimeZone>(start: &DateTime<Tz>, length: SprintLength) -> Result<DateTime<Tz>, String> {
    let end = match length {
        SprintLength::FourHours => Some(start.clone() + TimeDelta::hours(4)),
        SprintLength::OneDay => start.timezone().from_local_datetime(&start.date_naive().and_time(end_of_day())).single(),
        SprintLength::OneWeek => start.clone().checked_add_days(Days::new(7)),
        SprintLength::TwoWeeks => start.clone().checked_add_days(Days::new(14)),
        SprintLength::OneMonth => start.clone().checked_add_months(Months::new(1)),
        SprintLength::Minutes(minutes) => Some(start.clone() + TimeDelta::minutes(minutes.into())),
    };
    end.ok_or_else(|| "--for: the end falls on a clock change; use --end".to_string())
}
```
  `cli.rs` parsers: `start_moment` = `parse_moment(text, &Local, NaiveTime::MIN, "--start")`, `end_moment` = same with `end_of_day()` and `"--end"`, `preset` = `text.parse()` refusing `Minutes(_)` with "`{text}` is not 4h, 1d, 1w, 2w or 1m; use --end for other lengths".
  `commands.rs` `Start` arm:
```rust
let start = start.unwrap_or_else(sprint_time::now_to_the_minute);
let (end, length) = match (end, length) {
    (Some(end), _) => (Some(end), sprint_time::custom_length(&start, &end)),
    (None, Some(length)) => (Some(sprint_time::sprint_window(&start, length).map_err(Error::Usage)?), Some(length)),
    (None, None) => (None, None),
};
let window = StartSprint {
    starts_at: Some(start.with_timezone(&Utc)),
    ends_at: end.map(|end| end.with_timezone(&Utc)),
    length,
};
client.start_sprint(&project, sprint, &window).await?
```
  `sprint_line`: `window_text(start, end, &Local)` when both are set.
  MCP description: "Start a future sprint. `starts_at` and `ends_at` are RFC 3339 with an offset (default now and two weeks later); `length` (`4h`, `1d`, `1w`, `2w`, `1m` or minutes) becomes the board's next default and needs `ends_at`. Requires `project` and `sprint_id`."
  Docs: README example `santi sprints start WEB 3 --for 1w` plus `santi sprints start WEB 3 --end '2026-10-16 22:00'`; `docs/mcp.md` row: "start a future sprint (`starts_at`, `ends_at`, `length`)". CHANGELOG `### Added`: "**CLI:** `santi sprints start` takes `--for 4h|1d|1w|2w|1m` and local `--start`/`--end` times; sprint lines show local times with the UTC offset."
- [ ] **Step 4:** green: `cargo test -p santi-cli`; Rust gate.
- [ ] **Step 5:** commit `feat(cli): sprint times in the local zone and --for presets`.

---

### Task 5: start and edit dialogs (web)

**Files:**
- Regenerate: `web/src/shared/api/schema.d.ts` (`pnpm gen:api`)
- Modify: `web/vite.config.ts:146-151` (pin the test zone)
- Create: `web/src/features/sprint/sprint-window.ts`, `web/src/features/sprint/sprint-window.test.ts`
- Modify: `web/src/shared/lib/sprint-dates.ts` (`day` reads an instant; add `zoneName`)
- Modify: `web/src/features/sprint/sprint-dialog.tsx` (schemas 74–98, `TextField` 179–218, `EditSprintForm` 263–312, `StartSprintForm` 343–435, `SprintAction` 51–58), `sprint-mutations.ts:65-79`, `sprint-dialogs.test.tsx`
- Modify: `web/src/widgets/backlog/backlog.tsx:150-190` (start action carries the backlog's `sprint_length`)
- Modify (bridge, replaced in Task 6): `widgets/board/board-states.tsx:10-36`, `widgets/backlog/section-header.tsx:56-58`, `widgets/reports/sprint-report.tsx:99-101`, `widgets/reports/sprint-history.tsx:49-51` (`start_date` → `starts_at`, `end_date` → `ends_at`)
- Modify: `web/src/test/stub-api.ts:236-238,486-488`, `pages/board/board-page.test.tsx:163`, `pages/backlog/backlog-page.test.tsx`, `pages/reports/reports-page.test.tsx`, `web/e2e/board.spec.ts:164-168`, `web/e2e/reports.spec.ts` (field renames; e2e bodies send `starts_at: new Date().toISOString()`, `ends_at` one hour later)

**Model:** `StartSprintForm` and its tests as they are; `TextField` for the new pair component.

**Interfaces (produces):**
```ts
// shared/lib/sprint-dates.ts
export const day: (instant: string) => string        // "Sep 1", local
export const zoneName: (instant: Date) => string      // Intl short name: "EDT", "GMT-3"
// features/sprint/sprint-window.ts
export const PRESETS: readonly (readonly [token: string, label: string])[] // 4h "4 hours", 1d "1 day", 1w "1 week", 2w "2 weeks", 1m "1 month"
export const CUSTOM = 'custom'
export const sprintWindow: (start: Date, length: string) => Date
export const customLength: (start: Date, end: Date) => string | null       // "90"; null outside 1..9999999
export const toInputs: (instant: Date) => { day: string; time: string }   // 'YYYY-MM-DD', 'HH:MM' local
export const fromInputs: (day: string, time: string, fallback: '00:00' | '23:59') => Date
export const nowToTheMinute: () => Date
// sprint-dialog.tsx
export type SprintAction = … | { kind: 'start'; sprint: Sprint; section: BacklogSection; length: string | null }
// sprint-mutations.ts
useStartSprint(projectKey): mutateAsync({ id, length, ...body }: Of<UpdateSprint> & { length: string | null })
// PUT body = name, goal, starts_at, ends_at; POST …/start body = { starts_at, ends_at, length }
```
Form fields (names equal the API's so `refusal` maps errors unchanged): `starts_at` (date), `starts_at_time`, `ends_at` (date), `ends_at_time`; start form also `duration` (`4h` … `1m` | `custom`).

- [ ] **Step 1: zone pin** in `vite.config.ts`: `provider: playwright({ contextOptions: { timezoneId: 'America/New_York', locale: 'en-US' } })`. Run `pnpm test` once: still green before any other change (existing tests are zone-free).
- [ ] **Step 2: failing tests**
  - `sprint-window.test.ts` (zone pinned; build dates with `new Date(2026, 9, 16, 18, 0)`): 4h → 22:00; 1d → 23:59 same day; 1d from 23:59 → equal to start; 1w and 2w across the 2026-11-01 DST end keep 18:00 local; 1m Oct 16 → Nov 16, Jan 31 2027 → Feb 28; `'90'` → 19:30; `customLength` 90 → `'90'`, 0 → null; `toInputs`/`fromInputs` round trip; empty time → 00:00 / 23:59; `zoneName(new Date(2026, 9, 16))` → `'EDT'`.
  - `sprint-dialogs.test.tsx` (`vi.useFakeTimers({ toFake: ['Date'] })`, `vi.setSystemTime(new Date(2026, 9, 16, 18, 0, 42))`):
    - duration options exactly "4 hours", "1 day", "1 week", "2 weeks", "1 month", "Custom";
    - no remembered length → "2 weeks", start 2026-10-16 18:00, end 2026-10-30 18:00;
    - `length: '1d'` → "1 day", end 23:59; `length: '90'` → "Custom", end 19:30;
    - a planned `ends_at` after now → "Custom" with that end; a planned `starts_at` is replaced by now (SP-7);
    - picking "4 hours" sets end 22:00; changing the start time to 19:00 moves it to 23:00; editing the end time selects "Custom";
    - submit sends PUT then POST with `starts_at: '2026-10-16T22:00:00.000Z'`, `ends_at: '2026-10-17T02:00:00.000Z'`, `length: '4h'`; Custom sends minutes;
    - an end equal to the start shows "End after the start." under the end date and sends nothing;
    - a 422 on `ends_at` lands under the end date, values kept;
    - "Times use your time zone (EDT)." under the pairs;
    - tab order name → duration → start date → start time → end date → end time → goal → Cancel → Start sprint;
    - edit dialog: the pairs show the sprint's local times; clearing the end time saves 23:59; clearing both end inputs on a future sprint sends `ends_at: null`.
- [ ] **Step 3:** red: `pnpm test src/features/sprint`.
- [ ] **Step 4: code**
```ts
const MINUTE = 60_000

export const sprintWindow = (start: Date, length: string): Date => {
  const end = new Date(start)
  switch (length) {
    case '4h':
      return new Date(start.getTime() + 240 * MINUTE)
    case '1d':
      end.setHours(23, 59, 0, 0)
      return end
    case '1w':
    case '2w':
      end.setDate(end.getDate() + (length === '1w' ? 7 : 14))
      return end
    case '1m': {
      const day = end.getDate()
      end.setDate(1)
      end.setMonth(end.getMonth() + 1)
      end.setDate(Math.min(day, new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate()))
      return end
    }
    default:
      return new Date(start.getTime() + Number(length) * MINUTE)
  }
}

export const fromInputs = (day: string, time: string, fallback: '00:00' | '23:59') =>
  new Date(`${day}T${time || fallback}`)

export const toInputs = (instant: Date) => ({
  day: instant.toLocaleDateString('sv'),
  time: instant.toLocaleTimeString('sv', { hour: '2-digit', minute: '2-digit' }),
})
```
  Dialog: replace `today`/`addDays`/`DURATIONS`; `ordered` compares `fromInputs(...)` instants with `ORDER = { message: 'End after the start.', path: ['ends_at'] }`; start schema keeps "Pick a start date." / "Pick an end date."; one `MomentFields` component per bound: `<fieldset>` with legend "Starts"/"Ends", a `grid gap-2 sm:grid-cols-2` holding `Input type='date'` (`aria-label` "Start date"/"End date") and `Input type='time'` ("Start time"/"End time"), both `className={FIELD}` (keeps `h-11` and `text-base`), `FormMessage` under the date; zone line `<p className='text-sm text-muted-foreground'>Times use your time zone ({zoneName(new Date())}).</p>`. Start defaults: start = `nowToTheMinute()`; planned end after now → Custom with it; else remembered `length ?? '2w'` (a digits token → Custom with `sprintWindow(start, length)`). Changing duration or start recomputes the end unless Custom; editing either end input selects Custom. `backlog.tsx` passes `length: backlog.sprint_length ?? null` into the start action.
  Bridges: `day(iso)` = `new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })`; board `timeLeft(sprint.ends_at)` uses `Date.parse(endsAt)`.
- [ ] **Step 5:** green; web gate.
- [ ] **Step 6:** commit `feat(web): sprint dialogs with presets, date and time`.

---

### Task 6: ranges and countdown (web)

**Files:**
- Modify: `web/src/shared/lib/sprint-dates.ts` (add `formatRange`, `timeLeft`; drop `day` once unused)
- Create: `web/src/shared/lib/sprint-dates.test.ts`, `web/src/shared/lib/use-now.ts`, `web/src/shared/lib/use-now.test.tsx`
- Create: `web/src/entities/sprint/sprint-countdown.tsx`, `web/src/entities/sprint/sprint-countdown.test.tsx`
- Modify: `web/src/widgets/board/board-states.tsx` (`SprintStrip` uses `SprintCountdown`; remove `timeLeft`, `DAY`), `widgets/backlog/section-header.tsx` (`Dates` uses `formatRange`; active section shows `SprintCountdown` in place of the `sprint.overdue` badge), `widgets/reports/sprint-report.tsx:99-101`, `widgets/reports/sprint-history.tsx:49-51`
- Modify: `web/src/pages/board/board-page.test.tsx:23,163` (new copy)
- Modify: `web/e2e/board.spec.ts` (new test + screenshots)
- Modify: `CHANGELOG.md` `[Unreleased]` `### Added`

**Model:** `shared/lib/initials.ts` + `initials.test.ts` (pure helper and test); `shared/lib/use-return-focus.ts` (hook); `SprintStrip` badge classes.

**Interfaces (produces):**
```ts
export const formatRange: (startsAt: string, endsAt: string, hourCycle?: Intl.LocaleHourCycleKey) => string
// default hourCycle = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle
export const timeLeft: (now: number, endsAt: string) => { overdue: boolean; text: string }
export const useNow: () => number      // re-renders on each minute boundary
export const SprintCountdown: ({ sprint }: { sprint: Sprint }) => JSX.Element | null
```

- [ ] **Step 1: failing tests**
  - `sprint-dates.test.ts` (zone pinned to New York):
    - `formatRange`: local 00:00 Oct 1 → 23:59 Oct 14 → "Oct 1 – Oct 14"; 00:00 → 23:59 same day → "Oct 16"; 09:00 → 22:00 same day, `'h23'` → "Oct 16, 09:00 – 22:00 EDT", `'h12'` → "Oct 16, 9:00 AM – 10:00 PM EDT"; Oct 16 09:00 → Oct 17 22:00 `'h23'` → "Oct 16, 09:00 – Oct 17, 22:00 EDT". Hour option: `'numeric'` for h11/h12, `'2-digit'` otherwise.
    - `timeLeft` (end fixed, `now` varies): +3 d 2 h → "3 days left"; +24 h → "1 day left"; +5 h 20 m → "5h 20m left"; +5 h → "5h left"; +20 m → "20m left"; +30 s → "1m left"; 0 → overdue "Overdue"; −20 m → "Overdue by 20m"; −2 h 5 m → "Overdue by 2h"; −1 d → "Overdue by 1 day"; −3 d → "Overdue by 3 days"; `overdue` true from 0 on.
  - `use-now.test.tsx` (`vi.useFakeTimers()`, system time 18:00:42): first re-render at 18:01:00, then every 60 s; timer cleared on unmount.
  - `sprint-countdown.test.tsx`: active sprint ending 22:00, now 21:59:00 → `role="timer"` "1m left", status empty; advance to 22:00 → warning badge "Overdue" and status "Sprint 4 is overdue", no refetch; rendered already overdue → status stays empty; no `ends_at` → nothing.
  - `board-page.test.tsx`: strip shows "3 days left" from the stub; the old 'Ends today' row becomes "5h 20m left" (stub `ends_at` = now + 5 h 20 m).
  - backlog/reports tests: ranges via `formatRange` (stub sprint 00:00–23:59 → "Sep 1 – Sep 14").
  - `e2e/board.spec.ts` `sprint counts down to the minute`: open the backlog, start a sprint with "4 hours" → board strip "4h left"; set `ends_at` one minute ahead through the API, `page.clock.install()` + `fastForward('01:00')` → badge "Overdue"; screenshots of the start dialog and the strip at 1440 and 375, light and dark, to `docs/screenshots/san-96/`.
- [ ] **Step 2:** red: `pnpm test src/shared/lib src/entities/sprint src/pages/board`.
- [ ] **Step 3: code**
```ts
const MINUTE = 60_000
const HOUR_MINUTES = 60
const DAY_MINUTES = 1440

export const timeLeft = (now: number, endsAt: string) => {
  const diff = Date.parse(endsAt) - now
  if (diff > 0) {
    const minutes = Math.ceil(diff / MINUTE)
    if (minutes >= DAY_MINUTES) {
      const days = Math.floor(minutes / DAY_MINUTES)
      return { overdue: false, text: days === 1 ? '1 day left' : `${days} days left` }
    }
    const hours = Math.floor(minutes / HOUR_MINUTES)
    const rest = minutes % HOUR_MINUTES
    const text = hours === 0 ? `${rest}m left` : rest === 0 ? `${hours}h left` : `${hours}h ${rest}m left`
    return { overdue: false, text }
  }
  const late = Math.floor(-diff / MINUTE)
  if (late < 1) return { overdue: true, text: 'Overdue' }
  if (late < HOUR_MINUTES) return { overdue: true, text: `Overdue by ${late}m` }
  if (late < DAY_MINUTES) return { overdue: true, text: `Overdue by ${Math.floor(late / HOUR_MINUTES)}h` }
  const days = Math.floor(late / DAY_MINUTES)
  return { overdue: true, text: days === 1 ? 'Overdue by 1 day' : `Overdue by ${days} days` }
}

export const useNow = () => {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      timer = setTimeout(() => {
        setNow(Date.now())
        schedule()
      }, MINUTE - (Date.now() % MINUTE))
    }
    schedule()
    return () => clearTimeout(timer)
  }, [])
  return now
}

export const SprintCountdown = ({ sprint }: { sprint: Sprint }) => {
  const now = useNow()
  const [startedOverdue] = useState(() => !!sprint.ends_at && Date.parse(sprint.ends_at) <= Date.now())
  if (!sprint.ends_at) return null
  const { overdue, text } = timeLeft(now, sprint.ends_at)
  return (
    <>
      <span
        role='timer'
        className={overdue ? 'rounded-full bg-warning-bg px-2 text-xs font-semibold text-warning' : undefined}
      >
        {text}
      </span>
      <span role='status' className='sr-only'>
        {overdue && !startedOverdue ? `${sprint.name} is overdue` : ''}
      </span>
    </>
  )
}
```
  `formatRange` per the brief (row 6): whole days when the start is local 00:00 and the end local 23:59; zone from `zoneName(end)`. Board strip and active backlog section header render `SprintCountdown`; `Dates`, report header and history call `formatRange`; "Add dates" stays for sprints without times.
  CHANGELOG `### Added`: "**Sprints:** presets from 4 hours to 1 month with date and time pickers, times in your own zone, and a countdown that turns into \"Overdue by …\" at the minute the sprint ends."
- [ ] **Step 4:** green; web gate; `pnpm e2e board`.
- [ ] **Step 5:** commit `feat(web): sprint ranges with times and a minute countdown`.

## Self-review

- Brief coverage: row 1 → T4 offsets, T5 zone line, T6 ranges; row 2 → T5 presets/`sprintWindow`, T4 `sprint_window`; row 3 → T5 defaults; rows 4–5 → T6; row 6 → T6 `formatRange`; row 7 → T5 pairs; row 8 → T2 rename, T4 flags/MCP; row 9 → T2 migration + tests; row 10 → T2 overdue, T6 web; row 11 → T1 type, T3 storage, T5 reopen; row 13 → T2 importer. Behavior baseline kept: SP-5 (1 month and Custom), SP-7 (start = now, editable), SP-11 (T2 edit rules).
- Names shared across tasks: `SprintLength`, `starts_at`, `ends_at`, `length`, `sprint_length`, `sprintWindow`/`sprint_window`, `customLength`/`custom_length`, `formatRange`, `timeLeft`, `useNow`, `SprintCountdown`, `zoneName`.
- Task 2 leaves the web on the old `schema.d.ts` until Task 5 regenerates it; the branch merges only after Task 6.
