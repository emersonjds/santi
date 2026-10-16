# santi v1 — mechanics coverage

Card: SAN-34. Date: 2026-10-16. Base: `developer` at 96d4b03.
Question: does every mechanic in the behavior specs work end to end in the shipped product
(Rust API + React SPA in `web/`)?

## Method

- Rules: every ID in `behavior/scrum-board.md`, `kanban-board.md`, `backlog.md`,
  `sprint-lifecycle.md`; the santi adoption list and Responsive rules in `ui-layout.md`;
  decisions D2–D18, D20, D21, D29 (D19 is storage only). A rule is judged as amended by its v1 cut,
  `decisions.md` and `information-architecture.md` (IA).
- Evidence: an existing test (Rust `crates/santi-server/tests/<file>::<test>`, web
  `<file>.test.tsx` "<name>", `web/e2e/<spec>`), the component, or a live check.
- Live check: throwaway Playwright script against the dev server on :8080 (scrum project, a
  second status "In review" mapped into the In Progress column, epic, parent, subtask, active
  sprint, two future sprints), desktop 1280px and phone 375px. Script not committed.
- At SAN-34 the SPA called 31 of the API's operations and never `POST/PUT/DELETE /board/columns*`,
  `PUT /board/settings`, `POST/PUT/DELETE /statuses*`, `POST /members`,
  `PUT/DELETE /members/{user_id}`; SAN-44 wired the member edits and SAN-45 the board settings, so
  only `POST /members` stays unused. SAN-49 added `DELETE /issues/{number}` (D40). `crates/santi-cli` is a
  14-line stub (no CLI or MCP commands yet).

Status:
- **UI**: works in the SPA.
- **API only**: the server enforces or exposes it; the SPA cannot trigger or show it.
- **Missing**: neither.
- **Deferred**: cut from v1 ("drop") or marked later in the specs, IA or decisions.
- **Divergent**: works differently than the spec says.

## Summary

| Source | UI | API only | Missing | Divergent | Deferred | Rows |
|---|---|---|---|---|---|---|
| Scrum board | 22 | 0 | 0 | 0 | 10 | 32 |
| Kanban board | 16 | 0 | 0 | 0 | 13 | 29 |
| Backlog | 18 | 0 | 1 | 1 | 7 | 27 |
| Sprint lifecycle | 19 | 1 | 0 | 0 | 10 | 30 |
| UI layout (adoption + responsive) | 34 | 1 | 3 | 2 | 8 | 48 |
| Decisions | 20 | 0 | 0 | 0 | 0 | 20 |
| **Total** | **129** | **2** | **4** | **3** | **48** | **186** |

Decision rows restate spec rules, so a few gaps count twice (SB-17/KB-27/D5, SB-25/UI-12/D3).
Of the 138 rows that are in v1, 126 work in the SPA (91%); the other 12 are the gaps below.
SAN-44 (branch `feat/SAN-44-small-gaps`) closed R-4, R-8, BL-3 and D6 and added the members page (group 4).
SAN-45 (branch `feat/SAN-45-board-settings`) added the board settings page (group 1) and the KB-4/KB-5 server guard.
SAN-46 (branch `feat/SAN-46-board-drop-zones`) added status drop zones, live counts, inline create in every column and the column header limit (group 6, KB-16).
SAN-47 (branch `feat/SAN-47-filters`) added type, label, epic and text filters on board and backlog, the phone filter sheet, `parent=none`, `GET /labels` and a server-side status filter on search (group 5).
SAN-48 (branch `feat/SAN-48-epic-panel`) added the epic panel on the backlog, "Set epic" in the row menu and the epic picker in the issue view (group 7).
SAN-74 (owner parity rule): every Deferred, Missing, API only and Divergent row, and every partial gap, is reinstated into `parity-backlog.md`; each row's Gap column names its card ("reinstated → <card>"). Statuses above stay as measured at SAN-34 and later cards. Only KB-11 stays out (no cap is a superset).

## Scrum board

