use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};

use crate::issues::{IssueType, Priority};
use crate::projects::BoardType;
use crate::sprints::{Sprint, SprintLength};

#[cfg_attr(feature = "schemars", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[cfg_attr(
    feature = "sqlx",
    derive(sqlx::Type),
    sqlx(type_name = "text", rename_all = "snake_case")
)]
#[serde(rename_all = "snake_case")]
pub enum StatusCategory {
    Todo,
    InProgress,
    Done,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct Status {
    pub id: i64,
    pub name: String,
    pub category: StatusCategory,
    /// None = unmapped: issues in this status are hidden from board and backlog (D30).
    pub column_id: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct Column {
    pub id: i64,
    pub name: String,
    pub position: i32,
    pub wip_limit: Option<i32>,
    pub statuses: Vec<Status>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct BoardSettings {
    pub board_type: BoardType,
    pub done_window_days: Option<i32>,
    /// Left to right.
    pub columns: Vec<Column>,
    pub unmapped: Vec<Status>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateBoardSettings {
    /// 7, 14, 30, or null for never (kanban only, D8).
    #[serde(default)]
    pub done_window_days: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateColumn {
    pub name: String,
    /// Also create a status with the column's name and this category (SB-5).
    #[serde(default)]
    pub new_status: Option<StatusCategory>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateColumn {
    pub name: String,
    #[serde(default)]
    pub wip_limit: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ReorderColumns {
    pub column_ids: Vec<i64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct DeleteColumnParams {
    /// Column that receives the deleted column's statuses (D16); required when it has any.
    #[serde(default)]
    pub move_statuses_to: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateStatus {
    pub name: String,
    pub category: StatusCategory,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateStatus {
    pub name: String,
    /// The column to map to; null unmaps the status.
    #[serde(default)]
    pub column_id: Option<i64>,
}

/// One issue as the board draws it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct Card {
    pub id: i64,
    pub key: String,
    pub summary: String,
    pub issue_type: IssueType,
    pub priority: Priority,
    pub status_id: i64,
    pub column_id: i64,
    pub assignee_id: Option<i64>,
    pub assignee_name: Option<String>,
    /// Shows Delete to the reporter as well as admins (D40).
    pub reporter_id: i64,
    pub points: Option<f64>,
    pub labels: Vec<String>,
    /// Shown as a chip on subtasks and children of epics (D6).
    pub parent_key: Option<String>,
    pub sprint_id: Option<i64>,
    pub open_subtasks: i64,
    pub total_subtasks: i64,
    pub rank: String,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct BoardColumnView {
    pub id: i64,
    pub name: String,
    pub wip_limit: Option<i32>,
    /// Every card in the column, quick filters ignored (D7, KB-15).
    pub issue_count: i64,
    pub over_limit: bool,
    /// The cards that pass the quick filters, in rank order.
    pub cards: Vec<Card>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct BoardView {
    pub board_type: BoardType,
    /// The active sprint on a scrum board (SB-11); always null on kanban.
    pub sprint: Option<Sprint>,
    /// Left to right.
    pub columns: Vec<BoardColumnView>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct BacklogSection {
    /// Null for the no-sprint section, which is always last.
    pub sprint: Option<Sprint>,
    /// Quick filters ignored (D11).
    pub issue_count: i64,
    pub total_points: f64,
    pub cards: Vec<Card>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct EpicSummary {
    pub key: String,
    pub summary: String,
    pub child_count: i64,
    pub done_child_count: i64,
    pub done: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct Backlog {
    pub sections: Vec<BacklogSection>,
    pub epics: Vec<EpicSummary>,
    /// Length of the board's last started sprint (D48); null means two weeks.
    #[schema(value_type = Option<String>, example = "2w")]
    pub sprint_length: Option<SprintLength>,
}
