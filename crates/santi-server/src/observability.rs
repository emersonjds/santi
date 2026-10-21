use std::time::{Duration, Instant};

use axum::extract::{MatchedPath, Request};
use axum::http::{HeaderName, HeaderValue};
use axum::middleware::Next;
use axum::response::Response;
use tracing::field::Empty;
use tracing::{Instrument, Level, Subscriber};
use tracing_subscriber::EnvFilter;
use tracing_subscriber::fmt::MakeWriter;

const X_REQUEST_ID: HeaderName = HeaderName::from_static("x-request-id");

/// SAN-209: JSON lines (`json`) or human-readable ones, filtered like `RUST_LOG`.
pub fn subscriber<W>(filter: EnvFilter, json: bool, writer: W) -> Box<dyn Subscriber + Send + Sync>
where
    W: for<'writer> MakeWriter<'writer> + Send + Sync + 'static,
{
    let builder = tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_writer(writer);
    match json {
        true => Box::new(
            builder
                .json()
                .flatten_event(true)
                .with_span_list(false)
                .finish(),
        ),
        false => Box::new(builder.finish()),
    }
}

/// SAN-209: one line per request with the route template, never the raw path or query; the
/// auth extractors record `user_id` into this span.
pub async fn log_request(request: Request, next: Next) -> Response {
    let started = Instant::now();
    let id = request_id(request.headers().get(X_REQUEST_ID));
    let route = request
        .extensions()
        .get::<MatchedPath>()
        .map_or("unmatched", MatchedPath::as_str);
    let span = tracing::info_span!(
        "request",
        method = %request.method(),
        route,
        request_id = %id,
        user_id = Empty,
    );
    let mut response = next.run(request).instrument(span.clone()).await;
    let latency = started.elapsed();
    let status = response.status().as_u16();
    let latency_ms = latency.as_millis() as u64;
    span.in_scope(|| match level_for(status, latency) {
        Level::ERROR => tracing::error!(status, latency_ms, "request"),
        Level::WARN => tracing::warn!(status, latency_ms, "request"),
        _ => tracing::info!(status, latency_ms, "request"),
    });
    if let Ok(value) = HeaderValue::try_from(id) {
        response.headers_mut().insert(X_REQUEST_ID, value);
    }
    response
}

pub fn level_for(status: u16, latency: Duration) -> Level {
    if status >= 500 {
        return Level::ERROR;
    }
    if latency > Duration::from_millis(500) {
        return Level::WARN;
    }
    Level::INFO
}

/// Keeps an incoming id of up to 64 letters, digits, `-`, `_` or `.`; otherwise a new UUID.
pub fn request_id(incoming: Option<&HeaderValue>) -> String {
    let safe = |id: &&str| {
        (1..=64).contains(&id.len())
            && id
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || b"-_.".contains(&byte))
    };
    match incoming.and_then(|value| value.to_str().ok()).filter(safe) {
        Some(id) => id.to_string(),
        None => uuid::Uuid::new_v4().to_string(),
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use axum::http::HeaderValue;
    use tracing::Level;

    use super::{level_for, request_id};

    #[test]
    fn server_errors_log_at_error_and_slow_requests_at_warn() {
        let fast = Duration::from_millis(10);
        let slow = Duration::from_millis(501);
        assert_eq!(level_for(200, fast), Level::INFO);
        assert_eq!(level_for(404, Duration::from_millis(500)), Level::INFO);
        assert_eq!(level_for(200, slow), Level::WARN);
        assert_eq!(level_for(503, fast), Level::ERROR);
        assert_eq!(level_for(500, slow), Level::ERROR);
    }

    #[test]
    fn a_short_safe_incoming_request_id_is_kept_and_anything_else_replaced() {
        let incoming = HeaderValue::from_static("abc-123_X.9");
        assert_eq!(request_id(Some(&incoming)), "abc-123_X.9");
        let long = HeaderValue::try_from("a".repeat(65)).unwrap();
        for unsafe_id in [
            HeaderValue::from_static(""),
            HeaderValue::from_static("has space"),
            HeaderValue::from_static("a\"b"),
            long,
        ] {
            let generated = request_id(Some(&unsafe_id));
            assert_eq!(generated.len(), 36, "{unsafe_id:?}");
        }
        assert_eq!(request_id(None).len(), 36);
        assert_ne!(request_id(None), request_id(None));
    }
}
