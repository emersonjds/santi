# Scrum board — behavior spec

Card: SAN-12. Phase: documented only (public product docs). Live observation pending.

## Purpose

The Scrum board is the team's daily view of the running sprint: issues as cards laid out in
columns that stand for workflow phases, moved left to right as work progresses.

## Entities and attributes

- **Board**: name, type (scrum), owning project, ordered list of columns, quick filters,
  swimlane method, per-viewer display preferences.
- **Column**: name, position, set of mapped statuses, optional min/max issue count.
- **Status**: name, category (todo, in_progress, done); mapped to one column or to none.
- **Card**: projection of an issue: key, summary, type, priority, assignee, estimate, parent,
  subtask nesting.
- **Sprint**: only the active one feeds the board (lifecycle: SAN-15).
- **Quick filter**: name, predicate, position; toggled per viewer.
- **Swimlane**: horizontal group derived from the chosen method.
- **Rank**: total order of issues; cards inside a column follow it (ranking: SAN-14).

## Sources

- [S1] https://support.atlassian.com/jira-software-cloud/docs/configure-columns/
- [S2] https://support.atlassian.com/jira-software-cloud/docs/what-is-a-jira-software-board/
- [S3] https://support.atlassian.com/jira-software-cloud/docs/use-active-sprints/
- [S4] https://support.atlassian.com/jira-software-cloud/docs/move-or-transition-issues-in-an-active-sprint/
- [S5] https://support.atlassian.com/jira-software-cloud/docs/transition-an-issue/
- [S6] https://support.atlassian.com/jira-software-cloud/docs/configure-quick-filters/
- [S7] https://support.atlassian.com/jira-software-cloud/docs/show-or-hide-issues-on-your-board/
- [S8] https://support.atlassian.com/jira-software-cloud/docs/configure-swimlanes/
- [S9] https://support.atlassian.com/jira-software-cloud/docs/enable-sprints/
- [S10] https://support.atlassian.com/jira-software-cloud/docs/assign-statuses-and-edit-columns-in-a-team-managed-project/
- [S11] https://support.atlassian.com/jira-software-cloud/docs/create-edit-and-delete-work-items-on-the-board/
- [S12] https://support.atlassian.com/jira-software-cloud/docs/customize-your-view-of-the-board-and-backlog/
- [S13] https://support.atlassian.com/jira-software-cloud/docs/customize-cards/
- [S14] https://support.atlassian.com/jira-software-cloud/docs/configure-a-company-managed-board/
- [S15] https://support.atlassian.com/jira-software-cloud/docs/use-parallel-sprints/

## Rules

Columns and status mapping
- SB-1 A new scrum board starts with three columns (to do, in progress, done), each mapped to the status of the same name. `documented` [S1][S10]
- SB-2 A column can hold several statuses; a status lives in exactly one column or in the unmapped pool. Moving a status between columns is a reassignment. `documented` [S1][S10]
- SB-3 Issues whose status is unmapped are hidden from both the board and the backlog. A newly created status starts unmapped. `documented` [S1][S10]
- SB-4 Admins add, rename, reorder and delete columns. Deleting a column sends its statuses back to the unmapped pool. `documented` [S1]
- SB-5 With the simplified workflow, adding a column also creates a status of the same name with a chosen category. `documented` [S1]
- SB-6 A status can be deleted only when no issue currently holds it. `documented` [S1]
- SB-7 Position decides meaning: the leftmost column is always treated as not started and the rightmost as finished; anything between is in progress. `documented` [S1][S2]
- SB-8 Only issues in the rightmost column count as complete when a sprint closes; every other column counts as open work and is carried over. `documented` [S1][S9]

What the board shows
- SB-9 An issue appears on the board only if all hold: its status is mapped, it belongs to the active sprint, and it matches the board's scope (the project). `documented` [S3]
- SB-10 With no active sprint the board shows no issues; new issues land in the backlog. Starting a sprint brings its issues onto the board. `documented` [S9]
- SB-11 While a sprint runs, the board header carries the sprint name, its goal and the time left. `documented` [S9]
- SB-12 Inside a column, cards follow rank order. `documented` [S8]
- SB-13 Subtasks are shown nested under their parent, whatever the subtask's status. `documented` [S3][S11]
- SB-14 Turning sprints on for a project sends every board issue to the backlog, status unchanged. Turning them off keeps the running sprint's issues on the board. `documented` [S9]
- SB-15 Optional mode allows several active sprints at once (parallel sprints). `documented` [S15]

Moving cards
- SB-16 Dragging a card to another column changes the issue's status. `documented` [S4][S5]
- SB-17 When the target column holds several statuses, it splits into one drop zone per status while the card hovers; the drop zone picks the status. `documented` [S5]
- SB-18 A move is refused when the workflow forbids that transition (conditions, per-type restriction); an error is shown and the card stays. `documented` [S5]
- SB-19 Moving a card does not change its assignee. `documented` [S5]
- SB-20 Dragging within a column re-ranks the issue; a context action sends it to the top or bottom of that column. `documented` [S4]
- SB-21 Several cards can be selected (toggle or range) and moved together. `documented` [S4]
- SB-22 Moving the last open subtask to the done column prompts to also finish the parent. `documented` [S5]
- SB-23 An issue can be created inline in a column and takes that column's status; subtasks cannot be created this way. `documented` [S11]

