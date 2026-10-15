# Kanban board — behavior spec

Card: SAN-13. Phase: documented only (public product docs). Live observation pending.
Shared mechanics are referenced by Scrum board rule id (SB-n, `scrum-board.md`).

## Purpose

The Kanban board shows a continuous flow of work: no sprints, cards pulled from left to
right, columns capped to keep work in progress small, finished work leaving the board on its own.

## Entities and attributes

- **Board**: as in the Scrum spec, type `kanban`, plus a board-wide limit counting mode,
  a done-hiding window and an optional sub-filter.
- **Column**: as in the Scrum spec; min/max limit is the core feature here, not an extra.
- **Kanban backlog**: optional list view fed by one status slot outside the board columns.
- **Version**: named release grouping finished issues (company-managed only).
- **Card**, **Status**, **Quick filter**, **Rank**: as in the Scrum spec.

## Sources

- [K1] https://support.atlassian.com/jira-software-cloud/docs/configure-columns/
- [K2] https://support.atlassian.com/jira-software-cloud/docs/monitor-work-in-a-kanban-project/
- [K3] https://support.atlassian.com/jira-software-cloud/docs/use-your-kanban-backlog/
- [K4] https://support.atlassian.com/jira-software-cloud/docs/enable-the-backlog/
- [K5] https://support.atlassian.com/jira-software-cloud/docs/add-a-sub-filter-to-a-company-managed-kanban-board/
- [K6] https://support.atlassian.com/jira-software-cloud/docs/release-a-version-in-your-classic-project/
- [K7] https://support.atlassian.com/jira-software-cloud/docs/configure-versions-in-a-kanban-project/
- [K8] https://support.atlassian.com/jira/kb/kanban-board-shows-or-hides-completed-work-unexpectedly-in-jira-cloud/
- [K9] https://support.atlassian.com/jira-software-cloud/docs/get-started-with-team-managed-projects/
- [K10] https://support.atlassian.com/jira-software-cloud/docs/customize-cards/
- [K11] https://support.atlassian.com/jira-software-cloud/docs/enable-sprints/
- [K12] https://support.atlassian.com/jira-software-cloud/docs/what-is-a-jira-software-board/

## Rules

Columns and status mapping
- KB-1 A company-managed kanban board starts with four columns: backlog, selected for development, in progress, done. A team-managed one starts with the three of SB-1. `documented` [K1][K9]
- KB-2 Status mapping, the unmapped pool, column admin and status deletion work as SB-2 to SB-6. `documented` [K1]
- KB-3 An issue counts as complete when its status category is done, whatever column holds that status. Scrum decides by column position instead (SB-7, SB-8). `documented` [K8]
- KB-4 Team-managed boards always keep a done status and a done column. Deleting a column that holds issues asks for a target column and status; if the deleted column was done, the target inherits the done status. `documented` [K9]
- KB-5 If every mapped status sits in the first column, the board shows nothing; at least one status must map to a later column. `documented` [K2]

What the board shows
- KB-6 An issue appears when all hold: it matches the board scope, its status is mapped, it is not a subtask, and neither the sub-filter (KB-22) nor done-hiding (KB-23) removes it. `documented` [K2]
- KB-7 No sprint exists: no header with goal or time left, no start or complete step; the board is never empty for lack of a sprint (contrast SB-10, SB-11). `documented` [K2][K7]
- KB-8 Turning sprints off on a team-managed project leaves every issue on the board in its column. `documented` [K11]
- KB-9 Cards follow rank; dragging within a column and the top/bottom action re-rank as SB-12 and SB-20. `documented` [K2]
- KB-10 An issue created from the global create action lands at the bottom of the board. `documented` [K2]
- KB-11 The classic board view renders at most 5,000 issues; the newer single-project view drops that cap. `documented` [K12]

Column limits (WIP)
- KB-12 Each column may carry a min, a max, both or none; limits are optional per column. `documented` [K1]
- KB-13 A board-wide counting mode decides what is counted: off, every issue, or every issue except subtasks. Turning counting on shows a count in every column header next to its limits. `documented` [K1]
- KB-14 Breaching a limit is visual only: the header takes one warning color above max and another below min. Drops are never refused and no cards are hidden. `documented` [K1]
- KB-15 Counts include cards hidden by quick filters, as SB-28. `documented` [K1]
- KB-16 Limits can be set from the board column menu as well as from board settings. `documented` [K1][K9]

