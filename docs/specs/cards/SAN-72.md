# SAN-72 — For you home

Panel run after the first build (the card predates the panel). Baseline: `information-architecture.md` home rows and the reference home mapped by REA.

## Questions

| # | Question | product | ux | ia | Winner (architect) |
|---|---|---|---|---|---|
| 1 | Page name | For you | For you | Home everywhere | **For you** on the heading and the sidebar entry; route stays `/`. One name, matching the reference. |
| 2 | "N open issues assigned to you" | link | text (card is one link) | link | **Link** to `/p/{key}/board?assignee=<me>`. The card stops being one big link: the project name is the card's link, stretched over the card, and the count is its own link above it, so no nested anchors. |
| 3 | Recommended mix, done included | keep | keep, but done rows look open | keep | **Keep**, and every row shows a status chip; done rows use the done style (D36 teal, muted summary). |
| 4 | Lead = oldest admin | drop column | keep | keep | **Keep**: deterministic, no schema; becomes the real lead when a lead field exists. |
| 5 | Repeat view within a minute | always bump | keep throttle | n/a | **Keep throttle**: write amplification and the D39 budget; ordering jitter avoided. |
| 6 | Star inside the issue view | add now | not needed | add now | **Add now** (parity): star toggle in the issue header, same `/api/me/stars`. Sidebar Starred/Recent stays in SAN-73. No overflow tab while there are 5 tabs. |

Screenshot review (ux): an unstarred project star is invisible at rest on desktop — show it muted at rest, full color on hover/focus. Dark theme screenshots wait for SAN-93.

## Acceptance

- Heading and sidebar entry read "For you".
- Project card: name link covers the card; the assigned count is a separate link opening the board filtered to me; keyboard order name → star → count.
- Issue rows show a status chip; done rows are visibly done.
- Unstarred stars visible (muted) at rest on desktop and phone.
- Issue view header has a star toggle (aria-pressed, optimistic with rollback), reflected in the Starred tab.
- States unchanged from the build: empty per tab, skeletons, error with retry, Show more, 375px without sideways scroll.

## Out of scope

Sidebar Starred and Recent (SAN-73); dark theme (SAN-93).
