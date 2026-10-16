# Visual review (SAN-35)

Date: 2026-10-16. Audit of every screen at 1440, 1280 and 375 px against a realistic seed
(scrum project with a running sprint, two future sprints, epics, subtasks, comments, long
summaries; kanban project over its WIP limit; an empty kanban project; a member without admin
rights; a user without projects). Screenshots: `/tmp/santi-35/before/` and `/tmp/santi-35/after/`
(`<screen>-<width>.png`, made by `/tmp/santi-35/shots.mjs` against a private server on 8089).

Checklist: 4/8 px rhythm, alignment, type scale (12/14/16/20/24), hierarchy and density, column
widths, D36 radii/borders/shadows, icon sizes, control states, empty/loading/error states, motion
(150–200 ms ease-out, reduced motion), micro-interactions, contrast (AA), truncation, 375 px.

Status: `fixed` (after shot shows it), `kept` (reviewed, no change, reason given).

## Shared (every screen)

| # | Issue | Status |
|---|---|---|
| S1 | Native selects (filters, issue details, settings, import mapping, create dialog) draw the browser's own chevron and inner padding: four different looks next to santi's buttons. | fixed — one select style in `index.css` (no native arrow, a token-coloured chevron, 32 px end padding), so every `<select>` matches the inputs. |
| S2 | All avatars are the same purple tint: six people in a filter row or a sprint read as one blob; initials clip each other in the overlapping header stack ("AR", "GH" cut in half). | fixed — six avatar tones picked from the name (`avatarTone`, D36 amendment; no teal, which means done), 11 px labels, 6 px overlap instead of 8; the four hand-made initials circles (card, row, row editor, search) now share `AssigneeAvatar`. |
| S3 | No motion guard: dialogs, menus, sheets and the drag lift animate even with *reduce motion* on. | fixed — global `prefers-reduced-motion` rule collapses animation and transition durations (tested). |
| S4 | Dialog and menu motion uses the template's linear default; buttons `transition-all`. | fixed — dialogs and sheets 200 ms (sheets were 300/500 ms), menus, selects and popovers 150 ms, all ease-out; buttons transition colour and shadow only, with a pressed state (primary `#34258F` from D36, outline and ghost the sunken grey). |
| S5 | Dialog close button shows a focus ring as soon as a dialog opens (Radix focuses it; `focus:` instead of `focus-visible:`), and it is a 16 px target. | fixed — `focus-visible` ring, 32 px box (44 px on touch), hover fill. |
| S6 | Dialog headers are centered at 375 px while their bodies are left aligned. | fixed — headers start-aligned at every width. |
| S7 | Ghost buttons and menu hovers use the purple selection tint (`accent`), so hover and "selected" look alike. | fixed — hover uses the D36 hover-row grey (`--hover`, new token mapped from the table), purple tint stays for selection. |
| S8 | Skeletons are purple-tinted and lighter than the column they sit in. | fixed — skeletons use the hover grey; board card skeletons are white boxes with the card border, like real cards. |
| S9 | Menus mix items with and without icons, so labels start at two different x positions. | fixed — every card-menu item has a 16 px icon (Move to, Assign to me, Assign, Set priority). |

## Top bar and sidebar

| # | Issue | Status |
|---|---|---|
| T1 | 375 px: the search field is squeezed to "Search ATLA…", pushing create and avatar to the edge. ui-layout asks for a search icon there. | fixed — below 640 px the field is a 44 px search button; focusing it widens the field across the bar (CSS only, same form and shortcut). |
| T2 | Sidebar active item has a 2 px left bar plus a tint plus a tree guide line one pixel apart: three lines at the same spot. | kept — it is the template's sidebar (`shared/ui/sidebar.tsx`), the overlap reads as one accent at 1x; revisit with the dark theme. |

## Login / register

| # | Issue | Status |
|---|---|---|
| L1 | Password visibility icon shows "eye-off" while the password is hidden. | kept — the icon names the state (hidden), the button has a text label; changing it is a behavior decision. |
| L2 | Card, inputs and type follow the scale; contrast AA. | kept — no issue. |

## Home

| # | Issue | Status |
|---|---|---|
| H1 | With projects, the page has no "New project" action (IA §4 lists it as primary) and no list heading; the list floats under the greeting. | fixed — "Your projects" heading with a New project button on the same line. |
| H2 | Project rows have no hover or focus feedback beyond the cursor. | fixed — hover grey and a focus ring on the row link. |
| H3 | Empty state dashed border is barely visible (border on white 1.26:1). | kept — decorative; the heading, copy and the button carry the state. |

## New project

| # | Issue | Status |
|---|---|---|
| N1 | Layout, radio cards and help text follow the grid. | kept — no issue. |

## Project header (board, backlog, settings, search)

