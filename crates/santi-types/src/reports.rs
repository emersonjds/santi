use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::boards::StatusCategory;
use crate::issues::{IssueType, Priority};
use crate::sprints::Sprint;

/// A started sprint with its points (D46); a total is null when nothing in it was estimated (RP-26).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct SprintTotals {
    pub sprint: Sprint,
    /// Start points of the issues present at start.
    pub committed: Option<f64>,
    /// End points of the completed issues; live for the active sprint.
    pub completed: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct Velocity {
    /// Up to the 7 latest closed sprints, oldest first.
    pub sprints: Vec<SprintTotals>,
    /// A sprint with no estimated completed work counts as 0; null when every shown sprint is.
    pub average_completed: Option<f64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[cfg_attr(
    feature = "sqlx",
    derive(sqlx::Type),
    sqlx(type_name = "text", rename_all = "snake_case")
)]
#[serde(rename_all = "snake_case")]
pub enum ReportOutcome {
    Completed,
    NotCompleted,
    Removed,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct ReportIssue {
    pub key: String,
    pub summary: String,
    pub issue_type: IssueType,
    pub priority: Priority,
    pub status_name: String,
    pub status_category: StatusCategory,
    pub epic_key: Option<String>,
    pub epic_summary: Option<String>,
    pub points_at_start: Option<f64>,
    /// Null for removed issues (OQ-9).
    pub points_at_end: Option<f64>,
    pub added_after_start: bool,
}

/// Deleted issues lost their key and type (D40); a group sums them into one line.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct DeletedIssues {
    pub points_at_start: Option<f64>,
    pub points_at_end: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct ReportGroup {
    pub outcome: ReportOutcome,
    pub points_at_start: Option<f64>,
    pub points_at_end: Option<f64>,
    /// By issue number; subtasks are never rows (RP-30).
    pub issues: Vec<ReportIssue>,
    pub deleted: Option<DeletedIssues>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct SprintReport {
    pub sprint: Sprint,
    /// Neighbors among the board's started sprints, newest first (D46).
    pub newer_sprint_id: Option<i64>,
    pub older_sprint_id: Option<i64>,
    pub committed: Option<f64>,
    pub completed: Option<f64>,
    /// Completed, not completed and removed, always in that order.
    pub groups: Vec<ReportGroup>,
}
