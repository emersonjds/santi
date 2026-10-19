//! Attachment bytes (D53): an S3-compatible bucket or the local disk, picked at startup.

use std::net::IpAddr;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use axum::body::{Body, Bytes};
use axum::http::Method;
use futures_util::{Stream, StreamExt};
use object_store::aws::{AmazonS3, AmazonS3Builder};
use object_store::local::LocalFileSystem;
use object_store::memory::InMemory;
use object_store::path::Path;
use object_store::signer::{SignedUrlOptions, Signer};
use object_store::{ObjectStore, ObjectStoreExt, WriteMultipart};

pub use object_store::{Error, Result};

const PRESIGNED_FOR: Duration = Duration::from_secs(5 * 60);

#[derive(Clone, PartialEq, Eq)]
pub struct S3Config {
    pub bucket: String,
    pub endpoint: String,
    pub region: String,
    pub access_key_id: String,
    pub secret_access_key: String,
}

impl std::fmt::Debug for S3Config {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("S3Config")
            .field("bucket", &self.bucket)
            .field("endpoint", &self.endpoint)
            .field("region", &self.region)
            .field("access_key_id", &self.access_key_id)
            .field("secret_access_key", &"<redacted>")
            .finish()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StorageConfig {
    S3(S3Config),
    Local(PathBuf),
}

const S3_VARS: [&str; 5] = [
    "SANTI_S3_BUCKET",
    "SANTI_S3_ENDPOINT",
    "SANTI_S3_REGION",
    "SANTI_S3_ACCESS_KEY_ID",
    "SANTI_S3_SECRET_ACCESS_KEY",
];

impl StorageConfig {
    pub fn from_env() -> Result<Self, String> {
        Self::from_vars(|name| std::env::var(name).ok())
    }

    /// Printed at startup; `on_railway` when `RAILWAY_ENVIRONMENT` is set.
    pub fn startup_warnings(&self, on_railway: bool) -> Vec<&'static str> {
        match self {
            StorageConfig::Local(_) if on_railway => vec![
                "attachments are on the container disk and are lost on redeploy; set SANTI_S3_*",
            ],
            StorageConfig::S3(config) if public_http(&config.endpoint) => vec![
                "SANTI_S3_ENDPOINT uses plain http to a public host; attachments and keys travel unencrypted",
            ],
            _ => Vec::new(),
        }
    }

    /// Every `SANTI_S3_*` set selects the bucket, none the disk; an empty value counts as unset.
    pub fn from_vars(var: impl Fn(&str) -> Option<String>) -> Result<Self, String> {
        let var = |name: &str| var(name).filter(|value| !value.is_empty());
        let values = S3_VARS.map(var);
        let missing: Vec<&str> = S3_VARS
            .iter()
            .zip(&values)
            .filter(|(_, value)| value.is_none())
            .map(|(name, _)| *name)
            .collect();
        match values {
            [
                Some(bucket),
                Some(endpoint),
                Some(region),
                Some(access_key_id),
                Some(secret_access_key),
            ] => Ok(StorageConfig::S3(S3Config {
                bucket,
                endpoint,
                region,
                access_key_id,
                secret_access_key,
            })),
            _ if missing.len() == S3_VARS.len() => Ok(StorageConfig::Local(
                var("SANTI_ATTACHMENTS_DIR")
                    .unwrap_or_else(|| "./data/attachments".into())
                    .into(),
            )),
            _ => Err(format!(
                "S3 storage needs every SANTI_S3_* variable; missing: {}",
                missing.join(", ")
            )),
        }
    }
}

#[derive(Debug, Clone)]
pub struct Storage {
    store: Arc<dyn ObjectStore>,
    s3: Option<(AmazonS3, String)>,
}

pub enum Download {
    /// A presigned GET carrying the disposition and type.
    Redirect(String),
    /// The bytes and their count; the caller sets the disposition and type.
    Stream { body: Body, size: u64 },
}

impl Storage {
    pub fn memory() -> Self {
        Storage {
            store: Arc::new(InMemory::new()),
            s3: None,
        }
    }