| ID | Rule | Status | Evidence | Gap |
|---|---|---|---|---|
| SB-1 | New board: to do, in progress, done | UI | `board_settings::new_scrum_project_has_three_default_columns` | |
| SB-2 | Column holds several statuses; status in one column or unmapped | UI | `board-settings-page.test` "adds a status to the unmapped pool, then maps it with the column select"; `e2e/settings.spec.ts` (drag a status chip into a column) | |
| SB-3 | Unmapped status hidden; new status starts unmapped | UI | `board_view::unmapped_statuses_and_epics_stay_off_the_board`; `board-settings-page.test` "adds a status to the unmapped pool…" (Unmapped pool on `/p/KEY/settings`) | |
| SB-4 | Add, rename, reorder, delete columns | UI | `board-settings-page.test` "renames, and reorders by buttons and by keyboard drag; done stays rightmost", "asks where the statuses go…", "deletes an empty column without asking for a target" | |
| SB-5 | Adding a column may create its status | UI | `board-settings-page.test` "adds a column with its status left of done at once, and the board picks it up" | |
| SB-6 | Status deletable only when unused | UI | `issues::a_status_held_by_an_issue_cannot_be_deleted`; `board-settings-page.test` "shows why a status in use stays, and renames one in place" | |
| SB-7 | Position decides meaning (D2 strict) | UI | `board_settings::mapping_a_done_status_to_a_middle_column_is_refused`; `board-settings-page.test` "explains the done rule inline when the server refuses a mapping (D2)"; the rightmost column is pinned last in the editor | |
| SB-8 | Only done work counts complete at close | UI | `sprint_lifecycle::completing_sends_open_issues_to_the_backlog`; `e2e/backlog.spec.ts` | |
| SB-9 | Board = mapped status + active sprint + project | UI | `board_view::scrum_board_shows_the_active_sprint_by_status_and_rank` | |
| SB-10 | No active sprint: no cards, link to backlog | UI | `board-page.test` "points to the backlog when no sprint is running" | |
| SB-11 | Header: sprint name, goal, time left | UI | `board-page.test` "draws the running sprint and every card field" | Goal not expandable (see R-4); reinstated → P9 (SAN-74) |
| SB-12 | Cards follow rank | UI | `e2e/board.spec.ts` "move a card with the keyboard; a reload keeps the new order" | |
| SB-13 | Subtasks shown (D6: flat card, parent chip, `open/total` on parent) | UI | `board_view::subtasks_are_flat_cards_and_parents_count_them`; live: subtask card + "1/1" on parent | reinstated → P1 (SAN-74) |
| SB-14 | Sprints on/off toggle | Deferred | dropped: sprints always on | reinstated → P11 (SAN-74) |
| SB-15 | Parallel sprints | Deferred | dropped; `sprint_lifecycle::start_guards_are_enforced` | reinstated → P3 (SAN-74) |
| SB-16 | Drag to another column changes status | UI | `sortable-board.test` "moves a card to the next column at once"; `e2e/board.spec.ts` | |
| SB-17 | Multi-status column splits into one drop zone per status | UI | `sortable-board.test` "splits a column holding several statuses into one zone per status (SB-17)"; `card-menu.test` "moves a card to a status of a column holding several"; `e2e/board.spec.ts` "drop a card on the \"In review\" zone…" | Zones show for columns other than the card's own; inside its own column the status changes from Move to… or the issue view; reinstated → P1 (SAN-74) |
| SB-18 | Refused transitions | Deferred | dropped: free transitions; an empty column refuses drops (`sortable-board.test` "refuses a column that has no status to give the card") | reinstated → SAN-56 (SAN-74) |
| SB-19 | Move keeps the assignee | UI | `MoveIssue` has no assignee field (`web/openapi.json`) | |
| SB-20 | Re-rank within column; top/bottom action | UI | `sortable-board.test` "reorders inside a column without touching the status"; `card-menu.test` "moves a card to the bottom of another column" | |
| SB-21 | Multi-select move (v1: CLI/MCP batch) | Deferred | CLI/MCP not built (E3); UI side is UI-22 | reinstated → P4 (SAN-74) |
| SB-22 | Last subtask done prompts for parent | Deferred | later; D6 silent | reinstated → P8 (SAN-74) |
| SB-23 | Inline create in a column, takes its status | UI | `create-issue.test` "creates inline at the foot of any column, with its first status (SB-23, D5)"; `e2e/board.spec.ts` "create an issue inline in the Done column…" | A multi-status column creates with its first status |
| SB-24 | Quick filters narrow only | UI | `filter-bar.test` "toggles my issues and recent ones, then clears every filter" | |
| SB-25 | Filters: assignee, type, label, free text (API also parent) | UI | `filter-bar.test` "filters by type, label and epic, all kept in the URL", "sends the text box to the board once typing pauses"; `board_view::board_filters_by_no_epic_and_matches_text_on_the_key`; `e2e/board.spec.ts` "filter the board by type, label and text…"; Label and Epic show once the project has labels or epics | |
| SB-26 | Predefined and admin filters | Deferred | dropped; "updated in the last day" built per D18 amendment, "assigned to me" = "Only my issues" | reinstated → SAN-56 (SAN-74) |
| SB-27 | Filters per viewer (D18: URL) | UI | `filter-bar.test` "reads the filters back from a shared link" | reinstated → P6 (SAN-74) |
| SB-28 | Scrum column limits | Deferred | dropped (Kanban only) | reinstated → P1 (SAN-74) |
| SB-29 | Swimlanes | Deferred | dropped | reinstated → P1 (SAN-74) |
| SB-30 | Card fields; extra fields later | UI | `board-page.test` "draws the running sprint and every card field" | reinstated → P1, SAN-56 (SAN-74) |
| SB-31 | Days-in-column indicator | Deferred | later | reinstated → P1 (SAN-74) |
| SB-32 | Deleting a board keeps issues | Deferred | no board delete in v1 (D31); holds vacuously | reinstated → P12 (SAN-74) |

## Kanban board

