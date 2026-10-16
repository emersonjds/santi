use santi_types::boards::{
    BacklogSection, BoardColumnView, BoardSettings, Card, Column, Status, StatusCategory,
};
use santi_types::issues::IssueFilter;
use santi_types::projects::BoardType;
use santi_types::sprints::Sprint;

use crate::error::AppError;

/// SB-1: every new board starts with these columns, each holding the status of the same name.
pub const DEFAULT_LAYOUT: [(&str, StatusCategory); 3] = [
    ("To Do", StatusCategory::Todo),
    ("In Progress", StatusCategory::InProgress),
    ("Done", StatusCategory::Done),
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ColumnRow {
    pub id: i64,
    pub name: String,
    pub position: i32,
    pub wip_limit: Option<i32>,
}

/// One column, left to right, with the categories of the statuses mapped to it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LayoutColumn {
    pub id: i64,
    pub categories: Vec<StatusCategory>,
}

pub fn check_name(field: &str, name: &str) -> Result<String, AppError> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 60 {
        return Err(AppError::invalid(field, "must have 1 to 60 characters"));
    }
    Ok(name.to_string())
}

/// D2, strict: done statuses map only to the rightmost column, which holds only done statuses.
pub fn check_done_mapping(layout: &[LayoutColumn]) -> Result<(), AppError> {
    let rightmost = layout.len().saturating_sub(1);
    for (index, column) in layout.iter().enumerate() {
        let is_rightmost = index == rightmost;
        let misplaced = column
            .categories
            .iter()
            .any(|category| (*category == StatusCategory::Done) != is_rightmost);
        if misplaced {
            return Err(AppError::conflict(
                "done-column",
                "Done statuses belong in the rightmost column, and that column holds only done statuses.",
            ));
        }
    }
    Ok(())
}

/// D16: returns the column that receives the statuses, or None when the column holds none.
pub fn check_column_deletion(
    layout: &[LayoutColumn],
    column_id: i64,
    move_to: Option<i64>,
) -> Result<Option<i64>, AppError> {
    let Some(position) = layout.iter().position(|column| column.id == column_id) else {
        return Err(AppError::NotFound);
    };
    if position + 1 == layout.len() {
        return Err(AppError::conflict(
            "rightmost-column",
            "The rightmost column holds done work and cannot be deleted.",
        ));
    }
    if layout[position].categories.is_empty() {
        return Ok(None);
    }
    let Some(target) = move_to else {
        return Err(AppError::invalid(
            "move_statuses_to",
            "pick the column that receives this column's statuses",
        ));
    };
    let target_is_another_column =
        target != column_id && layout.iter().any(|column| column.id == target);
    if !target_is_another_column {
        return Err(AppError::invalid(
            "move_statuses_to",
            "must be another column of this board",
        ));
    }
    Ok(Some(target))
}

pub fn check_same_columns(current: &[i64], requested: &[i64]) -> Result<(), AppError> {
    let mut current = current.to_vec();
    let mut requested = requested.to_vec();
    current.sort_unstable();
    requested.sort_unstable();
    if current != requested {
        return Err(AppError::invalid(
            "column_ids",
            "must list every column of the board exactly once",
        ));
    }
    Ok(())
}

pub fn check_wip_limit(board_type: BoardType, wip_limit: Option<i32>) -> Result<(), AppError> {
    let Some(limit) = wip_limit else {
        return Ok(());
    };
    if board_type == BoardType::Scrum {
        return Err(AppError::invalid(
            "wip_limit",
            "column limits exist only on kanban boards",
        ));
    }
    if limit < 1 {
        return Err(AppError::invalid("wip_limit", "must be at least 1"));
    }
    Ok(())
}

pub fn check_done_window(board_type: BoardType, days: Option<i32>) -> Result<(), AppError> {
    if board_type == BoardType::Scrum && days.is_some() {
        return Err(AppError::invalid(
            "done_window_days",
            "only kanban boards hide done work",
        ));
    }
    if !matches!(days, None | Some(7) | Some(14) | Some(30)) {
        return Err(AppError::invalid(
            "done_window_days",
            "must be 7, 14, 30 or null",
        ));
    }
    Ok(())
}

