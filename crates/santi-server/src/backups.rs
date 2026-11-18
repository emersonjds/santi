//! SAN-205: scheduled logical backups, one restorable project export per project.

use std::collections::BTreeSet;
use std::time::{Duration, Instant};

use axum::body::Bytes;
use chrono::{DateTime, Utc};
use flate2::Compression;
use flate2::write::GzEncoder;
use santi_types::auth::ProjectExport;
use sqlx::PgPool;

use crate::error::AppError;
use crate::storage::Storage;
use crate::{auth, members, projects};

/// Session advisory lock held by the replica running a backup.
pub const LOCK_KEY: i64 = 0x5341_4e2d_3230_3500;

const PREFIX: &str = "backups";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BackupConfig {
    pub hour_utc: u32,
    pub keep: usize,
}

impl BackupConfig {
    /// `None` when `SANTI_BACKUP_HOUR_UTC` is unset; an empty value counts as unset.
    pub fn from_vars(var: impl Fn(&str) -> Option<String>) -> Result<Option<Self>, String> {
        let var = |name: &str| var(name).filter(|value| !value.is_empty());
        let Some(hour) = var("SANTI_BACKUP_HOUR_UTC") else {
            return Ok(None);
        };
        let hour_utc = hour.parse().ok().filter(|hour| *hour < 24).ok_or_else(|| {
            format!("SANTI_BACKUP_HOUR_UTC must be an hour from 0 to 23, got {hour:?}")
        })?;
        let keep = match var("SANTI_BACKUP_KEEP") {
            None => 14,
            Some(keep) => keep.parse().ok().filter(|keep| *keep >= 1).ok_or_else(|| {
                format!("SANTI_BACKUP_KEEP must be a whole number of at least 1, got {keep:?}")
            })?,
        };
        Ok(Some(BackupConfig { hour_utc, keep }))
    }
}

#[derive(Debug)]
pub struct Report {
    pub run: String,
    pub projects: usize,
    pub duration: Duration,
}

pub fn run_name(at: DateTime<Utc>) -> String {
    at.format("%Y-%m-%dT%H%M%SZ").to_string()
}

/// The day's run is due once `hour_utc` has passed and no run is named at or after it.
pub fn due(now: DateTime<Utc>, hour_utc: u32, runs: &[String]) -> bool {
    now.date_naive()
        .and_hms_opt(hour_utc, 0, 0)
        .map(|scheduled| run_name(scheduled.and_utc()))
        .is_some_and(|scheduled| {
            run_name(now) >= scheduled && runs.iter().all(|run| *run < scheduled)
        })
}

/// Every run but the newest `keep`.
pub fn expired(runs: &[String], keep: usize) -> Vec<String> {
    let mut runs = runs.to_vec();
    runs.sort_unstable_by(|a, b| b.cmp(a));
    runs.into_iter().skip(keep).collect()
}

/// `backups/{run}/{KEY}.json.gz` → `{run}`.
fn run_of(key: &str) -> &str {
    key.split('/').nth(1).unwrap_or_default()
}

fn internal(error: impl ToString) -> AppError {
    AppError::Internal(error.to_string())
}

