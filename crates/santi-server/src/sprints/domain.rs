use chrono::{DateTime, TimeDelta, Utc};
use santi_types::issues::IssueType;
use santi_types::projects::BoardType;
use santi_types::sprints::{Sprint, SprintLength, SprintState};

use crate::error::{AppError, reject_nul};

pub const DEFAULT_SPRINT_DAYS: i64 = 14;

/// SP-1: sprints exist only on scrum boards.
pub fn require_scrum(board_type: BoardType) -> Result<(), AppError> {
    if board_type == BoardType::Kanban {
        return Err(AppError::conflict(
            "kanban-has-no-sprints",
            "Kanban boards have no sprints.",
        ));
    }
    Ok(())
}

pub fn check_sprint_name(name: &str) -> Result<String, AppError> {
    reject_nul("name", name)?;
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 100 {
        return Err(AppError::invalid("name", "must have 1 to 100 characters"));
    }
    Ok(name.to_string())
}

/// D12: `Sprint N` unless a name is given.
pub fn sprint_name(custom: Option<&str>, number: i64) -> Result<String, AppError> {
    match custom {
        Some(name) => check_sprint_name(name),
        None => Ok(format!("Sprint {number}")),
    }
}

pub fn check_goal(goal: &str) -> Result<String, AppError> {
    reject_nul("goal", goal)?;
    let goal = goal.trim();
    if goal.chars().count() > 1000 {
        return Err(AppError::invalid(
            "goal",
            "must have at most 1000 characters",
        ));
    }
    Ok(goal.to_string())
}

pub fn check_window(
    start: Option<DateTime<Utc>>,
    end: Option<DateTime<Utc>>,
) -> Result<(), AppError> {
    if let (Some(start), Some(end)) = (start, end)
        && end <= start
    {
        return Err(AppError::invalid("ends_at", "must be after the start"));
    }
    Ok(())
}

pub fn check_length(
    length: Option<SprintLength>,
    ends_at: Option<DateTime<Utc>>,
) -> Result<(), AppError> {
    if length.is_some() && ends_at.is_none() {
        return Err(AppError::invalid("length", "needs ends_at"));
    }
    Ok(())
}

/// SP-11: future sprints edit freely, active ones keep both times set, closed ones keep their times.
pub fn check_sprint_edit(
    current: &Sprint,
    start: Option<DateTime<Utc>>,
    end: Option<DateTime<Utc>>,
) -> Result<(), AppError> {
    check_window(start, end)?;
    match current.state {
        SprintState::Future => Ok(()),
        SprintState::Active if start.is_none() || end.is_none() => Err(AppError::invalid(
            "ends_at",
            "an active sprint needs a start and an end",
        )),
        SprintState::Active => Ok(()),
        SprintState::Closed if (start, end) != (current.starts_at, current.ends_at) => Err(
            AppError::invalid("starts_at", "a closed sprint keeps its times"),
        ),
        SprintState::Closed => Ok(()),
    }
}

/// D6: subtasks follow their parent; D10: epics are not planned into sprints.
pub fn check_issue_can_change_sprint(issue_type: IssueType) -> Result<(), AppError> {
    match issue_type {
        IssueType::Subtask => Err(AppError::invalid(
            "sprint_id",
            "a subtask always shares its parent's sprint",
        )),
        IssueType::Epic => Err(AppError::invalid(
            "sprint_id",
            "epics are not planned into sprints",
        )),
        _ => Ok(()),
    }
}

/// False when the issue already sits in `target`, so a full-form edit resending it is a no-op.
pub fn sprint_change_needed(
    issue_type: IssueType,
    current: Option<i64>,
    target: Option<i64>,
) -> Result<bool, AppError> {
    if current == target {
        return Ok(false);
    }
    check_issue_can_change_sprint(issue_type)?;
    Ok(true)
}

pub fn check_sprint_open(state: SprintState) -> Result<(), AppError> {
    if state == SprintState::Closed {
        return Err(AppError::conflict(
            "sprint-closed",
            "A closed sprint takes no more issues.",
        ));
    }
    Ok(())
}

pub fn sprint_for_new_issue(
    issue_type: IssueType,
    parent_sprint: Option<i64>,
    requested: Option<i64>,
) -> Result<Option<i64>, AppError> {
    if requested.is_some() {
        check_issue_can_change_sprint(issue_type)?;
    }
    if issue_type == IssueType::Subtask {
        return Ok(parent_sprint);
    }
    Ok(requested)
}

