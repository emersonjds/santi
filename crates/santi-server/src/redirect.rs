use axum::extract::{Request, State};
use axum::http::header::{HOST, LOCATION};
use axum::http::{Method, StatusCode, Uri};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

use crate::AppState;

const RAILWAY_HOSTS: &str = ".up.railway.app";

/// SAN-223: the Railway-generated host answers a permanent redirect to the public URL, keeping
/// path and query; `/health` stays put for Railway's healthcheck. GET and HEAD get 301, other
/// methods 308 so the body survives.
// ponytail: Railway-generated hosts only; a general canonical-host setting if self-hosters ask.
pub fn old_host_redirect(
    method: &Method,
    host: &str,
    uri: &Uri,
    public_url: &str,
) -> Option<(StatusCode, String)> {
    fn without_port(host: &str) -> &str {
        host.split(':').next().unwrap_or_default()
    }
    let host = without_port(host);
    let public_host = without_port(
        public_url
            .split_once("://")
            .map_or(public_url, |(_, rest)| rest)
            .split('/')
            .next()
            .unwrap_or_default(),
    );
    let local = public_host == "localhost" || public_host.starts_with("127.");
    let old_host = host.ends_with(RAILWAY_HOSTS)
        && host != public_host
        && !public_host.ends_with(RAILWAY_HOSTS)
        && !local;
    if !old_host || uri.path() == "/health" {
        return None;
    }
    let status = match *method {
        Method::GET | Method::HEAD => StatusCode::MOVED_PERMANENTLY,
        _ => StatusCode::PERMANENT_REDIRECT,
    };
    let path_and_query = uri.path_and_query().map_or("/", |path| path.as_str());
    Some((status, format!("{public_url}{path_and_query}")))
}

pub async fn to_public_url(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Response {
    let headers = request.headers();
    let host = headers
        .get("x-forwarded-host")
        .or(headers.get(HOST))
        .and_then(|host| host.to_str().ok())
        .or(request
            .uri()
            .authority()
            .map(|authority| authority.as_str()))
        .unwrap_or_default();
    match old_host_redirect(request.method(), host, request.uri(), &state.public_url) {
        Some((status, target)) => (status, [(LOCATION, target)]).into_response(),
        None => next.run(request).await,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const PUBLIC: &str = "https://getsanti.app";
    const OLD: &str = "santi-production-bc0c.up.railway.app";

    fn redirect(
        method: Method,
        host: &str,
        uri: &str,
        public_url: &str,
    ) -> Option<(StatusCode, String)> {
        old_host_redirect(&method, host, &uri.parse().unwrap(), public_url)
    }

    #[test]
    fn nothing_moves_while_the_public_url_is_the_local_default() {
        assert_eq!(
            redirect(Method::GET, OLD, "/", "http://localhost:8080"),
            None
        );
        assert_eq!(
            redirect(Method::POST, OLD, "/api/projects", "http://127.0.0.1:8080"),
            None
        );
    }

    #[test]
    fn the_old_railway_host_moves_to_the_public_url_with_path_and_query() {
        assert_eq!(
            redirect(Method::GET, OLD, "/p/RAD/board?x=1", PUBLIC),
            Some((
                StatusCode::MOVED_PERMANENTLY,
                "https://getsanti.app/p/RAD/board?x=1".into()
            ))
        );
        assert_eq!(
            redirect(Method::HEAD, &format!("{OLD}:443"), "/", PUBLIC),
            Some((
                StatusCode::MOVED_PERMANENTLY,
                "https://getsanti.app/".into()
            ))
        );
    }

    #[test]
    fn writes_keep_their_method_and_body_with_308() {
        assert_eq!(
            redirect(Method::POST, OLD, "/api/auth/login", PUBLIC),
            Some((
                StatusCode::PERMANENT_REDIRECT,
                "https://getsanti.app/api/auth/login".into()
            ))
        );
    }

    #[test]
    fn health_the_public_host_and_other_hosts_are_left_alone() {
        assert_eq!(redirect(Method::GET, OLD, "/health", PUBLIC), None);
        assert_eq!(
            redirect(Method::GET, "getsanti.app", "/p/RAD/board", PUBLIC),
            None
        );
        assert_eq!(
            redirect(Method::GET, "santi.example.com", "/", PUBLIC),
            None
        );
        assert_eq!(redirect(Method::GET, "localhost:8080", "/", PUBLIC), None);
    }

    #[test]
    fn a_public_url_on_railway_never_redirects() {
        assert_eq!(
            redirect(Method::GET, OLD, "/", &format!("https://{OLD}")),
            None
        );
        assert_eq!(
            redirect(
                Method::GET,
                "other.up.railway.app",
                "/",
                &format!("https://{OLD}")
            ),
            None
        );
    }
}
