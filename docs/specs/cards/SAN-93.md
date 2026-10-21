# SAN-93 — Personal settings, slice 1: theme and preferences

Owner 2026-10-20. SAN-93 (8 points) splits into three slices; this brief covers the first. Language (i18n) and security (password change, sessions, tokens tab) get their own child cards.

## Context

- Dark tokens exist in `web/src/app/styles/theme.css` under `[data-theme='dark']` (D36); nothing sets the attribute. The information architecture lists this as the deferred dark-theme item (P10).
- No per-user time zone anywhere: the SPA formats dates with the browser zone in `web/src/shared/lib/sprint-dates.ts`, `web/src/pages/account/account-page.tsx` and `web/src/features/project/join-project.tsx`; the database keeps one global zone (D48). The CLI stays on the machine zone (SAN-125).
- `app_user` has `id, email, display_name, password_hash, created_at, deleted_at`. `GET /api/me` returns `User { id, email, display_name }`; there is no `PATCH`.
- `/account` already holds Profile (read-only), API tokens and Your data; the account menu reaches it through the item "API tokens".
- The server sends `script-src 'self'`: inline scripts are blocked, so the no-flash theme script is a file.

## Scope

Server (slice `auth`, same files as the token endpoints):
- Migration: `app_user.theme text NOT NULL DEFAULT 'system' CHECK (theme IN ('light','dark','system'))`, `app_user.time_zone text NULL` (IANA name; NULL means the browser zone). Down migration drops both.
- `User` gains `theme` and `time_zone`. New `PATCH /api/me { display_name?, theme?, time_zone? }` returns the updated `User`. 422 on an unknown theme, a time zone that `chrono-tz` does not know, or a blank or over-long display name (same bounds as register). Erased accounts answer like any other request from a dead session.
- OpenAPI regenerated; `web/openapi.json` and `schema.d.ts` committed.

Web:
- `web/public/theme.js`, loaded blocking in `index.html` head: reads `localStorage['santi-theme']`, resolves `system` through `prefers-color-scheme`, sets `document.documentElement.dataset.theme` before first paint and keeps following the media query while the choice is `system`. `meta[name=theme-color]` follows.
- `GET /api/me` is the source of truth across devices: when it loads, the theme is mirrored to localStorage and applied; the account page saves through `PATCH /api/me`.
- `/account` Profile becomes editable (display name). New section Preferences: theme and time zone. Saving shows a fixed message of ours on failure, never the server text.
- `web/src/shared/lib/format-date.ts`: one formatter taking the user's zone (or the browser's when null); the three call sites above use it.
- `.size-limit.js` gains the `/account` route at 170 KB.
- Information architecture: account menu item and `/account` rows updated.

Out of this slice: avatar colour, week start, date format (no screen consumes them yet; they come with the calendar and reports), CLI and MCP zones (SAN-125), language, security.

## Decisions

Panel 2026-10-20: product, ux, ia voted (tables below); ux broke the tie on 1. Architect challenge, data and readability: `PATCH /api/me` distinguishes "absent = unchanged" from `"time_zone": null = clear` (double option in the DTO, documented as nullable in OpenAPI); the display name autosaves on blur or Enter, not per keystroke; the zone list comes from `Intl.supportedValuesOf('timeZone')` at runtime (no bundled table); one `PATCH` per field change, no batching.

| # | Question | Options | Winner |
|---|---|---|---|
| 1 | Account menu entry and route | (a) rename "API tokens" to "Account settings", still `/account`, everything on one page; (b) new "Settings" item above "API tokens", new route `/account/settings`, tokens stay where they are; (c) "Settings" item opening `/account` with tabs (Profile, Preferences, API tokens, Your data) | (a), item named "Account": one scroll of four short sections, no tablist to learn or to reset at 375 px (ia, ux; product preferred tabs) |
| 2 | Theme control | (a) three radio cards Light / Dark / System with a small preview swatch; (b) a select; (c) a segmented control (3 buttons) | (c), unanimous: radiogroup with arrow keys, all options visible |
| 3 | Time zone control and default label | (a) a select listing `Intl.supportedValuesOf('timeZone')` with the first option "Browser time zone (America/Sao_Paulo)" reflecting the current browser zone, saved as null; (b) a searchable combobox; (c) text input with validation | (b), unanimous: the searchable picker already used for assignee, sprint and labels; first option "Browser time zone (<zone>)" saved as null |
| 4 | Save model | (a) each field saves on change with an inline "Saved" confirmation; (b) one Save button per section; (c) one Save button for the page | (a), unanimous: inline edit is the only save pattern in santi |
| 5 | Theme preview | (a) choosing a theme applies it immediately, before the save returns; on failure it reverts and shows the error; (b) applies only after the save succeeds | (a), unanimous: attribute flip first, revert with "Could not save your theme." on failure |

