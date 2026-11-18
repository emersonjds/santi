use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::extract::{MatchedPath, Request};
use axum::http::{HeaderName, HeaderValue};
use axum::middleware::Next;
use axum::response::Response;
use sentry::SentryFutureExt;
use sentry::integrations::tracing::{ErrorLayer, SpanLayer};
use tracing::field::Empty;
use tracing::{Instrument, Level, Subscriber};
use tracing_subscriber::EnvFilter;
use tracing_subscriber::filter::filter_fn;
use tracing_subscriber::fmt::MakeWriter;
use tracing_subscriber::layer::{Layer, SubscriberExt};
use tracing_subscriber::registry::LookupSpan;

const X_REQUEST_ID: HeaderName = HeaderName::from_static("x-request-id");

/// SAN-209: JSON lines (`json`) or human-readable ones, filtered like `RUST_LOG`. SAN-227: with
/// `sentry` options, error events except the per-request line also go to the bound Sentry client.
pub fn subscriber<W>(
    filter: EnvFilter,
    json: bool,
    writer: W,
    sentry: Option<&sentry::ClientOptions>,
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
            .with(sentry.map(sentry_layers)),
    )
}

/// Error events get route, method and request id as tags of the per-request hub, and from the
/// trace context when traces are on. Only the `trace` span becomes a transaction: the `request`
/// span carries `user_id`. The per-request line stays out since the error behind a 500 is
/// reported on its own.
fn sentry_layers<S>(options: &sentry::ClientOptions) -> impl Layer<S>
where
    S: Subscriber + for<'span> LookupSpan<'span>,
{
    let errors = filter_fn(|metadata| {
        metadata.is_event()
            && *metadata.level() == Level::ERROR
            && metadata.target() != module_path!()
    });
    let traced = matches!(
        options.traces_sampling_strategy,
        sentry::TracesSamplingStrategy::FixedRate(rate) if rate > 0.0
    );
    let traces = filter_fn(|metadata| {
        metadata.is_span() && metadata.name() == "trace" && metadata.target() == module_path!()
    });
    ErrorLayer::new()
        .with_filter(errors)
        .and_then(traced.then(|| SpanLayer::new().with_filter(traces)))
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

const KEPT_FIELDS: [&str; 4] = ["method", "route", "request_id", "status"];

/// Allowlist: trace data and tags keep `KEPT_FIELDS`, tracing fields keep `error`, the source
/// location stays; every other context, the request, user, extra and breadcrumbs go.
fn scrub(event: sentry::protocol::Event<'static>) -> sentry::protocol::Event<'static> {
    use sentry::protocol::Context;

    let kept = |key: &String| KEPT_FIELDS.contains(&key.as_str());
    let contexts = event
        .contexts
        .into_iter()
        .filter_map(|(name, context)| match context {
            Context::Trace(mut trace) => {
                trace.data.retain(|key, _| kept(key));
                Some((name, Context::Trace(trace)))
            }
            Context::Other(mut fields) if name == "Rust Tracing Fields" => {
                fields.retain(|key, _| key == "error");
                Some((name, Context::Other(fields)))
            }
            Context::Other(_) if name == "Rust Tracing Location" => Some((name, context)),
            _ => None,
        })
        .collect();
    sentry::protocol::Event {
        request: None,
        user: None,
        extra: Default::default(),
        breadcrumbs: Default::default(),
        tags: event
            .tags
            .into_iter()
            .filter(|(key, _)| kept(key))
            .collect(),
        contexts,
        ..event
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
    let method = request.method().as_str().to_owned();
    let hub = request_hub(&method, route, &id);
    let trace = sentry::Hub::run(
        hub.clone(),
        || tracing::info_span!("trace", method, route, request_id = %id, status = Empty),
    );
    let span = tracing::info_span!(
        parent: &trace,
        "request",
        method,
        route,
        request_id = %id,
        user_id = Empty,
    );
    let mut response = next
        .run(request)
        .instrument(span.clone())
        .instrument(trace.clone())
        .bind_hub(hub)
        .await;
    let latency = started.elapsed();
    let status = response.status().as_u16();
    let latency_ms = latency.as_millis() as u64;
    trace.record("status", status);
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

/// A hub per request so the route, method and request id tag its error events; without a client
/// the current hub is reused.
fn request_hub(method: &str, route: &str, id: &str) -> Arc<sentry::Hub> {
    let current = sentry::Hub::current();
    if current.client().is_none() {
        return current;
    }
    let hub = Arc::new(sentry::Hub::new_from_top(current));
    hub.configure_scope(|scope| {
        scope.set_tag("method", method);
        scope.set_tag("route", route);
        scope.set_tag("request_id", id);
    });
    hub
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
    fn sentry_events_keep_only_allowlisted_fields() {
        use sentry::protocol::{Breadcrumb, Context, Event, Request, TraceContext, User};

        let options = sentry_options(sentry_env(DSN, None)).unwrap().unwrap();
        let before_send = options.before_send.unwrap();
        let trace = TraceContext {
            data: [
                ("user_id".to_string(), 42.into()),
                ("route".to_string(), "/api/projects/{key}".into()),
                ("method".to_string(), "POST".into()),
                ("request_id".to_string(), "abc-123".into()),
                ("code.file.path".to_string(), "src/auth.rs".into()),
            ]
            .into(),
            ..Default::default()
        };
        let fields = [
            ("email".to_string(), "x@y.z".into()),
            ("error".to_string(), "pool timed out".into()),
        ];
        let event = Event {
            request: Some(Request {
                url: "https://santi.example/api/projects/LOG?secret=hush"
                    .parse()
                    .ok(),
                method: Some("POST".into()),
                data: Some("{\"password\":\"hunter2\"}".into()),
                cookies: Some("santi_session=abc".into()),
                headers: [("Authorization".to_string(), "Bearer tok".to_string())].into(),
                env: [("REMOTE_ADDR".to_string(), "10.0.0.1".to_string())].into(),
                ..Default::default()
            }),
            user: Some(User {
                id: Some("42".into()),
                email: Some("ana@example.com".into()),
                ..Default::default()
            }),
            contexts: [
                ("trace".to_string(), Context::Trace(Box::new(trace))),
                (
                    "Rust Tracing Fields".to_string(),
                    Context::Other(fields.into()),
                ),
                (
                    "member".to_string(),
                    Context::Other([("name".to_string(), "Ana".into())].into()),
                ),
            ]
            .into(),
            tags: [
                ("route".to_string(), "/api/projects/{key}".to_string()),
                ("nickname".to_string(), "Ana".to_string()),
            ]
            .into(),
            extra: [("token".to_string(), "Bearer tok".into())].into(),
            breadcrumbs: vec![Breadcrumb {
                message: Some("ana@example.com".into()),
                ..Default::default()
            }]
            .into(),
            ..Default::default()
        };

        let scrubbed = before_send(event).unwrap();

        let Some(Context::Trace(trace)) = scrubbed.contexts.get("trace") else {
            panic!("trace context missing: {scrubbed:?}");
        };
        let kept: Vec<_> = trace.data.keys().map(String::as_str).collect();
        assert_eq!(kept, ["method", "request_id", "route"]);
        let Some(Context::Other(fields)) = scrubbed.contexts.get("Rust Tracing Fields") else {
            panic!("tracing fields missing: {scrubbed:?}");
        };
        let kept: Vec<_> = fields.keys().map(String::as_str).collect();
        assert_eq!(kept, ["error"]);
        assert_eq!(scrubbed.contexts.len(), 2);
        let tags: Vec<_> = scrubbed.tags.keys().map(String::as_str).collect();
        assert_eq!(tags, ["route"]);
        assert!(scrubbed.request.is_none());
        assert!(scrubbed.user.is_none());
        assert!(scrubbed.extra.is_empty());
        assert!(scrubbed.breadcrumbs.values.is_empty());
    }
}
