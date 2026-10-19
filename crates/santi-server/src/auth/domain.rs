use argon2::Argon2;
use argon2::password_hash::{PasswordHasher, PasswordVerifier};
use axum::http::header::{AUTHORIZATION, COOKIE, HOST, ORIGIN};
use axum::http::{HeaderMap, Method};
use sha2::{Digest, Sha256};

use crate::error::{AppError, reject_nul};

pub const SESSION_COOKIE: &str = "__Host-santi_session";
pub const SESSION_DAYS: i64 = 30;
pub const RESET_HOURS: i64 = 24;
pub const API_TOKEN_PREFIX: &str = "santi_";
/// Versions of `web/terms.html` and `web/privacy.html` (and their pt-BR pages); bump one when its
/// text changes and everyone is asked to accept it again (D45).
pub const TERMS_VERSION: &str = "2026-10-16";
pub const PRIVACY_VERSION: &str = "2026-10-16.2";
pub const AGE_DECLARATION: &str = "18+";

/// Argon2 default parameters with a password nobody knows. Login verifies against it when the
/// email is unknown, so both failures cost the same time.
const DUMMY_PASSWORD_HASH: &str = "$argon2id$v=19$m=19456,t=2,p=1$LQzD6bTFuUbWQ35+CFbKXw$7x8VZQkRMrI/ptiG/Um0Ural4C1PMr9El05qYAXieyU";

pub fn normalize_email(email: &str) -> Result<String, AppError> {
    reject_nul("email", email)?;
    let email = email.trim().to_lowercase();
    let Some((local, domain)) = email.split_once('@') else {
        return Err(AppError::invalid("email", "must be an email address"));
    };
    let mut labels = domain.split('.');
    let valid = !local.is_empty()
        && email.len() <= 254
        && !domain.contains('@')
        && !email.chars().any(char::is_whitespace)
        && labels.clone().count() >= 2
        && labels.all(|label| !label.is_empty())
        && !domain.ends_with(".invalid");
    if !valid {
        return Err(AppError::invalid("email", "must be an email address"));
    }
    Ok(email)
}

pub fn check_password(password: &str) -> Result<(), AppError> {
    let length = password.chars().count();
    if !(10..=128).contains(&length) {
        return Err(AppError::invalid(
            "password",
            "must have 10 to 128 characters",
        ));
    }
    Ok(())
}

pub fn check_terms(accepted: bool) -> Result<(), AppError> {
    if !accepted {
        return Err(AppError::invalid(
            "accept_terms",
            "accept the Terms of Use and the Privacy Policy to sign up",
        ));
    }
    Ok(())
}

pub fn check_age(confirmed: bool) -> Result<(), AppError> {
    if !confirmed {
        return Err(AppError::invalid(
            "confirm_age",
            "santi is for people 18 or older",
        ));
    }
    Ok(())
}

pub fn check_display_name(name: &str) -> Result<String, AppError> {
    reject_nul("display_name", name)?;
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 100 {
        return Err(AppError::invalid(
            "display_name",
            "must have 1 to 100 characters",
        ));
    }
    Ok(name.to_string())
}

/// 32 random bytes as lowercase hex.
pub fn new_secret() -> String {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).expect("the operating system random source works");
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

pub fn new_api_token() -> String {
    format!("{API_TOKEN_PREFIX}{}", new_secret())
}

pub fn hash_token(token: &str) -> Vec<u8> {
    Sha256::digest(token.as_bytes()).to_vec()
}

pub fn hash_password(password: &str) -> Result<String, AppError> {
    Argon2::default()
        .hash_password(password.as_bytes())
        .map(|hash| hash.to_string())
        .map_err(|error| AppError::Internal(error.to_string()))
}

pub fn verify_password(password: &str, stored_hash: &str) -> bool {
    Argon2::default()
        .verify_password(password.as_bytes(), stored_hash)
        .is_ok()
}

pub fn dummy_password_hash() -> String {
    DUMMY_PASSWORD_HASH.to_string()
}

/// The address people open santi at: `SANTI_PUBLIC_URL`, else the Railway domain, else local.
pub fn public_url(configured: Option<String>, railway_domain: Option<String>) -> String {
    let configured = configured.filter(|url| !url.is_empty());
    let railway = railway_domain
        .filter(|domain| !domain.is_empty())
        .map(|domain| format!("https://{domain}"));
    let url = configured.or(railway);
    url.map_or_else(
        || "http://localhost:8080".into(),
        |url| url.trim_end_matches('/').to_string(),
    )
}

pub fn reset_url(base: &str, token: &str) -> String {
    format!("{base}/reset/{token}")
}

/// Bearer first, then the session cookie (D23). A present but unknown Bearer never falls back.
pub fn token_from_headers(headers: &HeaderMap) -> Option<&str> {
    bearer_token(headers).or_else(|| session_token(headers))
}

pub fn bearer_token(headers: &HeaderMap) -> Option<&str> {
    let (scheme, token) = header_text(headers, AUTHORIZATION)?.split_once(' ')?;
    scheme.eq_ignore_ascii_case("bearer").then_some(token)
}

