use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[cfg_attr(
    feature = "sqlx",
    derive(sqlx::Encode, sqlx::Decode),
    sqlx(rename_all = "snake_case")
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
    Backlog {},
    Sprint { sprint_id: i64 },
    NewSprint {},
}

#[cfg(test)]
mod tests {
    use super::OpenIssuesDestination;
    use serde_json::json;

    #[test]
    fn destinations_keep_their_wire_format() {
        for (destination, wire) in [
            (
                OpenIssuesDestination::Backlog {},
                json!({ "to": "backlog" }),
            ),
            (
                OpenIssuesDestination::NewSprint {},
                json!({ "to": "new_sprint" }),
            ),
            (
                OpenIssuesDestination::Sprint { sprint_id: 3 },
                json!({ "to": "sprint", "sprint_id": 3 }),
            ),
        ] {
            assert_eq!(serde_json::to_value(&destination).unwrap(), wire);
            assert_eq!(
                serde_json::from_value::<OpenIssuesDestination>(wire).unwrap(),
                destination
            );
        }
    }

    #[test]
    fn destinations_refuse_fields_they_do_not_take() {
        for wire in [
            json!({ "to": "backlog", "sprint_id": 3 }),
            json!({ "to": "new_sprint", "sprint_id": 3 }),
        ] {
            let error = serde_json::from_value::<OpenIssuesDestination>(wire).unwrap_err();
            assert!(error.to_string().contains("sprint_id"), "{error}");
        }
    }
}