pub fn start_window(
    now: DateTime<Utc>,
    start: Option<DateTime<Utc>>,
    end: Option<DateTime<Utc>>,
) -> Result<(DateTime<Utc>, DateTime<Utc>), AppError> {
    let start = start.unwrap_or(now);
    let end = end.unwrap_or(start + TimeDelta::days(DEFAULT_SPRINT_DAYS));
    check_window(Some(start), Some(end))?;
    Ok((start, end))
}

/// D13 and SP-9: one active sprint per board, and never an empty one.
pub fn check_can_start(
    state: SprintState,
    another_is_active: bool,
    issue_count: i64,
) -> Result<(), AppError> {
    if state != SprintState::Future {
        return Err(AppError::conflict(
            "sprint-not-future",
            "Only a future sprint can start.",
        ));
    }
    if another_is_active {
        return Err(AppError::conflict(
            "sprint-already-active",
            "Complete the active sprint before starting another.",
        ));
    }
    if issue_count == 0 {
        return Err(AppError::conflict(
            "sprint-empty",
            "Add at least one issue before starting the sprint.",
        ));
    }
    Ok(())
}

pub fn check_can_complete(state: SprintState) -> Result<(), AppError> {
    if state != SprintState::Active {
        return Err(AppError::conflict(
            "sprint-not-active",
            "Only the active sprint can be completed.",
        ));
    }
    Ok(())
}

