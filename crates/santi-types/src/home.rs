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
    /// The project's oldest admin account, if it has one.
    pub lead_name: Option<String>,
    pub starred: bool,
    /// Issues assigned to the caller that are not done.
    pub open_assigned: i64,
    pub starred_at: Option<DateTime<Utc>>,
    /// The caller's last visit or newest view or work on its issues.
    pub visited_at: Option<DateTime<Utc>>,
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
    #[param(inline)]
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[cfg_attr(
    feature = "sqlx",
    derive(sqlx::Encode, sqlx::Decode),
    sqlx(rename_all = "snake_case")
)]
#[serde(rename_all = "snake_case")]
pub enum ItemKind {
    Project,
    Issue,
}

/// A project or an issue in the sidebar's Recent and Starred lists.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct MyItem {
    pub kind: ItemKind,
    /// `WEB` or `WEB-12`.
    pub key: String,
    /// The project name or the issue summary.
    pub name: String,
    pub project_key: String,
    pub project_name: String,
    pub board_type: BoardType,
    /// Issues only.
    pub issue_type: Option<IssueType>,
    /// Last visit, view or work (recent), or the star time (starred).
    pub at: DateTime<Utc>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct RecentQuery {
    /// Case-insensitive text in the name or the key.
    #[serde(default)]
    pub q: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct StarredQuery {
    /// Only projects or only issues; both when absent.
    #[serde(default)]
    #[param(inline)]
    pub kind: Option<ItemKind>,
    /// Case-insensitive text in the name or the key.
    #[serde(default)]
    pub q: Option<String>,
}

/// A project key (`WEB`) or an issue key (`WEB-12`).
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct Star {
    pub key: String,
}

/// D45: what the home keeps about the caller, with the times.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct HomeExport {
    /// Projects the caller starred or opened.
    pub projects: Vec<ProjectActivity>,
    /// Issues the caller starred, opened or worked on.
    pub issues: Vec<IssueActivity>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ProjectActivity {
    pub key: String,
    pub starred_at: Option<DateTime<Utc>>,
    pub visited_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct IssueActivity {
    pub key: String,
    pub starred_at: Option<DateTime<Utc>>,
    pub viewed_at: Option<DateTime<Utc>>,
    /// Last create, edit, move or comment.
    pub worked_at: Option<DateTime<Utc>>,
}
