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
    toml::from_str(&text).map_err(|error| file_error(path, error))
}

/// Writes the file readable by its owner only: it holds a token with the user's full rights (D23).
pub fn save(path: &Path, config: &Config) -> Result<(), Error> {
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;

    let text = toml::to_string(config).map_err(|error| file_error(path, error))?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|error| file_error(path, error))?;
    }
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .open(path)
        .map_err(|error| file_error(path, error))?;
    // `mode` only applies on creation; an older file may be wider.
    std::fs::set_permissions(path, std::os::unix::fs::PermissionsExt::from_mode(0o600))
        .and_then(|()| file.write_all(text.as_bytes()))
        .map_err(|error| file_error(path, error))
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

    #[test]
    fn save_then_load_round_trips_with_owner_only_permissions() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("santi").join("config.toml");
        let saved = config("http://example.test", "santi_secret");
        save(&path, &saved).unwrap();
        assert_eq!(load(&path).unwrap(), saved);
        let mode = std::fs::metadata(&path).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o600);
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
    fn broken_file_names_the_path() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.toml");
        std::fs::write(&path, "url = ").unwrap();
        let message = load(&path).unwrap_err().to_string();
        assert!(message.contains("config.toml"), "{message}");
    }
}
