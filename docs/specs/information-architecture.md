# santi v1 — information architecture

Date: 2026-10-15. Card: SAN-32. Inputs: `2026-10-15-santi-v1-design.md`, `decisions.md` (D1–D36),
`behavior/ui-layout.md`, `scrum-board.md`, `kanban-board.md`, `backlog.md`, `sprint-lifecycle.md`.
Only what v1 builds is listed as v1; everything else is marked "later". SAN-74: every "later" below is
reinstated into `parity-backlog.md` and names its card.

## 1. Objects

```
user ── member (role: admin | member) ── project (key, name)
                                           ├─ board (exactly one, scrum | kanban; D31; several: reinstated → P12)
                                           │    ├─ columns (ordered; kanban: WIP max, D7)
                                           │    │    └─ statuses (category todo | in_progress | done; unmapped pool, D30)
                                           │    └─ sprints (scrum only: future | active | closed; one active, D13)
                                           ├─ issues KEY-N (one rank order, D4/D21)
                                           │    ├─ epic ── parent of story / task / bug (shown in the epic panel, D10)
                                           │    ├─ story / task / bug ── parent of subtasks (flat cards + chip, D6)
                                           │    └─ comments
                                           └─ invites (one-time links, no email; email: reinstated → SAN-69)
user ── API tokens (CLI, MCP; D23)
```

- Board and backlog are views, not objects. The backlog exists on scrum projects only (D9).
- An issue belongs to at most one sprint; a subtask always shares its parent's sprint (D6).
- Done = status category `done`, always the rightmost column (D2).

## 2. Global navigation

Top bar (every signed-in page), left to right:

| Slot | v1 | Notes |
|---|---|---|
| Sidebar toggle | yes | `panel-left`; `Ctrl+[` later (reinstated → P9) |
| santi mark | yes | links to `/` |
| Search field | yes, project pages only | placeholder "Search KEY"; Enter → `/p/{key}/search?q=`. Hidden outside a project. Global search: later (reinstated → P10) |
| + Create | yes | purple, the one solid button in the bar; `c` opens it (UI-32) |
| Account menu (avatar) | yes | name, email, API tokens, keyboard shortcuts (`?`), log out |
| Notifications, help | later | no notifications in v1; reinstated → SAN-54 (notifications), P10 (help) |

Sidebar, top to bottom:

| Group | v1 | Notes |
|---|---|---|
| Home | yes | `/` |
| Projects (header + "New project" icon) | yes | one row per project: avatar, name, key |
| └ current project expanded | yes | Board, Backlog (scrum only), Settings (admins only) |
| Recent, Starred, Filters, Dashboards | later | no view history, favorites or saved filters in the v1 model; reinstated → SAN-73, SAN-72, SAN-56, SAN-57 |

Project navigation: the project header carries tabs; the sidebar repeats the same links for the
current project (ui-layout OQ-7: both).

| Tab | v1 | Shown to |
|---|---|---|
| Board | yes | everyone |
| Backlog | yes, scrum only | everyone |
| Settings | yes | admins only |
| Summary, List, Calendar, Releases, Reports | later | reinstated → P5 (Summary, List, Calendar), SAN-55 (Releases, Reports) |

Tabs are fixed in v1 (UI-8 reordering: later; reinstated → P5).

## 3. URL map

Conventions: page routes are `/p/{key}/…` (API stays `/api/projects/{key}/…`). Filters are query
params (D18): `q`, `assignee` (repeatable, `me` allowed), `type`, `label`, `epic` (parent key).

SPA (D37): the page routes below are TanStack Router client routes; redirects (`303` in the table)
are client redirects. The server keeps `/api/*`, `/openapi.json`, `/docs`, `/health` and the built
assets (`/assets/*`, cached as immutable), and answers every other GET with `index.html`
(`no-cache`); an unknown `/api/*` path stays a D24 404. The SPA writes through `/api/*` only
(OpenAPI is the contract).

Pages

| Route | Page | Status |
|---|---|---|
| `GET /login`, `GET /register` | sign in, create account | built |
| `GET /invites/{token}` | join a project | built |
| `GET /` | home | built (projects only) |
| `GET /projects/new` | new project | built |
| `GET /p/{key}` | `303` → `/p/{key}/board` | built |
| `GET /p/{key}/board` | board (+ `?column={id}` at 375px) | built |
| `GET /p/{key}/backlog` | backlog (+ `?panel=epics`); kanban → `303` board | built |
| `GET /p/{key}/issues/{n}` | issue: full page; from board, backlog or search a modal with the URL masked to this path | built |
| `GET /p/{key}/search` | search results (`?q`, `type`, `status` category, `assignee`, `recently_updated`) | built |
| `GET /p/{key}/settings` | board settings: columns, statuses, done window | new |
| `GET /p/{key}/settings/members` | members, roles, invite links | new (moves off the project page) |
| `GET /account` | profile and API tokens | built |

Create issue has no route: + Create or `c` opens a dialog.

## 4. Pages and regions

Regions: shell (top bar + sidebar), header (project header or page title), toolbar, content,
overlay (modal, sheet, menu).