Kanban backlog
- KB-17 Off by default; the first board column then acts as the backlog. An admin turns it on by mapping a status to a dedicated backlog slot that is not a board column. `documented` [K1][K3]
- KB-18 Issues in the backlog slot show only in the backlog view, never on the board. The backlog view shows two lists: the backlog slot and the first board column. `documented` [K3]
- KB-19 Dragging an issue from the backlog list to the first-column list moves it to that column's status and onto the board. A collapsed parent carries its subtasks; an expanded one moves alone; subtasks may move without their parent. `documented` [K3]
- KB-20 The backlog is ranked by drag and by top/bottom actions; a new issue goes under the selected one, or to the top when none is selected. `documented` [K3]
- KB-21 Team-managed: with the backlog on, newly created issues land in it; turning it off sends every issue to the board by status. `documented` [K4]

How done work leaves the board
- KB-22 Company-managed boards may add a sub-filter, a query that further narrows the board scope. The default one hides issues whose fix version is released. It also scopes reports. `documented` [K5][K8]
- KB-23 Done-category issues disappear once older than a window: 1, 2 or 4 weeks, or never (company-managed); fixed 14 days on team-managed boards without sprints. Hidden issues are not modified. `documented` [K8][K9]
- KB-24 The hiding window counts from the last edit, not from reaching done: any field change makes the issue reappear until the window lapses again. `documented` [K8]
- KB-25 Releasing (company-managed): a release action lists unreleased versions attached to at least one issue in the done column; releasing one names it and records its date. An issue leaves the board once all its fix versions are released. `documented` [K6][K7]
- KB-26 A version can instead be cut on the spot, gathering every issue complete at that moment. In the newer board view releases move from the board to the backlog and release views. `documented` [K2][K7]

Moving cards and cards
- KB-27 Moving cards between columns, multi-status drop zones, refused transitions, assignee untouched and multi-select follow SB-16 to SB-21. `documented` [K2]
- KB-28 The days-in-column indicator is on by default for kanban (off for scrum, SB-31). `documented` [K10]

Quick filters
- KB-29 Same behavior as SB-24 to SB-27; the same filters also apply to the kanban backlog. `documented` [K3][K4]

## States and transitions

| Issue state | Trigger | Result |
|---|---|---|
| In backlog slot (KB-18) | dragged to first-column list | status = first column's status; card on board |
| On board | dropped on other column/zone | status changes (SB-16, SB-17) |
| On board, status category done | window lapses with no edit | hidden from board (KB-23) |
| Hidden done | any field edited | visible again until window lapses (KB-24) |
| Done with fix version | version released | leaves board via sub-filter (KB-22, KB-25) |

Card position = (column of its status, rank within column); no sprint dimension.

## Edge cases

- Max limit already breached: further drops still succeed, header only warns (KB-14).
- Done-category status in a middle column: counted complete and subject to hiding there (KB-3, KB-23).
- All statuses mapped to the first column: empty board (KB-5).
- Subtasks excluded from the board (KB-6) yet counted in limits unless the mode excludes them (KB-13).
- Editing an old done issue resurfaces it (KB-24).

## Proposed v1 cut for santi

Adopt: KB-1 (three columns, as SB-1), KB-2, KB-3, KB-4, KB-5, KB-6 (minus sub-filter), KB-7,
KB-9, KB-10, KB-12 (max only), KB-14, KB-15, KB-16, KB-23 (window per board: 7, 14, 30 days or never; default 14), KB-27, KB-29.

Drop:
- KB-8: board type is fixed at creation; no sprint toggle on a kanban board.
- KB-11: no render cap; paging is an implementation concern.
- KB-12 min limit and KB-13 counting modes: one max per column, counting every card on the board.
- KB-17 to KB-21: no kanban backlog in v1; the first column is the backlog (ranking: SAN-14).
- KB-22, KB-25, KB-26: no versions, releases or sub-filters in v1.
- KB-24: the window counts from entering a done-category status, so edits never resurface work.
- KB-28: later, with SB-31.

## Open questions (live observation)

- OQ-1 Drop a card on a column already at its max. Watch: any confirm, warning or toast beyond the header color?
- OQ-2 Map a done-category status to a middle column and leave an issue there past the hiding window. Watch: hidden or still shown?
- OQ-3 Edit only a comment on a hidden done issue. Watch: does it reappear, and does the window restart?
- OQ-4 Move an issue out of done and back. Watch: does the hiding window restart from the second move?
- OQ-5 Turn on limit counting with subtasks included on a board that hides subtasks. Watch: does the header count disagree with the visible cards?
- OQ-6 Create a subtask on a kanban board. Watch: is it drawn at all, nested under its parent, or only in the issue view?
- OQ-7 Set min greater than max on one column. Watch: accepted, refused, or silently fixed?
- OQ-8 Create an issue inline at the bottom of a middle column. Watch: status taken, and rank placement?
- OQ-9 Enable the kanban backlog with issues already in the first column. Watch: which issues move to the backlog list?
- OQ-10 Delete a column whose statuses hold done issues on a team-managed kanban board. Watch: does the target column inherit done, and do those issues reset their hiding window?
