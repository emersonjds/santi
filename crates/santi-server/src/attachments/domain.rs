//! D53: what an attachment may be, decided from its name and its bytes, never the client's header.

use crate::error::AppError;

pub const MAX_FILE_BYTES: u64 = 25 * 1024 * 1024;
pub const MAX_PER_ISSUE: i64 = 100;
pub const MAX_PER_REQUEST: usize = 10;
const MAX_NAME_CHARS: usize = 255;
/// The longest signature checked (WebP: `RIFF`, four size bytes, `WEBP`).
const HEAD_BYTES: usize = 12;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Magic {
    Png,
    Jpeg,
    Gif,
    Webp,
    Pdf,
    Zip,
    Utf8,
}

/// Office and OpenDocument files are ZIP containers.
const TYPES: [(&str, &str, Magic); 16] = [
    ("png", "image/png", Magic::Png),
    ("jpg", "image/jpeg", Magic::Jpeg),
    ("jpeg", "image/jpeg", Magic::Jpeg),
    ("gif", "image/gif", Magic::Gif),
    ("webp", "image/webp", Magic::Webp),
    ("pdf", "application/pdf", Magic::Pdf),
    (
        "docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        Magic::Zip,
    ),
    (
        "xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        Magic::Zip,
    ),
    (
        "pptx",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        Magic::Zip,
    ),
    ("odt", "application/vnd.oasis.opendocument.text", Magic::Zip),
    (
        "ods",
        "application/vnd.oasis.opendocument.spreadsheet",
        Magic::Zip,
    ),
    (
        "odp",
        "application/vnd.oasis.opendocument.presentation",
        Magic::Zip,
    ),
    ("zip", "application/zip", Magic::Zip),
    ("txt", "text/plain; charset=utf-8", Magic::Utf8),
    ("csv", "text/csv; charset=utf-8", Magic::Utf8),
    ("md", "text/markdown; charset=utf-8", Magic::Utf8),
];

pub fn not_allowed() -> AppError {
    AppError::invalid("file", "This file type is not allowed.")
}

pub fn too_large() -> AppError {
    AppError::invalid("file", "Larger than 25 MB.")
}

fn not_utf8() -> AppError {
    AppError::invalid("file", "Text files must be UTF-8.")
}

fn signature_matches(magic: Magic, head: &[u8]) -> bool {
    match magic {
        Magic::Png => head.starts_with(b"\x89PNG\r\n\x1a\n"),
        Magic::Jpeg => head.starts_with(b"\xff\xd8\xff"),
        Magic::Gif => head.starts_with(b"GIF87a") || head.starts_with(b"GIF89a"),
        Magic::Webp => head.starts_with(b"RIFF") && head.get(8..12) == Some(b"WEBP"),
        Magic::Pdf => head.starts_with(b"%PDF-"),
        Magic::Zip => head.starts_with(b"PK\x03\x04") || head.starts_with(b"PK\x05\x06"),
        Magic::Utf8 => true,
    }
}

/// Checks a file chunk by chunk as it streams to storage.
#[derive(Debug)]
pub struct Inspector {
    pub content_type: &'static str,
    magic: Magic,
    head: Vec<u8>,
    size: u64,
    /// The start of a UTF-8 character cut by the chunk boundary.
    carry: Vec<u8>,
}

impl Inspector {
    /// Refuses a name whose extension is not on the allowlist (SVG and HTML never are).
    pub fn for_name(file_name: &str) -> Result<Self, AppError> {
        let extension = file_name
            .rsplit_once('.')
            .map(|(_, extension)| extension.to_ascii_lowercase())
            .ok_or_else(not_allowed)?;
        let (_, content_type, magic) = TYPES
            .into_iter()
            .find(|(known, _, _)| *known == extension)
            .ok_or_else(not_allowed)?;
        Ok(Inspector {
            content_type,
            magic,
            head: Vec::with_capacity(HEAD_BYTES),
            size: 0,
            carry: Vec::new(),
        })
    }

