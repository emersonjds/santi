use santi_types::boards::StatusCategory;
use santi_types::reports::{
    DeletedIssues, ReportGroup, ReportIssue, ReportOutcome, SprintReport, SprintTotals, Velocity,
};
use santi_types::sprints::{Sprint, SprintState};

pub const VELOCITY_SPRINTS: usize = 7;

/// One `sprint_issue` fact with its issue as it is now; `issue` is None once deleted (D40).
pub struct FactRow {
    pub issue: Option<ReportIssue>,
    pub points_now: Option<f64>,
    pub added_after_start: bool,
    pub points_at_start: Option<f64>,
    pub outcome: Option<ReportOutcome>,
    pub points_at_close: Option<f64>,
}

/// RP-26: absent, not 0, when no value is estimated.
pub fn total(values: impl IntoIterator<Item = Option<f64>>) -> Option<f64> {
    values
        .into_iter()
        .flatten()
        .reduce(|sum, value| sum + value)
        .map(round)
}

/// Two decimals, so 0.1 + 0.2 reads 0.3 everywhere.
pub fn round(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

/// `history` is newest first, as the history page lists it.
pub fn velocity(history: Vec<SprintTotals>) -> Velocity {
    let mut sprints: Vec<SprintTotals> = history
        .into_iter()
        .filter(|row| row.sprint.state == SprintState::Closed)
        .take(VELOCITY_SPRINTS)
        .collect();
    sprints.reverse();
    let average_completed =
        total(sprints.iter().map(|row| row.completed)).map(|sum| round(sum / sprints.len() as f64));
    Velocity {
        sprints,
        average_completed,
    }
}

pub fn report(
    sprint: Sprint,
    newer_sprint_id: Option<i64>,
    older_sprint_id: Option<i64>,
    rows: Vec<FactRow>,
) -> SprintReport {
    let committed = total(
        rows.iter()
            .filter(|row| !row.added_after_start)
            .map(|row| row.points_at_start),
    );
    let groups = group_rows(rows, sprint.state == SprintState::Closed);
    SprintReport {
        sprint,
        newer_sprint_id,
        older_sprint_id,
        committed,
        completed: groups[0].points_at_end,
        groups,
    }
}

struct Placed {
    outcome: ReportOutcome,
    points_at_start: Option<f64>,
    points_at_end: Option<f64>,
    issue: Option<ReportIssue>,
}

/// D46: the stored outcome decides; without one the live status does, and a deleted issue counts
/// as removed.
fn place(row: FactRow, closed: bool) -> Placed {
    let outcome = row.outcome.unwrap_or(match &row.issue {
        None => ReportOutcome::Removed,
        Some(issue) if issue.status_category == StatusCategory::Done => ReportOutcome::Completed,
        Some(_) => ReportOutcome::NotCompleted,
    });
    let points_at_end = match outcome {
        ReportOutcome::Removed => None,
        _ if closed => row.points_at_close,
        _ => row.points_now,
    };
    let issue = row.issue.map(|issue| ReportIssue {
        points_at_start: row.points_at_start,
        points_at_end,
        added_after_start: row.added_after_start,
        ..issue
    });
    Placed {
        outcome,
        points_at_start: row.points_at_start,
        points_at_end,
        issue,
    }
}

fn group_rows(rows: Vec<FactRow>, closed: bool) -> Vec<ReportGroup> {
    let placed: Vec<Placed> = rows.into_iter().map(|row| place(row, closed)).collect();
    [
        ReportOutcome::Completed,
        ReportOutcome::NotCompleted,
        ReportOutcome::Removed,
    ]
    .into_iter()
    .map(|outcome| {
        let rows: Vec<&Placed> = placed.iter().filter(|row| row.outcome == outcome).collect();
        let deleted: Vec<&&Placed> = rows.iter().filter(|row| row.issue.is_none()).collect();
        ReportGroup {
            outcome,
            points_at_start: total(rows.iter().map(|row| row.points_at_start)),
            points_at_end: total(rows.iter().map(|row| row.points_at_end)),
            issues: rows.iter().filter_map(|row| row.issue.clone()).collect(),
            deleted: (!deleted.is_empty()).then(|| DeletedIssues {
                points_at_start: total(deleted.iter().map(|row| row.points_at_start)),
                points_at_end: total(deleted.iter().map(|row| row.points_at_end)),
            }),
        }
    })
    .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use ReportOutcome::{Completed, NotCompleted, Removed};
    use santi_types::issues::{IssueType, Priority};

    fn sprint(id: i64, state: SprintState) -> Sprint {
        Sprint {
            id,
            name: format!("Sprint {id}"),
            goal: String::new(),
            state,
            starts_at: None,
            ends_at: None,
            started_at: None,
            closed_at: None,
            overdue: false,
        }
    }

    fn totals(id: i64, state: SprintState, completed: Option<f64>) -> SprintTotals {
        SprintTotals {
            sprint: sprint(id, state),
            committed: Some(1.0),
            completed,
        }
    }

    fn issue(key: &str) -> ReportIssue {
        ReportIssue {
            key: key.to_string(),
            summary: "Work".to_string(),
            issue_type: IssueType::Story,
            priority: Priority::Medium,
            status_name: "To Do".to_string(),
            status_category: StatusCategory::Todo,
            epic_key: None,
            epic_summary: None,
            points_at_start: None,
            points_at_end: None,
            added_after_start: false,
        }
    }

    fn fact(key: Option<&str>) -> FactRow {
        FactRow {
            issue: key.map(issue),
            points_now: None,
            added_after_start: false,
            points_at_start: None,
            outcome: None,
            points_at_close: None,
        }
    }

    fn done(key: &str) -> FactRow {
        FactRow {
            issue: Some(ReportIssue {
                status_category: StatusCategory::Done,
                ..issue(key)
            }),
            ..fact(None)
        }
    }

    fn keys(group: &ReportGroup) -> Vec<&str> {
        group
            .issues
            .iter()
            .map(|issue| issue.key.as_str())
            .collect()
    }

    #[test]
    fn total_is_absent_when_nothing_is_estimated() {
        assert_eq!(total([None, None]), None);
        assert_eq!(total([]), None);
        assert_eq!(total([Some(0.0)]), Some(0.0));
        assert_eq!(total([Some(2.0), None, Some(0.5)]), Some(2.5));
    }

    #[test]
    fn totals_and_average_round_to_two_decimals() {
        assert_eq!(total([Some(0.1), Some(0.2)]), Some(0.3));
        let history = vec![
            totals(3, SprintState::Closed, Some(1.0)),
            totals(2, SprintState::Closed, None),
            totals(1, SprintState::Closed, None),
        ];
        assert_eq!(velocity(history).average_completed, Some(0.33));
    }

    #[test]
    fn velocity_keeps_the_seven_latest_closed_oldest_first() {
        let mut history = vec![totals(10, SprintState::Active, Some(1.0))];
        history.extend(
            (1..=9)
                .rev()
                .map(|id| totals(id, SprintState::Closed, Some(1.0))),
        );

        let velocity = velocity(history);

        let ids: Vec<i64> = velocity.sprints.iter().map(|row| row.sprint.id).collect();
        assert_eq!(ids, [3, 4, 5, 6, 7, 8, 9]);
    }

    #[test]
    fn velocity_average_counts_unestimated_sprints_as_zero() {
        let history = vec![
            totals(3, SprintState::Closed, Some(4.0)),
            totals(2, SprintState::Closed, None),
            totals(1, SprintState::Closed, Some(2.0)),
        ];

        assert_eq!(velocity(history).average_completed, Some(2.0));
    }

    #[test]
    fn velocity_average_is_absent_when_every_sprint_is() {
        let unestimated = vec![
            totals(2, SprintState::Closed, None),
            totals(1, SprintState::Closed, None),
        ];

        assert_eq!(velocity(unestimated).average_completed, None);
        let empty = velocity(vec![totals(1, SprintState::Active, Some(3.0))]);
        assert!(empty.sprints.is_empty());
        assert_eq!(empty.average_completed, None);
    }

    #[test]
    fn stored_outcome_decides_the_group() {
        let rows = vec![
            FactRow {
                outcome: Some(Completed),
                points_at_start: Some(1.0),
                points_at_close: Some(3.0),
                points_now: Some(9.0),
                ..fact(Some("SANTI-1"))
            },
            FactRow {
                outcome: Some(NotCompleted),
                points_at_close: Some(2.0),
                ..done("SANTI-2")
            },
        ];

        let report = report(sprint(4, SprintState::Closed), Some(5), Some(3), rows);

        let outcomes: Vec<ReportOutcome> =
            report.groups.iter().map(|group| group.outcome).collect();
        assert_eq!(outcomes, [Completed, NotCompleted, Removed]);
        assert_eq!(keys(&report.groups[0]), ["SANTI-1"]);
        assert_eq!(keys(&report.groups[1]), ["SANTI-2"]);
        assert_eq!(report.groups[0].issues[0].points_at_start, Some(1.0));
        assert_eq!(report.groups[0].issues[0].points_at_end, Some(3.0));
        assert_eq!(report.groups[1].points_at_end, Some(2.0));
        assert!(report.groups[2].issues.is_empty());
        assert_eq!(report.groups[2].points_at_start, None);
        assert_eq!(report.completed, Some(3.0));
        assert_eq!(
            (report.newer_sprint_id, report.older_sprint_id),
            (Some(5), Some(3))
        );
    }

    #[test]
    fn active_rows_without_outcome_group_by_live_status() {
        let rows = vec![
            FactRow {
                points_at_start: Some(2.0),
                points_now: Some(5.0),
                ..done("SANTI-1")
            },
            FactRow {
                points_now: Some(1.0),
                ..fact(Some("SANTI-2"))
            },
        ];

        let report = report(sprint(1, SprintState::Active), None, None, rows);

        assert_eq!(keys(&report.groups[0]), ["SANTI-1"]);
        assert_eq!(report.groups[0].issues[0].points_at_end, Some(5.0));
        assert_eq!(keys(&report.groups[1]), ["SANTI-2"]);
        assert_eq!(report.groups[1].points_at_end, Some(1.0));
        assert_eq!(report.completed, Some(5.0));
    }

    #[test]
    fn deleted_rows_sum_into_one_line_per_group() {
        let rows = vec![
            FactRow {
                outcome: Some(Completed),
                points_at_start: Some(1.0),
                points_at_close: Some(1.0),
                ..fact(None)
            },
            FactRow {
                outcome: Some(Completed),
                points_at_start: Some(2.0),
                points_at_close: Some(3.0),
                ..fact(None)
            },
            FactRow {
                outcome: Some(Completed),
                points_at_close: Some(4.0),
                ..fact(Some("SANTI-3"))
            },
        ];

        let report = report(sprint(1, SprintState::Closed), None, None, rows);

        let completed = &report.groups[0];
        assert_eq!(keys(completed), ["SANTI-3"]);
        assert_eq!(
            completed.deleted,
            Some(DeletedIssues {
                points_at_start: Some(3.0),
                points_at_end: Some(4.0)
            })
        );
        assert_eq!(completed.points_at_start, Some(3.0));
        assert_eq!(completed.points_at_end, Some(8.0));
        assert_eq!(report.groups[1].deleted, None);
        let live = super::report(
            sprint(2, SprintState::Active),
            None,
            None,
            vec![FactRow {
                points_at_start: Some(2.0),
                ..fact(None)
            }],
        );
        assert_eq!(
            live.groups[2].deleted,
            Some(DeletedIssues {
                points_at_start: Some(2.0),
                points_at_end: None
            })
        );
    }

    #[test]
    fn removed_rows_have_no_end_points() {
        let rows = vec![FactRow {
            outcome: Some(Removed),
            points_at_start: Some(3.0),
            points_now: Some(3.0),
            ..fact(Some("SANTI-1"))
        }];

        let report = report(sprint(1, SprintState::Active), None, None, rows);

        let removed = &report.groups[2];
        assert_eq!(keys(removed), ["SANTI-1"]);
        assert_eq!(removed.issues[0].points_at_end, None);
        assert_eq!(removed.points_at_start, Some(3.0));
        assert_eq!(removed.points_at_end, None);
    }

    #[test]
    fn committed_skips_added_after_start() {
        let rows = vec![
            FactRow {
                outcome: Some(Completed),
                points_at_start: Some(3.0),
                points_at_close: Some(3.0),
                ..fact(Some("SANTI-1"))
            },
            FactRow {
                outcome: Some(Completed),
                added_after_start: true,
                points_at_start: Some(5.0),
                points_at_close: Some(5.0),
                ..fact(Some("SANTI-2"))
            },
        ];

        let report = report(sprint(1, SprintState::Closed), None, None, rows);

        assert_eq!(report.committed, Some(3.0));
        assert_eq!(report.completed, Some(8.0));
        assert!(report.groups[0].issues[1].added_after_start);
    }
}
