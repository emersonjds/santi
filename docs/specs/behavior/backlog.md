# Backlog and ranking — behavior spec

Card: SAN-14. Phase: documented only (public product docs). Live observation pending.

## Purpose

The backlog is the planning view of a scrum project: every open issue in one ranked list,
split into one section per open sprint plus a final section for issues in no sprint. Rank
is the single order that both the backlog and the board read.

## Entities and attributes

- **Backlog section**: either a sprint (active or future) or the no-sprint section; holds a
  ranked slice of issues and an estimate total.
- **Rank**: total order of issues; each section and each board column shows its issues in
  that order (SB-12, KB-9).
- **Selection**: a set of rows picked by toggle, range or checkbox; target of bulk moves.
- **Epic panel**: optional per-viewer side list of epics used to filter and to set parents.
- **Estimate**: board-level statistic (story points, time, or plain issue count).

## Sources

- [B1] https://support.atlassian.com/jira-software-cloud/docs/use-your-scrum-backlog/
- [B2] https://support.atlassian.com/jira-software-cloud/docs/rank-an-issue/
- [B3] https://support.atlassian.com/jira-software-cloud/docs/enable-ranking/
- [B4] https://support.atlassian.com/jira-software-cloud/docs/create-a-work-item-and-a-subtask/
- [B5] https://support.atlassian.com/jira-software-cloud/docs/edit-multiple-issues-at-once-from-the-backlog/
- [B6] https://support.atlassian.com/jira-software-cloud/docs/add-issues-to-an-active-sprint/
- [B7] https://support.atlassian.com/jira-software-cloud/docs/plan-a-sprint/
- [B8] https://support.atlassian.com/jira-software-cloud/docs/create-sprints-in-company-managed-projects/
- [B9] https://support.atlassian.com/jira-software-cloud/docs/reorder-a-sprint-in-a-company-managed-project/
- [B10] https://support.atlassian.com/jira-software-cloud/docs/manage-epics-in-a-scrum-project/
- [B11] https://support.atlassian.com/jira-software-cloud/docs/manage-epics-in-team-managed-projects/
- [B12] https://support.atlassian.com/jira-software-cloud/docs/customize-your-view-of-the-board-and-backlog/
- [B13] https://support.atlassian.com/jira-software-cloud/docs/configure-estimation-and-tracking/
- [B14] https://support.atlassian.com/jira-software-cloud/docs/enable-estimation/
- [B15] https://support.atlassian.com/jira-software-cloud/docs/what-are-story-points/
- [B16] https://support.atlassian.com/jira-software-cloud/docs/estimate-an-issue/

## Rules

What the backlog shows
- BL-1 Sections are stacked: open sprints first (active, then future ones in their planned order), the no-sprint section last. Closed sprints are not shown. `documented` [B1][B7][B8][B9]
- BL-2 An issue is listed only if all hold: it is not a subtask row, it matches the board scope, its status is mapped (SB-3) to a column other than the rightmost, and at least one status sits beyond the first column (as KB-5; source wording is ambiguous, OQ-5). `documented` [B1]
- BL-3 Subtasks nest under their parent; a per-viewer toggle expands every parent or collapses to parent rows only. `documented` [B1][B12]
- BL-4 Backlog vs board: the board shows only the active sprint, done column included (SB-9); the backlog shows every open sprint and the no-sprint pool, minus done-column issues. `documented` [B1][B7]

Rank
- BL-5 Rank is one order shared by board and backlog; re-ranking in either view changes the issue's relative place in its column and swimlane too. `documented` [B2]
- BL-6 Rank is managed inside a section, not across sections: an issue moved into an empty sprint keeps its rank value; moved into a non-empty one, it is placed relative to that sprint's issues at the drop point. `documented` [B2]
- BL-7 Dragging a row re-ranks it; a context action sends it to the top or bottom of the backlog (on the board, of the column, SB-20). `documented` [B1][B2]
- BL-8 A selection (toggle, range, checkbox) can be sent to the top or bottom of the backlog, or into a sprint, in one action. `documented` [B1][B2][B5]
- BL-9 Ranking a parent carries its subtasks; a subtask is ranked only among its siblings. `documented` [B2]
- BL-10 Drag-ranking needs the board ordered by rank; a board ordered by another field places moved issues by that field. Ranking also needs edit and schedule rights on the issue. `documented` [B2][B3]
- BL-11 The rank field is one instance-wide field shared by every project and board. `documented` [B3]

Sprints in the backlog
- BL-12 Sprints are created from the no-sprint section; several future sprints may exist. Only future sprints can be reordered (up, down, top, bottom); active and closed ones are fixed. `documented` [B8][B9]
- BL-13 Dragging a row into another section changes its sprint (or clears it). Dragging a sprint's lower divider pulls or releases the adjacent rows in bulk. `documented` [B1][B6]
- BL-14 Issues can be added to or removed from the active sprint from the backlog; each change counts as scope change. `documented` [B1][B6][B7]
- BL-15 Future sprints can be planned while one runs, but not started until it completes (unless SB-15). Start and completion: SAN-15. `documented` [B1][B7]