    pub fn feed(&mut self, chunk: &[u8]) -> Result<(), AppError> {
        self.size += chunk.len() as u64;
        if self.size > MAX_FILE_BYTES {
            return Err(too_large());
        }
        if self.head.len() < HEAD_BYTES {
            let wanted = (HEAD_BYTES - self.head.len()).min(chunk.len());
            self.head.extend_from_slice(&chunk[..wanted]);
            if self.head.len() == HEAD_BYTES && !signature_matches(self.magic, &self.head) {
                return Err(not_allowed());
            }
        }
        if self.magic == Magic::Utf8 {
            let mut bytes = std::mem::take(&mut self.carry);
            bytes.extend_from_slice(chunk);
            if let Err(error) = std::str::from_utf8(&bytes) {
                if error.error_len().is_some() {
                    return Err(not_utf8());
                }
                self.carry = bytes[error.valid_up_to()..].to_vec();
            }
        }
        Ok(())
    }

    /// The file's size once every byte passed.
    pub fn finish(&self) -> Result<u64, AppError> {
        if self.size > MAX_FILE_BYTES {
            return Err(too_large());
        }
        if self.head.len() < HEAD_BYTES && !signature_matches(self.magic, &self.head) {
            return Err(not_allowed());
        }
        if !self.carry.is_empty() {
            return Err(not_utf8());
        }
        Ok(self.size)
    }
}

/// Unicode format characters (category Cf: zero-width, soft hyphen, bidi controls, tags), which
/// can disguise an extension.
fn is_invisible(char: char) -> bool {
    matches!(char,
        '\u{ad}'
        | '\u{600}'..='\u{605}'
        | '\u{61c}'
        | '\u{6dd}'
        | '\u{70f}'
        | '\u{890}'..='\u{891}'
        | '\u{8e2}'
        | '\u{180e}'
        | '\u{200b}'..='\u{200f}'
        | '\u{202a}'..='\u{202e}'
        | '\u{2060}'..='\u{2064}'
        | '\u{2066}'..='\u{206f}'
        | '\u{feff}'
        | '\u{fff9}'..='\u{fffb}'
        | '\u{110bd}'
        | '\u{110cd}'
        | '\u{13430}'..='\u{1343f}'
        | '\u{1bca0}'..='\u{1bca3}'
        | '\u{1d173}'..='\u{1d17a}'
        | '\u{e0001}'
        | '\u{e0020}'..='\u{e007f}')
}

/// The base name without control or bidi-override characters, at most 255 characters with the
/// extension kept.
pub fn sanitize_file_name(raw: &str) -> String {
    let base = raw.rsplit(['/', '\\']).next().unwrap_or_default();
    let clean: String = base
        .chars()
        .filter(|char| !char.is_control() && !is_invisible(*char))
        .collect();
    let clean = clean.trim();
    if clean.chars().count() <= MAX_NAME_CHARS {
        return clean.to_string();
    }
    let extension = clean
        .rsplit_once('.')
        .map_or("", |(_, extension)| extension);
    let extension = if extension.len() <= 16 { extension } else { "" };
    let stem_chars =
        MAX_NAME_CHARS - extension.chars().count() - usize::from(!extension.is_empty());
    let stem: String = clean.chars().take(stem_chars).collect();
    match extension {
        "" => stem,
        extension => format!("{stem}.{extension}"),
    }
}

/// `existing` files on the issue, `in_request` counting the one being added.
pub fn check_count(existing: i64, in_request: usize) -> Result<(), AppError> {
    if in_request > MAX_PER_REQUEST {
        return Err(AppError::invalid("file", "At most 10 files per upload."));
    }
    if existing + in_request as i64 > MAX_PER_ISSUE {
        return Err(AppError::invalid(
            "file",
            "An issue holds at most 100 files.",
        ));
    }
    Ok(())
}

