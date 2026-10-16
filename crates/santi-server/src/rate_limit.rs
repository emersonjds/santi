//! D44: in-memory token buckets per client address and per account, plus a per-email login
//! lockout. One process holds the counters; a restart forgets them.

use std::collections::HashMap;
use std::net::{IpAddr, Ipv6Addr, SocketAddr};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use axum::extract::{ConnectInfo, FromRequestParts};
use axum::http::HeaderMap;
use axum::http::request::Parts;

use crate::AppState;
use crate::error::AppError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Action {
    Login,
    Register,
    Token,
    InviteAccept,
    /// Preview and import share one bucket.
    Import,
}

impl Action {
    /// Burst size and the time one request takes to refill.
    fn rule(self) -> (u32, Duration) {
        let (burst, seconds) = match self {
            Action::Login => (10, 6),
            Action::Register => (10, 360),
            Action::Token => (10, 360),
            Action::InviteAccept => (10, 60),
            Action::Import => (20, 30),
        };
        (burst, Duration::from_secs(seconds))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum Subject {
    Address(IpAddr),
    Account(i64),
}

struct Bucket {
    tokens: f64,
    at: Instant,
}

struct Failures {
    count: u32,
    locked_until: Option<Instant>,
    at: Instant,
}

const LOCK_FROM: u32 = 5;
const FIRST_LOCK: Duration = Duration::from_secs(30);
const LONGEST_LOCK: Duration = Duration::from_secs(15 * 60);
const FORGET_FAILURES_AFTER: Duration = Duration::from_secs(60 * 60);
/// ponytail: past this many entries a write prunes idle ones (O(n) once in a while);
/// a shared store (Redis) only if santi runs more than one replica.
const MAX_ENTRIES: usize = 10_000;

pub struct RateLimits {
    trusted_proxies: usize,
    per_address: bool,
    buckets: Mutex<HashMap<(Action, Subject), Bucket>>,
    logins: Mutex<HashMap<String, Failures>>,
}

impl Default for RateLimits {
    fn default() -> Self {
        RateLimits::new(0, true)
    }
}

impl RateLimits {
    /// `trusted_proxies`: how many proxies in front append to `X-Forwarded-For` (1 on Railway).
    /// `per_address: false` turns off the address buckets (e2e runs where every user shares one).
    pub fn new(trusted_proxies: usize, per_address: bool) -> Self {
        RateLimits {
            trusted_proxies,
            per_address,
            buckets: Mutex::default(),
            logins: Mutex::default(),
        }
    }

    pub fn check(
        &self,
        action: Action,
        address: Option<IpAddr>,
        account: Option<i64>,
    ) -> Result<(), AppError> {
        self.check_at(action, address, account, Instant::now())
    }

    fn check_at(
        &self,
        action: Action,
        address: Option<IpAddr>,
        account: Option<i64>,
        now: Instant,
    ) -> Result<(), AppError> {
        let address = address
            .filter(|_| self.per_address)
            .map(|address| Subject::Address(network(address)));
        let subjects = address.into_iter().chain(account.map(Subject::Account));
        let (burst, every) = action.rule();
        let mut buckets = self
            .buckets
            .lock()
            .unwrap_or_else(|poison| poison.into_inner());
        for subject in subjects {
            if buckets.len() > MAX_ENTRIES {
                buckets.retain(|(action, _), bucket| {
                    let (burst, every) = action.rule();
                    now.duration_since(bucket.at) < every * burst
                });
            }
            let bucket = buckets.entry((action, subject)).or_insert(Bucket {
                tokens: f64::from(burst),
                at: now,
            });
            let refilled = now.duration_since(bucket.at).as_secs_f64() / every.as_secs_f64();
            bucket.tokens = (bucket.tokens + refilled).min(f64::from(burst));
            bucket.at = now;
            if bucket.tokens < 1.0 {
                let wait = every.as_secs_f64() * (1.0 - bucket.tokens);
                return Err(too_many(Duration::from_secs_f64(wait)));
            }
            bucket.tokens -= 1.0;
        }
        Ok(())
    }

    /// Counts an attempt before the password is checked, so parallel guesses count too.
    /// Unknown emails count the same way: the answer never says whether an account exists.
    pub fn login_attempt(&self, email: &str) -> Result<(), AppError> {
        self.login_attempt_at(email, Instant::now())
    }

    fn login_attempt_at(&self, email: &str, now: Instant) -> Result<(), AppError> {
        let mut logins = self
            .logins
            .lock()
            .unwrap_or_else(|poison| poison.into_inner());
        if logins.len() > MAX_ENTRIES {
            logins.retain(|_, failures| !forgotten(failures, now));
        }
        let failures = logins.entry(email.to_string()).or_insert(Failures {
            count: 0,
            locked_until: None,
            at: now,
        });
        if forgotten(failures, now) {
            failures.count = 0;
        }
        if let Some(until) = failures.locked_until.filter(|until| *until > now) {
            return Err(too_many(until - now));
        }
        failures.count += 1;
        failures.at = now;
        if failures.count >= LOCK_FROM {
            let doublings = (failures.count - LOCK_FROM).min(10);
            failures.locked_until =
                Some(now + (FIRST_LOCK * 2u32.pow(doublings)).min(LONGEST_LOCK));
        }
        Ok(())
    }

    pub fn login_succeeded(&self, email: &str) {
        let mut logins = self
            .logins
            .lock()
            .unwrap_or_else(|poison| poison.into_inner());
        logins.remove(email);
    }

    #[cfg(test)]
    fn bucket_count(&self) -> usize {
        self.buckets.lock().unwrap().len()
    }
}

fn forgotten(failures: &Failures, now: Instant) -> bool {
    let unlocked = failures.locked_until.is_none_or(|until| until <= now);
    unlocked && now.duration_since(failures.at) >= FORGET_FAILURES_AFTER
}

fn too_many(wait: Duration) -> AppError {
    let seconds = wait.as_secs() + u64::from(wait.subsec_nanos() > 0);
    AppError::TooManyRequests {
        retry_after: seconds.max(1),
    }
}

/// An IPv6 client gets a whole /64, so it shares one bucket; IPv4-mapped addresses count as IPv4.
fn network(address: IpAddr) -> IpAddr {
    match address.to_canonical() {
        IpAddr::V6(v6) => {
            let prefix = u128::from(v6) & !u128::from(u64::MAX);
            IpAddr::V6(Ipv6Addr::from(prefix))
        }
        v4 => v4,
    }
}

/// The client address: the peer, or behind `trusted_proxies` proxies the `X-Forwarded-For`
/// entry appended by the one facing the internet. Entries to its left are client-controlled.
pub fn client_ip(
    headers: &HeaderMap,
    peer: Option<IpAddr>,
    trusted_proxies: usize,
) -> Option<IpAddr> {
    if trusted_proxies == 0 {
        return peer;
    }
    let hops: Vec<&str> = headers
        .get_all("x-forwarded-for")
        .iter()
        .filter_map(|value| value.to_str().ok())
        .flat_map(|value| value.split(','))
        .map(str::trim)
        .collect();
    let Some(index) = hops.len().checked_sub(trusted_proxies) else {
        return peer;
    };
    hops[index].parse().ok().or(peer)
}

/// The caller's address; `None` when the server runs without connection info (tests).
pub struct ClientIp(pub Option<IpAddr>);

impl FromRequestParts<AppState> for ClientIp {
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let peer = parts
            .extensions
            .get::<ConnectInfo<SocketAddr>>()
            .map(|ConnectInfo(address)| address.ip());
        Ok(ClientIp(client_ip(
            &parts.headers,
            peer,
            state.limits.trusted_proxies,
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::{HeaderMap, HeaderValue};
    use std::net::{IpAddr, Ipv4Addr};
    use std::time::{Duration, Instant};

    const PEER: IpAddr = IpAddr::V4(Ipv4Addr::new(10, 0, 0, 1));

    fn forwarded(values: &[&'static str]) -> HeaderMap {
        let mut headers = HeaderMap::new();
        for value in values {
            headers.append("x-forwarded-for", HeaderValue::from_static(value));
        }
        headers
    }

    fn ip(text: &str) -> IpAddr {
        text.parse().unwrap()
    }

    #[test]
    fn a_bucket_allows_its_burst_then_says_how_long_to_wait() {
        let limits = RateLimits::new(0, true);
        let start = Instant::now();
        let client = Some(ip("203.0.113.7"));
        for _ in 0..10 {
            assert!(
                limits
                    .check_at(Action::Register, client, None, start)
                    .is_ok()
            );
        }

        let refused = limits.check_at(Action::Register, client, None, start);
        assert_eq!(refused, Err(AppError::TooManyRequests { retry_after: 360 }));
        let other = Some(ip("203.0.113.8"));
        assert!(
            limits
                .check_at(Action::Register, other, None, start)
                .is_ok()
        );
        let later = start + Duration::from_secs(360);
        assert!(
            limits
                .check_at(Action::Register, client, None, later)
                .is_ok()
        );
        assert!(
            limits
                .check_at(Action::Register, client, None, later)
                .is_err()
        );
    }

    #[test]
    fn accounts_have_their_own_bucket_next_to_the_address() {
        let limits = RateLimits::new(0, true);
        let now = Instant::now();
        for _ in 0..10 {
            assert!(limits.check_at(Action::Token, None, Some(7), now).is_ok());
        }

        assert!(limits.check_at(Action::Token, None, Some(7), now).is_err());
        assert!(limits.check_at(Action::Token, None, Some(8), now).is_ok());
        assert!(limits.check_at(Action::Import, None, Some(7), now).is_ok());
    }

    #[test]
    fn address_limits_can_be_switched_off_but_account_limits_stay() {
        let limits = RateLimits::new(0, false);
        let now = Instant::now();
        let client = Some(ip("203.0.113.7"));
        for _ in 0..50 {
            assert!(limits.check_at(Action::Login, client, None, now).is_ok());
        }
        for _ in 0..10 {
            limits
                .check_at(Action::Token, client, Some(7), now)
                .unwrap();
        }
        assert!(
            limits
                .check_at(Action::Token, client, Some(7), now)
                .is_err()
        );
    }

    #[test]
    fn logins_lock_from_the_fifth_failure_and_back_off_to_fifteen_minutes() {
        let limits = RateLimits::new(0, true);
        let mut now = Instant::now();
        for _ in 0..5 {
            assert!(limits.login_attempt_at("ana@example.com", now).is_ok());
        }
        assert_eq!(
            limits.login_attempt_at("ana@example.com", now),
            Err(AppError::TooManyRequests { retry_after: 30 })
        );
        assert!(limits.login_attempt_at("bob@example.com", now).is_ok());

        let mut waits = Vec::new();
        for _ in 0..8 {
            now += Duration::from_secs(15 * 60);
            limits.login_attempt_at("ana@example.com", now).unwrap();
            let Err(AppError::TooManyRequests { retry_after }) =
                limits.login_attempt_at("ana@example.com", now)
            else {
                panic!("locked");
            };
            waits.push(retry_after);
        }
        assert_eq!(waits, [60, 120, 240, 480, 900, 900, 900, 900]);
    }

    #[test]
    fn a_successful_login_clears_the_failures() {
        let limits = RateLimits::new(0, true);
        let now = Instant::now();
        for _ in 0..4 {
            limits.login_attempt_at("ana@example.com", now).unwrap();
        }
        limits.login_succeeded("ana@example.com");

        for _ in 0..4 {
            assert!(limits.login_attempt_at("ana@example.com", now).is_ok());
        }
    }

    #[test]
    fn failures_are_forgotten_after_an_idle_hour() {
        let limits = RateLimits::new(0, true);
        let now = Instant::now();
        for _ in 0..4 {
            limits.login_attempt_at("ana@example.com", now).unwrap();
        }
        let later = now + Duration::from_secs(60 * 60);

        for _ in 0..4 {
            assert!(limits.login_attempt_at("ana@example.com", later).is_ok());
        }
    }

    #[test]
    fn without_a_trusted_proxy_forwarded_for_is_ignored() {
        let spoofed = forwarded(&["198.51.100.1"]);

        assert_eq!(client_ip(&spoofed, Some(PEER), 0), Some(PEER));
        assert_eq!(client_ip(&spoofed, None, 0), None);
    }

    #[test]
    fn behind_trusted_proxies_the_entry_they_appended_is_the_client() {
        let chain = forwarded(&["6.6.6.6, 198.51.100.1", "192.0.2.9"]);

        assert_eq!(client_ip(&chain, Some(PEER), 1), Some(ip("192.0.2.9")));
        assert_eq!(client_ip(&chain, Some(PEER), 2), Some(ip("198.51.100.1")));
        assert_eq!(client_ip(&chain, Some(PEER), 4), Some(PEER));
        assert_eq!(client_ip(&HeaderMap::new(), Some(PEER), 1), Some(PEER));
        assert_eq!(
            client_ip(&forwarded(&["not-an-address"]), Some(PEER), 1),
            Some(PEER)
        );
    }

    #[test]
    fn ipv6_clients_share_a_bucket_per_64_prefix() {
        let limits = RateLimits::new(0, true);
        let now = Instant::now();
        for host in 0..10 {
            let address = ip(&format!("2001:db8:1:2::{host:x}"));
            limits
                .check_at(Action::Register, Some(address), None, now)
                .unwrap();
        }

        let same_64 = Some(ip("2001:db8:1:2:ffff::1"));
        assert!(
            limits
                .check_at(Action::Register, same_64, None, now)
                .is_err()
        );
        let mapped = Some(ip("::ffff:203.0.113.7"));
        let plain = Some(ip("203.0.113.7"));
        for _ in 0..10 {
            limits
                .check_at(Action::Register, mapped, None, now)
                .unwrap();
        }
        assert!(limits.check_at(Action::Register, plain, None, now).is_err());
    }

    #[test]
    fn idle_entries_are_pruned_once_the_table_grows() {
        let limits = RateLimits::new(0, true);
        let now = Instant::now();
        for user in 0..(MAX_ENTRIES as i64 + 1) {
            limits
                .check_at(Action::Import, None, Some(user), now)
                .unwrap();
        }
        let refilled = now + Duration::from_secs(60 * 60);
        limits
            .check_at(Action::Import, None, Some(-1), refilled)
            .unwrap();

        assert_eq!(limits.bucket_count(), 1);
    }
}