pub fn check_destination(closing_sprint_id: i64, target: &Sprint) -> Result<(), AppError> {
    if target.id == closing_sprint_id || target.state != SprintState::Future {
        return Err(AppError::invalid(
            "open_issues",
            "pick a future sprint of this board",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(text: &str) -> DateTime<Utc> {
        text.parse().unwrap()
    }

    fn sprint(state: SprintState) -> Sprint {
        Sprint {
            id: 1,
            name: "Sprint 1".into(),
            goal: String::new(),
            state,
            starts_at: Some(at("2026-10-01T00:00:00Z")),
            ends_at: Some(at("2026-10-14T23:59:00Z")),
            started_at: None,
            closed_at: None,
            overdue: false,
        }
    }

    #[test]
    fn kanban_boards_have_no_sprints() {
        assert!(require_scrum(BoardType::Scrum).is_ok());
        assert_eq!(
            require_scrum(BoardType::Kanban)
                .unwrap_err()
                .to_problem()
                .problem_type,
            "urn:santi:error:kanban-has-no-sprints"
        );
    }

    #[test]
    fn default_name_uses_the_board_counter() {
        assert_eq!(sprint_name(None, 4).unwrap(), "Sprint 4");
        assert_eq!(sprint_name(Some(" Launch "), 4).unwrap(), "Launch");
        assert!(sprint_name(Some("  "), 4).is_err());
    }

    #[test]
    fn goals_are_trimmed_and_bounded() {
        assert_eq!(check_goal(" Ship ").unwrap(), "Ship");
        assert!(check_goal(&"x".repeat(1001)).is_err());
    }

    #[test]
    fn window_must_end_after_it_starts() {
        let start = Some(at("2026-10-16T12:00:00Z"));
        assert_eq!(
            check_window(start, start),
            Err(AppError::invalid("ends_at", "must be after the start"))
        );
        assert!(check_window(start, Some(at("2026-10-16T11:59:00Z"))).is_err());
        assert!(check_window(start, Some(at("2026-10-16T12:01:00Z"))).is_ok());
        assert!(check_window(None, start).is_ok());
        assert!(check_window(start, None).is_ok());
    }

    #[test]
    fn edits_depend_on_the_sprint_state() {
        let same = (
            Some(at("2026-10-01T00:00:00Z")),
            Some(at("2026-10-14T23:59:00Z")),
        );
        assert!(check_sprint_edit(&sprint(SprintState::Future), None, None).is_ok());
        assert_eq!(
            check_sprint_edit(&sprint(SprintState::Active), None, same.1),
            Err(AppError::invalid(
                "ends_at",
                "an active sprint needs a start and an end"
            ))
        );
        assert!(
            check_sprint_edit(
                &sprint(SprintState::Active),
                same.0,
                Some(at("2026-10-20T22:00:00Z"))
            )
            .is_ok()
        );
        assert!(check_sprint_edit(&sprint(SprintState::Closed), same.0, same.1).is_ok());
        assert_eq!(
            check_sprint_edit(
                &sprint(SprintState::Closed),
                same.0,
                Some(at("2026-10-20T22:00:00Z"))
            ),
            Err(AppError::invalid(
                "starts_at",
                "a closed sprint keeps its times"
            ))
        );
    }

    #[test]
    fn only_parents_change_sprint_and_closed_sprints_take_nothing() {
        assert!(check_issue_can_change_sprint(IssueType::Story).is_ok());
        assert!(check_issue_can_change_sprint(IssueType::Subtask).is_err());
        assert!(check_issue_can_change_sprint(IssueType::Epic).is_err());
        assert!(check_sprint_open(SprintState::Active).is_ok());
        assert!(check_sprint_open(SprintState::Closed).is_err());
    }

    #[test]
    fn sprint_edits_skip_no_ops_and_keep_subtasks_and_epics_out() {
        assert_eq!(
            sprint_change_needed(IssueType::Story, None, Some(5)),
            Ok(true)
        );
        assert_eq!(
            sprint_change_needed(IssueType::Bug, Some(5), None),
            Ok(true)
        );
        assert_eq!(
            sprint_change_needed(IssueType::Story, Some(5), Some(5)),
            Ok(false)
        );
        assert_eq!(
            sprint_change_needed(IssueType::Subtask, Some(5), Some(5)),
            Ok(false)
        );
        assert_eq!(
            sprint_change_needed(IssueType::Subtask, Some(5), None),
            Err(AppError::invalid(
                "sprint_id",
                "a subtask always shares its parent's sprint"
            ))
        );
        assert_eq!(
            sprint_change_needed(IssueType::Epic, None, Some(5)),
            Err(AppError::invalid(
                "sprint_id",
                "epics are not planned into sprints"
            ))
        );
    }

    #[test]
    fn new_subtasks_inherit_the_parent_sprint() {
        assert_eq!(
            sprint_for_new_issue(IssueType::Subtask, Some(5), None).unwrap(),
            Some(5)
        );
        assert!(sprint_for_new_issue(IssueType::Subtask, Some(5), Some(6)).is_err());
        assert_eq!(
            sprint_for_new_issue(IssueType::Story, None, Some(6)).unwrap(),
            Some(6)
        );
        assert!(sprint_for_new_issue(IssueType::Epic, None, Some(6)).is_err());
        assert_eq!(
            sprint_for_new_issue(IssueType::Epic, None, None).unwrap(),
            None
        );
    }

    #[test]
    fn start_window_defaults_to_now_and_two_weeks() {
        let now = at("2026-10-16T21:30:00Z");
        assert_eq!(
            start_window(now, None, None).unwrap(),
            (now, at("2026-10-30T21:30:00Z"))
        );
        assert_eq!(
            start_window(now, Some(at("2026-10-20T09:00:00Z")), None).unwrap(),
            (at("2026-10-20T09:00:00Z"), at("2026-11-03T09:00:00Z"))
        );
        assert_eq!(
            start_window(now, None, Some(now)),
            Err(AppError::invalid("ends_at", "must be after the start"))
        );
    }

    #[test]
    fn length_needs_an_end() {
        let end = Some(at("2026-10-17T00:00:00Z"));
        assert_eq!(
            check_length(Some(SprintLength::OneDay), None),
            Err(AppError::invalid("length", "needs ends_at"))
        );
        assert!(check_length(Some(SprintLength::OneDay), end).is_ok());
        assert!(check_length(None, end).is_ok());
        assert!(check_length(None, None).is_ok());
    }

    #[test]
    fn start_guards() {
        let slug = |result: Result<(), AppError>| result.unwrap_err().to_problem().problem_type;
        assert!(check_can_start(SprintState::Future, false, 1).is_ok());
        assert_eq!(
            slug(check_can_start(SprintState::Active, false, 1)),
            "urn:santi:error:sprint-not-future"
        );
        assert_eq!(
            slug(check_can_start(SprintState::Future, true, 1)),
            "urn:santi:error:sprint-already-active"
        );
        assert_eq!(
            slug(check_can_start(SprintState::Future, false, 0)),
            "urn:santi:error:sprint-empty"
        );
    }

    #[test]
    fn only_the_active_sprint_completes() {
        assert!(check_can_complete(SprintState::Active).is_ok());
        assert!(check_can_complete(SprintState::Future).is_err());
        assert!(check_can_complete(SprintState::Closed).is_err());
    }

    #[test]
    fn destination_must_be_another_future_sprint() {
        let mut target = sprint(SprintState::Future);
        target.id = 9;
        assert!(check_destination(1, &target).is_ok());
        assert!(check_destination(9, &target).is_err());
        target.state = SprintState::Closed;
        assert!(check_destination(1, &target).is_err());
    }
}
