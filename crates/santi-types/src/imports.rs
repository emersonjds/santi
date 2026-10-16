use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::boards::StatusCategory;
use crate::issues::IssueType;

/// Where a CSV export came from, told apart by its header row (D41).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, ToSchema)]
#[cfg_attr(
    feature = "sqlx",
    derive(sqlx::Type),
    sqlx(type_name = "text", rename_all = "snake_case")
)]
#[serde(rename_all = "snake_case")]
pub enum ImportSource {
    Jira,
    Linear,
}

/// What the file holds, before anything is written.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct ImportPreview {
    pub source: ImportSource,
    pub row_count: i64,
    /// santi field → the file columns read for it.
    pub columns: Vec<ColumnUse>,
    pub statuses: Vec<StatusFound>,
    /// Assignees and reporters, once each.
    pub people: Vec<PersonFound>,
    pub sprints: Vec<SprintFound>,
    pub issue_types: Vec<TypeFound>,
    /// The first 100 problems.
    pub problems: Vec<RowProblem>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct ColumnUse {
    pub field: String,
    pub columns: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct StatusFound {
    pub name: String,
    pub count: i64,
    /// From the file's status category column, or guessed from the name.
    pub category: StatusCategory,
    /// Same name in this project, else its first status of the same category.
    pub suggested_status_id: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct PersonFound {
    pub name: String,
    pub count: i64,
    /// The project member with this email, if any.
    pub member_id: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct SprintFound {
    pub name: String,
    pub count: i64,
    /// An issue moved on from it, or its cycle ended.
    pub closed: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct TypeFound {
    pub name: String,
    pub count: i64,
    pub suggested: IssueType,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct RowProblem {
    /// Line in the file where the row starts; the header is line 1.
    pub line: i64,
    pub message: String,
}

/// What a sprint name in the file becomes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum SprintAction {
    Future,
    Closed,
    Skip,
}

/// The confirmed mapping; names are as they appear in the file.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct ImportMapping {
    /// Status name → santi status id. Rows with an unlisted status fail.
    #[serde(default)]
    pub statuses: BTreeMap<String, i64>,
    /// Person → member user id; unlisted or null = nobody (reporter: the importing admin).
    #[serde(default)]
    pub people: BTreeMap<String, Option<i64>>,
    /// Sprint name → action; unlisted = skip. Sprints with the same name on the board are reused.
    #[serde(default)]
    pub sprints: BTreeMap<String, SprintAction>,
    /// Issue type name → santi type; unlisted = the suggested type.
    #[serde(default)]
    pub types: BTreeMap<String, IssueType>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct ImportResult {
    pub source: ImportSource,
    pub created: i64,
    /// Already imported from this source (same original key).
    pub skipped: i64,
    pub failed: i64,
    /// The first 100 problems: failed rows and fields that were dropped or changed.
    pub problems: Vec<RowProblem>,
}

/// `multipart/form-data` body of the preview.
#[derive(ToSchema)]
pub struct PreviewUpload {
    /// The CSV export, at most 10 MB.
    #[schema(value_type = String, format = Binary)]
    pub file: Vec<u8>,
}

/// `multipart/form-data` body of the import.
#[derive(ToSchema)]
pub struct ImportUpload {
    /// The CSV export, at most 10 MB.
    #[schema(value_type = String, format = Binary)]
    pub file: Vec<u8>,
    pub mapping: ImportMapping,
}
