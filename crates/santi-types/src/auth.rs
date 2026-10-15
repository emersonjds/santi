use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Clone, Serialize, Deserialize, ToSchema)]
pub struct Register {
    pub email: String,
    pub password: String,
    pub display_name: String,
}

#[derive(Clone, Serialize, Deserialize, ToSchema)]
pub struct Login {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct User {
    pub id: i64,
    pub email: String,
    pub display_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct CreateToken {
    pub name: String,
}

/// Returned once at creation; only the hash is stored (D23). No `Debug`, so it never reaches a log.
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
