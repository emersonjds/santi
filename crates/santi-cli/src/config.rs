use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::Error;

pub const DEFAULT_URL: &str = "http://127.0.0.1:8080";

/// `~/.config/santi/config.toml`, written by `santi login`.
#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Config {
    pub url: Option<String>,
    pub token: Option<String>,
}

/// `$XDG_CONFIG_HOME/santi/config.toml`, else `$HOME/.config/santi/config.toml`.
pub fn path() -> Option<PathBuf> {
    let base = std::env::var_os("XDG_CONFIG_HOME")
        .filter(|dir| !dir.is_empty())
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|home| Path::new(&home).join(".config")))?;
    Some(base.join("santi").join("config.toml"))
}

/// A missing file is an empty config.
pub fn load(path: &Path) -> Result<Config, Error> {
    let text = match std::fs::read_to_string(path) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Config::default()),
        Err(error) => return Err(file_error(path, error)),
    };
    match toml::from_str(&text) {
        Ok(config) => Ok(config),
        // toml's own message quotes the line, and the line may be the token.
        Err(error) => {
            let before = &text[..error.span().unwrap_or_default().start];
            let line = before.matches('\n').count() + 1;
            let column = before.len() - before.rfind('\n').map_or(0, |at| at + 1) + 1;
            let at = format!("not valid TOML at line {line}, column {column}");
            Err(file_error(path, at))
        }
    }
}

/// Writes the file readable by its owner only: it holds a token with the user's full rights (D23).
pub fn save(path: &Path, config: &Config) -> Result<(), Error> {
    let text = toml::to_string(config).expect("the config serializes");
    write_private(path, text.as_bytes()).map_err(|error| file_error(path, error))
}

/// A temp file renamed over `path`, so a symlink planted there is never followed.
fn write_private(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    use std::fs::{DirBuilder, OpenOptions, Permissions};
    use std::io::Write;
    use std::os::unix::fs::{DirBuilderExt, OpenOptionsExt, PermissionsExt};

    let dir = path.parent().unwrap_or(Path::new("."));
    DirBuilder::new().recursive(true).mode(0o700).create(dir)?;
    if std::fs::metadata(dir)?.permissions().mode() & 0o077 != 0 {
        std::fs::set_permissions(dir, Permissions::from_mode(0o700))?;
    }
    if std::fs::symlink_metadata(path).is_ok_and(|meta| meta.file_type().is_symlink()) {
        return Err(std::io::Error::other(
            "is a symlink; refusing to write the token through it",
        ));
    }
    let temp = dir.join(format!(".config.toml.{}", std::process::id()));
    std::fs::remove_file(&temp).ok();
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(&temp)?;
    let written = file
        .write_all(bytes)
        .and_then(|()| file.sync_all())
        .and_then(|()| std::fs::rename(&temp, path));
    if written.is_err() {
        std::fs::remove_file(&temp).ok();
    }
    written
}

fn file_error(path: &Path, error: impl std::fmt::Display) -> Error {
    Error::Other(format!("{}: {error}", path.display()))
}

/// Flags (clap already folded `SANTI_URL` / `SANTI_TOKEN` into them) win over the file.
pub fn resolve(url: Option<String>, token: Option<String>, file: Config) -> Config {
    Config {
        url: url.or(file.url).or_else(|| Some(DEFAULT_URL.into())),
        token: token.or(file.token),
    }
}

#[cfg(test)]
mod tests {
    use std::os::unix::fs::PermissionsExt;

    use super::*;

    fn config(url: &str, token: &str) -> Config {
        Config {
            url: Some(url.into()),
            token: Some(token.into()),
        }
    }

    #[test]
    fn flags_win_over_the_file() {
        let file = config("http://file", "santi_file");
        let resolved = resolve(Some("http://flag".into()), Some("santi_flag".into()), file);
        assert_eq!(resolved, config("http://flag", "santi_flag"));
    }

    #[test]
    fn the_file_fills_what_flags_leave_out() {
        let file = config("http://file", "santi_file");
        assert_eq!(resolve(None, None, file.clone()), file);
        assert_eq!(
            resolve(Some("http://flag".into()), None, file),
            config("http://flag", "santi_file")
        );
    }

    #[test]
    fn url_defaults_to_the_local_server_and_token_stays_empty() {
        let resolved = resolve(None, None, Config::default());
        assert_eq!(resolved.url.as_deref(), Some(DEFAULT_URL));
        assert_eq!(resolved.token, None);
    }

    fn mode(path: &Path) -> u32 {
        std::fs::metadata(path).unwrap().permissions().mode() & 0o777
    }

    #[test]
    fn save_then_load_round_trips_with_owner_only_permissions() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("santi").join("config.toml");
        let saved = config("http://example.test", "santi_secret");
        save(&path, &saved).unwrap();
        assert_eq!(load(&path).unwrap(), saved);
        assert_eq!(mode(&path), 0o600);
        assert_eq!(mode(&dir.path().join("santi")), 0o700);
    }

    #[test]
    fn save_tightens_a_wider_file_and_directory() {
        let dir = tempfile::tempdir().unwrap();
        let santi = dir.path().join("santi");
        std::fs::create_dir(&santi).unwrap();
        std::fs::set_permissions(&santi, std::fs::Permissions::from_mode(0o777)).unwrap();
        let path = santi.join("config.toml");
        std::fs::write(&path, "url = \"http://old\"").unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644)).unwrap();
        let saved = config("http://new", "santi_secret");
        save(&path, &saved).unwrap();
        assert_eq!(load(&path).unwrap(), saved);
        assert_eq!(mode(&path), 0o600);
        assert_eq!(mode(&santi), 0o700);
    }

    #[test]
    fn save_refuses_a_symlinked_file() {
        let dir = tempfile::tempdir().unwrap();
        let victim = dir.path().join("victim");
        std::fs::write(&victim, "keep").unwrap();
        let path = dir.path().join("config.toml");
        std::os::unix::fs::symlink(&victim, &path).unwrap();
        let message = save(&path, &config("http://x", "santi_secret"))
            .unwrap_err()
            .to_string();
        assert!(message.contains("symlink"), "{message}");
        assert_eq!(std::fs::read_to_string(&victim).unwrap(), "keep");
    }

    #[test]
    fn missing_file_loads_as_empty() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(
            load(&dir.path().join("none.toml")).unwrap(),
            Config::default()
        );
    }

    #[test]
    fn unreadable_file_names_the_path() {
        let dir = tempfile::tempdir().unwrap();
        let message = load(dir.path()).unwrap_err().to_string();
        assert!(
            message.starts_with(&dir.path().display().to_string()),
            "{message}"
        );
    }

    #[test]
    fn broken_file_names_the_line_but_not_the_content() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.toml");
        std::fs::write(&path, "url = \"http://x\"\ntoken = santi_secret\n").unwrap();
        let message = load(&path).unwrap_err().to_string();
        assert_eq!(
            message,
            format!("{}: not valid TOML at line 2, column 9", path.display())
        );
    }
}