Quick filters
- SB-24 Quick filters narrow which cards are visible; they never change the issues. `documented` [S6][S7]
- SB-25 Built-in filters: by assignee (pick one or more people), by parent/epic, by label, by type. Each appears only once the project has data for it. `documented` [S7]
- SB-26 Company-managed boards also ship two predefined filters (assigned to the viewer; updated in the last day) and let admins add, rename, reorder and delete query-based ones. `documented` [S6]
- SB-27 Which quick filters a viewer has on, and which card fields they display, is per viewer. `documented` [S12]

Column limits, swimlanes, cards
- SB-28 Columns may carry a min and/or max issue count; breaching it only flags the column. Counts include cards hidden by quick filters; subtasks may be excluded. `documented` [S1]
- SB-29 Swimlane methods: none, by query (ordered, with an undeletable catch-all lane last), by parent story, by assignee (unassigned group above or below), by epic (others below), by project. `documented` [S8]
- SB-30 Card shows summary first, then type, key, priority, assignee and estimate; admins may add up to three extra fields. `documented` [S13]
- SB-31 Optional age indicator shows days spent in the current column, cumulative across revisits; off by default for scrum. `documented` [S13]
- SB-32 Deleting a board never deletes its issues. `documented` [S14]

## States and transitions

| Board state | Trigger | Result |
|---|---|---|
| No active sprint | sprint started (SAN-15) | sprint issues placed in columns by status |
| Active sprint | card dropped on other column/zone | status changes; rank kept or set by drop point (OQ-6) |
| Active sprint | card dragged within column | rank changes, status unchanged |
| Active sprint | issue added to/removed from sprint | card appears/disappears |
| Active sprint | sprint completed | rightmost-column issues stay done; the rest move per SAN-15; board empties |

Card position = (column of its status, rank within column, swimlane).

## Edge cases

- Status mapped nowhere: issue in the sprint becomes invisible yet still counts as open (SB-3, SB-8).
- Done-category status placed in a middle column is not counted complete (SB-7, SB-8).
- Column with zero statuses: behavior not documented (OQ-8).
- Quick filter hides cards but column limits still count them (SB-28).
- Subtask in sprint whose parent is outside it (OQ-10).

## Proposed v1 cut for santi

Adopt: SB-1, SB-2, SB-3, SB-4, SB-5 (adding a column may create a status), SB-6, SB-7, SB-8,
SB-9 (scope = the board's project), SB-10, SB-11, SB-12, SB-13, SB-16, SB-17, SB-19, SB-20,
SB-21 via CLI/MCP batch only, SB-23, SB-24, SB-25 (assignee, type, label, plus free text), SB-27, SB-32.

Drop:
- SB-18: transitions are free; any mapped status is a valid target.
- SB-14: sprints are always on for a scrum board.
- SB-15: at most one active sprint per board.
- SB-26: no query language; no predefined or admin-defined filters.
- SB-28: limits are Kanban-only in v1.
- SB-29: no swimlanes in v1.
- SB-22, SB-30 extra fields, SB-31, card colors: later.

Column-category rule for santi: since each status has a category, v1 counts an issue done at
sprint close when its status category is `done` and requires the rightmost column to hold only
`done` statuses, so position and category never disagree (needs confirmation, OQ-4).

## Open questions (live observation)

- OQ-1 Unmap a status that an issue in the active sprint holds. Watch: does the card vanish from board and backlog, and is it listed as open when completing the sprint?
- OQ-2 With no active sprint, open the board in a company-managed and a team-managed project. Watch: empty state, any prompt or link to the backlog.
- OQ-3 Turn on two quick filters (assignee + type), then two assignees. Watch: is the result the intersection or the union in each case?
- OQ-4 Map a done-category status into a middle column, put an issue in it, complete the sprint. Watch: counted complete or carried over?
- OQ-5 Drag a card into a column with two statuses and release over the column header or a gap. Watch: refused, default status, or prompt?
- OQ-6 Drop a card in a new column between two cards. Watch: does it keep its rank or take the drop position? Check the backlog order afterwards.
- OQ-7 Re-rank a card inside a column. Watch: does the backlog order change the same way?
- OQ-8 Remove every status from a column. Watch: can it stay, and does it accept drops?
- OQ-9 Delete a column whose statuses hold sprint issues. Watch: where do those issues go, is there a warning?
- OQ-10 Put a subtask in the sprint without its parent. Watch: how and where is it drawn?
- OQ-11 Create an issue inline on the board during a sprint. Watch: is it added to the active sprint automatically, at which rank?
- OQ-12 Move a parent with open subtasks to the done column. Watch: prompt, block, or silent move?
- OQ-13 Reload the page and log in as another member after toggling a quick filter. Watch: is the toggle remembered, and for whom?
- OQ-14 Look at column headers with no limits set. Watch: is a card count shown?