pub fn session_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get_all(COOKIE)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .flat_map(|value| value.split(';'))
        .find_map(|pair| pair.trim().strip_prefix(SESSION_COOKIE)?.strip_prefix('='))
}

pub fn session_cookie(token: &str) -> String {
    let max_age = SESSION_DAYS * 24 * 60 * 60;
    format!("{SESSION_COOKIE}={token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age={max_age}")
}

pub fn expired_session_cookie() -> String {
    format!("{SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0")
}

/// D22: a browser write must come from our own origin. Bearer requests carry no ambient
/// credential and pass; so do requests with neither `Sec-Fetch-Site` nor `Origin` (CLI).
/// `authority` is the request URI authority, which carries the host on HTTP/2.
pub fn is_cross_site_write(method: &Method, headers: &HeaderMap, authority: Option<&str>) -> bool {
    let safe_method = matches!(*method, Method::GET | Method::HEAD | Method::OPTIONS);
    if safe_method || bearer_token(headers).is_some() {
        return false;
    }
    if let Some(site) = header_text(headers, "sec-fetch-site") {
        return !matches!(site, "same-origin" | "none");
    }
    let Some(origin) = header_text(headers, ORIGIN) else {
        return false;
    };
    let origin_host = origin.split_once("://").map(|(_, host)| host);
    match (origin_host, header_text(headers, HOST).or(authority)) {
        (Some(origin_host), Some(host)) => origin_host != host,
        _ => true,
    }
}