/// Images open in the browser, everything else downloads; `filename*` per RFC 5987 carries the
/// exact name, `filename` an ASCII fallback. `save` downloads an image too.
pub fn content_disposition(file_name: &str, content_type: &str, save: bool) -> String {
    let kind = match !save && content_type.starts_with("image/") {
        true => "inline",
        false => "attachment",
    };
    let fallback: String = file_name
        .chars()
        .map(|char| match char {
            ' ' | '!'..='~' if char != '"' && char != '\\' => char,
            _ => '_',
        })
        .collect();
    let encoded: String = file_name
        .bytes()
        .map(
            |byte| match byte.is_ascii_alphanumeric() || b"!#$&+-.^_`|~".contains(&byte) {
                true => char::from(byte).to_string(),
                false => format!("%{byte:02X}"),
            },
        )
        .collect();
    format!("{kind}; filename=\"{fallback}\"; filename*=UTF-8''{encoded}")
}

#[cfg(test)]
mod tests {
    use super::*;

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR";

    fn inspect(name: &str, chunks: &[&[u8]]) -> Result<u64, AppError> {
        let mut inspector = Inspector::for_name(name)?;
        for chunk in chunks {
            inspector.feed(chunk)?;
        }
        inspector.finish()
    }

    fn message(error: AppError) -> String {
        error.to_problem().errors[0].message.clone()
    }

    #[test]
    fn allowed_types_pass_when_bytes_match_the_extension() {
        assert_eq!(inspect("shot.PNG", &[PNG]).unwrap(), 16);
        assert!(inspect("photo.jpg", &[b"\xff\xd8\xff\xe0\0\x10JFIF\0"]).is_ok());
        assert!(inspect("photo.jpeg", &[b"\xff\xd8\xff\xdb"]).is_ok());
        assert!(inspect("anim.gif", &[b"GIF89a\x01\0\x01\0"]).is_ok());
        assert!(inspect("old.gif", &[b"GIF87a\x01\0\x01\0"]).is_ok());
        assert!(inspect("pic.webp", &[b"RIFF\x24\0\0\0WEBPVP8 "]).is_ok());
        assert!(inspect("spec.pdf", &[b"%PDF-1.7\n%\xe2\xe3"]).is_ok());
        for name in [
            "a.docx", "a.xlsx", "a.pptx", "a.odt", "a.ods", "a.odp", "a.zip",
        ] {
            assert!(
                inspect(name, &[b"PK\x03\x04\x14\0\0\0\x08\0"]).is_ok(),
                "{name}"
            );
        }
        assert!(inspect("notes.txt", &["olá, mundo".as_bytes()]).is_ok());
        assert!(inspect("data.csv", &[b"a,b\n1,2\n"]).is_ok());
        assert!(inspect("README.md", &[b"# Title\n"]).is_ok());
        assert!(inspect("empty.txt", &[]).is_ok());
    }

    #[test]
    fn content_type_comes_from_the_extension() {
        assert_eq!(
            Inspector::for_name("a.JPG").unwrap().content_type,
            "image/jpeg"
        );
        assert_eq!(
            Inspector::for_name("a.md").unwrap().content_type,
            "text/markdown; charset=utf-8"
        );
    }

    #[test]
    fn script_carriers_and_unknown_extensions_are_refused() {
        for name in ["logo.svg", "page.html", "page.htm", "run.exe", "noext", ""] {
            let error = Inspector::for_name(name).unwrap_err();
            assert_eq!(message(error), "This file type is not allowed.", "{name}");
        }
    }

    #[test]
    fn bytes_that_do_not_match_the_extension_are_refused() {
        let html = inspect("cat.png", &[b"<!doctype html><script>alert(1)</script>"]);
        let svg = inspect("cat.jpg", &[b"<svg xmlns='http://www.w3.org/2000/svg'>"]);
        let pdf_as_zip = inspect("sheet.xlsx", &[b"%PDF-1.7\n"]);
        let webp_wrong = inspect("pic.webp", &[b"RIFF\x24\0\0\0WAVEfmt "]);

        for refused in [html, svg, pdf_as_zip, webp_wrong] {
            assert_eq!(
                message(refused.unwrap_err()),
                "This file type is not allowed."
            );
        }
    }

