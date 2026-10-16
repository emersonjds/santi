# UI layout — behavior spec

Card: SAN-19. Phase: public docs plus one live capture (landmark outline of the personal home
page on the maintainer's site). Board, backlog and issue screens not yet observed live.

## Purpose

Someone who lives in the reference tracker every day should find santi's screens where their
hands expect them: same regions, same navigation path, same action placement, same keys. The
look (logo, icons, colors, type, copy) is santi's own.

## Sources

`observed`: [O] `research/ui-layout/for-you-outline.txt`. `documented`: [N]
`what-is-the-new-navigation-in-jira.txt`, [B] `use-your-scrum-backlog.txt`, [A]
`use-active-sprints.txt`, [C] `create-an-issue-and-a-sub-task.txt`, [K]
`use-keyboard-shortcuts.txt`, [P] `navigate-jira-with-your-keyboard.txt`, [F]
`configure-field-layout-in-the-work-item.txt`, [SB] `docs/specs/behavior/scrum-board.md`.

## Rules

App shell
- UI-1 Three landmarks: a top bar, a left sidebar, a main area; skip links to each come first in the page. `observed` [O]
- UI-2 Top bar, left to right: sidebar collapse toggle, app switcher, home link (product mark), a wide search field, the global create button; then, pushed right: upgrade prompt, notifications, help, settings, account menu (avatar). `observed` [O]
- UI-3 Search sits in the top bar and spans every project; Enter jumps to advanced search. `observed` [O] `documented` [N]
- UI-4 Sidebar, top to bottom: personal home hub, recent, starred, apps, plans, the projects group (header with create-project and more-actions buttons, then one row per project, then a "more projects" expander), filters, dashboards, a block of external links, and a customize-sidebar button at the foot. `observed` [O]
- UI-5 Each project row carries a more-actions menu (project settings live there) and, for software projects, a create-board shortcut. `observed` [O] `documented` [N]
- UI-6 Sidebar can be resized or collapsed and re-expanded at any time; collapse state is per viewer. `documented` [N]
- UI-7 Sidebar order and visibility are customizable per viewer (show, hide, drag to reorder, arrow keys to reorder); nobody else sees the change. `documented` [N]
- UI-8 Inside a project, views (board, backlog, ...) are switched by horizontal tabs in the project header; admins reorder or remove tabs. `documented` [N][B]
- UI-9 Personal home hub main area: a heading, a strip of recommended projects, then tabs (recommended, assigned to me with a count, starred, worked on, overflow), a list of issue rows each with an avatar group, and a load-more button. `observed` [O]

Board screen
- UI-10 While a sprint runs, the board header shows the sprint name, its goal and the time left. `documented` [SB-11]
- UI-11 Columns stand for workflow phases left to right; cards are ranked inside a column; dragging a card across columns changes status. `documented` [A][SB-12][SB-16]
- UI-12 Viewer-defined quick filters narrow the cards; hidden cards are left out of swimlane counts. `documented` [A][B]
- UI-13 Card anatomy: key, summary, type, priority, assignee, estimate, parent; a subtask shows its parent's key above it. `documented` [A][SB]
- UI-14 Optional days-in-column indicator: small dots at the card foot, hover gives the exact count. `documented` [A]
- UI-15 Selecting a card opens the issue detail without leaving the board. `documented` [B]

Backlog screen
- UI-16 Sections stacked: active sprint, future sprints, then the unplanned backlog last. `documented` [B][BL-1]
- UI-17 A create-sprint action sits with the sections; each future sprint header holds its start action; started sprints move to the board. `documented` [B]
- UI-18 A sprint header shows avatars of everyone with work in it; hovering one gives that person's summary; the header's more-actions menu opens the per-assignee workload. `documented` [B]
- UI-19 Row fields editable in place: summary, assignee, estimate, parent, priority. `documented` [B]
- UI-20 Rows reorder by drag; dragging between sections moves the issue into or out of a sprint; a draggable divider moves several rows at once. `documented` [B]
- UI-21 Right-click on a row gives a context menu: send to top, send to bottom, split; right-click on the key opens the issue in a new tab. `documented` [B]
- UI-22 Multi-select by checkbox, Ctrl/Cmd-click, or Shift-click range; a toolbar appears with edit fields, edit status and bulk actions. `documented` [B]
- UI-23 Inline create sits at the foot of every sprint section and of the backlog section. `documented` [B][C]
- UI-24 The epic panel is toggled from the epic filter dropdown; it creates epics, accepts dropped rows and filters by epic. A version panel works the same way. `documented` [B]
- UI-25 Row-level more-actions menu holds flag (with optional comment) and delete. `documented` [B]

Issue detail
- UI-26 Two presentations: a panel on the right of the board or backlog (J/K moves selection and the panel follows), and a full page in its own tab. `documented` [B]
- UI-27 Two columns: main on the left (summary, description, tabbed field groups), details on the right (pinned fields, then always-shown details, then a collapsed group of empty extras that promotes a field once it has a value). `documented` [F]
- UI-28 Narrow layout is a single column: main first, details below. `documented` [F]
- UI-29 Header: type icon and key above the summary, parent key at the top left; the type icon opens a type picker. `documented` [C]
- UI-30 An add-related-work control sits right under the summary (child issue or subtask). `documented` [C]
- UI-31 Issue more-actions menu holds delete, convert and move. `documented` [C]

Create flow
- UI-32 The global create button lives in the top bar and works from every screen; C does the same. `observed` [O] `documented` [C][K]
- UI-33 It opens a compact dialog. Order: header with project and type (defaults: current project, last type used there), title, description, up to three required fields as chips, then the next three configured fields as optional chips beside them, a keep-open-for-another checkbox, the submit button. `documented` [C]
- UI-34 An expand control switches to the full form with every field; a viewer can make the full form the default. `documented` [C]
- UI-35 Clicking outside docks the draft at the bottom right instead of discarding it. `documented` [C]
- UI-36 New issue placement: top of the backlog; below the selected row if one is selected; bottom of the sprint if a sprint was set. `documented` [B][C]

Keyboard
- UI-37 `?` opens the shortcut sheet, grouped into global, navigation, issue actions; a switch there turns shortcuts off. `documented` [K]
- UI-38 `c` create, `o` open selected, `a` assign, `i` assign to me, `m` comment, `e` edit selected (backlog), `j`/`k` next/previous issue, `n`/`p` next/previous column. `documented` [K][B]
- UI-39 `Ctrl+[` toggles the sidebar; `Cmd/Ctrl+K` opens a command palette that searches and edits (status, assignee, parent, estimate, sprint, priority, labels, delete, link). `documented` [N][P][C]

## santi adoption

Mirror UI-1, UI-2 minus switcher and upgrade, UI-3, UI-6, UI-8, UI-10..13, UI-15..23, UI-26..30,
UI-32, UI-33 minus chips beyond title/description/type/assignee/estimate/sprint, UI-36..38.
- Sidebar (UI-4 trimmed): home hub (assigned to me), recent, projects group; each project
  expands to board, backlog, settings. Starred, filters, dashboards wait for those features.
- D6: subtasks are flat cards with a parent-key chip, not indented under the parent (overrides UI-13 nesting).
- D10: epic panel lists key, summary, child count and progress; epics never appear as rows.
- D18: quick filters and assignee picks live in the board URL; the filter bar renders from it.
- D1: panel and full page are the same server route; the panel loads it into the right region
  and pushes the URL, so a reload lands on the full page.
- Later: UI-7, UI-14, UI-21 split, UI-24 versions, UI-34, UI-35, UI-39.

## Responsive (375px)

- Top bar: sidebar toggle, santi mark, search icon (opens a full-width search sheet), create
  icon, account avatar. Notifications, help and settings move into the account menu.
- Sidebar: off-canvas drawer over a scrim, closed by default, closes on navigation.
- Board: one column at a time, chosen from a column picker showing per-column counts; cards
  full width; moving a card is a status menu on the card (drag stays for wide screens).
- Board header: sprint name and time left on one line, goal clamped to two lines and
  expandable, complete action in the header overflow menu.
- Filter bar: one filter button with an active-count badge opening a bottom sheet (search,
  assignees, quick filters).
- Backlog: sections full width; row shows type, key, two-line summary, estimate, avatar;
  in-place edits move to the detail page; checkboxes stay as 44px targets.
- Epic panel, create dialog, issue detail: full-screen sheets; detail uses the single column (UI-28).
- Every target 44px; form inputs 16px; no hover-only info (avatar summary and day dots open on tap);
  the page never scrolls sideways.

## santi identity

- Icons (Lucide): sidebar `panel-left`, search `search`, create `plus`, notifications `bell`,
  help `circle-help`, settings `settings`, account `circle-user`, home hub `house`, recent
  `clock`, project `folder`, board `kanban`, backlog `list`, more actions `ellipsis`, filter
  `list-filter`, epics `layers`, start sprint `play`, complete sprint `circle-check`, assign
  `user-plus`, comment `message-square`, flag `flag`, subtask `list-tree`, parent `corner-left-up`,
  drag `grip-vertical`, expand `maximize-2`, close `x`, delete `trash-2`, shortcuts `keyboard`.
- Palette (D36): light theme first — white canvas, neutral greys for surfaces (#FAFAFB sidebar,
  #F4F5F7 columns and sections, #E4E5E9 borders), dark slate text (#172033 / #5E6475 / #8A8F9C);
  brand purple #4C35D2 (hover #3F2CB0, pressed #34258F, tint #F3F1FD / #ECE8FB) for primary
  actions, focus and the active nav item; no blue; status category told by text and shape first,
  color second; dark mode follows with the same purple.
- Type: system UI font stack; scale 12 / 14 / 16 / 20 / 24 px; 16px base on inputs; tabular
  numerals for keys, counts and estimates.
- Copy: plain, short, sentence case, verb-first buttons; santi's own nouns (issue, project,
  sprint, epic), never the reference's renamed terms.

Do not mirror: product mark, app switcher, product and AI assistant names, upgrade prompt,
apps/plans/assets/goals entries, the reference's blue and status-lozenge colors, its fonts, its
issue-type and priority glyphs, its labels and empty-state wording, browser access-key modifier
shortcuts, AI suggestions in create.

## Open questions (live observation)

- OQ-1 Board header: where does complete-sprint sit relative to name, goal and time left, and what else lives there?
- OQ-2 Board filter bar: order of search, assignee avatar stack and quick-filter chips; how many avatars before overflow?
- OQ-3 Backlog section header: which totals show (issue count, points per status category) and where do start/complete/more sit?
- OQ-4 Epic panel: which side, and does it push the list or overlay it?
- OQ-5 Issue detail: where do comments and activity sit, and how does the right panel resize, close or expand to full page?
- OQ-6 Board card click: right panel or modal over the board?
- OQ-7 Project navigation: are board/backlog only header tabs, also sidebar children, or both?
- OQ-8 Narrow widths: how does the reference board behave below tablet width (not captured)?
