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

Panel 2026-10-20: product, ux, ia vote; architect challenges. Winner column filled after the vote.

| # | Question | Options | Winner |
|---|---|---|---|
| 1 | Account menu entry and route | (a) rename "API tokens" to "Account settings", still `/account`, everything on one page; (b) new "Settings" item above "API tokens", new route `/account/settings`, tokens stay where they are; (c) "Settings" item opening `/account` with tabs (Profile, Preferences, API tokens, Your data) | |
| 2 | Theme control | (a) three radio cards Light / Dark / System with a small preview swatch; (b) a select; (c) a segmented control (3 buttons) | |
| 3 | Time zone control and default label | (a) a select listing `Intl.supportedValuesOf('timeZone')` with the first option "Browser time zone (America/Sao_Paulo)" reflecting the current browser zone, saved as null; (b) a searchable combobox; (c) text input with validation | |
| 4 | Save model | (a) each field saves on change with an inline "Saved" confirmation; (b) one Save button per section; (c) one Save button for the page | |
| 5 | Theme preview | (a) choosing a theme applies it immediately, before the save returns; on failure it reverts and shows the error; (b) applies only after the save succeeds | |

## States (ux)

Filled by the ux agent: every state of the Preferences section and the editable Profile at 1440 and 375, light and dark.

## Acceptance

- Theme: choosing Dark sets `data-theme=dark` on the root with no flash on reload (the first paint already carries the attribute); System follows the OS and reacts to an OS change while the page is open; the choice survives a sign-out and sign-in on another browser (comes from the server).
- Time zone: with `Pacific/Auckland` saved, sprint dates on the backlog, the token creation date and the join-project date render in that zone; with the browser option, in the browser zone.
- Profile: the display name updates in the account menu header right after saving.
- API: `PATCH /api/me` with `{ "theme": "blue" }`, `{ "time_zone": "Mars/Olympus" }` or `{ "display_name": "" }` → 422 naming the field; a valid patch returns the whole `User`; `GET /api/me` reflects it.
- Every screen reviewed in dark at 1440 and 375 by ux from screenshots: board, backlog, issue, reports, account, login. Contrast of text and focus rings meets AA on the D36 dark surfaces.
- `/account` within the 170 KB route budget; `pnpm typecheck`, `pnpm lint`, `pnpm test:coverage` (> 90 %), server gate green.
