# santi — parity backlog

Card: SAN-74. Date: 2026-10-16. Base: `developer` at d84279e.

Owner rule (binding): santi reaches full parity with every reference-tracker feature observed in the
clean-room specs. Nothing the reference has stays "later" without the owner's explicit OK. Only the
vendor's separate platform products may be skipped, each with a reason (list at the end).

Inputs: `mechanics-coverage.md` (Deferred, Missing, API only, Divergent rows and partial gaps),
`information-architecture.md` (every "later"), `behavior/ui-layout.md` (adoption "Later:" list and
trims), `behavior/scrum-board.md`, `kanban-board.md`, `backlog.md`, `sprint-lifecycle.md`,
`reports.md`, `organizations.md`, and the trade-offs in `decisions.md` that cut reference behavior
(D6, D7, D8, D9, D10, D14, D18, D31, D36, D41, IA resolved #1–#3).

A decision that chose a different default (D6, D8, D14, D18, SP-17) is reinstated as the
reference behavior next to santi's default, never by reverting the decision: santi keeps its
default, and the reference behavior comes back as an option or an extra view.

Columns: **Source** rule ids; **Today** = Deferred, Missing, Partial, Divergent, API only;
**Size** S (≤ 2 days), M (≤ 1 week), L (> 1 week); **Card** = existing SAN card or a proposed new
card P1–P13 (scope below).

## Proposed new cards (demo order)

Ordered for a demo to a company manager first: what a manager sees on screen and judges in the
first ten minutes, then the rest. Existing cards that also belong early in that demo: SAN-55
(reports) right after P2, SAN-72/SAN-73 (home, sidebar) after P5, SAN-57 (dashboards) after them.

| Card | Title | Size | Rows |
|---|---|---|---|
| P1 | Board views: swimlanes, days in column, card layout, full column limits | L | PB-1..PB-8 |
| P2 | Issue fields: history, due date, flag, links, votes, resolution, comment edit, field layout | L | PB-9..PB-17 |
| P3 | Sprint planning parity: workload, sprint order, closed sprints, parallel sprints | L | PB-18..PB-25 |
| P4 | Multi-select and bulk actions | L | PB-26..PB-29 |
| P5 | Project views: Summary, List, Calendar tabs and tab order | L | PB-30..PB-33 |
| P6 | Backlog view parity: nested subtasks, view settings, remembered filters | M | PB-34..PB-39 |
| P7 | Create flow parity: full form, draft dock, placement | M | PB-40..PB-43 |
| P8 | Issue actions: type picker, convert, move, split, parent prompt | M | PB-44..PB-48 |
| P9 | Keyboard, side panel and phone parity | M | PB-49..PB-56 |
| P10 | Global shell: search everywhere, help, settings, dark theme | M | PB-57..PB-59 |
| P11 | Project features: sprints on/off, kanban backlog, estimation statistic, instance options | L | PB-60..PB-63 |
| P12 | Multiple and cross-project boards | L | PB-64..PB-70 |
| P13 | Project keys and names: change with aliases, checks, not-found page | M | PB-71..PB-75 |

- **P1 Board views.** Swimlanes (query, parent story, assignee, epic, project) with lane counts that
  leave filtered cards out; subtasks grouped under their parent through the parent lane; min limits,
  limits on scrum boards and the board counting mode with the under-min warning; up to three extra
  card fields and card colors; days-in-column dots (cumulative, tap on phones); done window presets
  of 1, 2 and 4 weeks plus a "restart on edit" option; status drop zones inside the card's own
  column. The board is the first screen a manager judges.
- **P2 Issue fields.** Issue history (one change log for status, sprint, estimate and field edits,
  shown as an activity tab; P1 day dots and SAN-55 charts read it, so it ships first), due date,
  flag with optional comment on card/row/issue, typed issue links, votes, resolution, edit and
  delete of one's own comments (admins: any), reporter edit by admins, and the field layout with
  pinned fields and a collapsed group of empty extras.
- **P3 Sprint planning parity.** Assignee avatars on sprint headers with a per-person summary and
  workload view; reorder future sprints; closed sprints: edit name and goal, delete from the
  report, reopen under the reference guards; delete the active sprint (issues to the next sprint);
  parallel sprints as a board option; "require subtasks done to complete" as an option.
- **P4 Multi-select and bulk.** Checkbox, Cmd/Ctrl-click and Shift range on board and backlog; a
  toolbar to send the selection to top, bottom, a sprint or a status; bulk edit of parent,
  assignee, priority, estimate, labels (50 per action) and status; the sprint divider drag; CLI and
  MCP batch move.
- **P5 Project views.** Summary tab (project overview: status breakdown, recent activity, types,
  workload), List tab (sortable issue table with inline edits), Calendar tab (issues by due date),
  and admins reordering or hiding tabs. Releases and Reports tabs come with SAN-55.
- **P6 Backlog view.** Subtasks nested under parent rows with a per-viewer expand toggle, a parent
  rank carrying its subtasks, per-viewer density and row fields, quick filters remembered per
  viewer (URL still wins when present), "mark epic done" from the panel, priority on the row.
- **P7 Create flow.** Expand to the full form (and make it a viewer's default), draft docked bottom
  right on outside click, placement at the top of the backlog or under the selected row, last type
  used per project, required and optional field chips.
- **P8 Issue actions.** Type picker on the type glyph, related-work control under the summary,
  convert (type, subtask ↔ issue), move to another project, split into a linked copy, prompt to
  finish the parent when its last subtask is done.
- **P9 Keyboard, side panel, phone.** Command palette that edits (status, assignee, parent,
  estimate, sprint, priority, labels, delete, link), `Ctrl+[`, right-click menus and key-click to a
  new tab, issue as a right side panel that follows J/K, one skip link per landmark, `n`/`p` on the
  phone column picker, phone search sheet, expandable sprint goal, a status list in the phone card
  menu, no hover-only info.
- **P10 Global shell.** Search across every project from any page (Enter opens SAN-56 advanced
  search), help menu and a settings entry in the top bar, dark theme switched on per viewer.
- **P11 Project features.** Sprints on/off per project (scrum and kanban become the same project
  with a feature switched), the kanban backlog, the estimation statistic (points, time, count,
  none), and instance options (votes, watching, time tracking, subtasks).
- **P12 Multiple boards.** Several boards per project with ids in URLs, boards across projects with
  an instance-wide rank, board delete keeping issues, board order by field, sub-filter, sprints
  shared by boards, the four-column kanban template. Needs SAN-56 saved filters.
- **P13 Project keys and names.** Key change with old keys kept as aliases, key and name checks that
  refuse and propose free variants, lower-case key paths rewritten, a not-found page naming the
  key, stated instance limits.

## Rows

### P1 Board views

| ID | Source | Feature | Today | Area | Size | Depends on | Card |
|---|---|---|---|---|---|---|---|
| PB-1 | SB-29, UI-12, IA §4 group by | Swimlanes by query (catch-all lane last), parent story, assignee, epic, project; filtered cards left out of lane counts | Deferred | Board | L | query lanes: SAN-56; project lanes: P12 | P1 |
| PB-2 | SB-13, D6 | Subtasks grouped under their parent whatever their status (parent lane) | Divergent (D6 flat cards + chip) | Board | M | PB-1 | P1 |
| PB-3 | SB-28, KB-12 (min), KB-13, D7 | Min limit, limits on scrum boards, counting mode (off, every issue, without subtasks), under-min color | Deferred (max on kanban only) | Board | M | — | P1 |
| PB-4 | SB-30 | Up to three admin-chosen extra card fields; card colors | Deferred | Board | M | non-built-in fields: SAN-56 | P1 |
| PB-5 | SB-31, KB-28, UI-14 | Days-in-column dots, cumulative across revisits, count on hover or tap; on for kanban, off for scrum | Deferred | Board | M | issue history PB-9 | P1 |
| PB-6 | KB-23 | Done window presets 1, 2, 4 weeks | Divergent (7/14/30 days) | Board | S | — | P1 |
| PB-7 | KB-24, D8 | Board option: done window restarts on any edit | Divergent (D8 default kept) | Board | S | — | P1 |
| PB-8 | SB-17, KB-27 | Status drop zones also inside the card's own column | Partial | Board | S | — | P1 |

### P2 Issue fields

| ID | Source | Feature | Today | Area | Size | Depends on | Card |
|---|---|---|---|---|---|---|---|
| PB-9 | reports.md change log, RP-15, RP-40, ui-layout OQ-5 | Issue history: time-stamped log of status, sprint, estimate and field changes, shown as activity | Missing (`done_at` keeps the last entry only) | Issue | M | — | P2 |
| PB-10 | OR-28, D41 | Due date on issues | Missing | Issue | M | — | P2 |
| PB-11 | UI-25 | Flag (with optional comment) from card, row and issue menus | Deferred | Issue | S | — | P2 |
| PB-12 | OR-28, UI-39, BL-18 | Typed issue links (blocks, relates, duplicates, clones) | Missing | Issue | M | — | P2 |
| PB-13 | OR-40 | Votes on issues | Missing | Issue | S | instance option PB-63 | P2 |
| PB-14 | D41 | Resolution field | Missing | Issue | S | — | P2 |
| PB-15 | OR-28 | Edit and delete one's own comments; admins delete any | Missing (comments: GET, POST only) | Issue | S | — | P2 |
| PB-16 | OR-28 | Admins edit the reporter | Missing (`UpdateIssue` has no reporter) | Issue | S | — | P2 |
| PB-17 | UI-27 | Field layout: pinned fields, always-shown details, collapsed empty extras promoted once set | Partial | Issue | M | custom fields SAN-56 | P2 |

### P3 Sprint planning parity

| ID | Source | Feature | Today | Area | Size | Depends on | Card |
|---|---|---|---|---|---|---|---|
| PB-18 | BL-24, UI-18 | Sprint header assignee avatars, per-person summary, per-assignee workload | Missing | Sprints | M | — | P3 |
| PB-19 | BL-12b | Reorder future sprints (up, down, top, bottom) | Deferred (order by id, D13) | Sprints | S | sprint position | P3 |
| PB-20 | SP-11b | Edit a closed sprint's name and goal | API only | Sprints | S | closed sprint list (SAN-55) | P3 |
| PB-21 | SP-23, D14 | Delete a closed sprint from its report | Deferred | Sprints | S | SAN-55 sprint report | P3 |
| PB-22 | SP-24, RP-55 | Reopen a closed sprint (no other active; restores backlog issues; report uses new end) | Deferred | Sprints | M | SAN-55 | P3 |
| PB-23 | SP-22, D14 | Delete the active sprint; its issues go to the next sprint, status kept | Divergent (future only, to backlog) | Sprints | S | — | P3 |
| PB-24 | SB-15, SP-9, SP-21, BL-15 | Parallel sprints option; open issues pass through the backlog | Deferred (one active) | Sprints | L | — | P3 |
| PB-25 | SP-17, RP-53 | Option: completing requires every subtask done | Divergent (never blocked) | Sprints | S | — | P3 |

### P4 Multi-select and bulk

| ID | Source | Feature | Today | Area | Size | Depends on | Card |
|---|---|---|---|---|---|---|---|
| PB-26 | UI-22, SB-21, KB-27, BL-8 | Multi-select (checkbox, Cmd/Ctrl-click, Shift range) on board and backlog; send to top, bottom, sprint, status | Missing | Board, backlog | L | — | P4 |
| PB-27 | BL-19 (bulk) | Bulk edit parent, assignee, priority, estimate, labels (50 per action), status per workflow | Missing | Backlog | M | PB-26 | P4 |
| PB-28 | BL-13, UI-20, SP-13 | Sprint divider drag pulls or releases adjacent rows | Trimmed | Backlog | M | — | P4 |
| PB-29 | SB-21, BL-8 (v1 cut) | CLI and MCP batch move | Missing (`santi issues move` takes one issue) | CLI, MCP | S | — | P4 |

### P5 Project views

| ID | Source | Feature | Today | Area | Size | Depends on | Card |
|---|---|---|---|---|---|---|---|
| PB-30 | IA §2 tabs | Summary tab: project overview | Deferred | Project | M | PB-9 for activity | P5 |
| PB-31 | IA §2 tabs | List tab: sortable issue table with inline edits | Deferred | Project | M | — | P5 |
| PB-32 | IA §2 tabs | Calendar tab: issues by due date | Deferred | Project | M | PB-10 | P5 |
| PB-33 | UI-8, IA §2 | Admins reorder or hide project tabs | Deferred | Project | S | — | P5 |

### P6 Backlog view

| ID | Source | Feature | Today | Area | Size | Depends on | Card |
|---|---|---|---|---|---|---|---|
| PB-34 | BL-3, D6 | Subtasks nested under parent rows; per-viewer expand/collapse | Divergent (parent rows + count) | Backlog | M | — | P6 |
| PB-35 | BL-9 | Ranking a parent carries its subtasks; subtasks rank among siblings | Deferred (dropped under D6) | Backlog | M | PB-34 | P6 |
| PB-36 | BL-26 | Per-viewer density, visible row fields, quick filters as buttons | Partial | Backlog | M | — | P6 |
| PB-37 | SB-27, KB-29, D18 | Quick filters and card fields remembered per viewer across sessions | Divergent (URL only) | Board, backlog | S | — | P6 |
| PB-38 | BL-21, D10 | Mark an epic done from the panel (separate flag) | Deferred | Backlog | S | — | P6 |
| PB-39 | BL-19 | Priority edited on the backlog row | Partial | Backlog | S | — | P6 |

### P7 Create flow

| ID | Source | Feature | Today | Area | Size | Depends on | Card |
|---|---|---|---|---|---|---|---|
| PB-40 | UI-34, IA §5 | Expand to the full form; a viewer can make it the default | Deferred | Create | M | — | P7 |
| PB-41 | UI-35, IA §5 | Outside click docks the draft bottom right | Deferred | Create | M | — | P7 |
| PB-42 | UI-36, BL-16, KB-20, IA §5, IA resolved #2 | Placement: top of backlog, under the selected row, bottom of a chosen sprint | Divergent (always bottom) | Create | S | top rank (D21 open keys) | P7 |
| PB-43 | UI-33 | Last type used per project; required and optional field chips | Trimmed | Create | S | custom-field chips: SAN-56 | P7 |

### P8 Issue actions

| ID | Source | Feature | Today | Area | Size | Depends on | Card |
|---|---|---|---|---|---|---|---|
| PB-44 | UI-29 | Type glyph opens the type picker | Divergent (Type select) | Issue | S | — | P8 |
| PB-45 | UI-30 | Add related work (child or subtask) right under the summary | Partial (below description) | Issue | S | — | P8 |
| PB-46 | UI-31 | Convert (type, subtask ↔ issue) and move to another project | Deferred | Issue | M | — | P8 |
| PB-47 | BL-18, UI-21 (split) | Split into a linked copy, to the backlog or a chosen section | Deferred | Issue | M | PB-12 | P8 |
| PB-48 | SB-22, D6 | Last open subtask to done prompts to finish the parent | Deferred (silent) | Issue | S | — | P8 |

### P9 Keyboard, side panel, phone

| ID | Source | Feature | Today | Area | Size | Depends on | Card |
|---|---|---|---|---|---|---|---|
| PB-49 | UI-39, IA §2 | Command palette that edits (status, assignee, parent, estimate, sprint, priority, labels, delete, link); `Ctrl+[` toggles the sidebar | Partial (palette jumps to projects) | Shell | M | PB-12 for link | P9 |
| PB-50 | UI-26, D1, IA §6 | Issue in a right side panel that follows J/K | Deferred (modal) | Issue | M | — | P9 |
| PB-51 | UI-21 | Right-click menu on rows and cards; right-click on the key opens a new tab | Partial ("…" menu) | Board, backlog | S | — | P9 |
| PB-52 | UI-1 | One skip link per landmark | Partial | Shell | S | — | P9 |
| PB-53 | UI-38 | `n`/`p` switch columns on the phone picker | Partial | Board | S | — | P9 |
| PB-54 | R-1 | Phone top bar: search icon opening a full-width sheet | Divergent | Shell | S | — | P9 |
| PB-55 | R-4, SB-11 | Sprint goal expandable on tap | Partial | Board | S | — | P9 |
| PB-56 | R-3, R-8 | Phone card menu lists statuses; no hover-only info (card "Updated", over-limit title, avatar summary, day dots on tap) | Partial | Board | S | — | P9 |

### P10 Global shell

| ID | Source | Feature | Today | Area | Size | Depends on | Card |
|---|---|---|---|---|---|---|---|
| PB-57 | UI-3, IA §2, IA §7, IA §11 item 11 | Search across every project from any page; Enter opens advanced search | Partial (project scope) | Shell | M | SAN-56 advanced search | P10 |
| PB-58 | UI-2, IA §2 | Help menu and settings entry in the top bar | Deferred | Shell | S | — | P10 |
| PB-59 | IA §11 item 12, IA resolved #1, D36 | Dark theme on, chosen per viewer | Deferred (tokens defined, off) | Shell | M | — | P10 |

### P11 Project features

| ID | Source | Feature | Today | Area | Size | Depends on | Card |
|---|---|---|---|---|---|---|---|
| PB-60 | SB-14, KB-8, SP-2 | Sprints on/off per project (on: board issues to the backlog, first sprint created; off: running sprint's issues stay) | Deferred (type fixed at creation) | Project | L | — | P11 |
| PB-61 | KB-17..KB-21, D9 | Kanban backlog: slot off the board, two lists, drag to the first column, placement, toggle | Deferred | Board | L | PB-60 | P11 |
| PB-62 | BL-22, RP-3 | Estimation statistic per board: points, time, issue count, none | Deferred (points only) | Board | M | time: SAN-54 | P11 |
| PB-63 | OR-40 | Instance options: votes, watching, time tracking, subtasks | Missing | Admin | S | SAN-65 admins | P11 |

### P12 Multiple boards

| ID | Source | Feature | Today | Area | Size | Depends on | Card |
|---|---|---|---|---|---|---|---|
| PB-64 | D31, UI-5, OR-10, OR-11 | Several boards per project, board id in URLs, create board from the project row | Deferred (one board, D31) | Board | L | — | P12 |
| PB-65 | SB-32 | Delete a board; issues kept | Deferred | Board | S | PB-64 | P12 |
| PB-66 | BL-10 | Board ordered by another field; ranking needs edit and schedule rights | Deferred | Board | M | PB-64, SAN-56 | P12 |
| PB-67 | BL-11, RP-1 | Boards across projects; one instance-wide rank | Deferred (rank per project) | Board | L | PB-64, SAN-56 saved filters | P12 |
| PB-68 | KB-22 | Board sub-filter (default hides released-version issues; scopes reports) | Deferred | Board | M | SAN-56, SAN-55 versions | P12 |
| PB-69 | SP-20 | Sprint shared by several boards | Deferred | Sprints | M | PB-64 | P12 |
| PB-70 | KB-1 | Kanban template: backlog, selected for development, in progress, done | Missing | Board | S | — | P12 |

### P13 Project keys and names

| ID | Source | Feature | Today | Area | Size | Depends on | Card |
|---|---|---|---|---|---|---|---|
| PB-71 | OR-38 | Change a project key; old keys stay as aliases | Missing | Project | M | — | P13 |
| PB-72 | OR-37, OR-39 | Key check refuses lower-case and taken keys (naming the holder) and proposes a free variant; name check proposes a variant | Partial | Project | S | — | P13 |
| PB-73 | OR-12 | Lower-case key in a path rewritten to upper case | Unknown | Project | S | — | P13 |
| PB-74 | OR-13 | Not-found page naming the requested key | Different (plain 404, D28) | Project | S | — | P13 |
| PB-75 | OR-41 | Stated instance limits (projects, issues, roles per user) | Missing | Admin | S | — | P13 |

### Existing cards

| ID | Source | Feature | Today | Area | Size | Depends on | Card |
|---|---|---|---|---|---|---|---|
| PB-76 | SB-5, coverage group 1 | Change a status's category | Missing (`UpdateStatus` has no category) | Board settings | S | — | SAN-53 |
| PB-77 | D41 | Components | Missing | Issue | M | — | SAN-54 |
| PB-78 | OR-28, D41 | Attachments | Missing | Issue | M | storage | SAN-54 |
| PB-79 | OR-28, BL-25, RP-19, RP-29, D41 | Work logs, time estimates, subtask time roll-up, subtask added under an active-sprint parent = scope change | Missing | Issue | L | — | SAN-54 |
| PB-80 | IA §2, UI-2 | Notifications (bell, in-app and email) | Deferred | Shell | L | SAN-68 email | SAN-54 |
| PB-81 | OR-28, D41 | Watchers: see and manage | Missing | Issue | M | PB-80 | SAN-54 |
| PB-82 | KB-25, KB-26, UI-24, IA §2, D41 | Versions: fix version field, version panel, release from board, cut on the spot, Releases tab | Deferred | Planning | L | — | SAN-55 |
| PB-83 | SP-25..SP-27, RP-23..RP-32 | Sprint report: outcome groups, added-after-start marker, start and now totals, closed sprint list | Deferred (facts stored, no read) | Reports | M | — | SAN-55 |
| PB-84 | SP-28, RP-11..RP-20 | Sprint burndown: guideline, remaining line, scope tables, start date-time | Deferred | Reports | L | PB-9, PB-86 | SAN-55 |
| PB-85 | RP-1..RP-5, RP-8, RP-9, IA §2 | Reports tab, reports on/off per project, measure per board, remembered per user | Deferred | Reports | S | — | SAN-55 |
| PB-86 | RP-6, RP-7 | Working calendar and timezone per board | Missing | Reports | M | — | SAN-55 |
| PB-87 | RP-21, RP-22 | Burnup | Deferred | Reports | M | PB-9 | SAN-55 |
| PB-88 | RP-33..RP-37 | Velocity | Deferred | Reports | M | — | SAN-55 |
| PB-89 | RP-38..RP-42 | Cumulative flow diagram | Deferred | Reports | L | PB-9 | SAN-55 |
| PB-90 | RP-43..RP-52 | Control chart | Deferred | Reports | L | PB-9, PB-86 | SAN-55 |
| PB-91 | SB-18, KB-27 | Workflows: refused transitions with an error | Deferred (free transitions) | Config | L | — | SAN-56 |
| PB-92 | D41, RP-3, SB-30 | Custom fields | Missing | Config | L | — | SAN-56 |
| PB-93 | OR-33 | Permission schemes | Missing | Config | L | SAN-66 | SAN-56 |
| PB-94 | UI-3, IA §2 | Advanced search and saved filters; sidebar Filters | Deferred | Search | L | — | SAN-56 |
| PB-95 | SB-26 | Admin-defined query quick filters (add, rename, reorder, delete) | Partial (two predefined built) | Board | M | PB-94 | SAN-56 |
| PB-96 | IA §2 | Dashboards; sidebar Dashboards | Deferred | Dashboards | L | PB-94 | SAN-57 |
| PB-97 | OR-1, OR-2, OR-3, OR-9, OR-42 | Organizations: tenant above projects, switcher, signup creates one | Missing | Orgs | L | SAN-63 model | SAN-64 |
| PB-98 | OR-7, OR-8 | Organization slug in URLs; slug change keeps redirecting, old slug never reused | Not applicable today | Orgs | S | PB-97 | SAN-64 |
| PB-99 | OR-23..OR-26 | Admin roles: org admin, site admin, user-access admin, app admin | Missing | Orgs | M | PB-97 | SAN-65 |
| PB-100 | OR-35, OR-36, OR-46 | Groups granting roles | Missing | Orgs | M | PB-97 | SAN-65 |
| PB-101 | OR-5, OR-6, OR-29 | Seats: tracker use apart from admin; user limit per org | Missing | Orgs | M | PB-97 | SAN-65 |
| PB-102 | OR-4 | Managed accounts through a verified domain | Missing | Orgs | M | PB-105 | SAN-65 |
| PB-103 | OR-45 | Remove versus suspend a user | Missing | Orgs | S | PB-97 | SAN-65 |
| PB-104 | OR-43 | Admins withdraw the create-project right | Missing | Orgs | S | PB-99 | SAN-65 |
| PB-105 | OR-19 | Approved domains with periodic reconfirm | Missing | Orgs | M | SAN-68 | SAN-69 |
| PB-106 | OR-14..OR-16 | Email invites: several emails, roles, groups, message, pending entry, resend | Different (links only) | Orgs | M | SAN-68 | SAN-69 |
| PB-107 | OR-17 | Invite policy: anyone, approved domains, request only, no one | Partial | Orgs | S | PB-99 | SAN-69 |
| PB-108 | OR-18 | Reusable invitation link, 30 days, turn off or regenerate | Different (one-time, 7 days) | Orgs | S | — | SAN-69 |
| PB-109 | OR-20 | Access requests queue | Missing | Orgs | M | SAN-68 | SAN-69 |
| PB-110 | OR-21, coverage group 4 | Add people already in the org by email from the members page | Partial (`POST /members` unused by the SPA) | Orgs | S | — | SAN-69 |
| PB-111 | OR-27, OR-28, OR-34 | Viewer, guest and integration roles with the reference rights | Partial (admin, member) | Access | M | — | SAN-66 |
| PB-112 | OR-30 | Custom roles; roles add up | Missing | Access | M | PB-111 | SAN-66 |
| PB-113 | SP-15 | Completing a sprint needs admin or manage-sprints | Deferred | Access | S | PB-111 | SAN-66 |
| PB-114 | RP-10 | Report access follows board visibility | Missing | Access | S | SAN-55 | SAN-66 |
| PB-115 | OR-31, OR-32 | Access levels: open, limited, private | Different (private only) | Access | M | PB-111 | SAN-67 |
| PB-116 | OR-47 | Project delete to a 60-day trash with restore; archive | Missing | Lifecycle | M | — | SAN-70 |
| PB-117 | OR-48 | Org rename, transfer projects to another org, org delete | Missing | Lifecycle | M | PB-97 | SAN-70 |
| PB-118 | OR-49 | Operator option: deactivate inactive orgs after warning emails (off by default) | Not applicable today | Lifecycle | S | SAN-68 | SAN-70 |
| PB-119 | UI-9, OR-44, IA §4, IA §11 item 11, IA resolved #3 | Home hub: recommended projects, assigned to me, starred, worked on, viewed | Deferred | Home | L | — | SAN-72 |
| PB-120 | UI-4, UI-5, UI-7, IA §2 | Sidebar: recent, starred, filters, dashboards, plans, more projects, project row menu, customize per viewer | Deferred | Shell | L | PB-94, PB-96 | SAN-73 |
| PB-121 | D41 | Importer maps components, versions, resolution, due dates, time, attachments, watchers, custom fields, comment authors as each lands | Dropped | Import | S each | each field's card | SAN-54, SAN-55, SAN-56, P2 |

## No work needed

| Source | Why |
|---|---|
| KB-11 | A render cap is a limit, not a feature; santi renders every issue, as the reference's newer view does. |
| SP-5 (3 weeks) | santi offers a superset (1, 2, 3, 4 weeks). |

## Skipped (vendor platform products)

| Source | Item | Reason |
|---|---|---|
| UI-2, OR-44, OR-5 | App switcher; the cross-product home's app list; per-app roles beyond the tracker | Cross-product platform: santi is one app, so one tracker role row remains (PB-101). |
| UI-4 | "Apps" sidebar entry | App marketplace. |
| ui-layout do-not-mirror, SAN-73 | Goals, teams directory | Separate platform products. |
| ui-layout do-not-mirror | Assets | Separate asset-management product. |
| UI-4 | Block of external links to the vendor's other products | Links to platform products; user-defined links stay in SAN-73 customize. |
| — | External "projects" (atlas) | Separate platform product. |
| ui-layout do-not-mirror | AI assistant and AI suggestions in create | The vendor's separate AI product. Not in the owner's named list: needs the owner's OK. |
| UI-2, OR-6, OR-29, OR-30, OR-32, OR-34, OR-47 | Upgrade prompt, paid trial, plan gates ("paid plans only", Free-site freeze) | Vendor billing, not a feature: santi ships every gated feature to everyone. |

## Counts

- Reinstated rows: 121 (PB-1..PB-121): 75 into proposed P1–P13, 46 into existing cards.
- Proposed new cards: 13 (7 L: P1, P2, P3, P4, P5, P11, P12; 6 M: P6, P7, P8, P9, P10, P13).
- Skipped: 8 items, all vendor platform or billing; one (AI assistant) waits for the owner's OK.
- No work: 2.
