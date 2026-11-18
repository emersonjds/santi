use santi_types::projects::{BoardType, ProjectState};

use crate::error::{AppError, reject_nul};

/// OR-58: a trashed project is purged this many days after it was trashed.
pub const TRASH_DAYS: i32 = 60;

pub fn check_project_key(key: &str) -> Result<String, AppError> {
    let key = key.trim().to_uppercase();
    let mut characters = key.chars();
    let starts_with_letter = characters
        .next()
        .is_some_and(|first| first.is_ascii_uppercase());
    let rest_is_alphanumeric =
        characters.all(|character| character.is_ascii_uppercase() || character.is_ascii_digit());
    let length_ok = (2..=10).contains(&key.len());
    if !(starts_with_letter && rest_is_alphanumeric && length_ok) {
        return Err(AppError::invalid(
            "key",
            "must be 2 to 10 letters or digits, starting with a letter",
        ));
    }
    Ok(key)
}

/// OR-37: a key a project changes to is refused, not converted, unless already upper case.
pub fn check_new_project_key(key: &str) -> Result<String, AppError> {
    let key = key.trim();
    if key != key.to_uppercase() {
        return Err(bad_new_key());
    }
    check_project_key(key).map_err(|_| bad_new_key())
}

fn bad_new_key() -> AppError {
    AppError::invalid(
        "key",
        "Keys are 2 to 10 characters: a capital letter, then capital letters or digits.",
    )
}

/// Who holds a key: the project's id and name, and whether it is one of its previous keys.
pub struct Holder<'a> {
    pub project_id: i64,
    pub name: &'a str,
    pub alias: bool,
}

/// OR-37, OR-38: whether project `taker` may take `key`; true when it is one of `taker`'s own
/// previous keys, which goes back to being live.
/// `taker` is None for a project not created yet.
pub fn check_key_taker(
    key: &str,
    taker: Option<i64>,
    holder: Option<Holder>,
) -> Result<bool, AppError> {
    let Some(holder) = holder else {
        return Ok(false);
    };
    let name = holder.name;
    match (Some(holder.project_id) == taker, holder.alias) {
        (true, alias) => Ok(alias),
        (false, false) => Err(AppError::conflict(
            "project-key-taken",
            &format!("{key} is already {name}'s key."),
        )),
        (false, true) => Err(AppError::conflict(
            "project-key-alias",
            &format!(
                "{key} is a previous key of {name}. Ask that project's admin to remove it before you can use it."
            ),
        )),
    }
}

pub fn check_project_name(name: &str) -> Result<String, AppError> {
    reject_nul("name", name)?;
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 100 {
        return Err(AppError::invalid("name", "must have 1 to 100 characters"));
    }
    Ok(name.to_string())
}

pub fn archived() -> AppError {
    AppError::conflict(
        "project-archived",
        "This project is archived and read-only; an admin can unarchive it.",
    )
}

/// For a write under the project lock: an archive or trash committed after the request was
/// authorized still wins.
pub fn check_active(state: ProjectState) -> Result<(), AppError> {
    match state {
        ProjectState::Active => Ok(()),
        ProjectState::Archived => Err(archived()),
        ProjectState::Trashed => Err(AppError::NotFound),
    }
}

pub fn not_trashed() -> AppError {
    AppError::conflict("project-not-trashed", "This project is not in the trash.")
}

/// OR-60: an archived or trashed project keeps its key until it is purged.
pub fn check_key_free(key: &str, held: Option<ProjectState>) -> Result<(), AppError> {
    let detail = match held {
        None | Some(ProjectState::Active) => return Ok(()),
        Some(ProjectState::Archived) => {
            format!(
                "The key {key} is held by an archived project; unarchive it or pick another key."
            )
        }
        Some(ProjectState::Trashed) => format!(
            "The key {key} is held by a project in the trash; restore or purge it, or pick another key."
        ),
    };
    Err(AppError::conflict("project-key-held", &detail))
}

