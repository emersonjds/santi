# SAN-73 — Sidebar parity

Baseline: `behavior/ui-layout.md` UI-4, UI-6, UI-7, UI-40..UI-67 (observed live, 1280px and 375px), `information-architecture.md` §2, SAN-72 brief (stars, issue views, worked on).

Owner (card comment, 2026-10-17): keep the name Projects. The sidebar is the place to reach projects, with the reference mechanics: Projects header with + and more actions, recent projects first, the current project expanded with board, backlog, reports and settings, a "More projects" entry, Recent and Starred flyouts. santi stays agile-only (Scrum and Kanban): apps, plans/goals and vendor links stay out. Mechanics that remain behave like the reference.

## Questions

| # | Question | product | ux | ia | Winner (architect) |
|---|---|---|---|---|---|
| 1 | Entries shipped now, top to bottom (For you, Recent, Starred, Projects; Filters/Dashboards/Plans wait for SAN-56/57/55: hidden or disabled?) | Hidden. Disabled rows still take tab stops, dead end for keyboard/SR users. | Hidden; disabled rows still take tab stops, dead end for keyboard and screen readers. | Hidden; a disabled tab-stop that leads nowhere breaks the one-name-one-place nav model. | **Hidden**: For you, Recent, Starred, Projects; the other entries appear with their features. |
| 2 | Recent item kinds and source (projects, boards, issues; issue views exist from SAN-72, project/board visits do not; UI-61: opening an issue counts as a project visit) | Agree; without project-visit tracking "recent" is empty on day one, worse than late. | Agree; recent is useless on day one without visit tracking. | Agree; project visit via issue-open keeps "recent" populated, matches Reports/Board one level deep. | **Projects and issues**; a board is its project (D31). Premise corrected: SAN-72 already records visits (`member.visited_at`, `POST /api/projects/{key}/visit` from the project layout, which also wraps the issue page and dialog) and issue views/work (`issue_activity`). No new table. A project's time is `greatest(member.visited_at, newest touch of its issues)`, the expression `/api/me/projects` already orders by, so sidebar and flyout agree (UI-61). |
| 3 | Recent flyout as UI-58/59 (search, time groups, pages of 15, view-all → For you "Viewed" tab)? | Agree; also needs empty/no-match states and 44px rows at 375px. | Agree; UI-58/59 parity, plus empty, no-match and 44px states. | Agree; view-all → For you Viewed keeps one recents home, no duplicate page. | **As UI-58/59**: `GET /api/me/recent` (one statement), search on the server over the whole history, pages of 15, time groups from the existing `groupByDay`. View-all → `/?tab=viewed` as it is; the Viewed tab gaining project rows (UI-58 foot) is a follow-up card. |
| 4 | Starred flyout type filter: which kinds (santi stars projects and issues today) | Agree; hiding a filter for kinds that can't exist avoids a confusing empty filter option. | Agree; hide kinds that cannot be starred yet. | Agree; filter only existing kinds (project, issue) avoids a dead option in the menu. | **All, Projects, Issues**: `GET /api/me/starred?kind=`, same item shape as Recent. |
| 5 | Projects rows: starred sublist above recent, 5 recent non-starred (UI-61); the current project open with Board, Backlog (scrum), Reports, Settings | Reports already ships (`/p/$key/reports` live): include it, dropping it removes a working link. | Include Reports (already shipped): Board, Backlog (scrum), Reports, Settings. | Include Reports; already linked at /p/key/reports, omitting adds a click to reach it. | **UI-61 + Reports**: rows come from `/api/me/projects` (one query; gains `starred_at`, `visited_at`); split in the client, so a star refills recent to 5 at once instead of after a reload (no extra state). Pages: Board, Backlog and Reports (scrum, as the header tabs), Settings (owner overrides UI-47/48). Current project open; a row opened by hand closes on reload (UI-65): `sidebar-expanded:<KEY>` is removed. |
| 6 | Projects header "…": manage-projects link and change-view submenu (UI-62) — ship both? | Agree; one menu item is one more keyboard stop than a submenu, simpler focus order. | Agree with product; one item keeps keyboard and focus order simpler than a submenu. | Both; one menu holds manage-projects link + view submenu, no new top-level entry. | **Both**: Manage projects → `/projects`; View radio submenu (Recent and starred, default / Starred only / Most recent project), kept in `localStorage` (D49). |
| 7 | Project row "…": add Star to the SAN-91 menu; "add people" → Members page? | Agree; keep Star icon-toggle visible too for 1-click, menu entry is the keyboard/SR path. | Agree; keep Star as a visible hover/focus toggle too, menu is the keyboard/SR path. | Agree; Star in menu, icon kept; add people reuses existing Members page, no new route. | **Yes**: Star/Unstar first in the menu, plus a row star action (UI-42) revealed like "…"; Add people → `/p/$key/settings/members` (admins); read-only last line "Scrum project" / "Kanban project". |
| 8 | More projects flyout with search (UI-64) vs link to `/projects` | Agree; one more click to `/projects`, but no duplicate search UI to keep accessible. | Agree with product; link to /projects, no duplicate search UI to keep accessible. | Flyout; owner wants reference mechanics, keeps project reach at sidebar depth, no detour to /projects. | **Flyout** (owner; replaces the ux link-out states): filters the cached `/api/me/projects` list, no request (membership-bounded); recent group (visited, not in the sidebar) then other group by name; view-all → `/projects`. |
| 9 | Customize modal (UI-66) now or later, given 4 entries | Agree; nothing to reorder/hide yet, dialog would be empty ceremony. | Later; 4 fixed entries need no customize yet. | Later; four fixed entries, nothing to reorder; owner didn't request it, add with SAN-56/57. | **Later**: follow-up card next to SAN-56/57; UI-7, UI-50, UI-66 stay the baseline. |
| 10 | Resize handle 200–500px (UI-52): ship now? width stored in localStorage until personal settings (SAN-93) exist | Agree; handle needs a 44px hit area and arrow-key step for keyboard resize. | Agree; 44px hit area and 20px arrow-key steps (UI-52). | Agree; localStorage mirrors existing sidebar-expanded pattern, no new storage mechanism. | **Ship** UI-52: separator 200–500px, arrows ±20px, default 320px, double-click collapses, width survives collapse and reload, a drag closes an open flyout; 24px pointer target (44px is a touch rule and the handle is hidden below `md`). Stored in `localStorage` until SAN-93 (D49). |
| 11 | 375px: sidebar drawer stays; flyouts open as a full layer (UI-67) | Agree; full layer avoids a flyout-in-drawer double-scroll trap on phone. | Agree; a full layer avoids a double-scroll trap inside the drawer. | Agree; full layer matches drawer's own full-width model, one navigation metaphor per breakpoint. | **Yes**: shadcn drawer stays; below `md` a flyout is a full-screen layer over the drawer. |
| 12 | Keyboard: Esc closes and returns focus (UI-57); arrows move between rows (reference did not) — add? Focus trap in flyout? | Agree; trap + focus-return is the accessible minimum, row arrows are nice-to-have not required. | Agree; Esc, focus return and trap are the floor; skip row arrows. | Agree; trap + focus-return keeps sidebar reachable by keyboard; row arrows wait, not structural. | **Radix Dialog** (already a dependency) as the flyout: traps Tab, Esc and close return focus to the trigger, heading, one open at a time, empty search on reopen. No row arrows. |