fn header_text(headers: &HeaderMap, name: impl axum::http::header::AsHeaderName) -> Option<&str> {
    headers.get(name)?.to_str().ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::{HeaderMap, HeaderValue, Method, header};

    #[test]
    fn email_is_trimmed_and_lowercased() {
        assert_eq!(
            normalize_email("  Ana@Example.COM ").unwrap(),
            "ana@example.com"
        );
    }

    #[test]
    fn email_without_at_or_dot_is_rejected() {
        assert!(normalize_email("ana.example.com").is_err());
        assert!(normalize_email("ana@localhost").is_err());
        assert!(normalize_email("@example.com").is_err());
        assert!(normalize_email(&format!("{}@example.com", "a".repeat(250))).is_err());
    }

    #[test]
    fn email_needs_one_at_no_spaces_and_non_empty_domain_labels() {
        for email in ["a@b@c.com", "a@.", "a b@x.y", "a@b.", "a@.b", "a@b..c"] {
            assert!(normalize_email(email).is_err(), "{email}");
        }
        assert_eq!(normalize_email("a@b.c").unwrap(), "a@b.c");
        assert!(normalize_email("deleted-1@deleted.invalid").is_err());
        assert_eq!(normalize_email("a.b@mail.x.io").unwrap(), "a.b@mail.x.io");
    }

    #[test]
    fn password_length_is_bounded() {
        assert!(check_password("short").is_err());
        assert!(check_password(&"x".repeat(129)).is_err());
        assert!(check_password("correct horse").is_ok());
    }

    #[test]
    fn terms_and_age_must_be_confirmed() {
        assert!(check_terms(true).is_ok());
        assert!(check_terms(false).is_err());
        assert!(check_age(true).is_ok());
        assert!(check_age(false).is_err());
    }

    #[test]
    fn display_name_is_trimmed_and_required() {
        assert_eq!(check_display_name("  Ana ").unwrap(), "Ana");
        assert!(check_display_name("   ").is_err());
        assert!(check_display_name(&"x".repeat(101)).is_err());
    }

    #[test]
    fn secrets_are_64_hex_chars_and_unique() {
        let first = new_secret();
        assert_eq!(first.len(), 64);
        assert!(first.chars().all(|character| character.is_ascii_hexdigit()));
        assert_ne!(first, new_secret());
    }

    #[test]
    fn public_url_prefers_the_configured_one_then_railway_then_localhost() {
        let configured = Some("https://santi.dev/".to_string());
        let railway = Some("santi.up.railway.app".to_string());
        assert_eq!(public_url(configured, railway.clone()), "https://santi.dev");
        assert_eq!(
            public_url(Some(String::new()), railway),
            "https://santi.up.railway.app"
        );
        assert_eq!(
            public_url(None, Some(String::new())),
            "http://localhost:8080"
        );
    }

    #[test]
    fn reset_url_puts_the_token_under_reset() {
        assert_eq!(
            reset_url("https://santi.dev", "abc"),
            "https://santi.dev/reset/abc"
        );
    }

    #[test]
    fn api_tokens_carry_the_santi_prefix() {
        assert!(new_api_token().starts_with("santi_"));
    }

    #[test]
    fn token_hash_is_a_stable_sha256() {
        assert_eq!(hash_token("abc"), hash_token("abc"));
        assert_eq!(hash_token("abc").len(), 32);
        assert_ne!(hash_token("abc"), hash_token("abd"));
    }

    #[test]
    fn password_hash_verifies_only_the_same_password() {
        let hash = hash_password("correct horse").unwrap();
        assert!(!hash.contains("correct horse"));
        assert!(verify_password("correct horse", &hash));
        assert!(!verify_password("wrong horse", &hash));
        assert!(!verify_password("correct horse", "not-a-hash"));
    }

    #[test]
    fn dummy_hash_is_a_real_hash_that_matches_nothing_users_send() {
        let same_cost = "$argon2id$v=19$m=19456,t=2,p=1$";
        assert!(
            hash_password("anything at all")
                .unwrap()
                .starts_with(same_cost)
        );
        assert!(dummy_password_hash().starts_with(same_cost));
        assert!(!verify_password("correct horse", &dummy_password_hash()));
    }

    #[test]
    fn bearer_wins_over_cookie() {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::AUTHORIZATION,
            HeaderValue::from_static("Bearer santi_abc"),
        );
        headers.insert(
            header::COOKIE,
            HeaderValue::from_static("__Host-santi_session=def"),
        );
        assert_eq!(token_from_headers(&headers), Some("santi_abc"));
    }

    #[test]
    fn session_cookie_is_found_among_others() {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::COOKIE,
            HeaderValue::from_static("theme=dark; __Host-santi_session=def"),
        );
        assert_eq!(token_from_headers(&headers), Some("def"));
    }

    #[test]
    fn other_authorization_schemes_are_ignored() {
        let mut headers = HeaderMap::new();
        headers.insert(header::AUTHORIZATION, HeaderValue::from_static("Basic abc"));
        assert_eq!(token_from_headers(&headers), None);
    }

    #[test]
    fn bearer_scheme_is_case_insensitive() {
        for value in ["bearer santi_abc", "BEARER santi_abc", "Bearer santi_abc"] {
            let mut headers = HeaderMap::new();
            headers.insert(header::AUTHORIZATION, HeaderValue::from_static(value));
            assert_eq!(token_from_headers(&headers), Some("santi_abc"), "{value}");
            headers.insert("sec-fetch-site", HeaderValue::from_static("cross-site"));
            assert!(
                !is_cross_site_write(&Method::POST, &headers, None),
                "{value}"
            );
        }
    }

    #[test]
    fn session_cookie_is_http_only_secure_and_lax() {
        let cookie = session_cookie("abc");
        assert!(cookie.starts_with("__Host-santi_session=abc;"));
        assert!(cookie.contains("HttpOnly"));
        assert!(cookie.contains("Secure"));
        assert!(cookie.contains("SameSite=Lax"));
        assert!(cookie.contains("Max-Age=2592000"));
        assert!(expired_session_cookie().contains("Max-Age=0"));
    }

    fn headers(pairs: &[(&'static str, &'static str)]) -> HeaderMap {
        let mut headers = HeaderMap::new();
        for (name, value) in pairs {
            headers.insert(*name, HeaderValue::from_static(value));
        }
        headers
    }

    #[test]
    fn cross_site_writes_are_detected() {
        let cross_site = headers(&[("sec-fetch-site", "cross-site")]);
        let other_origin = headers(&[("origin", "https://evil.example"), ("host", "santi.dev")]);
        let null_origin = headers(&[("origin", "null"), ("host", "santi.dev")]);
        let same_site = headers(&[("sec-fetch-site", "same-site")]);
        let origin_without_host = headers(&[("origin", "https://santi.dev")]);

        assert!(is_cross_site_write(&Method::POST, &cross_site, None));
        assert!(is_cross_site_write(&Method::DELETE, &other_origin, None));
        assert!(is_cross_site_write(&Method::POST, &null_origin, None));
        assert!(is_cross_site_write(&Method::POST, &same_site, None));
        assert!(is_cross_site_write(
            &Method::POST,
            &origin_without_host,
            None
        ));
        assert!(is_cross_site_write(
            &Method::POST,
            &origin_without_host,
            Some("evil.example")
        ));
        assert!(!is_cross_site_write(
            &Method::POST,
            &origin_without_host,
            Some("santi.dev")
        ));
    }

    #[test]
    fn same_origin_reads_and_non_browser_writes_pass() {
        let cross_site = headers(&[("sec-fetch-site", "cross-site")]);
        let same_origin = headers(&[("sec-fetch-site", "same-origin")]);
        let typed_url = headers(&[("sec-fetch-site", "none")]);
        let matching_origin = headers(&[("origin", "https://santi.dev"), ("host", "santi.dev")]);
        let bearer_from_elsewhere = headers(&[
            ("sec-fetch-site", "cross-site"),
            ("authorization", "Bearer santi_abc"),
        ]);

        assert!(!is_cross_site_write(&Method::GET, &cross_site, None));
        assert!(!is_cross_site_write(&Method::POST, &same_origin, None));
        assert!(!is_cross_site_write(&Method::POST, &typed_url, None));
        assert!(!is_cross_site_write(&Method::POST, &matching_origin, None));
        assert!(!is_cross_site_write(&Method::POST, &HeaderMap::new(), None));
        assert!(!is_cross_site_write(
            &Method::POST,
            &bearer_from_elsewhere,
            None
        ));
    }
}
