# Reports — behavior spec

Card: SAN-55 (E8), part 1. Phase: public product docs plus live chart data from the maintainer's
team-managed project (board 46). The report screens could not be opened live: the project's reports
feature is off (RP-8), so screen layout, options and click-through are documented only.

## Purpose

Reports turn a board's history into charts: how a sprint is burning down or up, what a sprint
finished, how much a team finishes per sprint, how work piles up per column, and how long issues
take to cross the workflow.

## Sources

- [R1] https://support.atlassian.com/jira-software-cloud/docs/view-and-understand-the-burndown-chart/
- [R2] https://support.atlassian.com/jira-software-cloud/docs/view-and-understand-the-sprint-report/
- [R3] https://support.atlassian.com/jira-software-cloud/docs/view-and-understand-the-velocity-chart/
- [R4] https://support.atlassian.com/jira-software-cloud/docs/view-and-understand-the-cumulative-flow-diagram/
- [R5] https://support.atlassian.com/jira-software-cloud/docs/view-and-understand-the-control-chart/
- [R6] https://support.atlassian.com/jira-software-cloud/docs/view-and-understand-the-burnup-chart/
- [R7] https://support.atlassian.com/jira-software-cloud/docs/configure-working-days/
- [R8] https://support.atlassian.com/jira-software-cloud/docs/enable-reports/
- [R9] https://support.atlassian.com/jira-software-cloud/docs/what-is-the-sprint-burndown-report/
- [R10] https://support.atlassian.com/jira-software-cloud/docs/what-is-the-velocity-report/
- [R11] https://support.atlassian.com/jira-software-cloud/docs/what-is-the-burnup-report/
- [R12] https://support.atlassian.com/jira-software-cloud/docs/what-is-the-cumulative-flow-diagram/
- [R13] https://support.atlassian.com/jira-software-cloud/docs/methods-of-calculating-rolling-average-on-the-control-chart/
- [R14] https://support.atlassian.com/jira-software-cloud/docs/configure-estimation-and-tracking/
- [R15] https://support.atlassian.com/jira-software-cloud/docs/configure-a-company-managed-board/
- [R16] https://support.atlassian.com/jira-software-cloud/docs/complete-a-sprint/
- [L] Live, 2026-10-16: board 46 configuration and the chart data behind each report, read-only,
  from the maintainer's logged-in session. The board has one active sprint (34 tasks, no subtasks,
  no estimates, 31 done) and one empty future sprint. It has no closed sprint (OQ-2).

## Entities

- **Report**: a read-only view computed from one board. No state of its own except the per-user
  choice of measure (RP-4).
- **Measure**: the quantity on the value axis: points, original time estimate, issue count, or
  (company-managed) any numeric field.
- **Board column order**: the leftmost column means not started, the rightmost means done, any
  column between means in progress.
- **Working calendar** (per board): which weekdays are worked, a list of single non-working dates,
  and a timezone.
- **Change log** (per issue): time-stamped entries for creation, status change, estimate change,
  and joining or leaving a sprint. Every chart is rebuilt from it.

## Rules

Shared
- RP-1 Every report is scoped to one board and reads only issues inside the board's scope (its
  filter and sub-filter). `documented` [R1][R2][R3][R4][R5]
- RP-2 An issue counts as done while its status maps to the rightmost column, and as not started
  while it maps to the leftmost one. Status category plays no part. `documented` [R1][R2][R3][R4];
  `observed` [L]: each chart's change entries flag a status entry as done or not done by its
  column alone.
- RP-3 Measure: company-managed boards pick points, original time, issue count or any numeric
  field. Team-managed boards use points when estimation is on and issue count when it is off, so
  each issue then weighs one. `documented` [R3][R9][R10][R11][R14]. `observed` [L]: the board
  offers time estimate, points and issue count; points is the board's current choice.
- RP-4 On the burndown, switching the measure is remembered for that user's next visit.
  `documented` [R1]
- RP-5 Subtask estimates are never summed in burndown, burnup, sprint report or velocity. Only
  standard-level issues (story, task, bug) carry value. `documented` [R1][R2][R3][R6][R9][R10][R11]
- RP-6 Each board has a working calendar: worked weekdays, single non-working dates and a timezone.
  Burndown, sprint report and control chart honour it (so do epic and version reports, out of
  scope here). Only a project admin or a board admin can edit it. `documented` [R7]
