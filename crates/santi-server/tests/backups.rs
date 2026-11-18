mod common;

use std::io::Read;
use std::path::PathBuf;

use axum::body::{Body, Bytes};
use axum::http::{Method, Request, StatusCode, header};
use chrono::{DateTime, Utc};
use common::{TestApp, body_json};
use http_body_util::BodyExt;
use santi_server::backups::{self, BackupConfig, LOCK_KEY};
use santi_server::storage::{Download, Storage, StorageConfig};
use serde_json::{Value, json};
use sqlx::PgPool;

fn dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("santi-backups-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir.canonicalize().unwrap()
}

fn disk(name: &str) -> Storage {
    Storage::new(&StorageConfig::Local(dir(name))).unwrap()
}

async fn put(storage: &Storage, key: &str) {
    let body = futures_util::stream::once(async { Ok::<_, std::io::Error>(Bytes::from("x")) });
    storage.put(key, body).await.unwrap();
}

async fn sorted_keys(storage: &Storage) -> Vec<String> {
    let mut keys = storage.list("backups").await.unwrap();
    keys.sort();
    keys
}

async fn runs_of(storage: &Storage) -> Vec<String> {
    let mut runs: Vec<String> = sorted_keys(storage)
        .await
        .iter()
        .map(|key| key.split('/').nth(1).unwrap().to_string())
        .collect();
    runs.dedup();
    runs
}

async fn decoded(storage: &Storage, key: &str) -> Value {
    let mut json = Vec::new();
    flate2::read::GzDecoder::new(&read_back(storage, key).await[..])
        .read_to_end(&mut json)
        .unwrap();
    serde_json::from_slice(&json).unwrap()
}

fn at(time: &str) -> DateTime<Utc> {
    time.parse().unwrap()
}

const CONFIG: BackupConfig = BackupConfig {
    hour_utc: 3,
    keep: 2,
};

async fn read_back(storage: &Storage, key: &str) -> Vec<u8> {
    let Download::Stream { body, .. } = storage.download(key, "attachment", "x").await.unwrap()
    else {
        panic!("expected a stream");
    };
    body.collect().await.unwrap().to_bytes().to_vec()
}

async fn two_projects(pool: PgPool) -> TestApp {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("ALPHA", "scrum").await;
    ana.create_project("BETA", "kanban").await;
    ana.create_issue("ALPHA", json!({ "summary": "Keep me" }))
        .await;
    ana
}