/// Writes the day's backup when due and the lock is free; `None` when nothing was written.
pub async fn run_if_due(
    pool: &PgPool,
    storage: &Storage,
    config: &BackupConfig,
    now: DateTime<Utc>,
) -> Result<Option<Report>, AppError> {
    if !due(now, config.hour_utc, &[]) {
        return Ok(None);
    }
    let mut lock = pool.acquire().await?;
    let locked = sqlx::query_scalar!(r#"SELECT pg_try_advisory_lock($1) AS "locked!""#, LOCK_KEY)
        .fetch_one(&mut *lock)
        .await?;
    if !locked {
        return Ok(None);
    }
    let result = run_locked(pool, storage, config, now).await;
    sqlx::query_scalar!("SELECT pg_advisory_unlock($1)", LOCK_KEY)
        .fetch_one(&mut *lock)
        .await?;
    result
}

async fn run_locked(
    pool: &PgPool,
    storage: &Storage,
    config: &BackupConfig,
    now: DateTime<Utc>,
) -> Result<Option<Report>, AppError> {
    let keys = storage.list(PREFIX).await.map_err(internal)?;
    let mut runs: Vec<String> = keys
        .iter()
        .map(|key| run_of(key).to_string())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    if !due(now, config.hour_utc, &runs) {
        return Ok(None);
    }
    let started = Instant::now();
    let run = run_name(now);
    let mut written = Vec::new();
    if let Err(error) = write_run(pool, storage, &run, &mut written).await {
        for key in &written {
            storage.delete(key).await.ok(); // the run's error is the one to report
        }
        return Err(error);
    }
    runs.push(run.clone());
    let expired = expired(&runs, config.keep);
    for key in keys
        .iter()
        .filter(|key| expired.iter().any(|run| run == run_of(key)))
    {
        storage.delete(key).await.map_err(internal)?;
    }
    Ok(Some(Report {
        run,
        projects: written.len(),
        duration: started.elapsed(),
    }))
}

async fn write_run(
    pool: &PgPool,
    storage: &Storage,
    run: &str,
    written: &mut Vec<String>,
) -> Result<(), AppError> {
    let mut conn = pool.acquire().await?;
    for (key, user_id) in projects::repo::list_backup_members(&mut conn).await? {
        let Some(member) = members::repo::find_member(&mut conn, &key, user_id).await? else {
            continue;
        };
        let project = projects::repo::find_project(&mut conn, member.project_id, user_id).await?;
        let export = auth::service::export_project(pool, &member, project).await?;
        let gzipped = tokio::task::spawn_blocking(move || gzip(&export))
            .await
            .map_err(internal)?
            .map_err(internal)?;
        let object = format!("{PREFIX}/{run}/{key}.json.gz");
        let body =
            futures_util::stream::once(async { Ok::<_, std::io::Error>(Bytes::from(gzipped)) });
        storage.put(&object, body).await.map_err(internal)?;
        written.push(object);
    }
    Ok(())
}

fn gzip(export: &ProjectExport) -> std::io::Result<Vec<u8>> {
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    serde_json::to_writer(&mut encoder, export)?;
    encoder.finish()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vars(pairs: &[(&'static str, &'static str)]) -> impl Fn(&str) -> Option<String> {
        let pairs = pairs.to_vec();
        move |name| {
            pairs
                .iter()
                .find(|(key, _)| *key == name)
                .map(|(_, value)| value.to_string())
        }
    }

    fn at(time: &str) -> DateTime<Utc> {
        time.parse().unwrap()
    }

    fn runs(names: &[&str]) -> Vec<String> {
        names.iter().map(|name| name.to_string()).collect()
    }

    #[test]
    fn backups_are_off_without_an_hour() {
        assert_eq!(BackupConfig::from_vars(vars(&[])), Ok(None));
        assert_eq!(
            BackupConfig::from_vars(vars(&[
                ("SANTI_BACKUP_HOUR_UTC", ""),
                ("SANTI_BACKUP_KEEP", "3")
            ])),
            Ok(None)
        );
    }

    #[test]
    fn an_hour_turns_backups_on_keeping_14_runs_by_default() {
        assert_eq!(
            BackupConfig::from_vars(vars(&[("SANTI_BACKUP_HOUR_UTC", "0")])),
            Ok(Some(BackupConfig {
                hour_utc: 0,
                keep: 14
            }))
        );
        assert_eq!(
            BackupConfig::from_vars(vars(&[
                ("SANTI_BACKUP_HOUR_UTC", "23"),
                ("SANTI_BACKUP_KEEP", "1")
            ])),
            Ok(Some(BackupConfig {
                hour_utc: 23,
                keep: 1
            }))
        );
    }

    #[test]
    fn invalid_values_name_the_variable() {
        for (pairs, variable) in [
            (
                vec![("SANTI_BACKUP_HOUR_UTC", "24")],
                "SANTI_BACKUP_HOUR_UTC",
            ),
            (
                vec![("SANTI_BACKUP_HOUR_UTC", "3am")],
                "SANTI_BACKUP_HOUR_UTC",
            ),
            (
                vec![("SANTI_BACKUP_HOUR_UTC", "3"), ("SANTI_BACKUP_KEEP", "0")],
                "SANTI_BACKUP_KEEP",
            ),
            (
                vec![("SANTI_BACKUP_HOUR_UTC", "3"), ("SANTI_BACKUP_KEEP", "-1")],
                "SANTI_BACKUP_KEEP",
            ),
        ] {
            let error = BackupConfig::from_vars(vars(&pairs)).unwrap_err();
            assert!(error.starts_with(variable), "{error}");
        }
    }

    #[test]
    fn runs_are_named_by_their_start_to_the_second() {
        assert_eq!(run_name(at("2026-11-08T03:04:05.9Z")), "2026-11-08T030405Z");
    }

    #[test]
    fn a_run_is_due_after_the_hour_until_one_is_written_that_day() {
        let yesterday = runs(&["2026-11-17T030000Z"]);
        assert!(!due(at("2026-11-18T02:59:59Z"), 3, &yesterday));
        assert!(due(at("2026-11-18T03:00:00Z"), 3, &yesterday));
        assert!(due(at("2026-11-18T22:10:00Z"), 3, &yesterday));
        assert!(due(at("2026-11-18T03:00:00Z"), 3, &[]));
        let today = runs(&["2026-11-17T030000Z", "2026-11-18T031500Z"]);
        assert!(!due(at("2026-11-18T23:59:00Z"), 3, &today));
        assert!(due(at("2026-11-19T03:01:00Z"), 3, &today));
    }

    #[test]
    fn retention_expires_all_but_the_newest_runs() {
        let all = runs(&[
            "2026-11-17T030000Z",
            "2026-11-19T030000Z",
            "2026-11-18T030000Z",
        ]);
        assert_eq!(expired(&all, 2), runs(&["2026-11-17T030000Z"]));
        assert_eq!(
            expired(&all, 1),
            runs(&["2026-11-18T030000Z", "2026-11-17T030000Z"])
        );
        assert!(expired(&all, 3).is_empty());
    }
}