    /// Creates the local directory; touches no network.
    pub fn new(config: &StorageConfig) -> Result<Self, String> {
        match config {
            StorageConfig::Local(dir) => std::fs::create_dir_all(dir)
                .and_then(|()| std::fs::canonicalize(dir))
                .map_err(|error| format!("attachments directory {}: {error}", dir.display()))
                .and_then(|dir| {
                    LocalFileSystem::new_with_prefix(dir).map_err(|error| error.to_string())
                })
                .map(|local| Storage {
                    store: Arc::new(local),
                    s3: None,
                }),
            StorageConfig::S3(config) => {
                let origin = origin(&config.endpoint).ok_or_else(|| {
                    format!(
                        "SANTI_S3_ENDPOINT must be an http(s) origin such as https://storage.example.com, got {:?}",
                        config.endpoint
                    )
                })?;
                let s3 = AmazonS3Builder::new()
                    .with_bucket_name(&config.bucket)
                    .with_endpoint(&origin)
                    .with_region(&config.region)
                    .with_access_key_id(&config.access_key_id)
                    .with_secret_access_key(&config.secret_access_key)
                    .with_allow_http(true)
                    .build()
                    .map_err(|error| error.to_string())?;
                Ok(Storage {
                    store: Arc::new(s3.clone()),
                    s3: Some((s3, origin)),
                })
            }
        }
    }

    /// The bucket's origin, for the SPA's CSP `img-src`; `None` when files are served by santi.
    pub fn image_origin(&self) -> Option<&str> {
        self.s3.as_ref().map(|(_, origin)| origin.as_str())
    }

    /// Streams `bytes` to `key` and returns the size; a stream error aborts the upload.
    pub async fn put<E>(
        &self,
        key: &str,
        bytes: impl Stream<Item = Result<Bytes, E>>,
    ) -> Result<u64>
    where
        E: std::error::Error + Send + Sync + 'static,
    {
        let mut upload = WriteMultipart::new(self.store.put_multipart(&Path::from(key)).await?);
        let mut size = 0;
        let mut bytes = std::pin::pin!(bytes);
        while let Some(chunk) = bytes.next().await {
            let chunk = match chunk {
                Ok(chunk) => chunk,
                Err(error) => {
                    upload.abort().await?;
                    return Err(Error::Generic {
                        store: "upload",
                        source: Box::new(error),
                    });
                }
            };
            size += chunk.len() as u64;
            upload.put(chunk);
            if let Err(error) = upload.wait_for_capacity(2).await {
                upload.abort().await?;
                return Err(error);
            }
        }
        upload.finish().await?;
        Ok(size)
    }

    /// A missing object is not an error.
    pub async fn delete(&self, key: &str) -> Result<()> {
        match self.store.delete(&Path::from(key)).await {
            Err(Error::NotFound { .. }) => Ok(()),
            result => result,
        }
    }

    pub async fn download(
        &self,
        key: &str,
        content_disposition: &str,
        content_type: &str,
    ) -> Result<Download> {
        let path = Path::from(key);
        match &self.s3 {
            Some((s3, _)) => {
                let options = SignedUrlOptions::new().with_query([
                    ("response-content-disposition", content_disposition),
                    ("response-content-type", content_type),
                ]);
                let url = s3
                    .signed_url_opts(Method::GET, &path, PRESIGNED_FOR, &options)
                    .await?;
                Ok(Download::Redirect(url.to_string()))
            }
            None => {
                let object = self.store.get(&path).await?;
                let size = object.meta.size;
                Ok(Download::Stream {
                    body: Body::from_stream(object.into_stream()),
                    size,
                })
            }
        }
    }
}

/// `<project_id>/<issue_id>/<uuid v4>`: never the file name.
pub fn object_key(project_id: i64, issue_id: i64) -> String {
    format!("{project_id}/{issue_id}/{}", uuid::Uuid::new_v4())
}

/// `scheme://host[:port]` without a path, so it is safe inside a CSP header.
fn origin(endpoint: &str) -> Option<String> {
    let (scheme, host) = endpoint.split_once("://")?;
    let host = host.strip_suffix('/').unwrap_or(host);
    let host_ok = !host.is_empty()
        && host
            .chars()
            .all(|char| char.is_ascii_alphanumeric() || ".-:[]".contains(char));
    (matches!(scheme, "http" | "https") && host_ok).then(|| format!("{scheme}://{host}"))
}

/// `http://` to anything but localhost or a loopback, private or unique-local address.
fn public_http(endpoint: &str) -> bool {
    let Some(authority) = endpoint.strip_prefix("http://") else {
        return false;
    };
    let authority = authority.split('/').next().unwrap_or_default();
    let host = match authority.strip_prefix('[') {
        Some(bracketed) => bracketed.split(']').next().unwrap_or_default(),
        None => authority.split(':').next().unwrap_or_default(),
    };
    let internal = host.eq_ignore_ascii_case("localhost")
        || match host.parse::<IpAddr>() {
            Ok(IpAddr::V4(ip)) => ip.is_loopback() || ip.is_private() || ip.is_link_local(),
            Ok(IpAddr::V6(ip)) => ip.is_loopback() || ip.is_unique_local(),
            Err(_) => false,
        };
    !internal
}
