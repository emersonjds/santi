use std::fmt;
use std::str::FromStr;

use serde::Serialize;
use serde_json::Value;

/// `WEB-12`: project key `WEB`, issue number 12.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IssueKey {
    pub project: String,
    pub number: i64,
}

impl FromStr for IssueKey {
    type Err = String;

    fn from_str(text: &str) -> Result<IssueKey, String> {
        let invalid = || format!("`{text}` is not an issue key; use PROJECT-NUMBER, e.g. WEB-12");
        let (project, number) = text.rsplit_once('-').ok_or_else(invalid)?;
        let number: i64 = number.parse().map_err(|_| invalid())?;
        if project.is_empty() || number < 1 || !project.chars().all(|c| c.is_ascii_alphanumeric()) {
            return Err(invalid());
        }
        Ok(IssueKey {
            project: project.to_ascii_uppercase(),
            number,
        })
    }
}

impl fmt::Display for IssueKey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}-{}", self.project, self.number)
    }
}

/// Query pairs from a filter DTO: arrays repeat the key (`type=bug&type=task`), null and false
/// are left out.
pub fn to_query(value: &impl Serialize) -> Vec<(String, String)> {
    let Ok(Value::Object(fields)) = serde_json::to_value(value) else {
        return vec![];
    };
    let mut pairs = vec![];
    for (key, value) in fields {
        let values = match value {
            Value::Array(values) => values,
            value => vec![value],
        };
        for value in values {
            let text = match value {
                Value::Null | Value::Bool(false) => continue,
                Value::String(text) => text,
                other => other.to_string(),
            };
            pairs.push((key.clone(), text));
        }
    }
    pairs
}

#[cfg(test)]
mod tests {
    use santi_types::issues::{IssueFilter, IssueType, PageParams};

    use super::*;

    #[test]
    fn issue_key_splits_project_and_number() {
        let key: IssueKey = "web-12".parse().unwrap();
        assert_eq!(
            key,
            IssueKey {
                project: "WEB".into(),
                number: 12
            }
        );
        assert_eq!(key.to_string(), "WEB-12");
    }

    #[test]
    fn malformed_issue_keys_are_rejected() {
        for text in ["WEB", "WEB-", "-3", "WEB-x", "WEB-0", "W/B-1"] {
            let error = text.parse::<IssueKey>().unwrap_err();
            assert!(error.contains("PROJECT-NUMBER"), "{text}: {error}");
        }
    }

    #[test]
    fn filters_become_repeated_query_pairs() {
        let filter = IssueFilter {
            issue_type: vec![IssueType::Bug, IssueType::Task],
            q: Some("login".into()),
            ..IssueFilter::default()
        };
        let pairs = to_query(&filter);
        let expected = [("q", "login"), ("type", "bug"), ("type", "task")]
            .map(|(key, value)| (key.to_string(), value.to_string()));
        assert_eq!(pairs, expected);
    }

    #[test]
    fn numbers_and_true_flags_are_kept() {
        let filter = IssueFilter {
            assignee: vec![4],
            recently_updated: true,
            ..IssueFilter::default()
        };
        let page = PageParams {
            limit: Some(20),
            cursor: None,
        };
        let mut pairs = to_query(&filter);
        pairs.extend(to_query(&page));
        let expected = [
            ("assignee", "4"),
            ("recently_updated", "true"),
            ("limit", "20"),
        ]
        .map(|(key, value)| (key.to_string(), value.to_string()));
        assert_eq!(pairs, expected);
    }
}
