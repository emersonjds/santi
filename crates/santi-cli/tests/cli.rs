mod common;

use std::os::unix::fs::PermissionsExt;

use assert_cmd::Command;
use common::server;
use predicates::prelude::*;
use predicates::str::contains;
use serde_json::Value;
use tempfile::TempDir;

/// `santi` with a throwaway config directory, so the user's real `~/.config/santi` is never read.
struct Santi {
    config: TempDir,
}

impl Santi {
    fn new() -> Santi {
        Santi {
            config: tempfile::tempdir().unwrap(),
        }
    }

    fn bare(&self) -> Command {
        let mut command = Command::new(env!("CARGO_BIN_EXE_santi"));
        command
            .env("XDG_CONFIG_HOME", self.config.path())
            .env_remove("SANTI_URL")
            .env_remove("SANTI_TOKEN");
        command
    }

    fn with(&self, token: &str) -> Command {
        let mut command = self.bare();
        command
            .env("SANTI_URL", &server().url)
            .env("SANTI_TOKEN", token);
        command
    }
}

fn json(command: &mut Command) -> Value {
    let output = command
        .arg("--json")
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    serde_json::from_slice(&output).unwrap()
}

#[test]
fn login_saves_url_and_token_then_commands_use_them() {
    let santi = Santi::new();
    let token = server().user();
    santi
        .bare()
        .args(["login", "--url", &server().url, "--token", &token])
        .assert()
        .success()
        .stdout(contains("Logged in to"));
    let file = santi.config.path().join("santi/config.toml");
    let mode = std::fs::metadata(&file).unwrap().permissions().mode();
    assert_eq!(mode & 0o777, 0o600);
    santi
        .bare()
        .arg("whoami")
        .assert()
        .success()
        .stdout(contains("@example.com"));
}

#[test]
fn login_reads_the_token_from_stdin() {
    let santi = Santi::new();
    let token = server().user();
    santi
        .bare()
        .args(["login", "--url", &server().url])
        .write_stdin(format!("{token}\n"))
        .assert()
        .success();
    let me = json(santi.bare().arg("whoami"));
    assert!(me["email"].as_str().unwrap().ends_with("@example.com"));
}

#[test]
fn login_with_a_bad_token_saves_nothing() {
    let santi = Santi::new();
    santi
        .bare()
        .args(["login", "--url", &server().url, "--token", "santi_nope"])
        .assert()
        .code(3)
        .stderr(contains("santi login"));
    assert!(!santi.config.path().join("santi/config.toml").exists());
}

#[test]
fn environment_wins_over_the_config_file() {
    let santi = Santi::new();
    let token = server().user();
    santi
        .bare()
        .args(["login", "--url", &server().url, "--token", &token])
        .assert()
        .success();
    santi
        .bare()
        .arg("whoami")
        .env("SANTI_TOKEN", "santi_wrong")
        .assert()
        .code(3);
}

#[test]
fn a_broken_config_file_is_skipped_when_flags_give_url_and_token() {
    let santi = Santi::new();
    let file = santi.config.path().join("santi/config.toml");
    std::fs::create_dir_all(file.parent().unwrap()).unwrap();
    std::fs::write(&file, "token = santi_secret").unwrap();
    santi
        .with(&server().user())
        .arg("whoami")
        .assert()
        .success();
    santi
        .bare()
        .arg("whoami")
        .assert()
        .code(1)
        .stderr(contains("config.toml: not valid TOML at line 1"))
        .stderr(contains("santi_secret").not());
}

#[test]
fn unreachable_server_exits_6() {
    Santi::new()
        .bare()
        .args([
            "whoami",
            "--url",
            "http://127.0.0.1:9",
            "--token",
            "santi_x",
        ])
        .assert()
        .code(6)
        .stderr(contains("127.0.0.1:9"));
}

