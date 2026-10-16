pub mod domain;
pub mod extract;
pub mod handler;
pub mod repo;
pub mod service;

use santi_types::projects::{BoardType, MemberRole};

/// The caller inside one project: every project-scoped use case takes it (D28).
#[derive(Debug, Clone)]
pub struct Member {
    pub user_id: i64,
    pub project_id: i64,
    pub project_key: String,
    pub board_id: i64,
    pub board_type: BoardType,
    pub role: MemberRole,
}
