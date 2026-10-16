# SAN-70 — Archive, trash and leave a project

Owner: inside the project there must be the option to archive or delete it; santi offers it even where the reference keeps it on paid plans. Baseline: `behavior/organizations.md` OR-47, OR-50..OR-67. Leaving a project already exists (members page, last-admin guard `last-admin`).

## Questions

| # | Question | product | ux | ia | Winner (architect) |
|---|---|---|---|---|---|
| 1 | Who | project admins: trash, archive, restore, purge | admins; members only Leave | — | **Project admins** do everything (no tracker-admin tier until SAN-64). |
| 2 | Trash window | 60 days, early purge | type key for trash and purge | — | **60 days** (OR-58), purge early by an admin; both type the project key to confirm. |
| 3 | Archived | read-only for all, hidden from lists/search/pickers, open by link, sprints frozen | banner + controls `aria-disabled` in place | archived → read-only, trashed → 404 | **Archived:** every write answers 409 `project-archived` (issues, comments, sprints, board settings, members, imports, stars stay allowed); hidden from sidebar, For you, search, pickers and `/api/projects` lists; opens by link read-only with a banner (Unarchive for admins). **Trashed:** answers 404 to everyone (OR-54), even admins, except the trash list and restore/purge. |
| 4 | Where listed | Trash + Archived tabs on /projects | tabs, reuse the table | `/projects?tab=archived|trash` | **Tabs on `/projects`** with `?tab=`. Archived: name, key, archived when/by, Unarchive. Trash: name, key, trashed when/by, days left, Restore, Delete forever. Only projects where the caller is admin. |
| 5 | Danger zone | — | end of Settings, rows label/desc + button | Settings + SAN-91 menu | **Danger zone at the end of project Settings**: Archive (outline), Delete project (destructive: "moves to trash for 60 days"), Leave project (outline, all members; disabled with the reason for the last admin). SAN-91's menu reuses the same dialogs. |
| 6 | After the action | — | land on /projects, toast with Undo 8 s | — | **Land on `/projects`**, toast "Moved SAN to trash" / "Archived SAN" with **Undo** for 8 s (restore / unarchive). |
| 7 | Key and name | reserved while trashed/archived | — | — | **Reserved** until purge (OR-60): creating a project with that key answers 409 naming the trashed/archived project. |
| 8 | Words | — | — | UI "Delete project"; API/CLI archive, unarchive, trash, restore, purge | **API:** `POST /api/projects/{key}/archive`, `/unarchive`, `/trash`, `/restore`, `DELETE /api/projects/{key}` (purge, trashed only); `GET /api/projects?state=archived|trashed`. **CLI:** `santi projects archive|unarchive|trash|restore|purge <KEY>`. **MCP:** same verbs as tools, purge marked destructive. |

## Acceptance

- Migration: `project.archived_at`, `archived_by`, `trashed_at`, `trashed_by` (nullable), never both set; reversible; indexes only where a query uses them (EXPLAIN, D39).
- One guard in the member extractor/service decides active / archived (read-only) / trashed (404), so no endpoint can forget it; tests per endpoint family.
- Purge: a timer next to the existing prune task (main.rs) deletes projects trashed more than 60 days ago, with everything they own; purge by API does the same at once.
- Account export (D45) lists archived and trashed projects the user administers with their state.
- Web states: empty tabs, network error inside dialogs (dialog stays open), last admin cannot leave (button disabled + reason), non-admins never see Archive/Delete, archived banner with `role="status"`, phone 375px (rows stack, 44px targets).
- `information-architecture.md` updated (tabs, danger zone, banner, API rows).