| ID | Rule | Status | Evidence | Gap |
|---|---|---|---|---|
| KB-1 | Three default columns | UI | `e2e/board.spec.ts` (kanban, To Do → In Progress) | reinstated → P12 (SAN-74) |
| KB-2 | Mapping, unmapped pool, column admin as SB-2..6 | UI | see SB-2..6; `e2e/settings.spec.ts` on a kanban project | |
| KB-3 | Done = status category | UI | `issue_moves::done_timer_follows_the_status_category` | |
| KB-4 | Done column kept; deleting a column asks a target | UI | `board_settings::column_deletion_guards`, `the_board_keeps_a_done_status_and_a_column_before_it` (409 `keep-done-column`); `board-settings-page.test` "asks where the statuses go, and puts the column back when the server refuses" | |
| KB-5 | At least one status beyond the first column | UI | `board_settings::the_board_keeps_a_done_status_and_a_column_before_it`: the rightmost column keeps a done status and at least one column sits before it (SAN-45) | |
| KB-6 | Scope, mapped, done-hiding (subtasks flat per D6) | UI | `board_view::kanban_hides_done_work_past_the_window` | |
| KB-7 | No sprint UI on kanban | UI | `app-shell.test` "shows only the board for a kanban project"; `sprints::kanban_projects_have_no_sprints` | |
| KB-8 | Sprint toggle on kanban | Deferred | dropped | reinstated → P11 (SAN-74) |
| KB-9 | Rank, drag and top/bottom as SB-12/20 | UI | `e2e/board.spec.ts` | |
| KB-10 | Global create lands at the bottom | UI | `create-issue.test` "creates the issue, toasts a link to it and shows its card"; `issues::numbers_increase_and_new_issues_rank_last` | |
| KB-11 | Render cap | Deferred | dropped | not reinstated: no cap is a superset (parity-backlog "No work needed") |
| KB-12 | Max limit per column | UI | `board_settings::kanban_columns_take_a_wip_limit_and_scrum_columns_do_not`; `board-settings-page.test` "sets and clears a WIP limit on a kanban column (D7)"; `e2e/settings.spec.ts` | |
| KB-13 | Min limit, counting modes | Deferred | dropped (D7) | reinstated → P1 (SAN-74) |
| KB-14 | Breach only warns | UI | `board-page.test` "warns on a column over its limit and tells when done work leaves"; `board_view::wip_limit_flags_a_full_column` | |
| KB-15 | Counts include filtered cards | UI | `board_view::wip_counts_ignore_quick_filters`; header shows `issue_count`, live while a card is held (`sortable-board.test` "counts follow the held card…") | |
| KB-16 | Limits from column menu and settings | UI | `board-settings-page.test` "sets and clears a WIP limit on a kanban column (D7)"; `board-page.test` "lets an admin set a column limit from its header…"; `e2e/board.spec.ts` "an admin sets a column limit from its header…" | |
| KB-17..KB-21 | Kanban backlog (5 rules) | Deferred | dropped (D9); `project-header.test` "sends a kanban backlog to the board" | reinstated → P11 (SAN-74) |
| KB-22 | Sub-filter | Deferred | dropped | reinstated → P12 (SAN-74) |
| KB-23 | Done hidden after 7/14/30 days or never, default 14 | UI | `board_view::kanban_hides_done_work_past_the_window`; `board-settings-page.test` "changes how long done work stays on a kanban board (KB-23)" | reinstated → P1 (SAN-74) |
| KB-24 | Window restarts on edit | Deferred | replaced by D8 (timer from entering done) | reinstated → P1 (option) (SAN-74) |
| KB-25, KB-26 | Releases, versions | Deferred | dropped | reinstated → SAN-55 (SAN-74) |
| KB-27 | Moves follow SB-16..21 | UI | as SB-17; counts recount during the drag and restore on cancel | Multi-select (SB-21) is still group 11; reinstated → P1, P4 (SAN-74) |
| KB-28 | Days-in-column on by default | Deferred | later | reinstated → P1 (SAN-74) |
| KB-29 | Filters as SB-24..27 | UI | as SB-25; backlog: `backlog-page.test` "sends type, label, epic and text from a shared link to the backlog" | reinstated → P6 (SAN-74) |

## Backlog