## Panel votes

### product

| # | Vote | Reason |
|---|---|---|
| 1 | (c) | Linear and GitHub keep personal settings as tabs on one surface; one route beats a second settings page to learn or a crowded single scroll. |
| 2 | (c) | Segmented control is one click, always visible, no dropdown to open; GitHub's radio cards add visual weight the live preview already gives for free. |
| 3 | (b) | A plain select over ~400 IANA zones is slow to scroll; GitHub and Linear both search timezone, matching the fastest path for a self-hosted team spread across zones. |
| 4 | (a) | Autosave per field with inline confirmation matches Linear/Notion preferences and needs zero extra click beyond the choice itself. |
| 5 | (a) | Instant apply with revert on failure is how Linear/GitHub already feel (theme is just an attribute flip); waiting for a round trip to see dark mode is a regression. |

### ia

| # | Vote | Reason |
|---|---|---|
| 1 | (a) | Disagree with product: `/account` already stacks Profile, tokens and Your data as sections on one page (no tabs), and board Settings does the same (columns, statuses, done window, danger zone on one scroll; a second route only for members, which is a long list). A 4th short section fits the same pattern; tabs would be a new navigation idiom for personal settings alone. Rename the menu item to "Account" so label matches the `/account` URL segment. |
| 2 | (c) | Agree with product. Matches the toggle/tab idiom already in the product (Epics toggle, project header Board/Backlog/Settings tabs): always-visible, one click, no open/close state to track. |
| 3 | (b) | Agree with product. Issue details already use searchable pickers for assignee, sprint and labels; reusing that component for ~400 zones is both faster and consistent, not a new control type. |
| 4 | (a) | Agree with product. Nothing else in santi uses a Save button for a settings form: columns/statuses edit inline, tokens create/revoke immediately. Autosave matches the only pattern that exists. |
| 5 | (a) | Agree with product. The no-flash design already applies the theme locally before the server round trip (localStorage + `theme.js`); instant apply with revert on failure is that same mechanism, not a new one. |

Rows to update once winners are set: 38 (account menu label), 96 and 125 (`/account` content: add Preferences), 244 and 250 (dark theme P10 item: no longer deferred).

### ux

| # | Vote | Reason |
|---|---|---|
| 1 | (a) | One page, menu item renamed "Account": at 375px a tab bar costs a tap plus a scroll-reset per section and needs its own keyboard/ARIA tablist pattern; 4 short sections stay one scroll, one back-swipe, one run of landmarks for a screen reader. |
| 2 | (c) | Segmented control: options visible with zero extra click, native radiogroup semantics, arrow-key switching, fits 375px width with no wrap. |
| 3 | (b) | Searchable combobox reuses the picker already used for assignee/sprint/labels; a flat select of ~400 zones is a long blind scroll, worse at 375px. |
| 4 | (a) | Autosave per field with inline "Saved" needs no extra click and matches every other inline edit in santi; a page Save button risks a lost change if the user navigates away first. |
| 5 | (a) | Instant apply with revert matches the no-flash mechanism already shipping; waiting for a round trip to see dark mode reads as broken on a slow connection, and revert-with-message covers the failure with no confirm dialog. |

## States (ux)

Menu item: label "Account" (was "API tokens"); same route `/account`; active state follows the existing nav item style, no new state.

