# Sprint lifecycle — behavior spec

Card: SAN-15. Phase: documented only (public product docs). Live observation pending.

## Purpose

A sprint is a fixed time box on a scrum board: planned as a future list in the backlog, started
with a goal and dates, worked on the board, then closed with its unfinished work sent onward.

## Entities and attributes

- **Sprint**: name, goal (optional), planned start and end, actual start, actual end, state
  (future, active, closed), owning board, position among future sprints (BL-1, BL-12).
- **Sprint membership**: issue to sprint link; changes after the start are scope changes (BL-14).
- **Completion outcome**: per issue at close: completed, not completed, removed during the sprint.
- **Destination**: where not-completed issues go at close: backlog, an existing future sprint, a new sprint.

## Sources

- [P1] https://support.atlassian.com/jira-software-cloud/docs/what-is-a-sprint/
- [P2] https://support.atlassian.com/jira-software-cloud/docs/create-sprints-in-company-managed-projects/
- [P3] https://support.atlassian.com/jira-software-cloud/docs/edit-a-sprint-in-a-company-managed-project/
- [P4] https://support.atlassian.com/jira-software-cloud/docs/plan-a-sprint/
- [P5] https://support.atlassian.com/jira-software-cloud/docs/enable-sprints/
- [P6] https://support.atlassian.com/jira-software-cloud/docs/add-issues-to-an-active-sprint/
- [P7] https://support.atlassian.com/jira-software-cloud/docs/remove-or-delete-issues-from-an-active-sprint/
- [P8] https://support.atlassian.com/jira-software-cloud/docs/complete-a-sprint/
- [P9] https://support.atlassian.com/jira-software-cloud/docs/delete-a-sprint/
- [P10] https://support.atlassian.com/jira-software-cloud/docs/delete-a-completed-sprint-in-a-company-managed-project/
- [P11] https://support.atlassian.com/jira-software-cloud/docs/reopen-a-sprint/
- [P12] https://support.atlassian.com/jira-software-cloud/docs/view-and-understand-the-sprint-report/

## Rules

Create and plan
- SP-1 Sprints exist only on scrum boards; a kanban board has none (KB-7). `documented` [P1][P8]
- SP-2 Turning sprints on for a team-managed project creates the first sprint automatically. `documented` [P5]
- SP-3 Any number of future sprints may exist; a new one is added as the last sprint, just above the no-sprint section (BL-1, BL-12). `documented` [P2][P5]
- SP-4 Before starting, a future sprint can be renamed, given a goal and given planned dates; dates are optional while planning. `documented` [P3][P5]
- SP-5 Typical lengths are one, two or four weeks; two weeks is the advised default for new teams. `documented` [P1][P5]

Start
- SP-6 Starting opens one step to confirm the name, the duration, the start and end dates, and an optional goal. `documented` [P4][P5]
- SP-7 The start date proposed in that step is the moment of starting, replacing any planned date, and stays editable. Reports measure scope change from this date. `documented` [P4][P5]
- SP-8 Team-managed: a sprint needs at least one issue before it can start. Company-managed: not stated (OQ-3). `documented` [P5]
- SP-9 Only one sprint per board may be active unless parallel sprints are on (SB-15, BL-15). `documented` [P4]
- SP-10 After start, the sprint's issues appear on the board, whose header shows the sprint name, goal and time left (SB-10, SB-11). `documented` [P4][P5]

Edit
- SP-11 Future and active sprints: name, goal, start and end are editable. Closed sprints: name and goal only. `documented` [P3]

Scope during the sprint
- SP-12 Issues may be added to or removed from the active sprint; every such change is a scope change and shows in burndown and report (BL-14). `documented` [P4][P6]
- SP-13 Adding works by drag, multi-select, divider drag (BL-13), or by creating an issue with the sprint set. Removing is a separate action from deleting the issue. `documented` [P6][P7]
- SP-14 The sprint section shows the total estimate of its issues, to compare with past velocity (BL-24). `documented` [P6]

Complete
- SP-15 Completing needs admin rights or the sprint-management permission. `documented` [P8]
- SP-16 An issue counts as completed only in the rightmost board column; every other column is open (SB-7, SB-8). `documented` [P5][P8]
- SP-17 All subtasks must be done before completing. A parent that is not done leaves the sprint with the other open work. `documented` [P8]
- SP-18 When open issues remain, one destination is picked for all of them: the backlog, an existing future sprint, or a new sprint created in the same step. `documented` [P4][P5][P8]
- SP-19 Completed issues leave the board (the board empties, SB table). Issues get no close date stamp; the sprint keeps its end date. `documented` [P8]
- SP-20 A sprint shared by several boards: only the closing board's open issues follow the chosen destination; the others go to the backlog. `documented` [P8]
- SP-21 With parallel sprints, open issues cannot go straight into another active sprint; they pass through the backlog. `documented` [P5]

