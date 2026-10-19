use std::path::PathBuf;

use axum::body::Bytes;
use http_body_util::BodyExt;
use santi_server::storage::{Download, S3Config, Storage, StorageConfig, object_key};

fn local_dir(name: &str) -> PathBuf {
    std::env::temp_dir().join(format!("santi-storage-{name}-{}", std::process::id()))
}

fn chunks(
    parts: &[&'static [u8]],
) -> impl futures_util::Stream<Item = Result<Bytes, std::io::Error>> {
    futures_util::stream::iter(parts.iter().map(|part| Ok(Bytes::from_static(part))))
}

async fn read_back(storage: &Storage, key: &str) -> Vec<u8> {
    match storage
        .download(key, "attachment", "text/plain")
        .await
        .unwrap()
    {
        Download::Stream { body, size } => {
            let bytes = body.collect().await.unwrap().to_bytes().to_vec();
            assert_eq!(bytes.len() as u64, size);
            bytes
        }
        Download::Redirect(url) => panic!("expected a stream, got a redirect to {url}"),
    }
}

async fn contract(storage: Storage) {
    let key = object_key(7, 42);

    let size = storage
        .put(&key, chunks(&[b"hello ", b"world"]))
        .await
        .unwrap();

    assert_eq!(size, 11);
    assert_eq!(read_back(&storage, &key).await, b"hello world");
    storage.delete(&key).await.unwrap();
    assert!(
        storage
            .download(&key, "attachment", "text/plain")
            .await
            .is_err()
    );
    storage.delete(&key).await.unwrap();
    storage.delete(&object_key(7, 43)).await.unwrap();
}

#[tokio::test]
async fn in_memory_storage_keeps_and_deletes_objects() {
    contract(Storage::memory()).await;
}

#[tokio::test]
async fn local_disk_storage_keeps_and_deletes_objects() {
    let dir = local_dir("contract");
    let storage = Storage::new(&StorageConfig::Local(dir.clone())).unwrap();

    contract(storage).await;

    assert!(dir.is_dir());
    std::fs::remove_dir_all(dir).unwrap();
}

#[tokio::test]
async fn a_failing_upload_stream_leaves_no_object() {
    let storage = Storage::memory();
    let key = object_key(1, 1);
    let broken = futures_util::stream::iter([
        Ok(Bytes::from_static(b"part")),
        Err(std::io::Error::other("client went away")),
    ]);

    assert!(storage.put(&key, broken).await.is_err());
    assert!(
        storage
            .download(&key, "attachment", "text/plain")
            .await
            .is_err()
    );
}

#[test]
fn object_keys_are_project_issue_and_a_random_uuid() {
    let key = object_key(3, 15);
    let parts: Vec<&str> = key.split('/').collect();

    assert_eq!(parts.len(), 3);
    assert_eq!(&parts[..2], ["3", "15"]);
    assert_eq!(parts[2].len(), 36);
    assert_eq!(parts[2].as_bytes()[14], b'4');
    assert!(
        parts[2]
            .chars()
            .all(|char| char == '-' || char.is_ascii_hexdigit())
    );
    assert_ne!(object_key(3, 15), key);
}

fn s3() -> S3Config {
    S3Config {
        bucket: "santi-files".into(),
        endpoint: "https://storage.example.test".into(),
        region: "auto".into(),
        access_key_id: "key-id".into(),
        secret_access_key: "secret".into(),
    }
}

#[tokio::test]
async fn s3_downloads_are_five_minute_path_style_presigned_urls() {
    let storage = Storage::new(&StorageConfig::S3(s3())).unwrap();

    let download = storage
        .download(
            "3/15/abc",
            "attachment; filename=\"report.pdf\"",
            "application/pdf",
        )
        .await
        .unwrap();

    let Download::Redirect(url) = download else {
        panic!("expected a presigned redirect");
    };
    assert!(
        url.starts_with("https://storage.example.test/santi-files/3/15/abc?"),
        "{url}"
    );
    assert!(url.contains("X-Amz-Expires=300"), "{url}");
    assert!(url.contains("X-Amz-Signature="), "{url}");
    assert!(
        url.contains("response-content-disposition=attachment%3B%20filename%3D%22report.pdf%22"),
        "{url}"
    );
    assert!(
        url.contains("response-content-type=application%2Fpdf"),
        "{url}"
    );
}

fn vars(pairs: &[(&str, &str)]) -> impl Fn(&str) -> Option<String> {
    let pairs: Vec<(String, String)> = pairs
        .iter()
        .map(|(name, value)| (name.to_string(), value.to_string()))
        .collect();
    move |name| {
        pairs
            .iter()
            .find(|(key, _)| key == name)
            .map(|(_, value)| value.clone())
    }
}

const S3_VARS: [(&str, &str); 5] = [
    ("SANTI_S3_BUCKET", "santi-files"),
    ("SANTI_S3_ENDPOINT", "https://storage.example.test"),
    ("SANTI_S3_REGION", "auto"),
    ("SANTI_S3_ACCESS_KEY_ID", "key-id"),
    ("SANTI_S3_SECRET_ACCESS_KEY", "secret"),
];

#[test]
fn every_s3_variable_selects_the_bucket() {
    let config = StorageConfig::from_vars(vars(&S3_VARS)).unwrap();

    assert_eq!(config, StorageConfig::S3(s3()));
}

#[test]
fn no_s3_variable_selects_the_local_disk() {
    assert_eq!(
        StorageConfig::from_vars(vars(&[])).unwrap(),
        StorageConfig::Local("./data/attachments".into())
    );
    assert_eq!(
        StorageConfig::from_vars(vars(&[
            ("SANTI_ATTACHMENTS_DIR", "/srv/files"),
            ("SANTI_S3_BUCKET", "")
        ]))
        .unwrap(),
        StorageConfig::Local("/srv/files".into())
    );
}

#[test]
fn a_partial_s3_set_names_the_missing_variables() {
    let error = StorageConfig::from_vars(vars(&S3_VARS[..2])).unwrap_err();

    assert_eq!(
        error,
        "S3 storage needs every SANTI_S3_* variable; missing: SANTI_S3_REGION, SANTI_S3_ACCESS_KEY_ID, SANTI_S3_SECRET_ACCESS_KEY"
    );
}

#[test]
fn the_s3_endpoint_must_be_a_plain_http_origin() {
    for endpoint in [
        "storage.example.test",
        "ftp://storage.example.test",
        "https://",
        "https://storage.example.test; script-src *",
    ] {
        let mut config = s3();
        config.endpoint = endpoint.into();

        assert!(
            Storage::new(&StorageConfig::S3(config)).is_err(),
            "{endpoint}"
        );
    }
}

#[test]
fn only_s3_storage_exposes_an_image_origin() {
    let mut config = s3();
    config.endpoint = "http://localhost:9000/".into();

    let storage = Storage::new(&StorageConfig::S3(config)).unwrap();

    assert_eq!(storage.image_origin(), Some("http://localhost:9000"));
    assert_eq!(Storage::memory().image_origin(), None);
}

#[test]
fn debug_output_hides_the_secret_key() {
    let mut config = s3();
    config.secret_access_key = "hunter2-do-not-log".into();

    let printed = format!("{:?}", StorageConfig::S3(config));

    assert!(!printed.contains("hunter2"), "{printed}");
    assert!(printed.contains("santi-files"), "{printed}");
}

#[test]
fn startup_warns_about_a_disk_on_railway_and_plain_http_to_a_public_host() {
    let disk = StorageConfig::Local("/data/attachments".into());
    let with_endpoint = |endpoint: &str| {
        let mut config = s3();
        config.endpoint = endpoint.into();
        StorageConfig::S3(config)
    };

    assert_eq!(
        disk.startup_warnings(true),
        ["attachments are on the container disk and are lost on redeploy; set SANTI_S3_*"]
    );
    assert!(disk.startup_warnings(false).is_empty());
    assert!(
        with_endpoint("https://storage.example.test")
            .startup_warnings(true)
            .is_empty()
    );
    for internal in [
        "http://localhost:9000",
        "http://127.0.0.1:9000/",
        "http://10.0.0.5",
        "http://192.168.1.20:9000",
        "http://[::1]:9000",
        "http://[fd00::5]",
    ] {
        assert!(
            with_endpoint(internal).startup_warnings(false).is_empty(),
            "{internal}"
        );
    }
    assert_eq!(
        with_endpoint("http://storage.example.test").startup_warnings(false),
        [
            "SANTI_S3_ENDPOINT uses plain http to a public host; attachments and keys travel unencrypted"
        ]
    );
}