## States (ux)

- Recent flyout loading: skeleton rows, no layout shift when real rows arrive.
- Recent flyout empty: heading "Nothing viewed yet", one-line hint, view-all link kept.
- Recent flyout error: inline message + Retry button, focus stays in flyout.
- Recent flyout search no-match: "No matches" heading, one-line hint, view-all link kept, no items.
- Recent flyout long item name: truncate with ellipsis, full name on title/tooltip and in SR label.
- Recent flyout many items: 15 rows then load-more on scroll with a loading indicator, no jump.
- Starred flyout loading: skeleton rows.
- Starred flyout empty: "Nothing starred yet" heading, how-to-star hint, view-all link, no search box.
- Starred flyout error: inline message + Retry, keeps last good list if retry fails again.
- Starred flyout search no-match: "No matches" heading + hint, same as Recent.
- Starred flyout long item name / many items: same truncate and paging rules as Recent.
- Projects section loading: skeleton rows per project, header buttons stay interactive.
- Projects section empty (no projects): "No projects yet" row + Create project action, no stale chevrons.
- Projects section error: inline message under header + Retry, existing cached rows stay visible if any.
- Projects section partial data (one project's recent boards fail to load): that project's expand area shows its own inline error + Retry, other rows unaffected.
- Projects section long project name/key: name truncates, key hidden below `md` per IA, full name on tooltip/SR.
- Projects section many projects: starred sublist + 5 recent, rest only via "More projects"; no unbounded list.
- Projects section no permission (viewer not a member of a listed project): row omitted, not shown disabled.
- More projects: loading state is the `/projects` page's own skeleton (we link out, not a flyout).
- More projects: error, empty and search-no-match states are `/projects` page's existing states (out of scope here).
- 375px, all four: sidebar is a full-width drawer, flyouts are full-page layers, 44px row/button targets, no sideways scroll, search inputs ≥16px font.
- Dark theme, all four: same states, tokens from D36, no hardcoded colors, sufficient contrast on hover/focus rows.
- Keyboard order: toggle → santi mark → search → create → account; inside sidebar: Projects header (create, "…") → each project row (chevron → name → "…") → More projects; flyout traps Tab, Esc closes and returns focus to the trigger that opened it.

Architect amendments: "partial data" does not apply (pages are static links, one board per project); the two More projects bullets are replaced by the flyout states in Acceptance; the row order gains the star (chevron → name → star → "…").

## Contract

- `GET /api/me/recent?q=&limit=&cursor=` and `GET /api/me/starred?kind=project|issue&q=&limit=&cursor=` → `Page<MyItem>`; `cursor` is an offset (as `/api/me/issues`); the web asks `limit=15`.
- `MyItem { kind: "project" | "issue", key: "WEB" | "WEB-12", name, project_key, project_name, board_type, issue_type?, at }`; `name` is the project name or the issue summary; `issue_type` only on issues.
- Recent: projects with a time (rule in Q2) and issues by `greatest(viewed_at, worked_at)`, newest first, ties by key. Starred: `member.starred_at` and `issue_star.created_at`, newest star first.
- `q`: trimmed, empty means none, `issues::domain::like_pattern` (case-insensitive substring, wildcards literal) on the name or the key.
- Only active projects the caller belongs to; 401 without a session; 422 on a bad `limit`; 400 on an unknown `kind`.
- `MyProject` gains `starred_at?` and `visited_at?` (the Q2 time); additive.
- Budgets (D39): 2 statements each (token + one query), pinned in `tests/perf_budget.rs`; no new index (both read by `user_id` prefixes: `issue_activity` and `issue_star` primary keys, `member_user_idx`).

## Acceptance

Sidebar (1440 and 375, light and `data-theme='dark'`, D36 tokens only):
- Entries top to bottom: For you, Recent, Starred, Projects; no Filters, Dashboards or Plans. Recent and Starred show `aria-expanded` on their trigger.
- Projects header: label, + (New project), "…" with Manage projects and the View submenu; the chosen view survives reload; blocked storage falls back to the default.
- Rows: "Starred" sublabel (newest star first) above "Recent" (5 non-starred, `/api/me/projects` order); a project shows once; starring moves it at once and recent refills to 5; unstarring returns it at once. View "Starred only" hides the recent sublist; "Most recent project" shows one row.
- The current project's row is open with Board, Backlog + Reports (scrum only), Settings; a row opened by hand closes again on reload; no `sidebar-expanded:*` keys written.
- Row "…": Star/Unstar first, Copy link, Add people (admins), Settings, Archive, Delete, Leave as SAN-91, read-only "Scrum project" / "Kanban project" last. Row star action revealed on hover/focus on desktop, always on a phone, `aria-pressed`, optimistic with rollback and toast.
- Loading: 3 skeleton rows, header buttons work. Empty: "No projects yet" row with a Create project link, no chevrons. Error: inline message + Retry under the header, cached rows stay. Long name: truncated, full name in `title` and the accessible name; key hidden below `md`. Projects the caller is not a member of never appear.
- Resize (≥ `md` only): drag 200–500px, arrows ±20px, `role="separator"` with `aria-valuenow/min/max`, default 320px, double-click collapses, width survives collapse, expand and reload, a drag closes an open flyout.

Flyouts (Recent, Starred, More projects):
- Open on click as a dialog beside the sidebar (≥ `md`), full-screen layer below `md`; heading, close button; opening one closes the other; Tab trapped; Esc and close return focus to the trigger; reopening starts with an empty search.
- Search: input ≥ 16px, clear button with text, filters 250ms after the last keystroke; Recent and Starred search the server, More projects the cached list.
- Recent: groups Today, Yesterday, This week, This month, Older; row = type icon, name, relative time, link to the project or issue; 15 rows, scrolling to the end loads 15 more behind a loading row, no jump; view-all → `/?tab=viewed`.
- Starred: type menu All / Projects / Issues; rows newest star first with an unstar toggle; unstarring keeps the row (toggle flipped) until close, the sidebar row moves at once; view-all → `/?tab=starred`.
- More projects: recent group (visited, not in the sidebar) then Other by name ignoring case; each project listed once across sidebar and flyout; view-all → `/projects`. Nothing left: "All your projects are in the sidebar" + view-all. No match: "No matches" + hint + view-all.
- Loading (Recent, Starred): skeleton rows of the final height. Empty: Recent "Nothing viewed yet" + hint + view-all; Starred "Nothing starred yet" + how-to-star hint + view-all, no search box. No match: "No matches" + hint + view-all, no rows. Error: inline message + Retry, focus stays in the flyout, the last good rows stay if Retry fails. Long names: truncated, full name in `title` and the accessible name.
- 375: 44px rows and buttons, no sideways scroll. Keyboard: toggle → mark → search → create → account; in the sidebar For you → Recent → Starred → Projects + → "…" → each row (chevron → name → star → "…") → More projects.

Gate: `/api/me/recent` and `/api/me/starred` at 2 statements in `perf_budget.rs`; `pnpm size` ≤ 170 KB per route (flyout bodies lazy, like `ProjectActions`); coverage > 90% both sides.

## Build slices

1. **Server: recent and starred feeds** (`backend`). Files: `crates/santi-types/src/home.rs` (`MyItem`, `ItemKind`, `RecentQuery { q }`, `StarredQuery { kind, q }`, `MyProject.starred_at/visited_at`), `crates/santi-server/src/home/{repo,service,handler}.rs`, `tests/home.rs`, `tests/perf_budget.rs`, `web/openapi.json` (`UPDATE_OPENAPI=1 cargo test -p santi-server --test openapi`), `.sqlx`. Model: `my_issues` in the same three files, `recently_visited_or_worked_projects_come_first` in `tests/home.rs`.
2. **Web: flyout shell, Recent and Starred** (`web`). Files: `web/src/entities/home/home-queries.ts` (`recentQuery`, `starredQuery`, infinite, page 15), `web/src/widgets/app-shell/sidebar-flyout.tsx` (Dialog shell, search, states), `recent-flyout.tsx`, `starred-flyout.tsx`, `app-sidebar.tsx` (two triggers), `web/src/shared/lib/use-debounced-value.ts`, tests next to them. Models: `myIssuesQuery`, `shared/ui/sidebar-sheet.tsx`, `entities/home/day-buckets.ts`, `features/star/star-button.tsx`, the lazy `ProjectActions` in `app-sidebar.tsx`.
3. **Web: Projects section and More projects** (`web`). Files: `app-sidebar.tsx` (rows from `myProjectsQuery`, starred/recent split, Reports, drop `sidebar-expanded`), `entities/home/sidebar-projects.ts` (pure split and More projects grouping), `projects-header-menu.tsx`, `project-actions.tsx` (Star, Add people, type line), `more-projects-flyout.tsx`, `entities/home/record-visit.ts` (invalidate `myProjectsQuery` after a visit), project mutations also invalidating `['home']`, `app-shell.test.tsx`. Models: `project-actions.tsx`, `StarProjectButton`, `pages/projects/projects-search.ts`, the slice 2 flyout.
4. **Web: resize and stored preferences** (`web`). Files: `web/src/shared/ui/sidebar.tsx` (width from state, separator), `web/src/shared/lib/sidebar-prefs.ts` (width and view in `localStorage`, guarded), tests. Models: `entities/project/last-project.ts`, `shared/lib/shortcuts.ts`.

Slice 4 is the split point if the card runs long: it ships alone as a follow-up without touching slices 1–3.

## Screenshot review (ux)

A. Copy: matches the brief verbatim across recent-flyout.tsx, starred-flyout.tsx, more-projects-flyout.tsx, project-sections.tsx, project-actions-button.tsx. "Most recent project" reads fine inside the View submenu, next to "Recent and starred" / "Starred only" — each name states what rows show. No fix.

B. Flyout search input: `sidebar-flyout.tsx:117` has `text-base` on the `Input` (16px), both widths. Compliant.

C. Desktop flyout: confirmed in screenshots (recent-open-1440-light/dark, starred-open-1440-light/dark) — no `DialogPrimitive.Overlay` in `sidebar-flyout.tsx`, flyout sits over breadcrumbs/title/tabs on plain canvas, reads like a layout break rather than an intentional panel. Blocker: add a scrim so it reads as a layer, not a glitch.

D. Filled star at rest on desktop: confirmed bug. `project-sections.tsx:134` passes `md:opacity-0` unconditionally to `StarProjectButton`, so a starred project's filled star also hides until hover/focus — contradicts SAN-72's "starred stays filled" (always visible). 375px is correct (`starred-open-375-light.png` shows the filled star without hover). Blocker.

E. "Starred only" view with an unstarred current project: confirmed. `sidebar-projects.ts:19-25` puts the current project alone in `recent` so it doesn't disappear from the sidebar, but `project-sections.tsx:251` renders it under the literal label "Recent" — misleading (it isn't recent) and contradicts Acceptance's "hides the recent sublist" by letter. Keeping the current project in view is the right call; the label is wrong. Fix: suppress/relabel the sublist when `view === 'starred'` (e.g. no header text for a lone current-project row).