Delete and reopen
- SP-22 Deleting a future or active sprint moves its issues to the next sprint in the list; issues from an active sprint keep their status. `documented` [P9]
- SP-23 A closed sprint is deleted from the report view, not from the backlog. `documented` [P10]
- SP-24 A closed sprint can be reopened only when no other sprint is active (unless parallel). Reopening restores issues still in the backlog, leaves issues now in an active sprint where they are, and is refused when all its open issues sit in an active sprint. The report then uses the new end date. `documented` [P11]

Completion facts (report)
- SP-25 The report belongs to one board and covers only issues in that board's scope. `documented` [P12]
- SP-26 Issues are grouped by outcome; issues added after the start are flagged; an estimate changed mid-sprint shows old and new value. `documented` [P12]
- SP-27 Subtask estimates are left out (parents only), and subtask completion is not tracked per sprint. `documented` [P12]
- SP-28 The goal shows on the report and burndown; the remaining-work line rises and falls with scope change. `documented` [P4][P12]

## States and transitions

| From | Trigger | To | Effect |
|---|---|---|---|
| (none) | create | future | last sprint above the no-sprint section |
| future | start (SP-6 to SP-9) | active | actual start set; issues on board |
| active | complete (SP-15 to SP-18) | closed | actual end set; open issues to destination |
| closed | reopen (SP-24) | active | report end date replaced |
| future, active | delete (SP-22) | removed | issues to next sprint |
| closed | delete from report (SP-23) | removed | not documented for issues (OQ-12) |

## Edge cases

- Planned start earlier than the real start makes all earlier work look like scope creep (SP-7).
- Done-category status in a middle column counts as open at close (SB-8, SB OQ-4).
- Deleting the last sprint in the list: no next sprint to receive issues (OQ-7).
- End date passes without completing (OQ-11).

## Proposed v1 cut for santi

Adopt: SP-1, SP-3, SP-4, SP-6, SP-7, SP-10, SP-11, SP-12, SP-13 via drag, CLI and MCP (no divider
drag), SP-14 (story points), SP-18, SP-19, SP-25, SP-26, SP-27.

Changes:
- SP-9: at most one active sprint per board, always; starting a second is refused.
- SP-16: completed = status category `done` (rightmost column holds only `done` statuses, SB cut).
- SP-8: starting an empty sprint is refused on every board.
- SP-17: completion is never blocked; a subtask follows its parent's outcome (proposal, OQ-5).
- SP-22: only future sprints can be deleted; their issues return to the no-sprint section with rank kept (BL-6). An active sprint must be completed instead.
- Create: default name "Sprint N", N = sprints ever created on the board + 1 (proposal, OQ-1).
- Start: duration presets 1, 2, 3, 4 weeks or custom end date; default 2 weeks (SP-5, OQ-2).
- Report facts: each issue's outcome (completed, not completed, removed) and an added-after-start flag are stored at close, so later edits never rewrite a closed sprint.

Drop: SP-2 (sprints always on), SP-15 (any project member may complete; roles later), SP-20 (a sprint
belongs to one board), SP-21 (no parallel sprints), SP-23 and SP-24 (deleting or reopening closed sprints: later),
SP-28 burndown line (charts later; goal kept on the sprint).

## Open questions (live observation)

- OQ-1 Create three sprints on a fresh board, delete the second, create another. Watch: default name pattern and whether numbering reuses or skips.
- OQ-2 Open the start step. Watch: duration choices, default choice, whether the end date follows the duration and can be set freely.
- OQ-3 Try to start an empty sprint in a company-managed project. Watch: allowed, warned or refused.
- OQ-4 Set an end date before the start date in the start step. Watch: validation and message placement.
- OQ-5 Complete a sprint holding an open subtask of a done parent, and a done subtask of an open parent. Watch: blocked, prompted, or where each ends up.
- OQ-6 Complete with open issues and pick the new-sprint destination. Watch: its name, state (future or started) and position.
- OQ-7 Delete the last sprint in the list while it holds issues. Watch: do they go to the no-sprint section, at which rank?
- OQ-8 Delete the active sprint while a future sprint exists. Watch: confirmation, and whether the next sprint becomes active.
- OQ-9 Remove an issue from the active sprint. Watch: where it lands, at which rank, and how the report lists it.
- OQ-10 Mid-sprint, change one issue's points, add one issue, remove one. Watch: sprint header total and the report's groups and markers.
- OQ-11 Let the end date pass without completing. Watch: does the sprint stay active, is there an overdue sign?
- OQ-12 Delete a closed sprint from the report view. Watch: what happens to the sprint field of its issues.
- OQ-13 Complete a sprint where every issue is done. Watch: is the destination choice skipped?
