use santi_types::projects::MemberRole;

use super::Member;
use crate::error::AppError;

pub const INVITE_DAYS: i64 = 7;

pub fn require_admin(member: &Member) -> Result<(), AppError> {
    if member.role != MemberRole::Admin {
        return Err(AppError::Forbidden);
    }
    Ok(())
}

/// `new_role` is None when the member is being removed.
pub fn check_admin_remains(
    admin_count: i64,
    current_role: MemberRole,
    new_role: Option<MemberRole>,
) -> Result<(), AppError> {
    let loses_admin = current_role == MemberRole::Admin && new_role != Some(MemberRole::Admin);
    if loses_admin && admin_count == 1 {
        return Err(AppError::conflict(
            "last-admin",
            "A project needs at least one admin.",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::members::Member;
    use santi_types::projects::{BoardType, MemberRole};

    fn member(role: MemberRole) -> Member {
        Member {
            user_id: 1,
            project_id: 1,
            project_key: "SANTI".into(),
            board_id: 1,
            board_type: BoardType::Scrum,
            role,
        }
    }

    #[test]
    fn only_admins_pass_require_admin() {
        assert!(require_admin(&member(MemberRole::Admin)).is_ok());
        assert_eq!(
            require_admin(&member(MemberRole::Member)),
            Err(AppError::Forbidden)
        );
    }

    #[test]
    fn the_last_admin_cannot_be_demoted_or_removed() {
        assert!(check_admin_remains(1, MemberRole::Admin, Some(MemberRole::Member)).is_err());
        assert!(check_admin_remains(1, MemberRole::Admin, None).is_err());
    }

    #[test]
    fn other_role_changes_are_allowed() {
        assert!(check_admin_remains(2, MemberRole::Admin, None).is_ok());
        assert!(check_admin_remains(1, MemberRole::Member, None).is_ok());
        assert!(check_admin_remains(1, MemberRole::Admin, Some(MemberRole::Admin)).is_ok());
    }
}
