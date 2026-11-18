mod common;

use std::io::Read;

use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use chrono::{DateTime, Utc};
use common::{TestApp, body_json};
use http_body_util::BodyExt;
use santi_server::backups::{self, BackupConfig, LOCK_KEY};
use santi_server::storage::{Download, Storage, StorageConfig};
use serde_json::json;
use sqlx::PgPool;

fn disk(name: &str) -> Storage {
    let dir = std::env::temp_dir().join(format!("santi-backups-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    Storage::new(&StorageConfig::Local(dir)).unwrap()
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
async fn a_run_writes_one_restorable_file_per_project(pool: PgPool) {
    let ana = two_projects(pool.clone()).await;
    let storage = disk("restorable");

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
        ("2026-11-18T030500Z", 2)
    );
    let mut keys = storage.list("backups").await.unwrap();
    keys.sort();
    assert_eq!(
        keys,
        [
            "backups/2026-11-18T030500Z/ALPHA.json.gz",
            "backups/2026-11-18T030500Z/BETA.json.gz"
        ]
    );
    let mut export = Vec::new();
    flate2::read::GzDecoder::new(&read_back(&storage, &keys[0]).await[..])
        .read_to_end(&mut export)
        .unwrap();
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
        .body(Body::from(export))
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
    assert_eq!(storage.list("backups").await.unwrap().len(), 2);
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
