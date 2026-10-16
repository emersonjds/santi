use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};

use crate::boards::StatusCategory;
use crate::issues::IssueType;
use crate::projects::{BoardType, MemberRole};

/// A project on the caller's home: recently visited or worked first, then starred, then by key.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct MyProject {
    pub key: String,
    pub name: String,
    pub board_type: BoardType,
    pub role: MemberRole,
    /// The project's oldest admin account.
    pub lead_name: String,
    pub starred: bool,
    /// Issues assigned to the caller that are not done.
    pub open_assigned: i64,
}

/// The lists of the home ("For you").
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum HomeView {
    /// Assigned (open), worked on, viewed and starred together.
    #[default]
    Recommended,
    /// Assigned to the caller and not done.
    Assigned,
    Starred,
    /// Created, edited, moved or commented on by the caller.
    Worked,
    Viewed,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct HomeQuery {
    #[serde(default)]
    pub view: HomeView,
}

/// One row of a home list, from any project the caller belongs to.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct HomeIssue {
    pub key: String,
    pub summary: String,
    pub issue_type: IssueType,
    pub status_category: StatusCategory,
    pub project_key: String,
    pub project_name: String,
    pub assignee_name: Option<String>,
    pub starred: bool,
    /// When the row entered the list: last view, last write, star, or last change (assigned).
    pub at: DateTime<Utc>,
}

/// A project key (`WEB`) or an issue key (`WEB-12`).
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct Star {
    pub key: String,
}
