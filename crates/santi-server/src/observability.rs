use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::extract::{MatchedPath, Request};
use axum::http::{HeaderName, HeaderValue};
use axum::middleware::Next;
use axum::response::Response;
use sentry::integrations::tracing::{ErrorLayer, SpanLayer};
use tracing::field::Empty;
use tracing::{Instrument, Level, Subscriber};
use tracing_subscriber::EnvFilter;
use tracing_subscriber::filter::{LevelFilter, filter_fn};
use tracing_subscriber::fmt::MakeWriter;
use tracing_subscriber::layer::{Layer, SubscriberExt};
use tracing_subscriber::registry::LookupSpan;

const X_REQUEST_ID: HeaderName = HeaderName::from_static("x-request-id");

/// SAN-209: JSON lines (`json`) or human-readable ones, filtered like `RUST_LOG`. SAN-227: with
/// `sentry`, error events except the per-request line also go to the bound Sentry client.
pub fn subscriber<W>(
    filter: EnvFilter,
    json: bool,
    writer: W,
    sentry: bool,
) -> Box<dyn Subscriber + Send + Sync>
where
    W: for<'writer> MakeWriter<'writer> + Send + Sync + 'static,
{
    let lines = tracing_subscriber::fmt::layer().with_writer(writer);
    let lines = match json {
        true => lines
            .json()
            .flatten_event(true)
            .with_span_list(false)
            .boxed(),
        false => lines.boxed(),
    };
    Box::new(
        tracing_subscriber::registry()
            .with(filter)
            .with(lines)
            .with(sentry.then(sentry_layers)),
    )
}

/// Request spans give error events their route, method and request id; the per-request line
/// stays out of Sentry since the error that caused a 500 is reported on its own.
fn sentry_layers<S>() -> impl Layer<S>
where
    S: Subscriber + for<'span> LookupSpan<'span>,
{
    let errors = filter_fn(|metadata| {
        metadata.is_event()
            && *metadata.level() == Level::ERROR
            && metadata.target() != module_path!()
    });
    SpanLayer::new().with_filter(LevelFilter::INFO).and_then(
        ErrorLayer::new()
            .enable_span_attributes()
            .with_filter(errors),
    )
}

/// SAN-227: Sentry stays off unless `SANTI_SENTRY_DSN` is set; a malformed DSN is an error.
pub fn sentry_options(
    var: impl Fn(&str) -> Option<String>,
) -> Result<Option<sentry::ClientOptions>, sentry::types::ParseDsnError> {
    let Some(dsn) = var("SANTI_SENTRY_DSN").filter(|dsn| !dsn.trim().is_empty()) else {
        return Ok(None);
    };
    let traces_sample_rate = var("SANTI_SENTRY_TRACES_SAMPLE_RATE")
        .and_then(|rate| rate.trim().parse::<f32>().ok())
        .filter(|rate| !rate.is_nan())
        .map_or(0.0, |rate| rate.clamp(0.0, 1.0));
    let mut options = sentry::ClientOptions::new()
        .traces_sample_rate(traces_sample_rate)
        .send_default_pii(false);
    options.dsn = Some(dsn.trim().parse()?);
    options.release = Some(env!("CARGO_PKG_VERSION").into());
    options.environment = Some(
        var("SANTI_SENTRY_ENVIRONMENT")
            .unwrap_or_else(|| "production".into())
            .into(),
    );
    options.before_send = Some(Arc::new(|event| Some(scrub(event))));
    Ok(Some(options))
}

