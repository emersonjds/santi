use std::cmp::Reverse;

use santi_types::boards::StatusCategory;
use santi_types::people::{PersonProgress, Tally, TeamProgress};
use santi_types::sprints::Sprint;

use crate::reports::domain::round;

/// An in-progress issue with no update for this many days is stuck (SAN-173).
pub const STUCK_DAYS: i32 = 3;

/// One assignee's issues in one status category.
pub struct TallyRow {
    pub user_id: Option<i64>,
    pub name: Option<String>,
    pub category: StatusCategory,
    pub issues: i64,
    pub points: f64,
    pub stuck: i64,
}

pub fn team_progress(sprint: Option<Sprint>, rows: Vec<TallyRow>) -> TeamProgress {
    let mut people: Vec<PersonProgress> = Vec::new();
    for row in rows {
        let index = match people
            .iter()
            .position(|person| person.user_id == row.user_id)
        {
            Some(index) => index,
            None => {
                people.push(PersonProgress {
                    user_id: row.user_id,
                    name: row.name,
                    to_do: Tally::default(),
                    in_progress: Tally::default(),
                    done: Tally::default(),
                    stuck: 0,
                });
                people.len() - 1
            }
        };
        let person = &mut people[index];
        let tally = match row.category {
            StatusCategory::Todo => &mut person.to_do,
            StatusCategory::InProgress => &mut person.in_progress,
            StatusCategory::Done => &mut person.done,
        };
        tally.issues += row.issues;
        tally.points = round(tally.points + row.points);
        person.stuck += row.stuck;
    }
    people.sort_by_key(|person| {
        (
            person.user_id.is_none(),
            Reverse(person.stuck),
            Reverse(person.in_progress.issues),
            person.name.as_deref().map(str::to_lowercase),
            person.user_id,
        )
    });
    TeamProgress { sprint, people }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(user_id: Option<i64>, category: StatusCategory, issues: i64, stuck: i64) -> TallyRow {
        TallyRow {
            user_id,
            name: user_id.map(|id| format!("user {id}")),
            category,
            issues,
            points: issues as f64 * 1.5,
            stuck,
        }
    }

    fn order(progress: &TeamProgress) -> Vec<Option<i64>> {
        progress
            .people
            .iter()
            .map(|person| person.user_id)
            .collect()
    }

    #[test]
    fn rows_fold_into_one_person_per_assignee() {
        let progress = team_progress(
            None,
            vec![
                row(Some(1), StatusCategory::Todo, 2, 0),
                row(Some(1), StatusCategory::InProgress, 1, 1),
                row(Some(1), StatusCategory::Done, 3, 0),
            ],
        );

        let ana = &progress.people[0];
        assert_eq!(progress.people.len(), 1);
        assert_eq!(ana.name.as_deref(), Some("user 1"));
        assert_eq!(
            ana.to_do,
            Tally {
                issues: 2,
                points: 3.0
            }
        );
        assert_eq!(ana.in_progress.issues, 1);
        assert_eq!(ana.done.points, 4.5);
        assert_eq!(ana.stuck, 1);
    }

    #[test]
    fn most_stuck_first_then_most_in_progress_then_name_and_unassigned_last() {
        let progress = team_progress(
            None,
            vec![
                row(None, StatusCategory::InProgress, 9, 9),
                row(Some(4), StatusCategory::InProgress, 1, 0),
                row(Some(3), StatusCategory::InProgress, 1, 0),
                row(Some(2), StatusCategory::InProgress, 5, 0),
                row(Some(1), StatusCategory::InProgress, 1, 1),
            ],
        );

        assert_eq!(order(&progress), [Some(1), Some(2), Some(3), Some(4), None]);
    }

    #[test]
    fn names_sort_ignoring_case_and_ties_fall_back_to_the_user_id() {
        let named = |user_id: i64, name: &str| TallyRow {
            name: Some(name.into()),
            ..row(Some(user_id), StatusCategory::Todo, 1, 0)
        };
        let progress = team_progress(
            None,
            vec![
                named(2, "Zed"),
                named(1, "bob"),
                named(9, "Deleted user"),
                named(8, "Deleted user"),
            ],
        );

        assert_eq!(order(&progress), [Some(1), Some(8), Some(9), Some(2)]);
    }
}