#[test]
fn issue_lifecycle_from_create_to_delete() {
    let santi = Santi::new();
    let token = server().user();
    server().project(&token, "CLI", "kanban");

    santi
        .with(&token)
        .args(["projects", "list"])
        .assert()
        .success()
        .stdout(contains("CLI"));
    santi
        .with(&token)
        .args([
            "issues",
            "create",
            "CLI",
            "--summary",
            "Fix login",
            "--type",
            "bug",
        ])
        .assert()
        .success()
        .stdout(contains("CLI-1"));
    let edited = json(santi.with(&token).args([
        "issues",
        "edit",
        "CLI-1",
        "--points",
        "5",
        "--label",
        "auth",
        "--priority",
        "high",
    ]));
    assert_eq!(edited["points"], 5.0);
    assert_eq!(edited["labels"], serde_json::json!(["auth"]));

    santi
        .with(&token)
        .args(["issues", "move", "CLI-1", "--status", "in progress"])
        .assert()
        .success();
    let board = json(santi.with(&token).args(["board", "CLI"]));
    let column = board["columns"]
        .as_array()
        .unwrap()
        .iter()
        .find(|column| column["name"] == "In Progress")
        .unwrap();
    assert_eq!(column["cards"][0]["key"], "CLI-1");
    santi
        .with(&token)
        .args(["board", "CLI"])
        .assert()
        .success()
        .stdout(contains("In Progress (1)"))
        .stdout(contains("CLI-1"));

    let found =
        json(
            santi
                .with(&token)
                .args(["search", "CLI", "login", "--status", "in_progress"]),
        );
    assert_eq!(found["items"][0]["key"], "CLI-1");
    santi
        .with(&token)
        .args(["issues", "list", "CLI", "--type", "bug"])
        .assert()
        .success()
        .stdout(contains("Fix login"));

    santi
        .with(&token)
        .args(["comment", "CLI-1", "Repro on Safari"])
        .assert()
        .success()
        .stdout(contains("Commented on CLI-1"));
    santi
        .with(&token)
        .args(["issues", "show", "CLI-1"])
        .assert()
        .success()
        .stdout(contains("Fix login"))
        .stdout(contains("Bug"));

    santi
        .with(&token)
        .args(["issues", "delete", "CLI-1"])
        .write_stdin("n\n")
        .assert()
        .success()
        .stdout(contains("Kept CLI-1"));
    santi
        .with(&token)
        .args(["issues", "delete", "CLI-1", "--yes"])
        .assert()
        .success();
    santi
        .with(&token)
        .args(["issues", "show", "CLI-1"])
        .assert()
        .code(4);
}

#[test]
fn validation_problems_name_the_field() {
    let santi = Santi::new();
    let token = server().user();
    server().project(&token, "VAL", "kanban");
    santi
        .with(&token)
        .args(["issues", "create", "VAL", "--summary", ""])
        .assert()
        .code(5)
        .stderr(contains("summary"));
    santi
        .with(&token)
        .args(["issues", "move", "VAL-1", "--status", "Nowhere"])
        .assert()
        .failure();
}

#[test]
fn sprint_planning_from_create_to_complete() {
    let santi = Santi::new();
    let token = server().user();
    server().project(&token, "SPR", "scrum");
    santi
        .with(&token)
        .args(["issues", "create", "SPR", "--summary", "Plan me"])
        .assert()
        .success();

    let sprint = json(
        santi
            .with(&token)
            .args(["sprints", "create", "SPR", "--goal", "Ship"]),
    );
    let id = sprint["id"].as_i64().unwrap().to_string();
    santi
        .with(&token)
        .args(["plan", "SPR-1", "--sprint", &id])
        .assert()
        .success();
    santi
        .with(&token)
        .args(["backlog", "SPR"])
        .assert()
        .success()
        .stdout(contains("Sprint 1"))
        .stdout(contains("SPR-1"));
    santi
        .with(&token)
        .args(["sprints", "start", "SPR", &id])
        .assert()
        .success()
        .stdout(contains("active"));
    santi
        .with(&token)
        .args(["sprints", "list", "SPR"])
        .assert()
        .success()
        .stdout(contains("Sprint 1"));
    let closed = json(
        santi
            .with(&token)
            .args(["sprints", "complete", "SPR", &id, "--to", "backlog"]),
    );
    assert_eq!(closed["state"], "closed");
    let issue = json(santi.with(&token).args(["issues", "show", "SPR-1"]));
    assert_eq!(issue["sprint_id"], Value::Null);

    json(santi.with(&token).args(["sprints", "create", "SPR"]));
    santi
        .with(&token)
        .args(["plan", "SPR-1", "--backlog"])
        .assert()
        .success();
}

#[test]
fn import_previews_then_asks_before_writing() {
    let santi = Santi::new();
    let token = server().user();
    server().project(&token, "IMP", "scrum");
    let csv = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../santi-server/tests/fixtures/imports/linear.csv"
    );
    santi
        .with(&token)
        .args(["import", "IMP", csv])
        .write_stdin("n\n")
        .assert()
        .success()
        .stdout(contains("linear"))
        .stdout(contains("Nothing imported"));
    santi
        .with(&token)
        .args(["import", "IMP", csv])
        .write_stdin("y\n")
        .assert()
        .success()
        .stdout(contains("Created"));
    let issues = server().get(&token, "/api/projects/IMP/issues");
    assert!(!issues["items"].as_array().unwrap().is_empty());
}
