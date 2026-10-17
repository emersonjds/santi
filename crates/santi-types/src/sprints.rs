use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::{fmt, str::FromStr};
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
    pub starts_at: Option<DateTime<Utc>>,
    pub ends_at: Option<DateTime<Utc>>,
    pub started_at: Option<DateTime<Utc>>,
    pub closed_at: Option<DateTime<Utc>>,
    /// Active and at or past its end; it stays active until completed (D15, D48).
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
    pub starts_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub ends_at: Option<DateTime<Utc>>,
}

#[cfg_attr(feature = "schemars", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, Default, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct StartSprint {
    /// Defaults to now.
    #[serde(default)]
    pub starts_at: Option<DateTime<Utc>>,
    /// Defaults to two weeks after the start (D12).
    #[serde(default)]
    pub ends_at: Option<DateTime<Utc>>,
    /// Remembered as the board's next default (D48): `4h`, `1d`, `1w`, `2w`, `1m`, or minutes. Needs `ends_at`.
    #[serde(default)]
    #[schema(value_type = Option<String>, example = "2w")]
    #[cfg_attr(feature = "schemars", schemars(with = "Option<String>"))]
    pub length: Option<SprintLength>,
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

/// D48: a start-dialog preset, or a custom length in minutes. Wire form: `4h`, `1d`, `1w`, `2w`, `1m` or digits.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub enum SprintLength {
    FourHours,
    OneDay,
    OneWeek,
    TwoWeeks,
    OneMonth,
    Minutes(u32),
}

impl FromStr for SprintLength {
    type Err = String;

    fn from_str(text: &str) -> Result<Self, Self::Err> {
        match text {
            "4h" => Ok(Self::FourHours),
            "1d" => Ok(Self::OneDay),
            "1w" => Ok(Self::OneWeek),
            "2w" => Ok(Self::TwoWeeks),
            "1m" => Ok(Self::OneMonth),
            _ if !text.starts_with('0')
                && (1..=7).contains(&text.len())
                && text.bytes().all(|byte| byte.is_ascii_digit()) =>
            {
                Ok(Self::Minutes(
                    text.parse().expect("1 to 7 digits fit in u32"),
                ))
            }
            _ => Err(format!(
                "`{text}` is not 4h, 1d, 1w, 2w, 1m or a number of minutes"
            )),
        }
    }
}

impl fmt::Display for SprintLength {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::FourHours => formatter.write_str("4h"),
            Self::OneDay => formatter.write_str("1d"),
            Self::OneWeek => formatter.write_str("1w"),
            Self::TwoWeeks => formatter.write_str("2w"),
            Self::OneMonth => formatter.write_str("1m"),
            Self::Minutes(minutes) => write!(formatter, "{minutes}"),
        }
    }
}

impl TryFrom<String> for SprintLength {
    type Error = String;

    fn try_from(text: String) -> Result<Self, Self::Error> {
        text.parse()
    }
}

impl From<SprintLength> for String {
    fn from(length: SprintLength) -> Self {
        length.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::{OpenIssuesDestination, SprintLength};
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

    #[test]
    fn lengths_round_trip_through_their_tokens() {
        for (token, length) in [
            ("4h", SprintLength::FourHours),
            ("1d", SprintLength::OneDay),
            ("1w", SprintLength::OneWeek),
            ("2w", SprintLength::TwoWeeks),
            ("1m", SprintLength::OneMonth),
            ("90", SprintLength::Minutes(90)),
            ("9999999", SprintLength::Minutes(9_999_999)),
        ] {
            assert_eq!(token.parse::<SprintLength>().unwrap(), length);
            assert_eq!(length.to_string(), token);
            assert_eq!(serde_json::to_value(length).unwrap(), json!(token));
            assert_eq!(
                serde_json::from_value::<SprintLength>(json!(token)).unwrap(),
                length
            );
        }
    }

    #[test]
    fn lengths_refuse_anything_else() {
        for token in ["", "0", "090", "-5", "1.5", "3w", "2W", "10000000", " 4h"] {
            assert!(token.parse::<SprintLength>().is_err(), "{token}");
            assert!(
                serde_json::from_value::<SprintLength>(json!(token)).is_err(),
                "{token}"
            );
        }
    }
}
