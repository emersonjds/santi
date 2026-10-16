use chrono::{DateTime, Utc};
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

/// An invite works once and only until it expires.
pub fn check_invite_usable(
    expires_at: DateTime<Utc>,
    used_at: Option<DateTime<Utc>>,
    now: DateTime<Utc>,
) -> Result<(), AppError> {
    if used_at.is_some() {
        return Err(AppError::gone(
            "invite-used",
            "This invite link was already used.",
        ));
    }
    if expires_at <= now {
        return Err(AppError::gone(
            "invite-expired",
            "This invite link has expired.",
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
    fn only_unused_unexpired_invites_are_usable() {
        let now: DateTime<Utc> = "2026-10-16T12:00:00Z".parse().unwrap();
        let later = now + chrono::Duration::days(1);
        let earlier = now - chrono::Duration::days(1);

        assert_eq!(check_invite_usable(later, None, now), Ok(()));
        assert_eq!(
            check_invite_usable(later, Some(earlier), now),
            Err(AppError::gone(
                "invite-used",
                "This invite link was already used."
            ))
        );
        assert_eq!(
            check_invite_usable(earlier, None, now),
            Err(AppError::gone(
                "invite-expired",
                "This invite link has expired."
            ))
        );
        assert_eq!(
            check_invite_usable(now, None, now)
                .unwrap_err()
                .to_problem()
                .status,
            410
        );
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