| Page | Header | Toolbar | Content | Overlay | Primary | Secondary |
|---|---|---|---|---|---|---|
| Login / register | none (no shell) | — | centered form | — | Sign in / Create account | switch to the other form |
| Join project | none | — | project name, role offered | — | Join project | sign in or create account first |
| Home | "Hi, {name}" | — | Assigned to me (later; reinstated → SAN-72); Your projects cards | — | New project | open a project |
| New project | "New project" | — | name, key (derived, editable), board type Scrum/Kanban with one-line help | — | Create project | Cancel |
| Board | project header | filter bar | columns; uppercase name, count, WIP `n/max` (kanban); cards | issue modal, card menu, start/complete dialogs | + Create (top bar), inline "Create issue" at column foot | Complete sprint (header, scrum), Settings link (admin) |
| Backlog | project header | filter bar + Epics toggle | sprint sections, then "Backlog" section | epic panel (right, pushes the list), issue modal, row menu | Create sprint | Start / Complete per sprint, inline create per section |
| Issue (page or modal) | type glyph, key, parent key, summary | — | main: description, subtasks (+ Add subtask), comments; details: status button, assignee, reporter, priority, points, sprint, labels, parent, dates | status menu, pickers | status button | Assign to me, Copy link, Open as page (modal only), Close |
| Create issue (modal) | "Create issue" | — | project, type, summary, description, assignee, points, sprint | — | Create | Create another (keep open), Cancel |
| Search | "Search" + query | filter bar | result rows: type, key, summary, status chip, assignee | issue modal | — | refine filters |
| Settings — board | project header | — | Columns (order, rename, WIP max kanban, delete), Statuses (name, category, column, unmapped pool), Done window (kanban) | delete-column target picker | Add column | Add status |
| Settings — members | project header | — | member rows (avatar, name, email, role select, remove); invite link box | — | Create invite link | change role, remove |
| Account | "Account" | — | profile (read only); API tokens (name, created, revoke) | token shown once | Create token | Revoke, Log out |

Project header (board, backlog, settings): project avatar (initial on brand tint), name, board
type badge (Scrum / Kanban), active sprint name + "n days left" (scrum; overdue badge, D15),
member avatars (5 + "+n", opens the member list), Invite (admins), then the tabs.

Filter bar (board, backlog, search): search box, assignee avatars (click toggles; "Only mine"),
Type, Label, Epic dropdowns, "Filters (n)" with Clear. AND across kinds, OR within (D3). Group by
(swimlanes): later (SB-29 dropped; reinstated → P1).

Card: type glyph, key, summary (2 lines), points pill, priority glyph (urgent only colored),
avatar; subtasks add a parent-key chip; parents show `open/total` subtasks (D6). Card menu
("…"): Move to…, Assign to me / Assign…, Set priority, Copy issue key, Delete (D40: admins and
the reporter, behind a confirm naming its subtasks and comments). Drop slot: dashed outline at the target position.

Backlog section header: name, dates, issue count, status chips (to do / in progress / done
counts), points total (D11), Start or Complete, "…" (edit, delete if future). Footer line:
"{visible} of {total} issues visible · Estimate: {visible points} of {total points}". Empty
sprint: dashed drop zone.

## 5. Create flow

1. "+ Create" (or `c`) opens a dialog (no route).
2. Project preselected: the current project; on home, the last project the user opened
   (cookie), else the first in the list. With no projects, "+ Create" goes to `/projects/new`.
3. Changing the project re-fetches the form for that project (statuses, members, sprints differ).
4. Fields per UI-33 trimmed: type (default Story), summary, description, assignee, points, sprint.
   Status = project's first `todo` status. Expand to full form, draft docking: later (reinstated → P7).
