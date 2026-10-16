use santi_types::projects::BoardType;

use crate::error::{AppError, reject_nul};

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

pub fn check_project_name(name: &str) -> Result<String, AppError> {
    reject_nul("name", name)?;
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 100 {
        return Err(AppError::invalid("name", "must have 1 to 100 characters"));
    }
    Ok(name.to_string())
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
