//! D44: in-memory token buckets per client address and per account, plus a per-email login
//! lockout. One process holds the counters; a restart forgets them.

use std::collections::HashMap;
use std::net::{IpAddr, Ipv6Addr, SocketAddr};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use axum::extract::{ConnectInfo, FromRequestParts};
use axum::http::HeaderMap;
use axum::http::request::Parts;
use sha2::{Digest, Sha256};

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
    /// The password check of `DELETE /api/me`, apart from the login lockout.
    Reauthenticate,
    AcceptLegal,
    /// Creating a project and the sample project share one bucket.
    CreateProject,
    /// Opening and using a reset link share one bucket.
    PasswordReset,
}

impl Action {
    /// Burst size and the time one request takes to refill.
    fn rule(self) -> (u32, Duration) {
        let (burst, seconds) = match self {
            Action::Login => (10, 6),
            Action::Register => (10, 360),
            Action::Token => (10, 360),
            Action::InviteAccept | Action::PasswordReset => (10, 60),
            Action::Import => (20, 30),
            Action::Reauthenticate => (5, 60),
            Action::AcceptLegal => (10, 60),
            Action::CreateProject => (20, 180),
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
/// Each table holds at most this many entries (about 100 bytes each); a timer drops idle ones
/// (`prune`). ponytail: a full table evicts an arbitrary entry, so a flood from many addresses
/// can reset someone's counters; a shared store (Redis) if that or a second replica matters.
const MAX_ENTRIES: usize = 100_000;

/// A login lockout entry: the SHA-256 of the normalized email, never the raw input, and the
/// client's network, so failures from elsewhere never lock the owner out.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct LoginKey([u8; 32], Option<IpAddr>);

pub struct RateLimits {
    trusted_proxies: usize,
    per_address: bool,
    buckets: Mutex<HashMap<(Action, Subject), Bucket>>,
    logins: Mutex<HashMap<LoginKey, Failures>>,
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
            make_room(&mut buckets, &(action, subject));
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
    /// Something that is not an email address is refused (401) before it takes an entry.
    pub fn login_attempt(
        &self,
        email: &str,
        address: Option<IpAddr>,
    ) -> Result<LoginKey, AppError> {
        self.login_attempt_at(email, address, Instant::now())
    }

    fn login_attempt_at(
        &self,
        email: &str,
        address: Option<IpAddr>,
        now: Instant,
    ) -> Result<LoginKey, AppError> {
        let email = crate::auth::domain::normalize_email(email)
            .map_err(|_| AppError::InvalidCredentials)?;
        let network = address.map(|address| match network(address) {
            IpAddr::V4(v4) => IpAddr::V4((u32::from(v4) & 0xffff_ff00).into()),
            v6 => v6,
        });
        let key = LoginKey(Sha256::digest(email.as_bytes()).into(), network);
        let mut logins = self
            .logins
            .lock()
            .unwrap_or_else(|poison| poison.into_inner());
        make_room(&mut logins, &key);
        let failures = logins.entry(key).or_insert(Failures {
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
        Ok(key)
    }

    pub fn login_succeeded(&self, key: &LoginKey) {
        let mut logins = self
            .logins
            .lock()
            .unwrap_or_else(|poison| poison.into_inner());
        logins.remove(key);
    }

    /// Drops idle buckets and forgotten failures; called by a timer, never on a request.
    pub fn prune(&self) {
        self.prune_at(Instant::now());
    }

    fn prune_at(&self, now: Instant) {
        self.buckets
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
            .retain(|(action, _), bucket| {
                let (burst, every) = action.rule();
                now.duration_since(bucket.at) < every * burst
            });
        self.logins
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
            .retain(|_, failures| !forgotten(failures, now));
    }

    #[cfg(test)]
    fn bucket_count(&self) -> usize {
        self.buckets.lock().unwrap().len()
    }

    #[cfg(test)]
    fn login_count(&self) -> usize {
        self.logins.lock().unwrap().len()
    }
}

/// Keeps a table at `MAX_ENTRIES` before `key` goes in.
fn make_room<K: Eq + std::hash::Hash + Copy, V>(table: &mut HashMap<K, V>, key: &K) {
    if table.len() < MAX_ENTRIES || table.contains_key(key) {
        return;
    }
    if let Some(evicted) = table.keys().next().copied() {
        table.remove(&evicted);
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
            assert!(
                limits
                    .login_attempt_at("ana@example.com", None, now)
                    .is_ok()
            );
        }
        assert_eq!(
            limits.login_attempt_at("ana@example.com", None, now),
            Err(AppError::TooManyRequests { retry_after: 30 })
        );
        assert!(
            limits
                .login_attempt_at("bob@example.com", None, now)
                .is_ok()
        );

        let mut waits = Vec::new();
        for _ in 0..8 {
            now += Duration::from_secs(15 * 60);
            limits
                .login_attempt_at("ana@example.com", None, now)
                .unwrap();
            let Err(AppError::TooManyRequests { retry_after }) =
                limits.login_attempt_at("ana@example.com", None, now)
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
        let mut key = None;
        for _ in 0..4 {
            key = Some(
                limits
                    .login_attempt_at("ana@example.com", None, now)
                    .unwrap(),
            );
        }
        limits.login_succeeded(&key.unwrap());

        for _ in 0..4 {
            assert!(
                limits
                    .login_attempt_at(" Ana@Example.com", None, now)
                    .is_ok()
            );
        }
    }

    #[test]
    fn failures_are_forgotten_after_an_idle_hour() {
        let limits = RateLimits::new(0, true);
        let now = Instant::now();
        for _ in 0..4 {
            limits
                .login_attempt_at("ana@example.com", None, now)
                .unwrap();
        }
        let later = now + Duration::from_secs(60 * 60);

        for _ in 0..4 {
            assert!(
                limits
                    .login_attempt_at("ana@example.com", None, later)
                    .is_ok()
            );
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
    fn a_lockout_holds_only_for_the_network_that_failed() {
        let limits = RateLimits::new(0, true);
        let now = Instant::now();
        let attacker = Some(ip("203.0.113.7"));
        for _ in 0..5 {
            limits
                .login_attempt_at("ana@example.com", attacker, now)
                .unwrap();
        }

        let same_24 = Some(ip("203.0.113.200"));
        assert!(
            limits
                .login_attempt_at("ana@example.com", same_24, now)
                .is_err()
        );
        let owner = Some(ip("198.51.100.1"));
        assert!(
            limits
                .login_attempt_at("ana@example.com", owner, now)
                .is_ok()
        );
        for _ in 0..5 {
            limits
                .login_attempt_at("bob@example.com", Some(ip("2001:db8::1")), now)
                .unwrap();
        }
        let same_64 = Some(ip("2001:db8::ffff"));
        assert!(
            limits
                .login_attempt_at("bob@example.com", same_64, now)
                .is_err()
        );
    }

    #[test]
    fn malformed_or_huge_emails_are_refused_without_an_entry() {
        let limits = RateLimits::new(0, true);
        let now = Instant::now();
        for attempt in 0..200 {
            let huge = format!("{}{attempt}@example.com", "a".repeat(64 * 1024));
            assert_eq!(
                limits.login_attempt_at(&huge, None, now),
                Err(AppError::InvalidCredentials)
            );
        }
        assert_eq!(
            limits.login_attempt_at("not an email", None, now),
            Err(AppError::InvalidCredentials)
        );

        assert_eq!(limits.login_count(), 0);
    }

    #[test]
    fn the_tables_stay_bounded_under_a_flood_of_new_keys() {
        let limits = RateLimits::new(0, true);
        let now = Instant::now();
        for user in 0..(MAX_ENTRIES + 50) {
            limits
                .login_attempt_at(&format!("user{user}@example.com"), None, now)
                .unwrap();
            limits
                .check_at(Action::Import, None, Some(user as i64), now)
                .unwrap();
        }

        assert_eq!(limits.login_count(), MAX_ENTRIES);
        assert_eq!(limits.bucket_count(), MAX_ENTRIES);
    }

    #[test]
    fn pruning_drops_idle_entries_and_keeps_live_ones() {
        let limits = RateLimits::new(0, true);
        let now = Instant::now();
        limits.check_at(Action::Import, None, Some(1), now).unwrap();
        limits
            .login_attempt_at("ana@example.com", None, now)
            .unwrap();
        for _ in 0..5 {
            limits
                .login_attempt_at("bob@example.com", None, now)
                .unwrap();
        }
        let later = now + Duration::from_secs(60 * 60);
        limits
            .check_at(Action::Import, None, Some(2), later)
            .unwrap();
        limits
            .login_attempt_at("carol@example.com", None, later)
            .unwrap();

        limits.prune_at(later);

        assert_eq!(limits.bucket_count(), 1);
        assert_eq!(limits.login_count(), 1);
    }
}