Creating and editing
- BL-16 An issue created from the global create action lands at the top of the backlog, or right below the selected row; if a sprint is chosen, at the bottom of that sprint. Same as KB-20. `documented` [B1][B4]
- BL-17 Inline create sits at the foot of each future sprint and of the no-sprint section; a multi-project board falls back to the full create form. `documented` [B1][B4]
- BL-18 Splitting an issue makes a linked copy of the same type with most fields, minus comments, history and work log, status reset to the workflow's first step; it goes to the no-sprint section, or to a chosen section when split from a sprint. `documented` [B1][B4]
- BL-19 Summary, assignee, estimate, parent and priority are editable on the row. Bulk edit covers parent, assignee, priority, estimate and labels (50 issues per action) and status, grouped per workflow. `documented` [B1][B5]

Epics
- BL-20 The epic panel lists epics and offers epic creation; dropping a row on an epic sets its parent, dropping it on the no-parent slot clears it; selecting an epic filters the backlog to its children. `documented` [B1][B10][B11]
- BL-21 An issue has at most one parent. Marking an epic done from the panel sets a separate epic flag only; its status and children are untouched. `documented` [B10][B11]

Estimation
- BL-22 The board picks one statistic: story points, time, or none (issue count). Team-managed projects start with estimation off. `documented` [B13][B14]
- BL-23 Story points are numbers, decimals allowed; by default only stories and epics carry them, subtasks never. `documented` [B1][B14][B15]
- BL-24 Each sprint section shows the total estimate of its issues; the sprint also shows avatars of assignees with a per-person load. `documented` [B1][B6][B14]
- BL-25 Subtask time estimates roll up to the parent; adding a subtask to an issue already in the active sprint is scope change. `documented` [B16]

View
- BL-26 View settings are per viewer: epic and version panels, quick filters as buttons, density, visible row fields. Quick filters behave as SB-24 to SB-27. `documented` [B1][B12]

## States and transitions

| Issue location | Trigger | Result |
|---|---|---|
| No-sprint section | dropped/sent into a sprint | sprint set; rank kept if sprint empty, else set by drop point (BL-6) |
| Future or active sprint | dropped into no-sprint section | sprint cleared; rank by drop point |
| Any section | dragged within section / top / bottom | rank changes, sprint unchanged |
| Active sprint | status moved to rightmost column | leaves the backlog, stays on board (BL-2, OQ-4) |
| Active sprint | sprint completed | open issues go to backlog or a future sprint (SAN-15) |

Row position = (section of its sprint, rank within section, nesting under parent).

## Edge cases

- Empty target sprint: the moved issue keeps its rank, so it may sit far from its neighbors in the global order (BL-6).
- Board ordered by a non-rank field: drag-ranking has no lasting effect (BL-10).
- Subtask whose parent is in another sprint (OQ-10, see SB OQ-10).
- Quick filter hides rows between two visible ones; where a drop lands is undocumented (OQ-11).

## Proposed v1 cut for santi

Adopt: BL-1 (future sprints in creation order), BL-2 (hide issues whose status category is `done`,
equivalent under the SB cut), BL-3, BL-4, BL-5, BL-6, BL-7, BL-8 via CLI/MCP batch only (as SB-21),
BL-9, BL-13 (no divider drag), BL-14, BL-15 (one active sprint), BL-16, BL-17, BL-19 (row edit; bulk via
CLI/MCP), BL-20, BL-21 (one parent only), BL-23, BL-24 (point totals only), BL-26 (epic panel, quick filters, fields).

Rank for santi: one total order per project, stored as a fractional index; every move (drag, top,
bottom, section change) writes only the moved issue's key, placed between its new neighbors. Sections
and board columns are filtered projections of that order. Inline create (proposal, OQ-1): lands at the
bottom of its section, type Story, status the project's first `todo`-category status, sprint = that section.
Epics are not backlog rows; they live in the panel (proposal, OQ-6).

Drop:
- BL-10: the board is always ordered by rank; any project member may rank.
- BL-11: rank is per project, not shared across projects.
- BL-12 reordering of future sprints: later.
- BL-18 split, BL-21 separate epic flag (epic done = `done`-category status), version panel: later or never.
- BL-22: story points only; no time statistic or issue-count mode.
- BL-24 assignee load, BL-25 time roll-up: no time tracking in v1.

## Open questions (live observation)

- OQ-1 Create inline at the foot of a future sprint and of the no-sprint section, with and without a selected row. Watch: rank of the new issue, default type and status, sprint assigned.
- OQ-2 Select three non-adjacent rows and send them to the top. Watch: is their relative order kept?
- OQ-3 Drag an issue into a non-empty sprint, then back to the no-sprint section. Watch: does it return to its old place or stay at the drop point?
- OQ-4 Move an active-sprint issue to the rightmost board column. Watch: does it leave the sprint section of the backlog, and does the sprint total change?
- OQ-5 Map statuses to the first and a middle column only, leaving the rightmost empty. Watch: does the backlog still list issues?
- OQ-6 Open the backlog with epics in the project and the panel closed. Watch: are epics listed as rows?
- OQ-7 Open the epic panel. Watch: what each entry shows (child count, point total, progress).
- OQ-8 Mix estimated, unestimated and subtask issues in a sprint. Watch: which totals the sprint shows (split by status category?) and whether subtasks or blanks count.
- OQ-9 Look at the no-sprint section header. Watch: is an issue count or estimate total shown?
- OQ-10 Drag a parent with subtasks into a sprint, then try to move one subtask alone. Watch: do subtasks follow, can one sit in another sprint?
- OQ-11 With a quick filter hiding rows, drop an issue between two visible rows. Watch: does it land above or below the hidden ones?
- OQ-12 Re-rank on the board, then reload the backlog (pairs with SB OQ-7). Watch: same relative move in the backlog?