- RP-7 The calendar reaches the charts as consecutive intervals marked worked or not worked.
  Non-working intervals run from local midnight to local midnight in the board timezone. The first
  interval starts at the sprint's start time, and the last ends at its end time. Every time on the
  axis is shown in the board timezone. `observed` [L]
- RP-8 Team-managed: reports are a project feature that only a project admin can turn on. While it
  is off, every report address resolves to a not-found page, but the chart data stays readable.
  `documented` [R8]; `observed` [L]
- RP-9 Team-managed projects offer burnup, sprint burndown, velocity and cumulative flow. Sprint
  reports appear only with the sprints feature on, and a report is listed only when there is data
  to draw. The sprint report and the control chart are company-managed only. `documented` [R8]
- RP-10 Anyone who can see the board can see its reports: that needs read access to the board's
  filter and browse rights on every project it shows. Changing estimation or working days needs
  board or project admin. `documented` [R7][R14][R15]

Sprint burndown
- RP-11 Scrum boards only. One sprint is shown at a time, picked from a sprint list.
  `documented` [R1][R9]
- RP-12 The time axis spans the sprint from its start to its end. The value axis is the measure.
  `documented` [R1][R9]
- RP-13 The guideline is a straight descent from the total at start to zero at the end. It stays
  level through non-working intervals, so all descent happens in worked time. `documented` [R2][R9];
  `observed` [L] (interval data per RP-7).
- RP-14 The remaining line starts at the start total. At any instant it equals the measure summed
  over issues that are in the sprint and not done. It rises when an issue joins, is re-estimated up
  or leaves done. It falls when an issue reaches done, leaves the sprint or is re-estimated down.
  `documented` [R2][R9]
- RP-15 The series is replayed from per-issue entries: creation (entering the first status, with
  its initial estimate), joining the sprint, leaving it, estimate change, entering done, leaving
  done. A move between two not-done columns produces no entry. `observed` [L]: an issue moved from
  the leftmost to the middle column left no burndown entry, while each move into the rightmost
  column did.
- RP-16 Scope change is measured against the sprint's start date-time as saved in the start step,
  not the moment the start action ran. `observed` [L]: the start was saved as the morning of day 1,
  and the sprint was created and filled that evening. Every one of its issues is flagged as added
  after start, including those present before the start action.
- RP-17 With nothing in the sprint at its start time, the start total is zero and the guideline is
  missing. `documented` [R1]
- RP-18 Team-managed tables under the chart: a list of scope changes (joins, removals and estimate changes
  while active), not completed (never reached done, including never started), completed while
  active, completed outside the sprint (done before joining, or done before the start), removed
  while active. Any column header sorts its table. `documented` [R9]
- RP-19 Company-managed with time tracking on: a subtask's remaining time rolls into its parent,
  and adding a subtask to a parent already in the active sprint is drawn as scope change. With
  time tracking off, that subtask still counts as scope change but is not drawn, and parent and
  subtask estimates are tracked separately. `documented` [R1]
- RP-20 A future sprint with no issues yields no chart, only a notice that there is nothing to draw.
  Its data has zero length (start = end = now). `observed` [L] (cause not separable, OQ-4).

Burnup
- RP-21 Scrum only. The user picks the sprint and the measure. The time axis is days.
  `documented` [R6][R11]
- RP-22 Three series: scope (measure total of the sprint's issues over time; a rise means scope
  creep), completed (measure total of issues that have reached done), and a guideline of ideal
  completion. The gap between scope and completed is the remaining work; the two meet when
  everything is done. `documented` [R6][R11]

Sprint report (company-managed)
- RP-23 Shows one sprint, picked from a list: the burndown of RP-13/RP-14 above the sprint's issues
  grouped by outcome. Meant for mid-sprint checks and retrospectives. `documented` [R2]
- RP-24 Groups: completed while active, not completed, completed outside this sprint, removed while
  active. `observed` [L]: the report data holds exactly these four lists; open issues in the
  leftmost and the middle column both fall under not completed.
- RP-25 Each group has two totals: the measure as it stood at start (or at joining) and as it
  stands now (or at close). A whole-sprint total is also kept. `observed` [L]
