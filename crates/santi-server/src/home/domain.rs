use crate::error::AppError;
use crate::projects::domain::check_project_key;

#[derive(Debug, PartialEq)]
pub enum StarTarget {
    Project(String),
    Issue(String, i64),
}

/// `WEB` stars a project, `WEB-12` an issue.
pub fn parse_star_key(key: &str) -> Result<StarTarget, AppError> {
    let invalid = || {
        AppError::invalid(
            "key",
            "must be a project key (WEB) or an issue key (WEB-12)",
        )
    };
    let (project, number) = match key.split_once('-') {
        Some((project, number)) => (project, Some(number)),
        None => (key, None),
    };
    let project = check_project_key(project).map_err(|_| invalid())?;
    let Some(number) = number else {
        return Ok(StarTarget::Project(project));
    };
    if number.starts_with('0') || !number.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(invalid());
    }
    number
        .parse()
        .map(|number| StarTarget::Issue(project, number))
        .map_err(|_| invalid())
}

/// SAN-206: the issue search answers 20 rows unless asked for 1 to 50.
pub fn search_limit(limit: Option<i64>) -> Result<i64, AppError> {
    let limit = limit.unwrap_or(20);
    if !(1..=50).contains(&limit) {
        return Err(AppError::invalid("limit", "must be between 1 and 50"));
    }
    Ok(limit)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn issue_search_limit_defaults_to_20_and_caps_at_50() {
        assert_eq!(search_limit(None).unwrap(), 20);
        assert_eq!(search_limit(Some(50)).unwrap(), 50);
        assert!(search_limit(Some(51)).is_err());
        assert!(search_limit(Some(0)).is_err());
    }

    #[test]
    fn keys_name_a_project_or_an_issue() {
        assert_eq!(
            parse_star_key("web").unwrap(),
            StarTarget::Project("WEB".into())
        );
        assert_eq!(
            parse_star_key("WEB-12").unwrap(),
            StarTarget::Issue("WEB".into(), 12)
        );
        for bad in [
            "", "W", "-1", "WEB-", "WEB-0", "WEB-x", "WEB-1-2", "WEB-007", "WEB-+5", "WEB- 5",
        ] {
            assert!(parse_star_key(bad).is_err(), "{bad}");
        }
    }
}