| # | Issue | Status |
|---|---|---|
| P1 | Member stack initials clip (see S2). | fixed |
| P2 | 375 px: members and Invite wrap to a second line pushed to the right edge with a large gap. | fixed — the second line starts at the left under the title. |

## Board

| # | Issue | Status |
|---|---|---|
| B1 | Columns are fixed at 288 px: three columns leave ~270 px empty at 1440 and the board looks unfinished. | fixed — columns flex to share the width, 288 px minimum, 416 px maximum (tested); many columns still scroll sideways inside the board. |
| B2 | 1280 px: the filter row (text, six avatars, Only mine, Type, Label, a 225 px epic select, Recently updated) is wider than the main area; the whole page scrolls sideways by ~60 px. | fixed — the row wraps, the text filter is 160 px and the epic select 144 px wide, so it fits one line at 1280 on the board. |
| B3 | Card footer: the key wraps to two lines ("ATLAS-" / "5") when the subtask count and points are present. | fixed — keys never wrap (`whitespace-nowrap`). |
| B4 | Card hover turns the whole border purple: loud, and purple is the selection colour (D36, one solid purple per view). | fixed — hover lifts the card (control border + small shadow, 150 ms). |
| B5 | Drag: the held card looks identical to a resting card (no lift), only the dashed slot shows. | fixed — the held card gets a larger shadow, a faint primary ring and a grabbing cursor; the slot keeps the dashed primary outline. No tilt: a transform changes the rect dnd-kit measures, and keyboard moves landed in the wrong column. |
| B6 | Loading skeleton: one bar for the filter row, no sprint line, fixed 288 px columns: the board jumps when it lands (D39 CLS 0). | fixed — skeleton mirrors the sprint line, filter row height and the flexing columns. |
| B7 | Low and medium priority glyphs (lucide signal) are 16 px icons whose drawing fills only the lower-left quarter: they read as stray dots. | kept — glyphs are D36 decisions (`signal-low/medium/high`); colour and the `title`/sr text carry the meaning. |
| B8 | 375 px: column header repeats the picked column's name and count shown in the picker just above. | kept — the header holds the WIP badge and the admin menu; removing it on a phone is a layout change for the board card. |
| B9 | WIP badge ("Max 2", amber when over) and empty-column slot read well. | kept — no issue. |
| B10 | 768–1100 px: the shell grew to the board's width (no `min-w-0` on the inset), so the whole page scrolled sideways instead of the board. | fixed — the board scrolls inside its own area (tested at 900 px). |

## Card menu

| # | Issue | Status |
|---|---|---|
| C1 | Items without icons start 24 px left of the ones with icons (S9). | fixed |
| C2 | Menu opens and closes without easing (S4). | fixed |

## Issue dialog and issue page