#[sqlx::test]
async fn a_run_writes_one_restorable_file_per_live_or_archived_project_then_a_manifest(
    pool: PgPool,
) {
    let ana = two_projects(pool.clone()).await;
    let (status, body) = ana
        .post(
            "/api/projects/ALPHA/issues/1/comments",
            json!({ "body": "Noted" }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    ana.create_project("GAMMA", "kanban").await;
    let (status, body) = ana.post("/api/projects/GAMMA/archive", json!(null)).await;
    assert_eq!(status, StatusCode::NO_CONTENT, "{body}");
    ana.create_project("DELTA", "kanban").await;
    let (status, body) = ana.post("/api/projects/DELTA/trash", json!(null)).await;
    assert_eq!(status, StatusCode::NO_CONTENT, "{body}");
    let root = dir("restorable");
    let storage = Storage::new(&StorageConfig::Local(root.clone())).unwrap();

    let skipped = backups::run_if_due(&pool, &storage, &CONFIG, at("2026-11-18T02:59:00Z"))
        .await
        .unwrap();
    let report = backups::run_if_due(&pool, &storage, &CONFIG, at("2026-11-18T03:05:00Z"))
        .await
        .unwrap()
        .unwrap();

    assert!(skipped.is_none());
    assert_eq!(
        (report.run.as_str(), report.projects),
        ("2026-11-18T030500Z", 3)
    );
    let keys = sorted_keys(&storage).await;
    assert_eq!(
        keys,
        [
            "backups/2026-11-18T030500Z/ALPHA.json.gz",
            "backups/2026-11-18T030500Z/BETA.json.gz",
            "backups/2026-11-18T030500Z/GAMMA.json.gz",
            "backups/2026-11-18T030500Z/manifest.json",
        ]
    );
    let manifest: Value = serde_json::from_slice(&read_back(&storage, &keys[3]).await).unwrap();
    assert_eq!(
        manifest,
        json!({
            "santi_version": env!("CARGO_PKG_VERSION"),
            "projects": [
                { "key": "ALPHA", "issues": 1, "comments": 1 },
                { "key": "BETA", "issues": 0, "comments": 0 },
                { "key": "GAMMA", "issues": 0, "comments": 0 },
            ]
        })
    );
    let modified = |key: &str| {
        std::fs::metadata(root.join(key))
            .unwrap()
            .modified()
            .unwrap()
    };
    assert!(
        keys[..3]
            .iter()
            .all(|key| modified(key) <= modified(&keys[3]))
    );
    let alpha = decoded(&storage, &keys[0]).await;
    let (status, account) = ana.get("/api/me/export").await;
    assert_eq!(status, StatusCode::OK);
    let exported = account["projects"]
        .as_array()
        .unwrap()
        .iter()
        .find(|project| project["project"]["key"] == "ALPHA")
        .unwrap();
    assert_eq!(&alpha, exported);
    let (status, body) = ana.post("/api/projects/ALPHA/trash", json!(null)).await;
    assert_eq!(status, StatusCode::NO_CONTENT, "{body}");
    let (status, body) = ana.delete("/api/projects/ALPHA").await;
    assert_eq!(status, StatusCode::NO_CONTENT, "{body}");
    let request = Request::builder()
        .method(Method::POST)
        .uri("/api/projects/restore")
        .header(
            header::AUTHORIZATION,
            format!("Bearer {}", ana.token.as_deref().unwrap()),
        )
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(alpha.to_string()))
        .unwrap();
    let response = ana.send(request).await;
    let status = response.status();
    let restored = body_json(response).await;
    assert_eq!(status, StatusCode::CREATED, "{restored}");
    assert_eq!(
        (&restored["project"]["key"], &restored["issues"]),
        (&json!("ALPHA"), &json!(1))
    );
}

#[sqlx::test]
async fn a_storage_failure_fails_the_run_without_a_manifest(pool: PgPool) {
    two_projects(pool.clone()).await;
    let storage = disk("failing");
    put(&storage, "backups/2026-11-18T030500Z").await; // a file where the run's directory goes

    let failed = backups::run_if_due(&pool, &storage, &CONFIG, at("2026-11-18T03:05:00Z")).await;

    assert!(failed.is_err());
    assert_eq!(sorted_keys(&storage).await, ["backups/2026-11-18T030500Z"]);
}

#[sqlx::test]
async fn retention_counts_complete_runs_and_removes_incomplete_ones(pool: PgPool) {
    two_projects(pool.clone()).await;
    let storage = disk("incomplete");
    for day in ["2026-11-16T03:05:00Z", "2026-11-17T03:05:00Z"] {
        backups::run_if_due(&pool, &storage, &CONFIG, at(day))
            .await
            .unwrap()
            .unwrap();
    }
    put(&storage, "backups/2026-11-17T120000Z/ALPHA.json.gz").await;

    backups::run_if_due(&pool, &storage, &CONFIG, at("2026-11-18T03:05:00Z"))
        .await
        .unwrap()
        .unwrap();

    assert_eq!(
        runs_of(&storage).await,
        ["2026-11-17T030500Z", "2026-11-18T030500Z"]
    );
}

#[sqlx::test]
async fn an_instance_without_projects_keeps_its_old_runs(pool: PgPool) {
    let ana = two_projects(pool.clone()).await;
    let storage = disk("empty");
    for day in ["2026-11-16T03:05:00Z", "2026-11-17T03:05:00Z"] {
        backups::run_if_due(&pool, &storage, &CONFIG, at(day))
            .await
            .unwrap()
            .unwrap();
    }
    for key in ["ALPHA", "BETA"] {
        let (status, body) = ana
            .post(&format!("/api/projects/{key}/trash"), json!(null))
            .await;
        assert_eq!(status, StatusCode::NO_CONTENT, "{body}");
    }

    let nothing = backups::run_if_due(&pool, &storage, &CONFIG, at("2026-11-18T03:05:00Z"))
        .await
        .unwrap();

    assert!(nothing.is_none());
    assert_eq!(
        runs_of(&storage).await,
        ["2026-11-16T030500Z", "2026-11-17T030500Z"]
    );
}

#[sqlx::test]
async fn files_under_backups_that_are_not_runs_are_left_alone(pool: PgPool) {
    two_projects(pool.clone()).await;
    let storage = disk("strays");
    put(&storage, "backups/README").await;
    put(&storage, "backups/2026-11-01-keep/x").await;

    for day in [
        "2026-11-18T03:05:00Z",
        "2026-11-19T03:05:00Z",
        "2026-11-20T03:05:00Z",
    ] {
        backups::run_if_due(&pool, &storage, &CONFIG, at(day))
            .await
            .unwrap()
            .unwrap();
    }

    let keys = sorted_keys(&storage).await;
    assert!(keys.contains(&"backups/README".to_string()), "{keys:?}");
    assert!(
        keys.contains(&"backups/2026-11-01-keep/x".to_string()),
        "{keys:?}"
    );
    assert_eq!(
        runs_of(&storage).await,
        [
            "2026-11-01-keep",
            "2026-11-19T030500Z",
            "2026-11-20T030500Z",
            "README"
        ]
    );
}

#[sqlx::test]
async fn a_second_check_the_same_day_writes_nothing(pool: PgPool) {
    two_projects(pool.clone()).await;
    let storage = disk("same-day");
    backups::run_if_due(&pool, &storage, &CONFIG, at("2026-11-18T03:05:00Z"))
        .await
        .unwrap()
        .unwrap();

    let again = backups::run_if_due(&pool, &storage, &CONFIG, at("2026-11-18T09:50:00Z"))
        .await
        .unwrap();

    assert!(again.is_none());
    assert_eq!(storage.list("backups").await.unwrap().len(), 3);
}

#[sqlx::test]
async fn retention_keeps_the_newest_runs(pool: PgPool) {
    two_projects(pool.clone()).await;
    let storage = disk("retention");

    for day in [
        "2026-11-18T03:05:00Z",
        "2026-11-19T04:00:00Z",
        "2026-11-20T03:00:00Z",
    ] {
        backups::run_if_due(&pool, &storage, &CONFIG, at(day))
            .await
            .unwrap()
            .unwrap();
    }

    let mut runs: Vec<String> = storage
        .list("backups")
        .await
        .unwrap()
        .iter()
        .map(|key| key.split('/').nth(1).unwrap().to_string())
        .collect();
    runs.sort();
    runs.dedup();
    assert_eq!(runs, ["2026-11-19T040000Z", "2026-11-20T030000Z"]);
}

#[sqlx::test]
async fn another_replica_holding_the_lock_skips(pool: PgPool) {
    two_projects(pool.clone()).await;
    let storage = disk("locked");
    let mut replica = pool.acquire().await.unwrap();
    sqlx::query("SELECT pg_advisory_lock($1)")
        .bind(LOCK_KEY)
        .execute(&mut *replica)
        .await
        .unwrap();

    let skipped = backups::run_if_due(&pool, &storage, &CONFIG, at("2026-11-18T03:05:00Z"))
        .await
        .unwrap();

    assert!(skipped.is_none());
    assert!(storage.list("backups").await.unwrap().is_empty());
}