- RP-26 A total is absent, not zero, when no issue in its group has a value. `observed` [L]: every
  total was empty on the unestimated board (display: OQ-3).
- RP-27 A completed issue re-estimated during the sprint shows its value before and after.
  `documented` [R2]
- RP-28 Issues that joined after the start carry a marker. The report keeps the set of such
  issues; an issue created straight into the active sprint belongs to it. `documented` [R2];
  `observed` [L]
- RP-29 With time tracking on, a third line shows logged work. `documented` [R2]
- RP-30 Subtask completion is not tracked per sprint; its history is the only trace.
  `documented` [R2]
- RP-31 Each row carries key, summary, type, priority, status, parent epic and both estimate
  values. `observed` [L]. Click target: OQ-1.
- RP-32 Sprint data does not follow issues moved to another project; reports of the receiving
  board can then go inconsistent. `documented` [R2]

Velocity
- RP-33 Scrum only. Bars per recent closed sprint, oldest to newest; the value axis is the measure.
  `documented` [R3][R10]
- RP-34 Commitment per sprint is the measure total of its issues at the start. Later joins and
  re-estimates do not change it. `documented` [R3][R10]
- RP-35 Completed per sprint is the measure total of issues done when the sprint closes, joins
  after the start included. `documented` [R3][R10]
- RP-36 The average line is the mean of completed values over the shown sprints, used as the
  forecast for the next sprint. `documented` [R3][R10] (zero sprints: OQ-5)
- RP-37 Only closed sprints count. With none, the report has no bars. `observed` [L]: the velocity
  data was empty with one active and one future sprint.

Cumulative flow
- RP-38 Area chart: time on one axis, issue count (never estimates) on the other, one band per
  board column in column order. `documented` [R4][R12]
- RP-39 A band's height at a time is the number of issues that are in that column or a column to
  its right. The leftmost band therefore counts every issue that has arrived. A move back to the
  left lowers the bands it leaves and never raises the leftmost one. `documented` [R4][R12]
- RP-40 Input is one entry per column move (from column, to column, status, time). Creation is an
  entry into the leftmost column. A team-managed backlog item counts from creation. Each dot drawn
  is one such move. `observed` [L]; `documented` [R12]
- RP-41 It covers the board's whole life and every issue type in scope, epics included; it is not
  tied to a sprint. A range picker narrows the time window, and an overview strip lets the user
  drag out a range. `documented` [R4][R12]; `observed` [L] (12 epics present).
- RP-42 Options: which columns, swimlanes and quick filters are drawn. With no column chosen the
  data is empty; a chosen subset narrows both the bands and the moves. `documented` [R4];
  `observed` [L]

Control chart (company-managed)
- RP-43 Shows cycle or lead time per issue for a project, version or sprint, with the mean, a
  rolling average and a standard-deviation band. `documented` [R5]
- RP-44 For each issue the data holds total time and working time in each column, plus the last
  time it left each column. The column it sits in now keeps counting up to now. Working time
  excludes non-working intervals. `observed` [L]
- RP-45 Elapsed time is the sum of time in the selected columns, every visit counted, so reopened
  work adds up. Selecting from first status to done gives lead time. Columns are pre-selected to
  match work in progress. `documented` [R5]
- RP-46 A dot sits horizontally at the moment the issue last left the last selected column and
  vertically at its elapsed time. Issues that overlap form a cluster dot at their average.
  `documented` [R5]
- RP-47 Issues still inside a selected column are included by default; leaving them out needs a
  filter. `documented` [R5]
- RP-48 An issue that never changed status carries no per-column data. `observed` [L]
- RP-49 Rolling average is issue-based: at each issue it averages that issue with an equal number
  before and after it. The window is 20% of the issues shown, rounded to an odd number, with a
  minimum of 5. A shorter timeframe shrinks the window. `documented` [R5][R13]
- RP-50 The elapsed-time axis is linear while the largest value is under 30 days and switches to
  a cube-root scale at 30 days or more. `documented` [R5]
- RP-51 Options: timeframe (presets or custom), columns, swimlanes, quick filters. Dragging over
  the chart zooms; selecting a dot shows that issue or cluster. `documented` [R5]
- RP-52 Epics in board scope are included. `observed` [L]