| # | Issue | Status |
|---|---|---|
| I1 | The summary title sits 10 px right of the key line and the description (the edit button's padding is not compensated). | fixed — negative inline margin equal to the padding, so the text lines up with the column edge. |
| I2 | Details column is a stack of eleven bordered form controls with labels above: reads as a form, not a tracker's detail panel; 900 px tall. | fixed — label left (88 px), value right, 32 px rows, controls borderless until hover or focus (control border then); the column is 19rem instead of 16rem so values do not clip. It is about 45% shorter and scans as a list. Phones keep labels above 44 px bordered controls. |
| I3 | Status is a plain select like the others; IA §4 calls it the issue's primary control. | fixed — the status select wears its category tone (grey / purple / teal chip colours) and weight. |
| I4 | Close `x` shows a focus ring on open and overlaps the Details heading (S5). | fixed — focus-visible only; the details column leaves room for it. |
| I5 | Subtask rows show status as text in a grey box without the category glyph (D36: glyph and text). | fixed — subtasks use `StatusPill`. |
| I7 | 375 px: the page scrolled sideways by 13 px: a long subtask summary (`truncate`) set the min-content of an auto grid track. | fixed — the subtask list and the view use `minmax(0, 1fr)` tracks. |
| I6 | 375 px: single column (UI-28) works; title, fields and comments keep 16 px inputs. | kept — no issue. |

## Create issue dialog

| # | Issue | Status |
|---|---|---|
| D1 | Header centered on a phone (S6), native selects (S1). | fixed |
| D2 | Fields, grid and the "Create another" switch align on 8 px steps. | kept — no issue. |

## Backlog

| # | Issue | Status |
|---|---|---|
| K1 | 1280 px: same filter-row overflow as the board, plus the Epics toggle (B2). | fixed — the toolbar wraps instead of overflowing; at 1280 the Epics toggle takes a second line at the right edge. |
| K2 | The Epics toggle sits 2 px higher than the filter buttons (`items-start`). | fixed — the toolbar centres its items. |
| K3 | 375 px: the assignee avatar drops alone onto a third line under the facts. | fixed — the facts line no longer wraps on a phone; the epic chip truncates first, so the avatar stays on the line. |
| K4 | 375 px: the disabled-start hint is right-aligned under wrapped chips, far from the button it explains. | fixed — the hint starts at the left on a phone, under the header. |
| K5 | Points total is a bare number in a white pill next to the status chips: unclear which is which. | fixed — the total reads "23 pts" (unit in muted, regular weight); the accessible name is unchanged. |
| K6 | Rows (44 px), drop zone, inline create, footer line and epic panel follow the grid; epic progress bars use primary. | kept — no issue. |

## Sprint dialogs (create, edit, start, complete)

| # | Issue | Status |
|---|---|---|
| G1 | Phone header centered (S6); dialog motion (S4). | fixed |
| G2 | Radio list rows are 40 px with 16 px radios; the destination text aligns with the title. | kept — no issue. |

## Search

| # | Issue | Status |
|---|---|---|
| R1 | Result rows lose column alignment: an unassigned row moves its status pill 32 px right, so pills zig-zag down the list. | fixed — status, assignee and time sit in fixed-width slots on wide screens; an empty slot keeps its width. |
| R2 | Filter row starts 4 px inside the content edge (the avatar toggles' padding). | fixed — the toggles' padding is compensated when they open the row. |
| R4 | Keys wrap ("ATLAS-" / "24") next to a long summary; same on backlog rows. | fixed — keys never wrap. |
| R3 | Long summaries truncate to one line on desktop, two on a phone. | kept — no issue. |

## Board settings

| # | Issue | Status |
|---|---|---|
| E1 | The Done column has no grip and arrows, so its name field starts 44 px left of the other columns' fields. | fixed — the Done row reserves the grip slot. |
| E2 | Native selects (S1). | fixed |
| E3 | 375 px: status rows stack name, category and column select loosely. | kept — usable at 44 px targets; a denser phone layout belongs to the settings card. |

## Members

| # | Issue | Status |
|---|---|---|
| M1 | Rows align; the last-admin hint makes the first row taller. | kept — the hint is required copy (IA §9) and sits under the control it explains. |
| M2 | Avatars all purple (S2). | fixed |

## Import

| # | Issue | Status |
|---|---|---|
| U1 | Drop zone border is 2 px dashed control grey: the heaviest line on the page. | fixed — 1 px dashed control border with a 150 ms colour change; primary border and tint while a file is dragged over (unchanged). |
| U2 | "How to export" and "rows with problems" toggles have no chevron: nothing says they open. | fixed — shared `Disclosure` (native details/summary) with a chevron that turns when open. |
| U3 | Mapping row titles are 16 px while every other list title is 14 px. | fixed — 14 px medium. |

## Account

| # | Issue | Status |
|---|---|---|
| A1 | Profile shown as two greyed read-only inputs. | kept — read-only inputs are the template pattern and stay selectable; a definition list is a content change for the account card. |
| A2 | Token form and empty line align. | kept — no issue. |

## 404 / 403 / error

| # | Issue | Status |
|---|---|---|
| X1 | Pages are centered, purple code, one action. | kept — no issue. |
| X2 | Error page (500 on the board) appears only after the query's retries (~7 s) with the skeleton showing meanwhile. | kept — retry policy is behavior (TanStack defaults), not visual. |

## Toasts

| # | Issue | Status |
|---|---|---|
| O1 | Sonner toasts use the template's theme; position bottom-right. | kept — matches D36 surfaces. |

## Totals

| Screen group | Found | Fixed | Kept |
|---|---|---|---|
| Shared | 9 | 9 | 0 |
| Top bar, sidebar | 2 | 1 | 1 |
| Login, register | 2 | 0 | 2 |
| Home | 3 | 2 | 1 |
| New project | 1 | 0 | 1 |
| Project header | 2 | 2 | 0 |
| Board | 10 | 7 | 3 |
| Card menu | 2 | 2 | 0 |
| Issue dialog and page | 7 | 6 | 1 |
| Create dialog | 2 | 1 | 1 |
| Backlog | 6 | 5 | 1 |
| Sprint dialogs | 2 | 1 | 1 |
| Search | 4 | 3 | 1 |
| Board settings | 3 | 2 | 1 |
| Members | 2 | 1 | 1 |
| Import | 3 | 3 | 0 |
| Account | 2 | 0 | 2 |
| 404 / 403 / error | 2 | 0 | 2 |
| Toasts | 1 | 0 | 1 |
| **All** | **65** | **45** | **20** |

"Kept" rows that read "no issue" or "matches D36" are checks that passed (11); the other 9 are real issues left on purpose, each with its reason above.

After shots: no screen scrolls sideways at 1440, 1280 or 375 (the shot script checks `scrollWidth`); before, board, backlog, card menu, drag, issue dialog, sprint dialogs and create dialog did at 1280.