const DIGITS: &[u8; 36] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/// The caller's sample project key: `MOB` and the user id in base 36, unique per user and
/// within the 10-character limit for ids below 36^7.
pub fn sample_key(user_id: i64) -> String {
    let mut rest = user_id.unsigned_abs();
    let mut digits = Vec::new();
    loop {
        digits.push(DIGITS[(rest % 36) as usize]);
        rest /= 36;
        if rest == 0 {
            break;
        }
    }
    digits.reverse();
    format!("MOB{}", String::from_utf8_lossy(&digits))
}

/// The sample key when the caller's own is taken by someone else's project: `MOB` and seven
/// random base-36 characters.
pub fn random_sample_key() -> String {
    let mut bytes = [0u8; 7];
    getrandom::fill(&mut bytes).expect("the operating system random source works");
    let suffix: String = bytes
        .iter()
        .map(|byte| char::from(DIGITS[usize::from(*byte) % DIGITS.len()]))
        .collect();
    format!("MOB{suffix}")
}

/// KB-23: kanban boards hide done work after 14 days by default; scrum boards never hide.
pub fn default_done_window(board_type: BoardType) -> Option<i32> {
    match board_type {
        BoardType::Kanban => Some(14),
        BoardType::Scrum => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use santi_types::projects::BoardType;

    #[test]
    fn sample_keys_are_valid_project_keys_per_user() {
        assert_eq!(sample_key(1), "MOB1");
        assert_eq!(sample_key(35), "MOBZ");
        assert_eq!(sample_key(36), "MOB10");
        assert_eq!(sample_key(36_i64.pow(7) - 1), "MOBZZZZZZZ");
        assert!(check_project_key(&sample_key(36_i64.pow(7) - 1)).is_ok());
        let random = random_sample_key();
        assert!(random.starts_with("MOB") && random.len() == 10, "{random}");
        assert_eq!(check_project_key(&random).unwrap(), random);
        assert_ne!(random, random_sample_key());
    }

    #[test]
    fn project_key_is_trimmed_and_uppercased() {
        assert_eq!(check_project_key(" santi ").unwrap(), "SANTI");
    }

    #[test]
    fn project_key_shape_is_enforced() {
        for bad in ["S", "1ABC", "AB-C", "ABCDEFGHIJK", ""] {
            assert!(check_project_key(bad).is_err(), "{bad} should be refused");
        }
        assert!(check_project_key("A1").is_ok());
    }

    #[test]
    fn a_new_key_is_refused_unless_upper_case() {
        assert_eq!(check_new_project_key(" NOWVI ").unwrap(), "NOWVI");
        for bad in ["nowvi", "Nowvi", "N", "1AB"] {
            assert!(check_new_project_key(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn a_key_is_free_or_the_takers_own_previous_key() {
        let holder = |project_id, alias| Holder {
            project_id,
            name: "Nowvi",
            alias,
        };
        assert_eq!(check_key_taker("A1", Some(1), None), Ok(false));
        assert_eq!(
            check_key_taker("A1", Some(1), Some(holder(1, true))),
            Ok(true)
        );
        assert_eq!(
            check_key_taker("A1", Some(1), Some(holder(1, false))),
            Ok(false)
        );
        let taken = check_key_taker("A1", Some(1), Some(holder(2, false))).unwrap_err();
        assert_eq!(taken.to_problem().detail, "A1 is already Nowvi's key.");
        let aliased = check_key_taker("A1", Some(1), Some(holder(2, true))).unwrap_err();
        assert_eq!(
            aliased.to_problem().problem_type,
            "urn:santi:error:project-key-alias"
        );
    }

    #[test]
    fn project_name_is_required() {
        assert!(check_project_name("  ").is_err());
        assert_eq!(check_project_name(" Santi ").unwrap(), "Santi");
    }

    #[test]
    fn kanban_hides_done_after_14_days_and_scrum_never() {
        assert_eq!(default_done_window(BoardType::Kanban), Some(14));
        assert_eq!(default_done_window(BoardType::Scrum), None);
    }
}