Sprint close and edge cases
- RP-53 At close, open issues go to the backlog, a future sprint or a new sprint, and the report
  keeps them as not completed. Every subtask must be done first, and a parent that is not done
  leaves with the open work. `documented` [R16] (see SP-17, SP-18)
- RP-54 An issue done before joining, or done before the start, appears as completed outside the
  sprint and adds nothing to the burndown. `documented` [R9]
- RP-55 Reopening a closed sprint makes reports use its new end date. `documented` (SP-24)

## santi data today

Stored (decisions D2, D8, D11–D17, D21, D40; migrations 0005, 0007, 0008, 0011):
- issue: type, status (category plus column mapping; strict D2: done = `done` category = rightmost
  column), current points (NULL on subtasks, D11), parent, current sprint, `created_at`,
  `updated_at`, `done_at` (last entry into done, cleared on leaving it, D8).
- sprint: state, `start_date`/`end_date` as dates, `started_at`/`closed_at` as instants.
- sprint_issue facts: `added_after_start`, `points_at_start` (at start, or at joining), `outcome`
  (completed / not_completed / removed; cleared when an issue rejoins, which keeps its first
  `added_after_start`), `points_at_close`. Rows outlive a deleted issue (D40).
- board: type, columns with positions. No history table, no working calendar, no timezone.

Per report:
- Sprint report (closed sprints): groups, added-after-start marker and start/close totals come from
  sprint_issue. Missing: points of a removed issue at its removal (`points_at_close` is unset for
  removed); a completed-outside-sprint group (done state at joining is not kept); intermediate
  re-estimates (only first and last values).
- Sprint report (active sprint): current state comes from issue rows plus sprint_issue. Same gaps.
- Velocity: commitment = sum of `points_at_start` where not added after start; completed = sum of
  `points_at_close` where outcome is completed; issue count by counting rows. Nothing missing for
  points or count. Original time estimate does not exist in v1.
- Burndown and burnup: missing a time-stamped log of sprint join/leave, estimate changes, and done
  entries and exits (`done_at` holds only the latest entry). Also missing: a start date-time (RP-16:
  santi has a date plus the start action's instant), the working calendar and board timezone
  (RP-6, RP-7).
- Cumulative flow: missing a time-stamped status-change log per issue (from, to, when). Column
  history is also absent if mappings change (D16, OQ-8).
- Control chart: same status-change log, plus the working calendar for working time.
- Shared: no per-user saved measure (RP-4); no measure setting per board (points vs count).

## Open questions

- OQ-1 The report screens were never seen live (RP-8). Turning reports on changes a project setting
  and needs the maintainer's consent. Open until then: what a row or dot click opens, hover
  details, the table set on the team-managed burndown, and the burnup guideline.
- OQ-2 Board 46 has no closed sprint, despite the card brief. Velocity, a closed sprint report and
  close-time outcomes were not seen with data.
- OQ-3 With estimation on and no issue estimated, charts get empty totals. Unseen: whether they
  draw zero, fall back to count, or show a notice.
- OQ-4 The no-chart notice came from a sprint that is both future and empty. Which condition
  triggers it?
- OQ-5 Velocity: how many sprints are shown, and are sprints with zero completed excluded from the
  average? One documented worked example leaves one out.
- OQ-6 Does the burnup guideline stay level on non-working days like the burndown one? The docs
  say nothing.
- OQ-7 The sprint report data gave a days-left value of 0 for a sprint with 13 days left. Meaning
  unknown.
- OQ-8 After a column/status mapping edit, are old moves redrawn in current columns or kept in the
  columns of their time (CFD, control chart)?
- OQ-9 Removed group totals: the value at removal or the current value?
- OQ-10 Issue removed then re-added in the same sprint: which group, which marker, which start
  value?
- OQ-11 Team-managed: does adding a subtask under an issue in the active sprint count as scope
  change (RP-19 is documented for company-managed only)?
- OQ-12 Can an epic sit in a sprint and count in burndown, sprint report or velocity? The CFD and
  control chart include epics.
- OQ-13 Report access for plain members versus admins beyond board visibility (RP-10).
- OQ-14 Control chart rolling average with fewer than 5 issues shown.
- OQ-15 Issue deleted during an active sprint: removed, or dropped from every report?
