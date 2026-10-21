use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::boards::StatusCategory;
use crate::issues::{IssueType, Priority};

/// How the other issue relates to this one, read from this issue (D59); declared in display order.
#[cfg_attr(feature = "schemars", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum Relation {
    Blocks,
    IsBlockedBy,
    Relates,
    Duplicates,
    IsDuplicatedBy,
    Clones,
    IsClonedBy,
}

/// The other end of a link.
#[cfg_attr(feature = "schemars", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct LinkedIssue {
    pub key: String,
    pub summary: String,
    pub status_id: i64,
    pub status_name: String,
    pub status_category: StatusCategory,
    pub priority: Priority,
    pub assignee_id: Option<i64>,
    pub assignee_name: Option<String>,
    pub issue_type: IssueType,
}

#[cfg_attr(feature = "schemars", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct IssueLink {
    pub id: i64,
    pub relation: Relation,
    pub issue: LinkedIssue,
}

#[cfg_attr(feature = "schemars", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateLink {
    pub relation: Relation,
    /// The other issue's key, like `OPS-12`; it may be in another project the caller belongs to.
    pub issue: String,
}
