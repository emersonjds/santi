use santi_types::boards::{BoardColumnView, BoardSettings, Card, Column, Status, StatusCategory};
use santi_types::projects::BoardType;

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

/// Cards arrive in rank order; each column keeps that order.
pub fn build_board_columns(columns: Vec<ColumnRow>, cards: Vec<Card>) -> Vec<BoardColumnView> {
    columns
        .into_iter()
        .map(|column| {
            let in_column: Vec<Card> = cards
                .iter()
                .filter(|card| card.column_id == column.id)
                .cloned()
                .collect();
            let issue_count = in_column.len() as i64;
            BoardColumnView {
                over_limit: column
                    .wip_limit
                    .is_some_and(|limit| issue_count > i64::from(limit)),
                cards: in_column,
                id: column.id,
                name: column.name,
                wip_limit: column.wip_limit,
                issue_count,
            }
        })
        .collect()
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
}
