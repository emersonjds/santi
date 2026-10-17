# SAN-95 — Card footer: points and priority in purple, editable on the card

Owner, 2026-10-16: on the reference board, story points and priority stand out by color; in santi they are purple. The card description fixed the glyphs, the colors and the inline edits, so no panel ran (no open UX question). Cross-cutting part: D47.

## Decisions

| # | Question | Winner |
|---|---|---|
| 1 | Priority glyphs | lucide `ChevronsUp` urgent, `ChevronUp` high, `Equal` medium, `ChevronDown` low. Glyph shape tells the priority; color only reinforces it. |
| 2 | Priority colors (D47) | urgent `--priority-urgent` (light #4C35D2 7.64:1 on white, dark #B8ABF1 7.46:1 on card), high `--priority-high` (#8B78E9 both themes: 3.52:1 on white, 4.39:1 on dark card), medium `text-muted-foreground`, low `text-subtle-foreground`. Red leaves the priorities; bug type keeps its red. |
| 3 | Points pill | Always shown on board cards (`–` when empty), `--points` on `--points-bg` (light #3F2CB0 on #ECE8FB 7.96:1, dark #C4B8F5 on #2C2075 7.34:1). Same pill on backlog rows. Tooltip "Story points". |
| 4 | Points edit | The pill is a button; click, Enter or Space swaps it for a number field: Enter or blur saves, Esc cancels, empty clears. Optimistic with rollback (the backlog row's `RowPoints` behavior). |
| 5 | Priority edit | The glyph is the visible face of a native `<select>` laid over it (the `RowAssignee` pattern): keyboard and phone get the platform menu, no menu chunk to load. Options show the priority names. |
| 6 | Where | Board card and backlog row get both editors; issue detail shows the glyph beside its priority field; every other `PriorityGlyph` (reports) picks up the new glyphs. Search and home lists have no priority today. |
| 7 | Read-only | Viewer or archived project (SAN-104 `WriteLock`): static pill and glyph, no button, no select. |

## Acceptance

- Each priority renders its own glyph and token in light and dark; `aria-label`/`title` "<Name> priority"; icon contrast ≥ 3:1 on the card surface.
- Points pill visible on every board card, `–` when empty; label "Add points to SAN-1" or "3 points"; title "Story points".
- Inline points: Enter saves, Esc restores and sends nothing, invalid or negative sends nothing; the card shows the new value before the response and rolls back on error.
- Inline priority: choosing an option saves it with the same optimism and rollback; the select has `aria-label` "Priority of SAN-1".
- Clicking pill or glyph neither opens the issue nor starts a drag; keyboard focus reaches both after the summary link.
- Editing one card does not re-render the other cards of the column (memoized card, D39 INP).
- States: 375px (44px touch targets kept through the hit area, no horizontal scroll), 1440px, light and dark, keyboard focus ring, read-only project.
