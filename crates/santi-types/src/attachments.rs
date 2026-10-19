use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// A file on an issue (D53); `comment_id` when it was attached to one of the issue's comments.
#[cfg_attr(feature = "schemars", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct Attachment {
    pub id: i64,
    pub file_name: String,
    /// Decided by the server from the bytes and the extension.
    pub content_type: String,
    pub size_bytes: i64,
    pub uploader_id: i64,
    pub uploader_name: String,
    pub comment_id: Option<i64>,
    pub created_at: DateTime<Utc>,
}

/// `multipart/form-data` body of an upload.
#[derive(ToSchema)]
pub struct AttachmentUpload {
    /// Repeated, 1 to 10 files of at most 25 MB each: PNG, JPEG, GIF, WebP, PDF, DOCX, XLSX,
    /// PPTX, ODT, ODS, ODP, TXT, CSV, MD or ZIP.
    #[schema(value_type = Vec<String>, format = Binary)]
    pub file: Vec<Vec<u8>>,
    /// A comment of the same issue the files belong to.
    pub comment_id: Option<i64>,
}

/// The bytes of a downloaded file.
#[derive(ToSchema)]
#[schema(value_type = String, format = Binary)]
pub struct AttachmentFile(pub Vec<u8>);