F. Projects header `max-md:h-11` (`app-sidebar.tsx:113`): 44px only below `md`, default height at desktop (pointer). Matches the touch-target rule, not a bug. No fix.

G. 375 drawer "For you" accent on open: confirmed (rest-375-light/dark) — "For you" shows the active/current styling while the open page is a project's Board (breadcrumb/content behind the drawer is the Board empty state, and the Board row in the project sublist is correctly highlighted too, so two rows read "current" at once). `app-sidebar.tsx:94-96` already sets `activeOptions={{ exact: true }}` on the `/` Link, so the fix isn't "add exact" — the aria-current is firing anyway; trace the router match (basepath, trailing slash, or a stale match during the drawer's open transition) before touching the class. Blocker (wrong current-location signal), diagnosis needs one more look before the fix.

H. 1440 wide sidebar (`wide-recent-1440-light.png`): keys sit far right with a wide gap from short names — inherent to flex-1 name + trailing key layout, gets more visible as the sidebar widens toward 500px. Cosmetic, not blocking. Later.

I. Filled star color light (brownish, `#B45309`-ish) vs dark (yellow, `#FBBF24`): this is the D36 `warning` token, tuned for contrast on each theme's own surface — not a contrast bug, by design. Real smell: reusing the "warning" semantic color for a star is a meaning mismatch (star ≠ caution). Later: give star its own token (e.g. reuse `avatar`-style accent or a dedicated `star` token) instead of `text-warning`; not urgent, both values pass contrast.

J. 375 "…" menu, disabled "Leave project" with two-line reason: confirmed tall menu (`project-menu-375-light.png`), but it still fits the 375×812 viewport with no scroll/clip. Not a blocker. Later: a tooltip/popover on a disabled item instead of inline paragraph would read better, but it's more code than the current approach — not cheap, defer.

Fix now (blockers and cheap majors):
- C: add a dimmed backdrop to the desktop flyout so it reads as a layer over the page, not a broken layout — `web/src/widgets/app-shell/sidebar-flyout.tsx` (add `DialogPrimitive.Overlay`, scope to `md:` so the mobile full-screen layer is unaffected).
- D: stop hiding the filled star at rest — `web/src/widgets/app-shell/project-sections.tsx:134`, make `md:opacity-0` conditional on `!project.starred` (or drop the className override when starred).
- E: don't label the lone current-project row "Recent" in Starred-only view — `web/src/widgets/app-shell/project-sections.tsx:245-251` (pass no label / a different label when `view === 'starred'`).
- G: "For you" row takes the active/current styling while a project page is open — `web/src/widgets/app-shell/app-sidebar.tsx:94-96` (exact already set; find why aria-current still matches before changing the class).

Later (noted, not blocking):
- H: wide-sidebar key/name gap — cosmetic spacing at resize widths ≥ ~400px.
- I: star reuses the `warning` token — give it a dedicated token when touched next; contrast is fine today.
- J: disabled "Leave project" two-line reason makes the row menu tall — fits the viewport; revisit if it ever clips on a shorter phone.

## Follow-up cards

- For you Viewed tab lists project rows with the UI-58 context line (view-all target parity).
- Customize sidebar (UI-7, UI-50, UI-66), with SAN-56/57.
- Width and View move to personal settings on the server (UI-52), with SAN-93.
