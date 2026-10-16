use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[cfg_attr(
    feature = "sqlx",
    derive(sqlx::Type),
    sqlx(type_name = "text", rename_all = "snake_case")
)]
#[serde(rename_all = "snake_case")]
pub enum SprintState {
    Future,
    Active,
    Closed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct Sprint {
    pub id: i64,
    pub name: String,
    pub goal: String,
    pub state: SprintState,
    pub start_date: Option<NaiveDate>,
    pub end_date: Option<NaiveDate>,
    pub started_at: Option<DateTime<Utc>>,
    pub closed_at: Option<DateTime<Utc>>,
    /// Active and past its end date; it stays active until completed (D15).
    pub overdue: bool,
}

#[cfg_attr(feature = "schemars", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, Default, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateSprint {
    /// Defaults to `Sprint N`, N counting every sprint ever created on the board (D12).
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub goal: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateSprint {
    pub name: String,
    #[serde(default)]
    pub goal: String,
    #[serde(default)]
    pub start_date: Option<NaiveDate>,
    #[serde(default)]
    pub end_date: Option<NaiveDate>,
}

#[cfg_attr(feature = "schemars", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, Default, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct StartSprint {
    /// Defaults to today.
    #[serde(default)]
    pub start_date: Option<NaiveDate>,
    /// Defaults to two weeks after the start (D12).
    #[serde(default)]
    pub end_date: Option<NaiveDate>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CompleteSprint {
    pub open_issues: OpenIssuesDestination,
}

/// Where every unfinished issue goes when the sprint closes (D13).
#[cfg_attr(feature = "schemars", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(tag = "to", rename_all = "snake_case", deny_unknown_fields)]
pub enum OpenIssuesDestination {
    Backlog,
    Sprint { sprint_id: i64 },
    NewSprint,
}
