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
        .stdout(contains("Logged in to"))
        .stderr(contains("plain HTTP").not());
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
fn login_warns_before_sending_a_token_over_plain_http_to_another_host() {
    Santi::new()
        .bare()
        .args([
            "login",
            "--url",
            "http://santi.invalid",
            "--token",
            "santi_x",
        ])
        .assert()
        .code(6)
        .stderr(contains("warning: http://santi.invalid/ is plain HTTP"));
}

#[test]
fn token_flag_help_points_at_safer_inputs() {
    Santi::new()
        .bare()
        .arg("--help")
        .assert()
        .success()
        .stdout(contains("visible in `ps`"));
}

#[test]
fn network_errors_hide_url_credentials() {
    Santi::new()
        .bare()
        .args([
            "whoami",
            "--url",
            "http://alice:hunter2@127.0.0.1:9",
            "--token",
            "santi_x",
        ])
        .assert()
        .code(6)
        .stderr(contains("http://127.0.0.1:9/"))
        .stderr(contains("hunter2").not())
        .stderr(contains("alice").not());
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
    let unlabeled = json(
        santi
            .with(&token)
            .args(["issues", "edit", "CLI-1", "--label", "none"]),
    );
    assert_eq!(unlabeled["labels"], serde_json::json!([]));

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
        .args(["issues", "comment", "CLI-1", "Also on Firefox"])
        .assert()
        .success();
    santi
        .with(&token)
        .args(["issues", "comments", "CLI-1"])
        .assert()
        .success()
        .stdout(contains(" · just now\nRepro on Safari\n\n"))
        .stdout(contains("Also on Firefox"));
    let comments = json(santi.with(&token).args(["issues", "comments", "CLI-1"]));
    assert_eq!(comments[1]["body"], "Also on Firefox");
    santi
        .with(&token)
        .args(["issues", "show", "CLI-1"])
        .assert()
        .success()
        .stdout(contains("Fix login"))
        .stdout(contains("Type:     Bug"))
        .stdout(contains("Status:   In Progress"))
        .stdout(contains("Assignee: Unassigned"))
        .stdout(contains("Sprint:   Backlog"));

    santi
        .with(&token)
        .args(["issues", "delete", "CLI-1"])
        .write_stdin("n\n")
        .assert()
        .code(10)
        .stdout("")
        .stderr(contains("Kept CLI-1"));
    santi
        .with(&token)
        .args(["issues", "delete", "CLI-1", "--json"])
        .write_stdin("n\n")
        .assert()
        .code(10)
        .stdout("");
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
fn project_keys_are_letters_and_digits() {
    let santi = Santi::new();
    santi
        .with("santi_x")
        .args(["board", "../tokens"])
        .assert()
        .code(2)
        .stderr(contains("project key"));
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
    let unplanned = json(
        santi
            .with(&token)
            .args(["issues", "edit", "SPR-1", "--sprint", "none"]),
    );
    assert_eq!(unplanned["sprint_id"], Value::Null);
    let replanned = json(
        santi
            .with(&token)
            .args(["issues", "plan", "SPR-1", "--sprint", &id]),
    );
    assert_eq!(replanned["sprint_name"], "Sprint 1");
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

    let next = json(santi.with(&token).args(["sprints", "create", "SPR"]));
    let next = next["id"].as_i64().unwrap().to_string();
    let planned = json(
        santi
            .with(&token)
            .args(["plan", "SPR-1", "--sprint", &next]),
    );
    assert_eq!(planned["sprint_id"].to_string(), next);
    let unplanned = json(santi.with(&token).args(["plan", "SPR-1", "--backlog"]));
    assert_eq!(unplanned["sprint_id"], Value::Null);
    let issue = json(santi.with(&token).args(["issues", "show", "SPR-1"]));
    assert_eq!(issue["sprint_id"], Value::Null);
}

#[test]
fn sprints_start_for_four_hours() {
    let santi = Santi::new();
    let token = server().user();
    server().project(&token, "FOR", "scrum");
    let sprint = json(santi.with(&token).args(["sprints", "create", "FOR"]));
    let id = sprint["id"].as_i64().unwrap().to_string();
    santi
        .with(&token)
        .args([
            "issues",
            "create",
            "FOR",
            "--summary",
            "Ship",
            "--sprint",
            &id,
        ])
        .assert()
        .success();
    let started = json(
        santi
            .with(&token)
            .args(["sprints", "start", "FOR", &id, "--for", "4h"]),
    );
    let at = |field: &str| {
        started[field]
            .as_str()
            .unwrap()
            .parse::<chrono::DateTime<chrono::Utc>>()
            .unwrap()
    };
    assert_eq!(at("ends_at") - at("starts_at"), chrono::TimeDelta::hours(4));
    let backlog = json(santi.with(&token).args(["backlog", "FOR"]));
    assert_eq!(backlog["sprint_length"], "4h");
}

#[test]
fn sprints_start_end_day_only_ends_at_2359_local() {
    let santi = Santi::new();
    let token = server().user();
    server().project(&token, "DAY", "scrum");
    let sprint = json(santi.with(&token).args(["sprints", "create", "DAY"]));
    let id = sprint["id"].as_i64().unwrap().to_string();
    santi
        .with(&token)
        .args([
            "issues",
            "create",
            "DAY",
            "--summary",
            "Ship",
            "--sprint",
            &id,
        ])
        .assert()
        .success();
    santi
        .with(&token)
        .env("TZ", "America/Sao_Paulo")
        .args([
            "sprints",
            "start",
            "DAY",
            &id,
            "--start",
            "2026-10-16 09:00",
            "--end",
            "2026-10-16",
        ])
        .assert()
        .success()
        .stdout(contains("2026-10-16 09:00 → 2026-10-16 23:59 -03:00"));
    let sprints = json(santi.with(&token).args(["sprints", "list", "DAY"]));
    assert_eq!(sprints[0]["starts_at"], "2026-10-16T12:00:00Z");
    assert_eq!(sprints[0]["ends_at"], "2026-10-17T02:59:00Z");
    let backlog = json(santi.with(&token).args(["backlog", "DAY"]));
    assert_eq!(backlog["sprint_length"], "899");
}

#[test]
fn sprints_report_prints_text_and_json() {
    let santi = Santi::new();
    let token = server().user();
    server().project(&token, "REP", "scrum");
    let sprint = json(santi.with(&token).args(["sprints", "create", "REP"]));
    let id = sprint["id"].as_i64().unwrap().to_string();
    santi
        .with(&token)
        .args([
            "issues",
            "create",
            "REP",
            "--summary",
            "Report me",
            "--points",
            "3",
            "--sprint",
            &id,
        ])
        .assert()
        .success();
    santi
        .with(&token)
        .args(["sprints", "start", "REP", &id])
        .assert()
        .success();
    santi
        .with(&token)
        .args(["sprints", "complete", "REP", &id])
        .assert()
        .success();

    santi
        .with(&token)
        .args(["sprints", "report", "REP", &id])
        .assert()
        .success()
        .stdout(contains("Committed 3 · Completed —"))
        .stdout(contains("Not completed — 1 issue, 3 → 3 points"))
        .stdout(contains("REP-1 Report me (Story, To Do) 3 → 3"));
    let report = json(santi.with(&token).args(["sprints", "report", "REP", &id]));
    let api = server().get(&token, &format!("/api/projects/REP/sprints/{id}/report"));
    assert_eq!(report, api);
    santi
        .with(&token)
        .args(["sprints", "report", "REP", "999999"])
        .assert()
        .failure();
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
        .code(10)
        .stdout(contains("linear"))
        .stderr(contains("Nothing imported"));
    let declined = santi
        .with(&token)
        .args(["import", "IMP", csv, "--json"])
        .write_stdin("n\n")
        .assert()
        .code(10)
        .get_output()
        .stdout
        .clone();
    let preview: Value = serde_json::from_slice(&declined).unwrap();
    assert_eq!(preview["source"], "linear");
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

#[test]
fn project_lifecycle_from_archive_to_purge() {
    let santi = Santi::new();
    let token = server().user();
    server().project(&token, "LIFE", "scrum");
    let run = |args: &[&str]| santi.with(&token).args(args).assert();

    run(&["projects", "archive", "LIFE"])
        .success()
        .stdout(contains("Archived LIFE"));
    run(&["projects", "list"])
        .success()
        .stdout(contains("LIFE").not());
    run(&["projects", "list", "--state", "archived"])
        .success()
        .stdout(contains("LIFE").and(contains("archived")));
    run(&["projects", "unarchive", "LIFE"])
        .success()
        .stdout(contains("Unarchived LIFE"));
    santi
        .with(&token)
        .args(["projects", "trash", "LIFE"])
        .write_stdin("n\n")
        .assert()
        .code(10)
        .stderr(contains("Kept LIFE"));
    run(&["projects", "trash", "LIFE", "--yes"])
        .success()
        .stdout(contains("Moved LIFE to the trash"));
    let trashed = json(
        santi
            .with(&token)
            .args(["projects", "list", "--state", "trashed"]),
    );
    assert_eq!(trashed[0]["key"], "LIFE");
    assert_eq!(trashed[0]["state"], "trashed");
    run(&["projects", "list", "--state", "trashed"])
        .success()
        .stdout(contains("purged on"));
    run(&["board", "LIFE"]).code(4);
    run(&["projects", "restore", "LIFE"])
        .success()
        .stdout(contains("Restored LIFE"));
    run(&["projects", "trash", "LIFE", "--yes"]).success();
    santi
        .with(&token)
        .args(["projects", "purge", "LIFE"])
        .write_stdin("n\n")
        .assert()
        .code(10)
        .stderr(contains("Kept LIFE"));
    run(&["projects", "purge", "LIFE", "--yes"])
        .success()
        .stdout(contains("Purged LIFE"));
    run(&["projects", "list", "--state", "trashed"])
        .success()
        .stdout("(none)\n");
    run(&["projects", "list", "--state", "gone"]).failure();
}
