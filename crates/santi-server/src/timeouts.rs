use std::time::Duration;

use axum::extract::Request;
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use sqlx::{PgConnection, PgPool};

use crate::error::AppError;

/// SAN-213: how long a request, a statement and a wait for a pooled connection may take.
#[derive(Debug, Clone, PartialEq)]
pub struct Timeouts {
    pub request: Duration,
    pub statement: Duration,
    pub acquire: Duration,
}

impl Default for Timeouts {
    fn default() -> Self {
        Timeouts {
            request: Duration::from_secs(30),
            statement: Duration::from_millis(15_000),
            acquire: Duration::from_millis(5_000),
        }
    }
}

/// Reads the three variables through `var`; a value that is not a positive whole number keeps
/// the default and adds a warning.
pub fn from_env(var: impl Fn(&str) -> Option<String>) -> (Timeouts, Vec<String>) {
    let defaults = Timeouts::default();
    let mut warnings = Vec::new();
    let mut read = |name: &str, default: u64| {
        let Some(value) = var(name) else {
            return default;
        };
        match value.trim().parse::<u64>() {
            Ok(number) if number > 0 => number,
            _ => {
                warnings.push(format!(
                    "{name}={value:?} is not a positive whole number; using {default}"
                ));
                default
            }
        }
    };
    let request = read("SANTI_REQUEST_TIMEOUT_SECS", defaults.request.as_secs());
    let statement = read(
        "SANTI_DB_STATEMENT_TIMEOUT_MS",
        defaults.statement.as_millis() as u64,
    );
    let acquire = read(
        "SANTI_DB_ACQUIRE_TIMEOUT_MS",
        defaults.acquire.as_millis() as u64,
    );
    let timeouts = Timeouts {
        request: Duration::from_secs(request),
        statement: Duration::from_millis(statement),
        acquire: Duration::from_millis(acquire),
    };
    (timeouts, warnings)
}

/// Every connection starts with `statement_timeout`; a caller waits `acquire` for one at most.
pub fn pool(options: PgConnectOptions, max_connections: u32, timeouts: &Timeouts) -> PgPool {
    let statement_ms = timeouts.statement.as_millis().to_string();
    PgPoolOptions::new()
        .max_connections(max_connections)
        .acquire_timeout(timeouts.acquire)
        .connect_lazy_with(options.options([("statement_timeout", statement_ms)]))
}

/// For restore and import transactions, which may write tens of thousands of rows at once.
pub async fn allow_long_statements(conn: &mut PgConnection) -> Result<(), sqlx::Error> {
    sqlx::query("SET LOCAL statement_timeout = '5min'")
        .execute(conn)
        .await?;
    Ok(())
}

/// A request still running after `limit` is dropped and answered 503 `busy`.
pub async fn cut_after(limit: Duration, request: Request, next: Next) -> Response {
    match tokio::time::timeout(limit, next.run(request)).await {
        Ok(response) => response,
        Err(_) => {
            tracing::error!(timeout_ms = limit.as_millis() as u64, "request timed out");
            AppError::Busy.into_response()
        }
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::{Timeouts, from_env};

    fn read(vars: &[(&str, &str)]) -> (Timeouts, Vec<String>) {
        from_env(|name| {
            vars.iter()
                .find(|(key, _)| *key == name)
                .map(|(_, value)| value.to_string())
        })
    }

    #[test]
    fn unset_variables_give_the_defaults() {
        let (timeouts, warnings) = read(&[]);

        assert_eq!(timeouts.request, Duration::from_secs(30));
        assert_eq!(timeouts.statement, Duration::from_millis(15_000));
        assert_eq!(timeouts.acquire, Duration::from_millis(5_000));
        assert!(warnings.is_empty());
    }

    #[test]
    fn valid_values_are_read() {
        let (timeouts, warnings) = read(&[
            ("SANTI_REQUEST_TIMEOUT_SECS", "60"),
            ("SANTI_DB_STATEMENT_TIMEOUT_MS", "2500"),
            ("SANTI_DB_ACQUIRE_TIMEOUT_MS", " 750 "),
        ]);

        assert_eq!(timeouts.request, Duration::from_secs(60));
        assert_eq!(timeouts.statement, Duration::from_millis(2500));
        assert_eq!(timeouts.acquire, Duration::from_millis(750));
        assert!(warnings.is_empty());
    }

    #[test]
    fn garbage_falls_back_to_the_default_with_a_warning() {
        for garbage in ["abc", "0", "-5", "", "1.5", "99999999999999999999"] {
            let (timeouts, warnings) = read(&[
                ("SANTI_REQUEST_TIMEOUT_SECS", garbage),
                ("SANTI_DB_STATEMENT_TIMEOUT_MS", garbage),
                ("SANTI_DB_ACQUIRE_TIMEOUT_MS", garbage),
            ]);

            assert_eq!(timeouts.request, Duration::from_secs(30), "{garbage}");
            assert_eq!(timeouts.statement, Duration::from_millis(15_000));
            assert_eq!(timeouts.acquire, Duration::from_millis(5_000));
            assert_eq!(warnings.len(), 3, "{garbage}");
            assert!(
                warnings[0].starts_with("SANTI_REQUEST_TIMEOUT_SECS")
                    && warnings[0].ends_with("using 30"),
                "{}",
                warnings[0]
            );
        }
    }
}
