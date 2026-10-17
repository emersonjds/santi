# SAN-91 — Project row in the sidebar: expand and actions

Owner: a dropdown on the project name in the sidebar; Archive and Delete also reachable there (SAN-70 note).

## Questions

| # | Question | product | ux | ia | Winner (architect) |
|---|---|---|---|---|---|
| 1 | Expand | separate caret toggles, name navigates | own `<button>` before the link, `aria-expanded` + `aria-controls` | per-project, current open | **Chevron button toggles** any project's Board/Backlog/Settings; the name still navigates. Current project open by default; the choice is kept per project in `localStorage` (`sidebar-expanded:<KEY>`, read/write in try/catch). |
| 2 | Menu items | drop Board/Backlog; Copy link, Star, Settings, then Archive/Delete | four card items, no destructive | Board, Backlog, Settings, Copy link, Archive, Delete; Leave for members | **"…" menu: Copy link, Settings, separator, Archive project and Delete project (admins, active projects; reuse the SAN-70 dialogs, opened from `onSelect` with controlled state), Leave project (everyone; same rules as the danger zone).** Board/Backlog stay as sub-links (chevron). Star waits for SAN-73 (the sidebar list has no star state). |
| 3 | Many projects | recent + View all, but in SAN-73 | — | list all now, SAN-73 later | **List all** for now; recents and "View all projects" belong to SAN-73. |
| 4 | Phone | bottom sheet | dropdown via `SidebarMenuAction` | — | **Dropdown** (the sidebar is already a drawer on phone; no sheet on top of a sheet). Key text hidden below `md`; chevron and "…" reach 44px. |
| 5 | Settings for members | — | — | yes (danger zone has Leave) | **Settings sub-link for everyone** (SAN-70 opened Settings to members). |

## Acceptance

- Tab order per row: chevron → name → "…". Focus returns to "…" after a dialog closes.
- "…" visible on hover/focus-within on desktop, always on phone.
- Copy link copies `<origin>/p/<KEY>` and confirms with a toast.
- Loading: skeleton rows without buttons. Long names truncate; buttons keep their width.
- `information-architecture.md` sidebar section updated.
