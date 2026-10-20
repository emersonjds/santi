use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};

/// Why the caller is told (SAN-172): one event per person per change: an assignment first, then a mention, then a comment.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[cfg_attr(
    feature = "sqlx",
    derive(sqlx::Encode, sqlx::Decode),
    sqlx(rename_all = "snake_case")
)]
#[serde(rename_all = "snake_case")]
pub enum NotificationKind {
    /// @mentioned in a comment or a description.
    Mention,
    /// The issue was assigned to the caller.
    Assigned,
    /// A comment on an issue the caller reported or is assigned to.
    Comment,
}

/// One notification of the caller, newest first.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct Notification {
    pub id: i64,
    pub kind: NotificationKind,
    pub actor_id: i64,
    pub actor_name: String,
    pub project_key: String,
    /// `WEB-12`.
    pub issue_key: String,
    pub issue_summary: String,
    /// The comment it is about, if any.
    pub comment_id: Option<i64>,
    /// The first 140 characters of the comment, or else of the description; untrusted Markdown.
    pub excerpt: String,
    pub created_at: DateTime<Utc>,
    pub read_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct NotificationQuery {
    /// Only unread notifications.
    #[serde(default)]
    pub unread: bool,
    /// Only this kind; every kind when absent.
    #[serde(default)]
    #[param(inline)]
    pub kind: Option<NotificationKind>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct UnreadCount {
    pub count: i64,
}
