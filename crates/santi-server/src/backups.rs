//! SAN-205: scheduled logical backups, one restorable project export per project.

use std::collections::{BTreeSet, HashSet};
use std::io::Write;
use std::time::{Duration, Instant};

use axum::body::Bytes;
use chrono::{DateTime, Utc};
use flate2::Compression;
use flate2::write::GzEncoder;
use santi_types::auth::ProjectExport;
use serde_json::json;
use sqlx::PgPool;

use crate::error::AppError;
use crate::storage::Storage;
use crate::{auth, members, projects, restore};

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
    at.format(RUN_FORMAT).to_string()
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

const RUN_FORMAT: &str = "%Y-%m-%dT%H%M%SZ";

/// Only names santi gives runs; anything else under `backups/` is never counted or deleted.
fn is_run(name: &str) -> bool {
    chrono::NaiveDateTime::parse_from_str(name, RUN_FORMAT).is_ok()
}

/// `backups/{run}/{KEY}.json.gz` → `{run}`.
fn run_of(key: &str) -> &str {
    key.split('/').nth(1).unwrap_or_default()
}

fn internal(error: impl ToString) -> AppError {
    AppError::Internal(error.to_string())
}

/// The JSON the restore endpoint accepts, or why it would refuse it. Comments, parents and links
/// pointing at issues of the project the export lacks (written while it was read) are dropped
/// first.
pub fn restorable(mut export: ProjectExport, max_bytes: usize) -> Result<Vec<u8>, String> {
    let keys: HashSet<String> = export
        .issues
        .iter()
        .map(|issue| issue.key.clone())
        .collect();
    export
        .comments
        .retain(|comment| keys.contains(&comment.issue_key));
    for issue in &mut export.issues {
        if issue
            .parent_key
            .as_ref()
            .is_some_and(|parent| !keys.contains(parent))
        {
            issue.parent_key = None;
        }
    }
    let project = export.project.key.clone();
    let in_file = |key: &String| {
        keys.contains(key)
            || key
                .rsplit_once('-')
                .is_some_and(|(other, _)| other != project)
    };
    let links = std::mem::take(&mut export.links);
    export.links = links
        .into_iter()
        .filter(|link| keys.contains(&link.source) && in_file(&link.target))
        .collect();
    let over = export
        .links
        .len()
        .saturating_sub(restore::domain::MAX_LINKS);
    if over > 0 {
        tracing::warn!(project = %project, over, "backup of project {project} leaves out {over} links past the restore limit");
        export.links.truncate(restore::domain::MAX_LINKS);
    }
    restore::domain::check(&mut export.clone()).map_err(|error| format!("{error:?}"))?;
    let json = serde_json::to_vec(&export).map_err(|error| error.to_string())?;
    if json.len() > max_bytes {
        return Err(format!(
            "{} bytes, over the restore limit of {max_bytes}",
            json.len()
        ));
    }
    Ok(json)
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
    lock.close_on_drop();
    let locked = sqlx::query_scalar!(r#"SELECT pg_try_advisory_lock($1) AS "locked!""#, LOCK_KEY)
        .fetch_one(&mut *lock)
        .await?;
    if !locked {
        return Ok(None);
    }
    let result = run_locked(pool, storage, config, now).await;
    if let Err(error) = sqlx::query_scalar!("SELECT pg_advisory_unlock($1)", LOCK_KEY)
        .fetch_one(&mut *lock)
        .await
    {
        tracing::warn!(%error, "backup lock release failed; its connection is closed instead");
    }
    result
}

async fn run_locked(
    pool: &PgPool,
    storage: &Storage,
    config: &BackupConfig,
    now: DateTime<Utc>,
) -> Result<Option<Report>, AppError> {
    let runs: Vec<String> = storage
        .children(PREFIX)
        .await
        .map_err(internal)?
        .into_iter()
        .filter(|run| is_run(run))
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
    if written.is_empty() {
        return Ok(None);
    }
    // ponytail: lists every backup key once per written run (projects × KEEP keys, 1,000 per S3
    // request); list each expired run's prefix instead if instances reach thousands of projects.
    let keys = storage.list(PREFIX).await.map_err(internal)?;
    let complete: Vec<String> = keys
        .iter()
        .filter(|key| key.ends_with("/manifest.json"))
        .map(|key| run_of(key))
        .filter(|name| is_run(name))
        .map(String::from)
        .collect();
    let incomplete: BTreeSet<&str> = keys
        .iter()
        .map(|key| run_of(key))
        .filter(|name| {
            is_run(name) && *name < run.as_str() && !complete.iter().any(|done| done == name)
        })
        .collect();
    for name in &incomplete {
        tracing::error!(run = %name, "backup run {name} was incomplete; removed");
    }
    let expired = expired(&complete, config.keep);
    for key in keys.iter().filter(|key| {
        let name = run_of(key);
        incomplete.contains(name) || expired.iter().any(|run| run == name)
    }) {
        storage.delete(key).await.map_err(internal)?;
    }
    Ok(Some(Report {
        run,
        projects: written.len() - 1,
        duration: started.elapsed(),
    }))
}

/// Each project's file, then `manifest.json` last: a run without one did not finish.
async fn write_run(
    pool: &PgPool,
    storage: &Storage,
    run: &str,
    written: &mut Vec<String>,
) -> Result<(), AppError> {
    let mut conn = pool.acquire().await?;
    let backed_up = projects::repo::list_backup_members(&mut conn).await?;
    drop(conn);
    let (mut manifest, mut failed) = (Vec::new(), false);
    for (key, user_id) in backed_up {
        let mut conn = pool.acquire().await?;
        let member = match user_id {
            Some(user_id) => members::repo::find_member(&mut conn, &key, user_id).await?,
            None => None,
        };
        let Some(member) = member else {
            tracing::warn!(project = %key, "backup skipped project {key}: it has no member");
            continue;
        };
        let project =
            projects::repo::find_project(&mut conn, member.project_id, member.user_id).await?;
        drop(conn);
        let export = auth::service::export_project(pool, &member, project).await?;
        let (issues, comments) = (export.issues.len(), export.comments.len());
        let file = tokio::task::spawn_blocking(move || {
            restorable(export, restore::handler::MAX_BODY_BYTES)
                .and_then(|json| gzip(&json).map_err(|error| error.to_string()))
        })
        .await
        .map_err(internal)?;
        let gzipped = match file {
            Ok(gzipped) => gzipped,
            Err(error) => {
                tracing::error!(project = %key, %error, "backup of project {key} would not restore; skipped");
                failed = true;
                continue;
            }
        };
        let object = format!("{PREFIX}/{run}/{key}.json.gz");
        put(storage, &object, gzipped).await?;
        written.push(object);
        manifest.push(json!({ "key": key, "issues": issues, "comments": comments }));
    }
    if manifest.is_empty() {
        return match failed {
            true => Err(internal("no project could be backed up")),
            false => Ok(()),
        };
    }
    let manifest = json!({ "santi_version": env!("CARGO_PKG_VERSION"), "projects": manifest });
    let object = format!("{PREFIX}/{run}/manifest.json");
    put(storage, &object, manifest.to_string().into_bytes()).await?;
    written.push(object);
    Ok(())
}

async fn put(storage: &Storage, key: &str, bytes: Vec<u8>) -> Result<u64, AppError> {
    let body = futures_util::stream::once(async { Ok::<_, std::io::Error>(Bytes::from(bytes)) });
    storage.put(key, body).await.map_err(internal)
}

fn gzip(json: &[u8]) -> std::io::Result<Vec<u8>> {
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(json)?;
    encoder.finish()
}

#[cfg(test)]
mod tests {
    use super::*;
    use santi_types::auth::ExportedLink;
    use santi_types::links::Relation;

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

    #[test]
    fn only_timestamped_names_are_runs() {
        assert!(is_run("2026-11-18T030500Z"));
        for stray in ["README", "2026-11-01-keep", "2026-11-18T0305Z", ""] {
            assert!(!is_run(stray), "{stray}");
        }
    }

    fn sample() -> ProjectExport {
        serde_json::from_value(crate::restore::domain::tests::file()).unwrap()
    }

    #[test]
    fn a_restorable_export_drops_what_points_outside_it() {
        let mut export = sample();
        export.issues[1].parent_key = Some("SHOP-9".into());
        let mut gone = export.comments[0].clone();
        gone.issue_key = "SHOP-8".into();
        export.comments.push(gone);
        let link = |source: &str, target: &str| ExportedLink {
            source: source.into(),
            target: target.into(),
            relation: Relation::Blocks,
        };
        export.links = vec![
            link("SHOP-1", "SHOP-9"),
            link("SHOP-8", "SHOP-1"),
            link("SHOP-1", "OPS-3"),
        ];

        let json = restorable(export, usize::MAX).unwrap();

        let written: ProjectExport = serde_json::from_slice(&json).unwrap();
        assert_eq!(written.issues[1].parent_key, None);
        assert_eq!(written.comments.len(), 1);
        assert_eq!(written.comments[0].issue_key, "SHOP-2");
        assert_eq!(written.links.len(), 1);
        assert_eq!(written.links[0].target, "OPS-3");
    }

    #[test]
    fn links_past_the_restore_cap_are_trimmed_not_fatal() {
        let mut export = sample();
        let link = ExportedLink {
            source: "SHOP-1".into(),
            target: "SHOP-2".into(),
            relation: Relation::Relates,
        };
        export.links = vec![link; restore::domain::MAX_LINKS + 1];

        let json = restorable(export, usize::MAX).unwrap();

        let written: ProjectExport = serde_json::from_slice(&json).unwrap();
        assert_eq!(written.links.len(), 500_000);
    }

    #[test]
    fn an_export_the_restore_would_refuse_is_not_written() {
        let mut export = sample();
        export.issues[0].summary = String::new();
        assert!(restorable(export, usize::MAX).is_err());
        let size = serde_json::to_vec(&sample()).unwrap().len();
        assert!(restorable(sample(), size).is_ok());
        assert!(restorable(sample(), size - 1).unwrap_err().contains("over"));
    }
}