    #[test]
    fn a_signature_split_across_chunks_still_matches() {
        assert!(inspect("shot.png", &[b"\x89P", b"NG\r\n", b"\x1a\n\0\0\0\rIHDR"]).is_ok());
        assert!(inspect("pic.webp", &[b"RIFF", b"\x24\0\0\0WEB", b"P"]).is_ok());
    }

    #[test]
    fn a_file_shorter_than_its_signature_is_refused() {
        assert!(inspect("shot.png", &[b"\x89PNG"]).is_err());
        assert!(inspect("shot.png", &[]).is_err());
        assert!(inspect("short.jpg", &[b"\xff\xd8\xff"]).is_ok());
    }

    #[test]
    fn text_must_be_utf8_even_when_a_character_spans_chunks() {
        let split = "ação".as_bytes();
        let refused = inspect("latin1.csv", &[b"caf\xe9\n"]);
        let cut_at_end = inspect("cut.txt", &[&split[..2]]);

        assert!(inspect("ok.txt", &[&split[..2], &split[2..]]).is_ok());
        assert_eq!(message(refused.unwrap_err()), "Text files must be UTF-8.");
        assert_eq!(
            message(cut_at_end.unwrap_err()),
            "Text files must be UTF-8."
        );
    }

    #[test]
    fn a_file_over_25_mb_is_refused_as_it_streams() {
        let mut inspector = Inspector::for_name("big.txt").unwrap();
        inspector
            .feed(&vec![b'a'; MAX_FILE_BYTES as usize])
            .unwrap();

        let refused = inspector.feed(b"a").unwrap_err();

        assert_eq!(message(refused), "Larger than 25 MB.");
        assert_eq!(inspector.finish().unwrap_err(), too_large());
    }

    #[test]
    fn file_names_lose_paths_controls_and_bidi_overrides() {
        assert_eq!(
            sanitize_file_name("C:\\Users\\ana\\report.pdf"),
            "report.pdf"
        );
        assert_eq!(sanitize_file_name("../../etc/passwd.txt"), "passwd.txt");
        assert_eq!(sanitize_file_name(" a\0b\r\n\tc.txt "), "abc.txt");
        assert_eq!(
            sanitize_file_name("invoice\u{202e}fdp.exe"),
            "invoicefdp.exe"
        );
        assert_eq!(sanitize_file_name("zero\u{200b}width.png"), "zerowidth.png");
        assert_eq!(sanitize_file_name("relatório.md"), "relatório.md");
        assert_eq!(
            sanitize_file_name("a\u{ad}b\u{61c}c\u{180e}d\u{2060}\u{2064}e\u{e0041}.png"),
            "abcde.png"
        );
    }

    #[test]
    fn long_file_names_are_cut_keeping_the_extension() {
        let long = format!("{}.pdf", "é".repeat(300));

        let name = sanitize_file_name(&long);

        assert_eq!(name.chars().count(), 255);
        assert!(name.ends_with("é.pdf"));
        assert_eq!(sanitize_file_name(&"x".repeat(300)).chars().count(), 255);
    }

    #[test]
    fn counts_cap_the_request_and_the_issue() {
        assert!(check_count(0, 10).is_ok());
        assert!(check_count(90, 10).is_ok());
        assert_eq!(
            message(check_count(0, 11).unwrap_err()),
            "At most 10 files per upload."
        );
        assert_eq!(
            message(check_count(100, 1).unwrap_err()),
            "An issue holds at most 100 files."
        );
        assert!(check_count(95, 6).is_err());
    }

    #[test]
    fn images_open_inline_and_the_rest_download_with_an_encoded_name() {
        assert_eq!(
            content_disposition("shot.png", "image/png", false),
            "inline; filename=\"shot.png\"; filename*=UTF-8''shot.png"
        );
        assert_eq!(
            content_disposition("Relatório \"final\" 100%.pdf", "application/pdf", false),
            "attachment; filename=\"Relat_rio _final_ 100%.pdf\"; filename*=UTF-8''Relat%C3%B3rio%20%22final%22%20100%25.pdf"
        );
    }
}