pub fn assemble_settings(
    board_type: BoardType,
    done_window_days: Option<i32>,
    columns: Vec<ColumnRow>,
    statuses: Vec<Status>,
) -> BoardSettings {
    let columns = columns
        .into_iter()
        .map(|column| Column {
            statuses: statuses
                .iter()
                .filter(|status| status.column_id == Some(column.id))
                .cloned()
                .collect(),
            id: column.id,
            name: column.name,
            position: column.position,
            wip_limit: column.wip_limit,
        })
        .collect();
    let unmapped = statuses
        .into_iter()
        .filter(|status| status.column_id.is_none())
        .collect();
    BoardSettings {
        board_type,
        done_window_days,
        columns,
        unmapped,
    }
}

/// D9: the kanban board's first column is its backlog.
pub fn require_backlog(board_type: BoardType) -> Result<(), AppError> {
    if board_type == BoardType::Kanban {
        return Err(AppError::conflict(
            "kanban-has-no-backlog",
            "Kanban boards have no backlog; the first column is the intake list.",
        ));
    }
    Ok(())
}

/// D3: each filter kind matches when empty or when any of its values matches; kinds are AND-ed.
pub fn matches_filter(card: &Card, filter: &IssueFilter) -> bool {
    let assignee_matches = filter.assignee.is_empty()
        || card
            .assignee_id
            .is_some_and(|id| filter.assignee.contains(&id));
    let type_matches = filter.issue_type.is_empty() || filter.issue_type.contains(&card.issue_type);
    let label_matches =
        filter.label.is_empty() || card.labels.iter().any(|label| filter.label.contains(label));
    let parent_matches = filter.parent.is_empty()
        || card
            .parent_key
            .as_ref()
            .is_some_and(|key| filter.parent.contains(key));
    let text = filter
        .q
        .as_deref()
        .map(str::trim)
        .filter(|text| !text.is_empty());
    let text_matches =
        text.is_none_or(|text| card.summary.to_lowercase().contains(&text.to_lowercase()));
    assignee_matches && type_matches && label_matches && parent_matches && text_matches
}

/// Cards arrive in rank order; each column keeps that order.
pub fn build_board_columns(
    columns: Vec<ColumnRow>,
    cards: Vec<Card>,
    filter: &IssueFilter,
) -> Vec<BoardColumnView> {
    columns
        .into_iter()
        .map(|column| {
            let in_column: Vec<&Card> = cards
                .iter()
                .filter(|card| card.column_id == column.id)
                .collect();
            let issue_count = in_column.len() as i64;
            BoardColumnView {
                over_limit: column
                    .wip_limit
                    .is_some_and(|limit| issue_count > i64::from(limit)),
                cards: in_column
                    .into_iter()
                    .filter(|card| matches_filter(card, filter))
                    .cloned()
                    .collect(),
                id: column.id,
                name: column.name,
                wip_limit: column.wip_limit,
                issue_count,
            }
        })
        .collect()
}

/// BL-1: the given sprints in order, then the no-sprint section.
pub fn build_backlog_sections(
    sprints: Vec<Sprint>,
    cards: Vec<Card>,
    filter: &IssueFilter,
) -> Vec<BacklogSection> {
    let mut sections: Vec<BacklogSection> = sprints
        .into_iter()
        .map(|sprint| backlog_section(Some(sprint), &cards, filter))
        .collect();
    sections.push(backlog_section(None, &cards, filter));
    sections
}

