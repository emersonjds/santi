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
    match number.parse::<i64>() {
        Ok(number) if number > 0 => Ok(StarTarget::Issue(project, number)),
        _ => Err(invalid()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
        for bad in ["", "W", "-1", "WEB-", "WEB-0", "WEB-x", "WEB-1-2"] {
            assert!(parse_star_key(bad).is_err(), "{bad}");
        }
    }
}
