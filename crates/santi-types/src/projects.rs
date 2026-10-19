use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[cfg_attr(
    feature = "sqlx",
    derive(sqlx::Encode, sqlx::Decode),
    sqlx(rename_all = "snake_case")
)]
#[cfg_attr(feature = "schemars", derive(schemars::JsonSchema))]
#[serde(rename_all = "snake_case")]
pub enum BoardType {
    Scrum,
    Kanban,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[cfg_attr(
    feature = "sqlx",
    derive(sqlx::Encode, sqlx::Decode),
    sqlx(rename_all = "snake_case")
)]
#[serde(rename_all = "snake_case")]
pub enum MemberRole {
    Admin,
    Member,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateProject {
    pub key: String,
    pub name: String,
    pub board_type: BoardType,
}

/// SAN-70: an archived project is read-only; a trashed one answers 404 until restored or purged.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[cfg_attr(
    feature = "sqlx",
    derive(sqlx::Encode, sqlx::Decode),
    sqlx(rename_all = "snake_case")
)]
#[cfg_attr(feature = "schemars", derive(schemars::JsonSchema))]
#[serde(rename_all = "snake_case")]
pub enum ProjectState {
    #[default]
    Active,
    Archived,
    Trashed,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct ProjectsQuery {
    /// `archived` and `trashed` list only projects the caller administers.
    #[serde(default)]
    #[param(inline)]
    pub state: ProjectState,
}

/// A project as seen by the caller: `role` is the caller's role in it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct Project {
    pub id: i64,
    pub key: String,
    pub name: String,
    pub board_type: BoardType,
    pub role: MemberRole,
    pub state: ProjectState,
    pub archived_at: Option<DateTime<Utc>>,
    /// Display name of who archived it.
    pub archived_by: Option<String>,
    pub trashed_at: Option<DateTime<Utc>>,
    /// Display name of who moved it to the trash.
    pub trashed_by: Option<String>,
    /// When a trashed project is deleted for good: 60 days after `trashed_at` (OR-58).
    pub purge_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct MemberInfo {
    pub user_id: i64,
    pub email: String,
    pub display_name: String,
    pub role: MemberRole,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct AddMember {
    pub email: String,
    pub role: MemberRole,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct SetRole {
    pub role: MemberRole,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateInvite {
    pub role: MemberRole,
    /// How many people may join with the link, 1 to 50; 1 when absent.
    pub max_uses: Option<i32>,
}

/// The token is shown once; the invite link is `/invites/{token}`.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct Invite {
    pub token: String,
    pub expires_at: DateTime<Utc>,
    pub max_uses: i32,
}

/// What an invite link offers, shown before accepting it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct InvitePreview {
    pub project_key: String,
    pub project_name: String,
    pub role: MemberRole,
    pub expires_at: DateTime<Utc>,
    pub inviter_name: String,
    pub max_uses: i32,
    pub spots_left: i32,
}
