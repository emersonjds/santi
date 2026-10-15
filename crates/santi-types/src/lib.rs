use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct Health {
    pub status: String,
    pub version: String,
}

/// RFC 9457 problem details, the body of every error response (D24).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct Problem {
    #[serde(rename = "type")]
    pub problem_type: String,
    pub title: String,
    pub status: u16,
    pub detail: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub errors: Vec<FieldError>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct FieldError {
    pub field: String,
    pub message: String,
}

#[cfg(test)]
mod tests {
    use super::Health;

    #[test]
    fn health_serializes_status_and_version() {
        let health = Health {
            status: "ok".into(),
            version: "0.1.0".into(),
        };
        let json = serde_json::to_value(&health).unwrap();
        assert_eq!(
            json,
            serde_json::json!({ "status": "ok", "version": "0.1.0" })
        );
    }
}
