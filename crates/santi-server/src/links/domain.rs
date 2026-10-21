use santi_types::links::Relation;

use crate::error::AppError;
use crate::home::domain::{StarTarget, parse_star_key};

/// D59: each relation is stored as one of four `link_type`s, from the side that reads it forward.
pub struct Stored {
    pub link_type: &'static str,
    /// This issue is the link's source; false stores it from the other issue's side.
    pub forward: bool,
}

pub fn stored(relation: Relation) -> Stored {
    let (link_type, forward) = match relation {
        Relation::Blocks => ("blocks", true),
        Relation::IsBlockedBy => ("blocks", false),
        Relation::Relates => ("relates", true),
        Relation::Duplicates => ("duplicates", true),
        Relation::IsDuplicatedBy => ("duplicates", false),
        Relation::Clones => ("clones", true),
        Relation::IsClonedBy => ("clones", false),
    };
    Stored { link_type, forward }
}

/// The relation a stored link reads as from one of its issues; `relates` reads the same both ways.
pub fn seen_from(link_type: &str, is_source: bool) -> Relation {
    match (link_type, is_source) {
        ("blocks", true) => Relation::Blocks,
        ("blocks", false) => Relation::IsBlockedBy,
        ("duplicates", true) => Relation::Duplicates,
        ("duplicates", false) => Relation::IsDuplicatedBy,
        ("clones", true) => Relation::Clones,
        ("clones", false) => Relation::IsClonedBy,
        _ => Relation::Relates,
    }
}

/// `OPS-12` → (`OPS`, 12).
pub fn parse_issue_key(key: &str) -> Result<(String, i64), AppError> {
    match parse_star_key(key.trim()) {
        Ok(StarTarget::Issue(project, number)) => Ok((project, number)),
        _ => Err(AppError::invalid(
            "issue",
            "must be an issue key, like OPS-12",
        )),
    }
}

pub fn check_not_self(issue_id: i64, other_id: i64) -> Result<(), AppError> {
    if issue_id == other_id {
        return Err(AppError::invalid("issue", "an issue cannot link to itself"));
    }
    Ok(())
}

pub fn already_linked() -> AppError {
    AppError::invalid("issue", "these issues already have this link")
}

#[cfg(test)]
mod tests {
    use super::*;

    const ALL: [Relation; 7] = [
        Relation::Blocks,
        Relation::IsBlockedBy,
        Relation::Relates,
        Relation::Duplicates,
        Relation::IsDuplicatedBy,
        Relation::Clones,
        Relation::IsClonedBy,
    ];

    fn other_side(relation: Relation) -> Relation {
        let stored = stored(relation);
        seen_from(stored.link_type, !stored.forward)
    }

    #[test]
    fn each_relation_reads_back_as_itself_and_as_its_inverse_from_the_other_issue() {
        for relation in ALL {
            let stored = stored(relation);
            assert_eq!(seen_from(stored.link_type, stored.forward), relation);
        }
        assert_eq!(other_side(Relation::Blocks), Relation::IsBlockedBy);
        assert_eq!(other_side(Relation::IsBlockedBy), Relation::Blocks);
        assert_eq!(other_side(Relation::Relates), Relation::Relates);
        assert_eq!(other_side(Relation::Duplicates), Relation::IsDuplicatedBy);
        assert_eq!(other_side(Relation::IsClonedBy), Relation::Clones);
    }

    #[test]
    fn only_issue_keys_name_the_other_issue() {
        assert_eq!(parse_issue_key(" ops-12 ").unwrap(), ("OPS".into(), 12));
        for bad in ["OPS", "OPS-", "OPS-0", "OPS-x", "-12", ""] {
            assert!(parse_issue_key(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn an_issue_cannot_link_to_itself() {
        assert!(check_not_self(1, 1).is_err());
        assert!(check_not_self(1, 2).is_ok());
    }
}