| ID | Rule | Status | Evidence | Gap |
|---|---|---|---|---|
| BL-1 | Active, future (creation order), then no-sprint | UI | `backlog-page.test` "stacks the running sprint, the planned ones, then the backlog"; `backlog::backlog_lists_active_then_future_sprints_then_the_rest` | |
| BL-2 | Open parent rows only, mapped, not done | UI | `boards/repo.rs:366`; `backlog::reopened_issue_of_a_closed_sprint_returns_to_the_backlog` | |
| BL-3 | Subtasks nest under parent (D6: parent rows with `open/total`) | UI | `backlog-page.test` "draws a dense row: type, key, summary, epic, status, subtasks, points and assignee" (`SubtaskCount` shared with the board card) | reinstated → P6 (SAN-74) |
| BL-4 | Board shows the sprint incl. done; backlog hides done | UI | `boards/repo.rs`; `section-header.tsx` chips | |
| BL-5 | One rank for board and backlog | UI | `issue_moves::after_anchor_places_the_issue_right_after_it`; `e2e/board.spec.ts` | |
| BL-6 | Empty sprint keeps rank; else drop point | UI | `sortable-backlog.test` "drags a row into an empty sprint at once, keeping its rank"; `sprints::issues_move_into_a_sprint_and_back_keeping_rank` | |
| BL-7 | Drag re-ranks; top/bottom action | UI | `sortable-backlog.test` "reorders inside a section", "moves a row to the top or bottom of another section from its menu" | |
| BL-8 | Selection sent to top/bottom/sprint (v1: CLI/MCP) | Deferred | CLI/MCP not built (E3); UI side is UI-22 | reinstated → P4 (SAN-74) |
| BL-9 | Ranking a parent carries its subtasks | Deferred | BL-9 dropped under D6: backlog rows are parents only, so a backlog move has no subtask rows to carry; the sprint still follows the parent (`sprints::subtasks_always_share_their_parent_sprint`) and a move writes one row (D21) | Subtasks keep their own rank on the board (flat cards, D6); reinstated → P6 (SAN-74) |
| BL-10, BL-11 | Rank needs rank order; instance-wide rank | Deferred | dropped (2 rules) | reinstated → P12 (SAN-74) |
| BL-12a | Create sprints from the backlog | UI | `sprint-dialogs.test` "creates a sprint, named by the server unless a name is given" | |
| BL-12b | Reorder future sprints | Deferred | later (backlog cut); sprints list by id (D13) | reinstated → P3 (SAN-74) |
| BL-13 | Drag between sections changes sprint | UI | `e2e/backlog.spec.ts` "plan a sprint by drag…" | reinstated → P4 (SAN-74) |
| BL-14 | Add/remove in active sprint = scope change | UI | `issue_mechanics::editing_the_sprint_moves_subtasks_and_records_scope_change` | |
| BL-15 | Plan while running; start refused | UI | `backlog-page.test` "lets a planned sprint start only when no other runs and it holds an issue" | |
| BL-16 | New issue placement (IA resolved #2: bottom; sprint kept) | UI | `create-issue.test` "keeps the dialog open for another, with type and sprint kept" | reinstated → P7 (SAN-74) |
| BL-17 | Inline create at every section foot | UI | `backlog-page.test` "creates inline at the foot of a sprint, into that sprint", "creates inline in the backlog with no sprint" | |
| BL-18 | Split | Deferred | later | reinstated → P8 (SAN-74) |
| BL-19 | Row edits (summary, assignee, points, parent, priority) | UI | `row-edits.test` "edits a summary in place…", "sets points and the assignee in the row…", "clears points and the assignee…"; parent from the row menu "Set epic" (BL-20); `e2e/backlog.spec.ts` "edit a row summary and its points in place…" | Wide screens only (a phone opens the issue); priority is not on the row, edited in the issue; bulk edit is group 11; reinstated → P4, P6 (SAN-74) |
| BL-20 | Epic panel: list, create, drop to set parent, filter | UI | `epic-panel.test` "lists all issues, issues without an epic and each epic…", "creates an epic from the panel", "drops a row onto an epic at once and takes it back…", "sets and clears the epic from the row menu", "filters the backlog by an epic or by no epic…"; `e2e/backlog.spec.ts` "create an epic in the panel, drag two issues onto it and filter by it" | Done counts follow a drop only after the refetch |
| BL-21 | One parent; epic done = done status | UI | `issues::parent_rules_are_enforced`; Epic picker in `issue-fields.tsx` for stories, tasks and bugs (`issue-detail.test` "saves the summary, description and every detail field on change"); subtasks keep their parent | reinstated → P6 (SAN-74) |
| BL-22 | Estimation statistic choice | Deferred | dropped: points only | reinstated → P11 (SAN-74) |
| BL-23 | Points numeric, never on subtasks | UI | `issues::patch_enforces_type_parent_and_points_rules`; Points field | |
| BL-24 | Section point totals | UI | `backlog-page.test` "stacks … each with its header facts"; `backlog::quick_filters_hide_rows_but_not_totals` | reinstated → P3 (SAN-74) |
| BL-25 | Time roll-up | Deferred | dropped | reinstated → SAN-54 (SAN-74) |
| BL-26 | View: epic panel, quick filters, fields | UI | quick filters as SB-25 (SAN-47); epic panel as BL-20, kept in the URL (`?panel=epics`, `epic-panel.test` "opens from the toolbar into the URL…") | reinstated → P6 (SAN-74) |

## Sprint lifecycle

| ID | Rule | Status | Evidence | Gap |
|---|---|---|---|---|
| SP-1 | No sprints on kanban | UI | `sprints::kanban_projects_have_no_sprints` | |
| SP-2 | First sprint auto-created | Deferred | dropped | reinstated → P11 (SAN-74) |
| SP-3 | Any number of future sprints, new one last | UI | `sprint-dialogs.test` "creates a sprint…"; `backlog-page.test` | |
| SP-4 | Rename, goal, dates before start | UI | `sprint-dialogs.test` "edits name, goal and dates, refusing an end before the start" | |
| SP-5 | Presets 1/2/3/4 weeks, default 2 (D12) | UI | `sprint-dialogs.test` "starts a sprint today for two weeks unless another length is picked" | |
| SP-6 | One start step | UI | same | |
| SP-7 | Start date = now, editable | UI | `sprint_lifecycle::start_defaults_to_today_and_two_weeks`; `sprint-dialogs.test` "proposes the planned dates and closes on Escape" | |
| SP-8 | Empty sprint cannot start | UI | `sprint_lifecycle::start_guards_are_enforced`; `backlog-page.test` (hint) | |
| SP-9 | One active sprint | UI | same; hint "Complete X before starting another." | |
| SP-10 | Started issues on board with header | UI | `board-page.test`; `e2e/backlog.spec.ts` | |
| SP-11a | Edit future/active sprints | UI | `sprint-dialogs.test` "edits name, goal and dates…" | |
| SP-11b | Edit closed sprint name and goal | API only | `sprint_lifecycle::closed_and_active_sprints_are_protected` | Closed sprints never appear in the SPA; reinstated → P3 (SAN-74) |
| SP-12 | Scope change recorded | UI | `sprint_lifecycle::scope_facts_are_recorded` | |
| SP-13 | Add by drag (CLI/MCP later) | UI | `e2e/backlog.spec.ts` | CLI/MCP E3; reinstated → P4 (SAN-74) |
| SP-14 | Section point total | UI | as BL-24 | |
| SP-15 | Completion permission | Deferred | dropped | reinstated → SAN-66 (SAN-74) |
| SP-16 | Completed = done category | UI | `sprint-dialogs.test` "skips the destination when every issue is done (D13)" | |
| SP-17 | Never blocked; subtask follows parent | UI | `sprint_lifecycle::subtasks_follow_their_parent_at_completion` | reinstated → P3 (option) (SAN-74) |
| SP-18 | One destination: backlog, future or new sprint | UI | `sprint-dialogs.test` "completes a sprint, sending its open issues to the picked sprint"; `board-page.test` "completes the running sprint from the header menu (R-4)"; `e2e/board.spec.ts` "complete the running sprint from the board header…" | |
| SP-19 | Completed issues leave the board | UI | `e2e/backlog.spec.ts` | |
| SP-20, SP-21 | Shared and parallel sprints | Deferred | dropped (2 rules) | reinstated → P12, P3 (SAN-74) |
| SP-22 | Only future sprints deletable; issues back, rank kept | UI | `sprint-dialogs.test` "deletes a planned sprint after asking; the running one has no delete"; `sprints::deleting_a_future_sprint_returns_its_issues_to_the_backlog` | reinstated → P3 (SAN-74) |
| SP-23, SP-24 | Delete or reopen closed sprints | Deferred | later (2 rules) | reinstated → P3 (SAN-74) |
| SP-25..SP-27 | Report: per board, outcomes, added flag, parents only | Deferred | facts stored at close (`scope_facts_are_recorded`, `sprints/repo.rs:230`); no read endpoint; Reports tab later (IA §2) (3 rules) | reinstated → SAN-55 (SAN-74) |
| SP-28 | Burndown | Deferred | dropped | reinstated → SAN-55 (SAN-74) |
| Create | Default name "Sprint N", never reused (D12) | UI | `sprints::default_names_count_every_sprint_ever_created` | |

## UI layout

Adoption list.

| ID | Rule | Status | Evidence | Gap |
|---|---|---|---|---|
| UI-1 | Top bar, sidebar, main; skip links first | UI | live: "Skip to content" first | One skip link, not one per landmark; reinstated → P9 (SAN-74) |
| UI-2 | Top bar order (no switcher, no upgrade) | UI | `widgets/app-shell/top-bar.tsx`; `app-shell.test` | |
| UI-3 | Search in top bar (project scope, IA §7) | UI | `e2e/search.spec.ts` | reinstated → P10 (SAN-74) |
| UI-6 | Sidebar collapse, kept per viewer | UI | `shared/ui/sidebar.tsx` (cookie `sidebar_state`, Ctrl/Cmd+B) | |
| UI-8 | Project tabs incl. Settings for admins | UI | `board-settings-page.test` "links admins to settings from the tabs and the sidebar; members get 403"; `app-shell.test` | Tab reordering later (IA §2); reinstated → P5 (SAN-74) |
| UI-10 | Board header sprint facts | UI | as SB-11; "…" menu with Edit and Complete sprint (R-4) | |
| UI-11 | Ranked columns, drag changes status | UI | as SB-12, SB-16 | |
| UI-12 | Quick filters | UI | as SB-25 | |
| UI-13 | Card anatomy, parent chip | UI | `board-page.test` "draws the running sprint and every card field" | |
| UI-15 | Card opens detail without leaving | UI | `issue-detail.test` "opens a card in a dialog over the board under the issue URL; Esc goes back" | |
| UI-16 | Sections stacked | UI | as BL-1 | |
| UI-17 | Create sprint; Start in future header | UI | `backlog-page.test` | |
| UI-18 | Sprint header avatars, per-person summary | Missing | `section-header.tsx` has none | Per-person load cut (BL-24); avatars were not; reinstated → P3 (SAN-74) |
| UI-19 | Row fields edited in place | UI | as BL-19 | |
| UI-20 | Rows drag within and between sections | UI | as BL-7, BL-13 | |
| UI-21 | Row menu: top, bottom | UI | `features/move-issue/row-menu.tsx` ("…" per section; no right-click) | reinstated → P9, P8 (split) (SAN-74) |
| UI-22 | Multi-select (checkbox, Cmd/Shift-click) and toolbar | Missing | live: 0 checkboxes | reinstated → P4 (SAN-74) |
| UI-23 | Inline create in every section | UI | as BL-17 | |
| UI-26 | J/K moves selection (panel → modal per D1) | UI | `shortcuts.test` "moves the focus card by card with j and k…", "opens the focused card with Enter or o, and steps through the board inside the dialog"; `e2e/board.spec.ts` "walk the board with j and k…"; `board-perf.spec.ts` j/k INP 16 ms on 250 cards | Selection is the focused card (D36 ring); a virtualized backlog reveals rows one window at a time; reinstated → P9 (SAN-74) |
| UI-27 | Two-column detail | UI | `issue-detail.tsx:188` | reinstated → P2 (SAN-74) |
| UI-28 | Narrow: single column | UI | live 375px: issue page fits, no sideways scroll | |
| UI-29 | Header: glyph, key, parent; glyph opens type picker | Divergent | `issue-detail.tsx:35-50`; type changes from the Type select in details | Minor; reinstated → P8 (SAN-74) |
| UI-30 | Add related work (subtask) | UI | `issue-detail.test` "lists subtasks and adds one inline" | Sits below the description, not under the summary; reinstated → P8 (SAN-74) |
| UI-32 | Create in top bar and `c` | UI | `create-issue.test` "opens with c, but not while typing" | |
| UI-33 | Compact create dialog, trimmed fields | UI | `create-issue.test` | reinstated → P7 (SAN-74) |
| UI-36 | Placement (IA resolved #2: bottom) | UI | as BL-16 | reinstated → P7 (SAN-74) |
| UI-37 | `?` opens the shortcut sheet | UI | `widgets/app-shell/shortcut-sheet.tsx`; `shortcuts.test` "lists every shortcut on ? and turns them off and back on from there" (switch kept per browser; account menu entry) | |
| UI-38 | `c o a i m e j k n p` | UI | `shared/lib/shortcuts.ts` (one layer: not in fields, not under another dialog or menu); `shortcuts.test` (n/p, i on a card, row and open issue, a, m, e, g b, g l, /) | `a` and `m` act on the open issue, `e` on a backlog row; n/p do not switch the phone column picker; reinstated → P9 (SAN-74) |
| D1 | Modal and page on one route | UI | `issue-detail.test` "shows the full page when the issue URL is loaded directly" | |
| D6 | Flat subtasks with parent chip | UI | as SB-13 | |
| D10 | Epic panel | UI | as BL-20 | |
| D18 | Filters in the URL | UI | as SB-27 | |
| UI-7, UI-14, UI-21 split, UI-24 versions, UI-34, UI-35, UI-39 | Later per adoption | Deferred | 7 rules; a Cmd/Ctrl+K palette exists for jumping to projects only | reinstated → SAN-73 (UI-7), P1 (UI-14), P8 (split), SAN-55 (versions), P7 (UI-34, UI-35), P9 (UI-39) (SAN-74) |
| UI-25, UI-31 | Issue delete | UI | `issue_delete` (cascade, epic unlink, sprint `removed` fact, 403/404); `card-menu.test` "deletes a card and its subtasks at once…", "puts a deleted card back…"; `row-edits.test` "deletes a row from its menu…"; `issue-detail.test` "deletes the issue from its menu…"; `e2e/board.spec.ts` "delete an issue with its subtask…" | Flag (UI-25) stays out; convert and move (UI-31) later; reinstated → P2 (flag), P8 (convert, move) (SAN-74) |

Responsive (375px).

| ID | Rule | Status | Evidence | Gap |
|---|---|---|---|---|
| R-1 | Top bar: toggle, mark, search icon opening a sheet, create, avatar | Divergent | live: full search field in the bar, no sheet; fits 375px | Minor; reinstated → P9 (SAN-74) |
| R-2 | Sidebar as drawer, closes on navigation | UI | `app-shell.test` "opens the sidebar as a drawer on a phone and closes it on navigation" | |
| R-3 | One column, picker with counts, move by menu | UI | `column-picker.test`; `card-menu.test` "is how a phone moves cards, with no drag handles" | Menu lists columns, not statuses (SB-17); reinstated → P9 (SAN-74) |
| R-4 | Board header: one line, goal expandable, Complete in overflow | UI | `board-page.test` "completes the running sprint from the header menu (R-4)"; `e2e/board.spec.ts`; future sprints from `sprintsQuery` | Goal clamped to two lines, not expandable; reinstated → P9 (SAN-74) |
| R-5 | One filter button with badge, bottom sheet | UI | `filter-bar.test` "gives a phone one Filters button that opens the controls in a sheet"; `e2e/board.spec.ts` "on a phone, the Filters sheet applies a filter"; desktop keeps one row, "More filters" popover below 1280px | |
| R-6 | Backlog rows full width, move by menu | UI | `backlog-page.test` "draws a dense row…"; `sortable-backlog.test` "offers Move to… instead of drag on a phone" | |
| R-7 | Create, detail, sprint dialogs as full-screen sheets | UI | `sprint-dialogs.test` "opens as a full-screen sheet on a phone"; `issue-dialog.tsx:22`; `create-issue-dialog.tsx:203`; `epic-panel.test` "opens as a full-screen sheet on a phone, which a pick closes" | |
| R-8 | 44px targets, 16px inputs, no hover-only, no sideways scroll | UI | `app/touch-targets.test.tsx` measures every control on board, backlog, issue and members pages at 375px (card "…", filter avatars, issue summary, top bar mark and Create, members stack, Projects breadcrumb fixed in SAN-44) | Hover-only: "Updated …" on the card key, over-limit title; reinstated → P9 (SAN-74) |

## Decisions

| ID | Mechanic | Status | Evidence | Gap |
|---|---|---|---|---|
| D2 | Done = category, done only in the rightmost column | UI | close and hiding use the category (SB-8, KB-3); mapping guard shown inline (SB-7) | |
| D3 | AND across kinds, OR within | UI | `board_view::board_quick_filters_combine`; `comments_search::search_combines_filters_and_within_or_across_and`, `search_filters_by_status_category_and_no_epic`; `filter-bar.test` "filters by type, label and epic…" (two types OR-ed, label and epic AND-ed) | |
| D4 | Drop position wins, one order | UI | `issue_moves::*anchor*`; `sortable-board.test`, `sortable-backlog.test` | |
| D5 | Inline create, bottom, column status | UI | as SB-23 | |
| D6 | Flat subtasks; parent `open/total`; backlog parent rows with count | UI | board card and backlog row (BL-3) | |
| D7 | One max per column, warn only | UI | display (KB-14); setting on `/p/KEY/settings` (KB-12) and the column header (KB-16) | |
| D8 | Done hidden after window from entering done | UI | `issue_moves::done_timer_follows_the_status_category`, `moving_between_done_statuses_keeps_the_timer`; window select (KB-23) | |
| D9 | No kanban backlog | UI | `project-header.test` "sends a kanban backlog to the board" | |
| D10 | Epic panel | UI | as BL-20 | |
| D11 | Point totals on section headers | UI | as BL-24 | |
| D12 | Sprint N, presets, date check | UI | `sprints::sprint_edits_validate_dates`; `sprint-dialogs.test` | |
| D13 | Empty start refused; no destination step when all done | UI | `sprint-dialogs.test` "skips the destination when every issue is done (D13)" | |
| D14 | Only future sprints deleted | UI | as SP-22 | |
| D15 | Overdue stays active, flagged | UI | `sprint_lifecycle::an_overdue_sprint_stays_active_and_is_flagged`; `backlog-page.test` "flags an overdue sprint and shows planned dates" | |
| D16 | Column delete needs target; empty column refuses drops | UI | `board_settings::column_deletion_guards`; `board-settings-page.test` "asks where the statuses go…"; `sortable-board.test` "refuses a column that has no status to give the card" | |
| D17 | No live updates | UI | by design: reload | |
| D18 | Filters in URL; recently updated | UI | `filter-bar.test`; `issue_mechanics::recently_updated_filter_keeps_issues_touched_in_the_last_day` | |
| D20 | `KEY-N`, never reused | UI | `issues::concurrent_creates_get_distinct_numbers_and_ranks` | |
| D21 | Fractional rank, one-row moves | UI | `issue_moves::anchors_at_both_ends` | |
| D29 | Keyset pages on search | UI | `search-page.test` "loads the next page on demand" | |

## Gap groups, ranked

Ranked by what blocks a small team using the MVP every day.

1. **Board settings page** — L. Done in SAN-45: `/p/{key}/settings` (`board-settings-page.test`,
   `e2e/settings.spec.ts`); changing a status's category (no API field) left out. The board
   column header menu for the limit (KB-16) came in SAN-46.
   Rules: SB-2..SB-7, KB-2, KB-4, KB-5, KB-12, KB-16, KB-23 (window), D2 guard, D7, D8, D16, UI-8.
   API: none; `/board/columns*`, `/statuses*`, `/board/settings` exist and are tested.
   UI: `/p/{key}/settings` (admins; members get the 403 page, IA §9), Settings tab + sidebar
   link; columns (add with status, rename, reorder, delete with target picker, WIP max on
   kanban), statuses (add, rename, category, column or unmapped pool, delete when unused), done
   window; a column header menu to set the limit (KB-16).
   Why: today every team is stuck with To Do / In Progress / Done. Adding "In review" or a WIP
   limit needs curl.
2. **Complete sprint from the board** — S. Done in SAN-44 (goal expand left out).
   Rules: R-4, SP-18 (entry point), UI-10.
   API: none.
   UI: overflow menu in the board's sprint strip opening the existing complete dialog. That
   dialog reads future sprints from `BacklogContext`, so on the board it needs `sprintsQuery`
   instead. Goal expandable on tap.
   Why: the sprint ends where the team looks every day (the board); today they must go to the
   backlog to close it.
3. **Small fixes** — S. Done in SAN-44.
   Rules: R-8, BL-3/D6 count, inline subtask Esc.
   API: none.
   UI: 44px card menu trigger, filter avatars and issue summary at 375px; `open/total` chip on
   backlog rows; Esc and a Cancel on the "Add subtask" field.
   Why: real bugs against adopted rules, each a few lines.
4. **Members management** — S. Done in SAN-44: `/p/{key}/settings/members` (`members-page.test`,
   `e2e/projects.spec.ts` "an admin changes a member role…"); add by email and moving the invite box
   off the header left out.
   Rules: IA §3 `/settings/members`, IA §9.
   API: none; `POST /members`, `PUT/DELETE /members/{user_id}`, last-admin guard exist
   (`projects::admin_changes_roles_and_removes_members`, `projects::the_last_admin_stays`).
   UI: members page: role select, remove, add by email, invite link box moved from the header;
   "A project needs at least one admin." hint.
   Why: nobody can remove someone who left or promote a second admin.
5. **Complete quick filters + phone filter sheet** — M. Done in SAN-47 (`filter-bar.test`,
   `backlog-page.test`, `search-page.test`, `e2e/board.spec.ts`).
   Rules: SB-25, KB-29, D3, UI-12, BL-26 (filters), R-5.
   API: none for type, label, parent, `q` on board and backlog. A label list for the dropdown
   can come from the loaded cards.
   UI: extend `BoardSearch`/`parseBoardSearch` and `FilterBar` with Type, Label, Epic dropdowns
   and a text box; "Filters (n)" with a bottom sheet at 375px.
   Why: a 6-person board with 40 cards needs "bugs only" or "this epic"; today it is assignee
   only.
6. **Status drop zones and drag feedback** — M. Done in SAN-46 (`sortable-board.test`,
   `create-issue.test`, `board-page.test`, `e2e/board.spec.ts`, zone drop INP in `e2e/board-perf.spec.ts`).
   Rules: SB-17, KB-27, SB-23/D5, KB-15 (live counts).
   API: none; `move` takes `status_id`.
   UI: when a column holds more than one status, show one droppable zone per status while a
   card hovers. Recount headers during hover. "Move to…" lists statuses. Inline create at
   every column foot with that column's status.
   Why: once group 1 lets a team add a second status to a column, dragging can't reach it.
   Do it right after group 1.
7. **Epic panel** — M. Done in SAN-48 (`epic-panel.test`, `issue-detail.test`,
   `e2e/backlog.spec.ts`).
   Rules: BL-20, D10, UI-24 (epics), R-7 (epic sheet), BL-26 (panel).
   API: none; `parent=none` ("no epic") came in SAN-47, the rest exists (`Backlog.epics`,
   `PATCH parent`, `POST issues` type epic).
   UI: `?panel=epics` toggle; list with key, summary, child count, progress; create epic;
   drop a row on an epic or on "No epic" (plus a "Set epic" menu item for phones); select to
   filter.
   Why: epics can be created, but there is no place to see them or plan by them.
8. **Issue delete** — M. Done in SAN-49 (D40; `issue_delete`, `card-menu.test`, `issue-detail.test`,
   `row-edits.test`, `e2e/board.spec.ts`).
   Rules: UI-25, UI-31 (IA resolved #5 deferred it).
   API: `DELETE /issues/{n}`. Subtasks cascade or are refused; a delete from the active sprint
   records a "removed" scope fact; comments go too. Needs adversarial review.
   UI: card menu, row menu and issue "…" with confirm.
   Why: duplicates and typos can only be parked in Done today; they pollute search and reports.
9. **Backlog row editing** — M. Done in SAN-49 (`row-edits.test`, `e2e/backlog.spec.ts`); BL-9
   dropped under D6.
   Rules: BL-19, UI-19, BL-9.
   API: BL-9 needs a move that also re-anchors subtasks, or record BL-9 as dropped under D6.
   UI: row menu gets Assign, Set priority, Points, Epic, like the board card menu. Inline
   summary edit on wide screens.
   Why: grooming means touching 20 rows; one modal per row is slow.
10. **Keyboard paths** — M. Done in SAN-50 (`shortcuts.test`, `e2e/board.spec.ts`, `board-perf.spec.ts`).
    Rules: UI-26 (J/K), UI-37, UI-38.
    API: none.
    UI: `?` sheet (and account menu entry); `j/k` selection on board and backlog; `o` open,
    `a`/`i` assign, `m` comment, `e` edit, `n/p` columns.
    Why: power users live on the keyboard; only `c` exists.
11. **Multi-select and bulk moves** — L. Reinstated → P4 (SAN-74).
    Rules: UI-22, SB-21, BL-8, BL-19 bulk.
    API: optional batch move; N single moves work at human scale (one lock per project, D21).
    UI: checkbox, Cmd-click, Shift-range; toolbar: send to sprint, top, bottom, assign, status.
    Why: sprint planning moves 10–15 rows at once.
12. **Reorder future sprints** — S. Reinstated → P3 (SAN-74).
    Rules: BL-12b (later).
    API: sprint `position` plus a reorder endpoint (today the order is by id, D13).
    UI: Move up/down in the sprint menu.
    Why: matters only for teams that plan two or more sprints ahead.
13. **Closed sprints and report** — M. Reinstated → SAN-55 (report), P3 (closed sprint edits) (SAN-74).
    Rules: SP-11b, SP-25..SP-27 (view later).
    API: read endpoint for a closed sprint's stored facts.
    UI: closed sprint list with outcomes and added-after-start flags; edit name and goal.
    Why: the retro needs "what slipped"; the data is already stored.

## Divergent rules that are bugs

- Fixed in SAN-44: R-8 targets, the inline subtask field (Esc and Cancel, `issue-detail.test`
  "drops an open subtask field on Esc or Cancel, leaving the dialog open") and the BL-3/D6 count.
- Fixed in SAN-46: SB-17 (a drop into a multi-status column always took its first status) and
  SB-23/D5 (inline create only at the foot of the first column).