5. Placement (UI-36): sprint chosen → bottom of that sprint; otherwise top of the backlog
   (kanban: top of the first column). Today every create appends at the bottom (D5's rule),
   so the global modal needs a "top" rank; open question for the owner (reinstated → P7). Success: toast "KEY-N created" with Open link;
   "Create another" keeps the modal open with type and sprint kept.
6. Inline create (column foot, section foot) posts to the same route with the context fixed (D5).

## 6. Issue detail: modal and page

- One route, `/p/{key}/issues/{n}` (D1). From board, backlog or search a card opens it in a modal
  (`<dialog>`, max 960px, two columns) and pushes the URL; reload or a shared link lands on the
  full page. Close (`x`, Esc, backdrop) goes back in history to the board URL with its filters.
- Modal over side panel (resolves ui-layout OQ-6): the board keeps every column visible, and
  board and backlog get the same behavior. Right panel with J/K follow (UI-26): later (reinstated → P9).
- Edits save per field (`PATCH /api/projects/{key}/issues/{n}`, card refreshed from the query
  cache), so closing shows
  the current state without a reload.

## 7. Search

- v1: project scope only, `/p/{key}/search?q=`; free text over summary plus the filter params;
  keyset pages of 50 (D29). Done issues are included (the way to reach work hidden by D8).
- Results open the issue modal. Empty: "No issues match “{q}”. Try fewer words or clear filters."
- Later: global search across projects (`/search`), field in the top bar on every page (reinstated → P10).

## 8. Empty states and first run

| Where | Copy | Action |
|---|---|---|
| Home, no projects | "No projects yet. A project groups a board, its backlog and its sprints." | New project |
| New scrum project | lands on Backlog (work starts with planning) | — |
| New kanban project | lands on Board | — |
| Board, scrum, no active sprint | "No sprint is running. Plan one in the backlog and start it to see its issues here." | Open backlog |
| Board, empty column | dashed slot "Drop issues here" | inline Create issue (first column) |
| Board or backlog, filters hide all | "No issues match these filters." | Clear filters |
| Backlog section, empty | "Create issues here, then drag them into a sprint." | inline Create issue |
| Future sprint, empty | dashed zone "Drag issues here to plan this sprint." | — |
| Start on empty sprint | button disabled, hint "Add an issue before starting." (D13) | — |
| Epic panel, empty | "No epics yet." | Create epic |
| Members, only you | "Invite people with a link. Each link works once." | Create invite link |
| Account, no tokens | "Tokens let the santi CLI and agents act as you." | Create token |

First run: register → home (empty) → New project (name, key, type) → backlog (scrum) or board
(kanban) → Create issue → (scrum) Create sprint → drag issues in → Start → board.

## 9. Permissions in the UI

| Action | Admin | Member | UI for members |
|---|---|---|---|
| Create, edit, move, rank, comment on issues | yes | yes | — |
| Create, edit, start, complete, delete future sprints | yes | yes | — (SP-15 dropped; reinstated → SAN-66) |
| Board settings: columns, statuses, mapping, WIP, done window | yes | no | Settings tab and sidebar link hidden; direct URL → 403 page "Only project admins can change settings." |
| Members: roles, remove, invite links | yes | no | Invite button hidden; member avatars still open a read-only list |
| Create a project | any signed-in user | — | creator becomes admin |

The last admin cannot be demoted or removed: the role select and Remove are disabled with the hint
"A project needs at least one admin." Non-members get 404 on every project URL (D28).

## 10. Mobile (375px)

Follows ui-layout "Responsive". IA specifics:
- Top bar: toggle, mark, search icon (project pages), + icon, avatar.
- Sidebar becomes the drawer; it is the only path to Home and other projects.
- Project tabs stay in the header (three fit: Board, Backlog, Settings); header meta collapses to
  name + sprint line; member avatars and Invite move into the header "…" menu.
- Board: one column at a time via a column picker with counts (`?column=`); card menu "Move to…"
  replaces drag.
- Modals (create, issue, sprint dialogs) and the epic panel open as full-screen sheets.

## 11. Build order (remaining UI work)

| # | IA item | Card |
|---|---|---|
| 1 | Tailwind `@theme` with the D36 tokens (light on, dark defined) | SAN-32 |
| 2 | Shell: top bar, sidebar groups, drawer, skip links, account menu | SAN-32 |
| 3 | Project header + tabs; `/p/{key}` → `/board`; members and invites move to settings | SAN-32 |
| 4 | Board: filter bar, column headers, cards, card menu, drop slot, empty states | SAN-32 |
| 5 | Issue modal + page on one route, out-of-band card refresh | SAN-32 |
| 6 | Global create modal (`/p/{key}/issues/new`) with project preselect | SAN-32 |
| 7 | Backlog layout: sections, status chips, estimate line, epic panel | backlog card in progress, styled by SAN-32 |
| 8 | Login, register, join, new project, search restyled | SAN-32 |
| 9 | Settings: board and members pages | new card |
| 10 | Account page with API tokens | new card (needed before the CLI ships, E3) |
| 11 | Home "Assigned to me"; Recent; global search | later; reinstated → SAN-72, SAN-73, P10 |
| 12 | Dark theme switched on and checked screen by screen | later; reinstated → P10 |

## Resolved questions (orchestrator, 2026-10-15)

The owner delegated these calls; defaults chosen to keep v1 small.

1. Dark theme: tokens defined, switched off in v1 (item 12). Reinstated → P10.
2. New issues land at the bottom of the backlog, as `create_issue` already does; UI-36 "top of backlog" is dropped for v1. Reinstated → P7.
3. Home "Assigned to me" and sidebar "Recent" stay later (item 11). Reinstated → SAN-72, SAN-73.
4. Account page with API tokens is v1 and gets its own card before the CLI ships.
5. Issue delete was deferred until a delete service existed; SAN-49 built it (D40): card, row and issue menus.
6. Settings are hidden from members; the URL answers 403.
7. After creation a scrum project opens on the backlog and a kanban project on the board.

Amendment (SAN-74, 2026-10-16): the owner set a binding parity rule. santi reaches full parity with
every reference feature in the clean-room specs; nothing the reference has stays "later" without the
owner's explicit OK, and only the vendor's separate platform products may be skipped, with a reason.
The "keep v1 small" defaults above stand as v1 history; each "later" is reinstated in
`parity-backlog.md`.