fn backlog_section(sprint: Option<Sprint>, cards: &[Card], filter: &IssueFilter) -> BacklogSection {
    let sprint_id = sprint.as_ref().map(|sprint| sprint.id);
    let in_section: Vec<&Card> = cards
        .iter()
        .filter(|card| card.sprint_id == sprint_id)
        .collect();
    BacklogSection {
        issue_count: in_section.len() as i64,
        total_points: in_section
            .iter()
            .filter_map(|card| card.points)
            .fold(0.0, |total, points| total + points),
        cards: in_section
            .into_iter()
            .filter(|card| matches_filter(card, filter))
            .cloned()
            .collect(),
        sprint,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use santi_types::boards::StatusCategory::{Done, InProgress, Todo};

    fn layout(columns: &[(i64, &[StatusCategory])]) -> Vec<LayoutColumn> {
        columns
            .iter()
            .map(|(id, categories)| LayoutColumn {
                id: *id,
                categories: categories.to_vec(),
            })
            .collect()
    }

    #[test]
    fn default_layout_satisfies_the_done_rule() {
        assert!(
            check_done_mapping(&layout(&[(1, &[Todo]), (2, &[InProgress]), (3, &[Done])])).is_ok()
        );
    }

    #[test]
    fn done_status_outside_the_rightmost_column_is_refused() {
        let error = check_done_mapping(&layout(&[(1, &[Todo, Done]), (2, &[Done])])).unwrap_err();
        assert_eq!(
            error.to_problem().problem_type,
            "urn:santi:error:done-column"
        );
    }

    #[test]
    fn non_done_status_in_the_rightmost_column_is_refused() {
        assert!(check_done_mapping(&layout(&[(1, &[Todo]), (2, &[Done, InProgress])])).is_err());
    }

    #[test]
    fn empty_columns_and_empty_boards_pass() {
        assert!(check_done_mapping(&layout(&[(1, &[Todo]), (2, &[])])).is_ok());
        assert!(check_done_mapping(&[]).is_ok());
    }

    #[test]
    fn column_deletion_rules() {
        let board = layout(&[(1, &[Todo]), (2, &[]), (3, &[Done])]);
        assert_eq!(
            check_column_deletion(&board, 9, None),
            Err(AppError::NotFound)
        );
        assert!(check_column_deletion(&board, 3, Some(1)).is_err());
        assert_eq!(check_column_deletion(&board, 2, None), Ok(None));
        assert!(check_column_deletion(&board, 1, None).is_err());
        assert!(check_column_deletion(&board, 1, Some(1)).is_err());
        assert!(check_column_deletion(&board, 1, Some(9)).is_err());
        assert_eq!(check_column_deletion(&board, 1, Some(2)), Ok(Some(2)));
    }

    #[test]
    fn reorder_must_list_every_column_once() {
        assert!(check_same_columns(&[1, 2, 3], &[3, 1, 2]).is_ok());
        assert!(check_same_columns(&[1, 2, 3], &[1, 2]).is_err());
        assert!(check_same_columns(&[1, 2, 3], &[1, 2, 2]).is_err());
    }

    #[test]
    fn wip_limits_are_kanban_only_and_positive() {
        assert!(check_wip_limit(BoardType::Kanban, Some(3)).is_ok());
        assert!(check_wip_limit(BoardType::Kanban, None).is_ok());
        assert!(check_wip_limit(BoardType::Kanban, Some(0)).is_err());
        assert!(check_wip_limit(BoardType::Scrum, Some(3)).is_err());
        assert!(check_wip_limit(BoardType::Scrum, None).is_ok());
    }

    #[test]
    fn done_window_accepts_only_the_offered_choices() {
        for days in [None, Some(7), Some(14), Some(30)] {
            assert!(check_done_window(BoardType::Kanban, days).is_ok());
        }
        assert!(check_done_window(BoardType::Kanban, Some(10)).is_err());
        assert!(check_done_window(BoardType::Scrum, Some(14)).is_err());
        assert!(check_done_window(BoardType::Scrum, None).is_ok());
    }

    #[test]
    fn names_are_trimmed_and_bounded() {
        assert_eq!(check_name("name", " Review ").unwrap(), "Review");
        assert!(check_name("name", "").is_err());
        assert!(check_name("name", &"x".repeat(61)).is_err());
    }

    #[test]
    fn settings_group_statuses_by_column() {
        let columns = vec![ColumnRow {
            id: 1,
            name: "To Do".into(),
            position: 0,
            wip_limit: None,
        }];
        let statuses = vec![
            Status {
                id: 10,
                name: "To Do".into(),
                category: Todo,
                column_id: Some(1),
            },
            Status {
                id: 11,
                name: "Parked".into(),
                category: Todo,
                column_id: None,
            },
        ];

        let settings = assemble_settings(BoardType::Scrum, None, columns, statuses);

        assert_eq!(settings.columns[0].statuses[0].id, 10);
        assert_eq!(settings.unmapped[0].id, 11);
    }

    use santi_types::issues::{IssueType, Priority};
    use santi_types::sprints::SprintState;

    fn card(id: i64, column_id: i64, sprint_id: Option<i64>, points: Option<f64>) -> Card {
        Card {
            id,
            key: format!("SANTI-{id}"),
            summary: format!("Card {id}"),
            issue_type: IssueType::Story,
            priority: Priority::Medium,
            status_id: 1,
            column_id,
            assignee_id: None,
            assignee_name: None,
            points,
            labels: vec![],
            parent_key: None,
            sprint_id,
            open_subtasks: 0,
            total_subtasks: 0,
            rank: format!("{id}"),
        }
    }

    fn open_sprint(id: i64) -> Sprint {
        Sprint {
            id,
            name: format!("Sprint {id}"),
            goal: String::new(),
            state: SprintState::Future,
            start_date: None,
            end_date: None,
            started_at: None,
            closed_at: None,
            overdue: false,
        }
    }

    #[test]
    fn filter_kinds_are_and_ed_and_values_or_ed() {
        let mut bug = card(1, 1, None, None);
        bug.issue_type = IssueType::Bug;
        bug.labels = vec!["ui".into()];
        bug.assignee_id = Some(7);
        bug.parent_key = Some("SANTI-9".into());
        let either = IssueFilter {
            issue_type: vec![IssueType::Bug, IssueType::Task],
            ..IssueFilter::default()
        };
        let narrowed = IssueFilter {
            label: vec!["docs".into()],
            ..either.clone()
        };

        assert!(matches_filter(&bug, &IssueFilter::default()));
        assert!(matches_filter(&bug, &either));
        assert!(!matches_filter(&bug, &narrowed));
        assert!(matches_filter(
            &bug,
            &IssueFilter {
                assignee: vec![7, 8],
                ..IssueFilter::default()
            }
        ));
        assert!(!matches_filter(
            &bug,
            &IssueFilter {
                assignee: vec![8],
                ..IssueFilter::default()
            }
        ));
        assert!(matches_filter(
            &bug,
            &IssueFilter {
                parent: vec!["SANTI-9".into()],
                ..IssueFilter::default()
            }
        ));
        assert!(matches_filter(
            &bug,
            &IssueFilter {
                q: Some(" CARD ".into()),
                ..IssueFilter::default()
            }
        ));
        assert!(!matches_filter(
            &bug,
            &IssueFilter {
                q: Some("login".into()),
                ..IssueFilter::default()
            }
        ));
    }

    #[test]
    fn board_columns_count_every_card_but_show_filtered_ones() {
        let columns = vec![
            ColumnRow {
                id: 1,
                name: "To Do".into(),
                position: 0,
                wip_limit: Some(1),
            },
            ColumnRow {
                id: 2,
                name: "Done".into(),
                position: 1,
                wip_limit: None,
            },
        ];
        let mut assigned = card(2, 1, None, None);
        assigned.assignee_id = Some(7);
        let cards = vec![card(1, 1, None, None), assigned];
        let mine = IssueFilter {
            assignee: vec![7],
            ..IssueFilter::default()
        };

        let view = build_board_columns(columns, cards, &mine);

        assert_eq!(view[0].issue_count, 2);
        assert!(view[0].over_limit);
        assert_eq!(view[0].cards.len(), 1);
        assert_eq!(view[1].issue_count, 0);
        assert!(!view[1].over_limit);
    }

    #[test]
    fn backlog_sections_follow_sprint_order_with_unfiltered_totals() {
        let cards = vec![
            card(1, 1, Some(5), Some(3.0)),
            card(2, 1, Some(5), None),
            card(3, 1, None, Some(5.0)),
        ];
        let only_ui = IssueFilter {
            label: vec!["ui".into()],
            ..IssueFilter::default()
        };

        let sections =
            build_backlog_sections(vec![open_sprint(5), open_sprint(6)], cards, &only_ui);

        assert_eq!(sections.len(), 3);
        assert_eq!(sections[0].issue_count, 2);
        assert_eq!(sections[0].total_points, 3.0);
        assert!(sections[0].cards.is_empty());
        assert_eq!(sections[1].issue_count, 0);
        assert_eq!(sections[1].total_points.to_string(), "0");
        assert!(sections[2].sprint.is_none());
        assert_eq!(sections[2].total_points, 5.0);
    }

    #[test]
    fn kanban_boards_have_no_backlog() {
        assert!(require_backlog(BoardType::Scrum).is_ok());
        assert!(require_backlog(BoardType::Kanban).is_err());
    }
}
