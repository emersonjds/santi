use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct Register {
    pub email: String,
    pub password: String,
    pub display_name: String,
    /// Must be true when the instance requires its legal documents (D45): the person agrees to
    /// the Terms of Use and the Privacy Policy.
    #[serde(default)]
    pub accept_terms: bool,
    /// Must be true alongside `accept_terms`: the person declares being 18 or older.
    #[serde(default)]
    pub confirm_age: bool,
}

/// The instance's legal documents (D45). `required: false` when the operator turned them off.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct LegalDocuments {
    pub required: bool,
    pub terms_version: String,
    pub privacy_version: String,
}

/// Whether the caller accepted the current versions; the app asks again when they change.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct LegalStatus {
    pub required: bool,
    pub terms_version: String,
    pub privacy_version: String,
    pub accepted: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct AcceptLegal {
    #[serde(default)]
    pub accept_terms: bool,
    #[serde(default)]
    pub confirm_age: bool,
}

/// One row of the append-only acceptance record: `document` is `terms`, `privacy` or `age`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct LegalAcceptance {
    pub document: String,
    pub version: String,
    /// SHA-256 of the page the person was shown, when the server had it.
    pub text_hash: Option<String>,
    pub accepted_at: DateTime<Utc>,
}

/// A project the person joined through an invite link, and when.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct InviteUse {
    pub project_key: String,
    pub joined_at: DateTime<Utc>,
}

#[derive(Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct Login {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct User {
    pub id: i64,
    pub email: String,
    pub display_name: String,
    pub theme: Theme,
    /// IANA name, e.g. `Pacific/Auckland`; `null` means the browser's zone.
    pub time_zone: Option<String>,
}

#[cfg_attr(feature = "schemars", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[cfg_attr(
    feature = "sqlx",
    derive(sqlx::Encode, sqlx::Decode),
    sqlx(rename_all = "snake_case")
)]
#[serde(rename_all = "snake_case")]
pub enum Theme {
    Light,
    Dark,
    /// Follows the operating system.
    System,
}

/// Absent fields stay as they are; `"time_zone": null` goes back to the browser's zone.
#[derive(Debug, Clone, Default, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateMe {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub theme: Option<Theme>,
    /// IANA name, e.g. `Pacific/Auckland`.
    #[serde(
        default,
        deserialize_with = "crate::nullable_field",
        skip_serializing_if = "Option::is_none"
    )]
    #[schema(value_type = Option<String>)]
    pub time_zone: Option<Option<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateToken {
    pub name: String,
}

/// Returned once at creation; only the hash is stored (D23).
// No `Debug`: the token never reaches a log.
#[derive(Clone, Serialize, Deserialize, ToSchema)]
pub struct CreatedToken {
    pub id: i64,
    pub name: String,
    pub token: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct ApiToken {
    pub id: i64,
    pub name: String,
    pub created_at: DateTime<Utc>,
}

/// A signed-in browser (D60). `client` is a device label ("Chrome on macOS"), never the raw
/// user agent; `current` marks the caller's own session.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct Session {
    pub id: i64,
    pub client: String,
    pub created_at: DateTime<Utc>,
    pub last_used_at: DateTime<Utc>,
    pub current: bool,
}

/// No `Debug`: passwords never reach a log.
#[derive(Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ChangePassword {
    pub current: String,
    pub new: String,
}

/// How many other sessions a password change or a bulk sign-out ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct SignedOut {
    pub signed_out: i64,
}

/// Deleting the account asks for the password again.
#[derive(Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct DeleteAccount {
    pub password: String,
}

/// The account a live reset link belongs to.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct PasswordResetPreview {
    pub email: String,
    pub expires_at: DateTime<Utc>,
}

#[derive(Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ResetPassword {
    pub password: String,
}

/// Everything santi holds about the caller (D45): the account, its API tokens (names only),
/// every project the caller administers, in full, and the home's stars and history.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct AccountExport {
    pub exported_at: DateTime<Utc>,
    pub user: User,
    /// Every acceptance of the Terms of Use, the Privacy Policy and the age declaration.
    pub legal_acceptances: Vec<LegalAcceptance>,
    pub invite_uses: Vec<InviteUse>,
    pub api_tokens: Vec<ApiToken>,
    pub projects: Vec<ProjectExport>,
    /// Projects the caller is a plain member of: named here, owned by their admins.
    pub other_projects: Vec<crate::projects::Project>,
    pub home: crate::home::HomeExport,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ProjectExport {
    pub project: crate::projects::Project,
    pub members: Vec<crate::projects::MemberInfo>,
    pub board: crate::boards::BoardSettings,
    pub sprints: Vec<crate::sprints::Sprint>,
    pub issues: Vec<crate::issues::Issue>,
    pub comments: Vec<ExportedComment>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ExportedComment {
    pub issue_key: String,
    pub author_id: i64,
    pub body: String,
    pub created_at: DateTime<Utc>,
    /// Last change of the text; null until a save changes it (D52).
    pub edited_at: Option<DateTime<Utc>>,
    pub edited_by_id: Option<i64>,
}
