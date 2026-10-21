use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::sprints::Sprint;

/// Who is doing what: the active sprint on Scrum, the board on Kanban (done window applied).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct TeamProgress {
    /// The active sprint; null on Kanban and on Scrum with no sprint running (then `people` is empty).
    pub sprint: Option<Sprint>,
    /// Most stuck first, then most in progress, then by name; Unassigned last.
    pub people: Vec<PersonProgress>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct PersonProgress {
    /// Null for the Unassigned row.
    pub user_id: Option<i64>,
    pub name: Option<String>,
    pub to_do: Tally,
    pub in_progress: Tally,
    pub done: Tally,
    /// In progress with no update for 3 days or more.
    pub stuck: i64,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct Tally {
    pub issues: i64,
    /// Unestimated issues count as 0.
    pub points: f64,
}
