use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[cfg_attr(
    feature = "sqlx",
    derive(sqlx::Type),
    sqlx(type_name = "text", rename_all = "snake_case")
)]
#[serde(rename_all = "snake_case")]
pub enum BoardType {
    Scrum,
    Kanban,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[cfg_attr(
    feature = "sqlx",
    derive(sqlx::Type),
    sqlx(type_name = "text", rename_all = "snake_case")
)]
#[serde(rename_all = "snake_case")]
pub enum MemberRole {
    Admin,
    Member,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct CreateProject {
    pub key: String,
    pub name: String,
    pub board_type: BoardType,
}

/// A project as seen by the caller: `role` is the caller's role in it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct Project {
    pub id: i64,
    pub key: String,
    pub name: String,
    pub board_type: BoardType,
    pub role: MemberRole,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct MemberInfo {
    pub user_id: i64,
    pub email: String,
    pub display_name: String,
    pub role: MemberRole,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct AddMember {
    pub email: String,
    pub role: MemberRole,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct SetRole {
    pub role: MemberRole,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct CreateInvite {
    pub role: MemberRole,
}

/// The token is shown once; the invite link is `/invites/{token}`.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct Invite {
    pub token: String,
    pub expires_at: DateTime<Utc>,
}

/// What an invite link offers, shown before accepting it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct InvitePreview {
    pub project_key: String,
    pub project_name: String,
    pub role: MemberRole,
    pub expires_at: DateTime<Utc>,
    pub inviter_name: String,
}
