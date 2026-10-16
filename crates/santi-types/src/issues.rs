use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[cfg_attr(
    feature = "sqlx",
    derive(sqlx::Type),
    sqlx(type_name = "text", rename_all = "snake_case")
)]
#[serde(rename_all = "snake_case")]
pub enum IssueType {
    Epic,
    #[default]
    Story,
    Task,
    Bug,
    Subtask,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[cfg_attr(
    feature = "sqlx",
    derive(sqlx::Type),
    sqlx(type_name = "text", rename_all = "snake_case")
)]
#[serde(rename_all = "snake_case")]
pub enum Priority {
    Urgent,
    High,
    #[default]
    Medium,
    Low,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, ToSchema)]
pub struct CreateIssue {
    pub summary: String,
    #[serde(default)]
    pub issue_type: IssueType,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub priority: Priority,
    /// Defaults to the project's first mapped to-do status (D5).
    #[serde(default)]
    pub status_id: Option<i64>,
    #[serde(default)]
    pub assignee_id: Option<i64>,
    #[serde(default)]
    pub points: Option<f64>,
    #[serde(default)]
    pub labels: Vec<String>,
    /// Parent issue key, e.g. `SANTI-3`.
    #[serde(default)]
    pub parent: Option<String>,
    /// Plan the issue into this sprint; subtasks always take their parent's sprint (D6).
    #[serde(default)]
    pub sprint_id: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct Issue {
    pub id: i64,
    pub key: String,
    pub number: i64,
    pub summary: String,
    pub description: String,
    pub issue_type: IssueType,
    pub priority: Priority,
    pub status_id: i64,
    pub assignee_id: Option<i64>,
    pub reporter_id: i64,
    pub points: Option<f64>,
    pub labels: Vec<String>,
    pub parent_key: Option<String>,
    pub sprint_id: Option<i64>,
    pub rank: String,
    pub done_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

/// Absent fields stay as they are; `null` clears a nullable field.
#[derive(Debug, Clone, Default, Serialize, Deserialize, ToSchema)]
pub struct UpdateIssue {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub issue_type: Option<IssueType>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub priority: Option<Priority>,
    #[serde(
        default,
        deserialize_with = "crate::nullable_field",
        skip_serializing_if = "Option::is_none"
    )]
    #[schema(value_type = Option<i64>)]
    pub assignee_id: Option<Option<i64>>,
    #[serde(
        default,
        deserialize_with = "crate::nullable_field",
        skip_serializing_if = "Option::is_none"
    )]
    #[schema(value_type = Option<f64>)]
    pub points: Option<Option<f64>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub labels: Option<Vec<String>>,
    #[serde(
        default,
        deserialize_with = "crate::nullable_field",
        skip_serializing_if = "Option::is_none"
    )]
    #[schema(value_type = Option<String>)]
    pub parent: Option<Option<String>>,
}

impl IssueType {
    pub fn label(self) -> &'static str {
        match self {
            IssueType::Epic => "Epic",
            IssueType::Story => "Story",
            IssueType::Task => "Task",
            IssueType::Bug => "Bug",
            IssueType::Subtask => "Subtask",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::IssueType;

    #[test]
    fn every_type_has_a_label() {
        let labels: Vec<&str> = [
            IssueType::Epic,
            IssueType::Story,
            IssueType::Task,
            IssueType::Bug,
            IssueType::Subtask,
        ]
        .map(IssueType::label)
        .to_vec();
        assert_eq!(labels, ["Epic", "Story", "Task", "Bug", "Subtask"]);
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, ToSchema)]
pub struct MoveIssue {
    /// New status; absent keeps the current one.
    #[serde(default)]
    pub status_id: Option<i64>,
    /// Place right after this issue key (D4). Send at most one of `after` and `before`.
    #[serde(default)]
    pub after: Option<String>,
    /// Place right before this issue key.
    #[serde(default)]
    pub before: Option<String>,
    /// Absent keeps the sprint; `null` sends the issue (and its subtasks) to the backlog.
    #[serde(
        default,
        deserialize_with = "crate::nullable_field",
        skip_serializing_if = "Option::is_none"
    )]
    #[schema(value_type = Option<i64>)]
    pub sprint_id: Option<Option<i64>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct Comment {
    pub id: i64,
    pub author_id: i64,
    pub body: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct CreateComment {
    pub body: String,
}

/// One keyset page (D29): pass `next_cursor` back as `cursor` for the next page; null means last page.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct Page<T> {
    pub items: Vec<T>,
    pub next_cursor: Option<i64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct PageParams {
    /// 1 to 200, default 50.
    #[serde(default)]
    pub limit: Option<i64>,
    #[serde(default)]
    pub cursor: Option<i64>,
}

/// Quick filters (D3): repeated values of one key mean "any of them"; different keys must all match.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct IssueFilter {
    /// Assignee user ids.
    #[serde(default)]
    pub assignee: Vec<i64>,
    #[serde(default, rename = "type")]
    pub issue_type: Vec<IssueType>,
    #[serde(default)]
    pub label: Vec<String>,
    /// Parent issue keys, e.g. an epic's `SANTI-3`.
    #[serde(default)]
    pub parent: Vec<String>,
    /// Free text matched against the summary, ignoring case.
    #[serde(default)]
    pub q: Option<String>,
}
