use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Health {
    pub status: String,
    pub version: String,
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