/// Keeps the request method only and drops the user; route, status and request id travel as
/// tracing fields.
fn scrub(mut event: sentry::protocol::Event<'static>) -> sentry::protocol::Event<'static> {
    event.request = event.request.map(|request| sentry::protocol::Request {
        method: request.method,
        ..Default::default()
    });
    event.user = None;
    for context in event.contexts.values_mut() {
        if let sentry::protocol::Context::Other(fields) = context {
            fields.retain(|key, _| !key.ends_with("user_id"));
        }
    }
    event
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

    use super::{level_for, request_id, sentry_options};

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

    fn sentry_env(
        dsn: Option<&'static str>,
        rate: Option<&'static str>,
    ) -> impl Fn(&str) -> Option<String> {
        move |name| match name {
            "SANTI_SENTRY_DSN" => dsn.map(String::from),
            "SANTI_SENTRY_TRACES_SAMPLE_RATE" => rate.map(String::from),
            _ => None,
        }
    }

    const DSN: Option<&str> = Some("https://public@sentry.example.com/1");

    #[test]
    fn sentry_stays_off_without_a_dsn_and_a_bad_dsn_is_an_error() {
        assert!(sentry_options(sentry_env(None, None)).unwrap().is_none());
        assert!(
            sentry_options(sentry_env(Some(""), None))
                .unwrap()
                .is_none()
        );
        assert!(
            sentry_options(sentry_env(Some("  "), None))
                .unwrap()
                .is_none()
        );
        assert!(sentry_options(sentry_env(Some("not a dsn"), None)).is_err());
    }

    #[test]
    fn sentry_defaults_to_production_without_traces_and_clamps_the_sample_rate() {
        let options = sentry_options(sentry_env(DSN, None)).unwrap().unwrap();
        assert_eq!(options.environment.as_deref(), Some("production"));
        assert_eq!(
            format!("{:?}", options.traces_sampling_strategy),
            "FixedRate(0.0)"
        );
        assert!(!options.send_default_pii);
        assert_eq!(options.release.as_deref(), Some(env!("CARGO_PKG_VERSION")));
        let staging = sentry_options(|name| match name {
            "SANTI_SENTRY_DSN" => DSN.map(String::from),
            "SANTI_SENTRY_ENVIRONMENT" => Some("staging".into()),
            _ => None,
        })
        .unwrap()
        .unwrap();
        assert_eq!(staging.environment.as_deref(), Some("staging"));
        for (rate, expected) in [
            ("0.25", "FixedRate(0.25)"),
            (" 1 ", "FixedRate(1.0)"),
            ("5", "FixedRate(1.0)"),
            ("-1", "FixedRate(0.0)"),
            ("abc", "FixedRate(0.0)"),
            ("NaN", "FixedRate(0.0)"),
        ] {
            let options = sentry_options(sentry_env(DSN, Some(rate)))
                .unwrap()
                .unwrap();
            let strategy = format!("{:?}", options.traces_sampling_strategy);
            assert_eq!(strategy, expected, "{rate}");
        }
    }

    #[test]
    fn sentry_events_lose_body_cookies_authorization_query_and_the_user() {
        use sentry::protocol::{Context, Event, Request, User};

        let options = sentry_options(sentry_env(DSN, None)).unwrap().unwrap();
        let before_send = options.before_send.unwrap();
        let fields = [
            ("request:method".to_string(), "POST".into()),
            ("request:route".to_string(), "/api/projects/{key}".into()),
            ("request:request_id".to_string(), "abc-123".into()),
            ("request:user_id".to_string(), 42.into()),
            ("status".to_string(), 500.into()),
        ];
        let event = Event {
            request: Some(Request {
                url: "https://santi.example/api/projects/LOG?secret=hush"
                    .parse()
                    .ok(),
                method: Some("POST".into()),
                data: Some("{\"password\":\"hunter2\"}".into()),
                query_string: Some("secret=hush".into()),
                cookies: Some("santi_session=abc".into()),
                headers: [
                    ("Authorization".to_string(), "Bearer tok".to_string()),
                    ("Cookie".to_string(), "santi_session=abc".to_string()),
                ]
                .into(),
                env: [("REMOTE_ADDR".to_string(), "10.0.0.1".to_string())].into(),
            }),
            user: Some(User {
                id: Some("42".into()),
                email: Some("ana@example.com".into()),
                username: Some("Ana".into()),
                ..Default::default()
            }),
            contexts: [(
                "Rust Tracing Fields".to_string(),
                Context::Other(fields.into()),
            )]
            .into(),
            ..Default::default()
        };

        let scrubbed = before_send(event).unwrap();

        let request = scrubbed.request.clone().unwrap();
        assert_eq!(request.method.as_deref(), Some("POST"));
        let text = serde_json::to_string(&scrubbed).unwrap();
        for leak in [
            "hunter2",
            "hush",
            "secret",
            "santi_session",
            "Bearer",
            "10.0.0.1",
            "LOG",
            "ana@example.com",
            "Ana",
            "user_id",
            "42",
        ] {
            assert!(!text.contains(leak), "{leak} in {text}");
        }
        assert!(scrubbed.user.is_none());
        for kept in ["/api/projects/{key}", "abc-123", "500"] {
            assert!(text.contains(kept), "{kept} missing from {text}");
        }
    }
}