Profile — display name (text input, inline edit, no section Save):
| State | Behavior |
|---|---|
| Idle | Shows current name, editable on focus (not read-only like email). |
| Editing | Local value only; no save yet. |
| Saving | Autosaves on blur/Enter if changed; input disabled, trailing spinner, no layout shift. |
| Saved | Spinner replaced by a checkmark + "Saved" for 2s, then clears; account menu header name updates immediately. |
| Error | Input re-enabled, value kept, red helper text "Could not save your name." below the field; focus stays in the input. |
| Validation: empty | Blocked before save, helper text "Name is required."; Saving never fires. |
| Validation: too long | Blocked before save at the register bound, helper text "Name is too long."; count shown only past the limit. |

Preferences — Theme (segmented control: Light / Dark / System):
| State | Behavior |
|---|---|
| Idle | Current choice pressed/checked; matches `data-theme` already applied. |
| Selected | New option applies to `document.documentElement.dataset.theme` and localStorage at once, before the request resolves. |
| Applying | PATCH in flight; control stays interactive (switching again just restarts the request with the latest value). |
| Save failed | Theme reverts to the last saved value (DOM + localStorage), the previously-selected segment regains the pressed state, red helper text "Could not save your theme." below the control. |

Preferences — Time zone (searchable combobox):
| State | Behavior |
|---|---|
| Idle | Closed, shows "Browser time zone (<zone>)" when `time_zone` is null, else the saved zone name. |
| Open | Search input focused, full list filtered as typed, current value highlighted. |
| No results | "No time zone matches." row, not focusable, search stays editable. |
| Selected | Closes, shows chosen zone immediately (optimistic), triggers save. |
| Saving | Trailing spinner on the closed control; reopening is still allowed. |
| Saved | Spinner clears; dependent dates (sprint, token, join-project) re-render in the new zone right away. |
| Error | Reverts to the last saved value, red helper text "Could not save your time zone." below the control. |

Keyboard and screen reader:
- Segmented control: `role="radiogroup"` with a label "Theme", each option `role="radio"`; arrow keys move selection and apply it; Tab enters/exits as one stop.
- Combobox: `role="combobox"` + `aria-expanded` + `aria-controls` on the input, listbox options `role="option"`; Esc closes and restores idle text; error/helper text linked via `aria-describedby`.
- Name input: `aria-invalid` and `aria-describedby` pointing at the active helper text while in a validation or error state.
- Focus ring: 2px, brand purple (#4C35D2 light, #8B78E9 dark) offset, never removed by `outline:none`.
- Save of any field never steals focus; focus only moves into an error for the name field (kept there to let retry).

375px layout:
- Theme segmented control and time zone combobox span the full content width, each option/row a 44px tap target.
- Name input and combobox search input use 16px font (no mobile zoom-on-focus).
- Helper/error text wraps under the control, no horizontal scroll, no two-line overflow of the segmented labels (short words: Light / Dark / System).

Dark variant (D36 dark tokens):
- Surfaces: control and combobox panel on `#1A1918` (card), popover/listbox on `#262422` (raised), border `#262422` lightened per D36 border token; canvas stays `#0F0F0E`.
- Selected segment / selected option: purple tint using `#8B78E9`, pressed state `#B8ABF1`; same tokens as the active nav item in dark.
- Error text and helper text keep the shared destructive/muted tokens already used for the delete-account and token errors, unchanged between themes.

## Acceptance

- Theme: choosing Dark sets `data-theme=dark` on the root with no flash on reload (the first paint already carries the attribute); System follows the OS and reacts to an OS change while the page is open; the choice survives a sign-out and sign-in on another browser (comes from the server).
- Time zone: with `Pacific/Auckland` saved, sprint dates on the backlog, the token creation date and the join-project date render in that zone; with the browser option, in the browser zone.
- Profile: the display name updates in the account menu header right after saving.
- API: `PATCH /api/me` with `{ "theme": "blue" }`, `{ "time_zone": "Mars/Olympus" }` or `{ "display_name": "" }` → 422 naming the field; a valid patch returns the whole `User`; `GET /api/me` reflects it.
- Every screen reviewed in dark at 1440 and 375 by ux from screenshots: board, backlog, issue, reports, account, login. Contrast of text and focus rings meets AA on the D36 dark surfaces.
- `/account` within the 170 KB route budget; `pnpm typecheck`, `pnpm lint`, `pnpm test:coverage` (> 90 %), server gate green.
