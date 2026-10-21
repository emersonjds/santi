mod common;

use std::os::unix::fs::PermissionsExt;

use assert_cmd::Command;
use common::server;
use predicates::prelude::*;
use predicates::str::contains;
use serde_json::{Value, json};
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
fn notifications_list_and_mark_read() {
    let santi = Santi::new();
    let admin = server().user();
    let bo = server().user();
    server().project(&admin, "NTF", "kanban");
    server().member(&admin, "NTF", &bo);
    let bo_id = server().get(&bo, "/api/me")["id"].as_i64().unwrap();
    server().post(
        &admin,
        "/api/projects/NTF/issues",
        json!({ "summary": "Ship it" }),
    );
    let body = format!("[@Bo](mention:{bo_id}) look");
    let comments = "/api/projects/NTF/issues/1/comments";
    server().post(&admin, comments, json!({ "body": body }));
    let second = json!({ "summary": "Second", "assignee_id": bo_id });
    server().post(&admin, "/api/projects/NTF/issues", second);

    let page = json(santi.with(&bo).args(["notifications"]));
    assert_eq!(page["items"][0]["kind"], "assigned");
    assert_eq!(page["items"][1]["kind"], "mention");
    santi
        .with(&bo)
        .args(["notifications"])
        .assert()
        .success()
        .stdout(
            contains(" assigned NTF-2 to you · just now")
                .and(contains(" mentioned you on NTF-1 · just now"))
                .and(contains("Ship it: @Bo look")),
        );
    let id = page["items"][0]["id"].as_i64().unwrap().to_string();
    santi
        .with(&bo)
        .args(["notifications", "read", &id])
        .assert()
        .success()
        .stdout(format!("Read notification {id}\n"));
    let unread = json(santi.with(&bo).args(["notifications", "--unread"]));
    assert_eq!(unread["items"].as_array().unwrap().len(), 1);
    santi
        .with(&bo)
        .args(["notifications", "read", "--all"])
        .assert()
        .success()
        .stdout("Read every notification\n");
    santi
        .with(&bo)
        .args(["notifications", "--unread"])
        .assert()
        .success()
        .stdout("(none)\n");
    santi
        .with(&admin)
        .args(["notifications", "read", &id])
        .assert()
        .code(4);
}

#[test]
fn invites_list_live_links_with_joiners_and_revoke_one() {
    let santi = Santi::new();
    let admin = server().user();
    let guest = server().user();
    server().project(&admin, "INV", "kanban");
    let created = server().post(
        &admin,
        "/api/projects/INV/invites",
        json!({ "role": "member", "max_uses": 2 }),
    );
    let link = created["token"].as_str().unwrap();
    server().post(&guest, &format!("/api/invites/{link}/accept"), json!(null));
    let email = server().get(&guest, "/api/me")["email"].clone();

    let invites = json(santi.with(&admin).args(["invites", "INV"]));
    let id = invites[0]["id"].as_i64().unwrap();
    assert_eq!(invites[0]["uses"], 1);
    assert_eq!(invites[0]["joined"][0]["email"], email);
    santi
        .with(&admin)
        .args(["invites", "INV"])
        .assert()
        .success()
        .stdout(
            contains(format!("{id:<6} member, 1 of 2 spots used, expires "))
                .and(contains(format!("<{}> joined ", email.as_str().unwrap()))),
        );
    let revoke = ["invites", "revoke", "INV", &id.to_string()].map(String::from);
    santi
        .with(&admin)
        .args(&revoke)
        .write_stdin("n\n")
        .assert()
        .code(10)
        .stdout("")
        .stderr(
            contains(format!("Revoke invite {id} in INV? [y/N] "))
                .and(contains(format!("Kept invite {id}"))),
        );
    santi
        .with(&admin)
        .args(&revoke)
        .arg("--yes")
        .assert()
        .success()
        .stdout(format!("Revoked invite {id} in INV\n"));
    santi
        .with(&admin)
        .args(["invites", "INV"])
        .assert()
        .success()
        .stdout("(none)\n");
    santi
        .with(&admin)
        .args(&revoke)
        .arg("--yes")
        .assert()
        .code(4);
}

#[test]
fn members_list_people_and_text_output_shows_mentions_by_name() {
    let santi = Santi::new();
    let token = server().user();
    server().project(&token, "MEN", "kanban");
    let me = json(santi.with(&token).arg("whoami"));
    let (id, name) = (
        me["id"].as_i64().unwrap(),
        me["display_name"].as_str().unwrap(),
    );

    let members = json(santi.with(&token).args(["members", "MEN"]));
    assert_eq!(members[0]["user_id"], id);
    assert_eq!(members[0]["role"], "admin");
    santi
        .with(&token)
        .args(["members", "MEN"])
        .assert()
        .success()
        .stdout(contains(format!("{id:<6} {name} <{name}> (admin)")));

    let description = format!("Ask [@{name}](mention:{id}) about **[docs](https://x.dev)**");
    santi
        .with(&token)
        .args([
            "issues",
            "create",
            "MEN",
            "--summary",
            "Mention",
            "--description",
            &description,
        ])
        .assert()
        .success();
    santi
        .with(&token)
        .args(["issues", "show", "MEN-1"])
        .assert()
        .success()
        .stdout(contains(format!(
            "\n\nAsk @{name} about **[docs](https://x.dev)**\n"
        )));
    let shown = json(santi.with(&token).args(["issues", "show", "MEN-1"]));
    assert_eq!(shown["description"], description);

    let body = format!("[@{name}](mention:{id}) please look");
    santi
        .with(&token)
        .args(["comment", "MEN-1", &body])
        .assert()
        .success();
    santi
        .with(&token)
        .args(["issues", "comments", "MEN-1"])
        .assert()
        .success()
        .stdout(contains(format!("\n@{name} please look\n")));
    let comments = json(santi.with(&token).args(["issues", "comments", "MEN-1"]));
    assert_eq!(comments[0]["body"], body);
}

#[test]
fn comments_are_edited_and_deleted_by_their_author_or_an_admin() {
    let santi = Santi::new();
    let (admin, bob) = (server().user(), server().user());
    server().project(&admin, "CMT", "kanban");
    server().member(&admin, "CMT", &bob);
    santi
        .with(&admin)
        .args(["issues", "create", "CMT", "--summary", "Thread"])
        .assert()
        .success();
    let mine = json(santi.with(&admin).args(["comment", "CMT-1", "First"]))["id"].clone();
    let bobs = json(santi.with(&bob).args(["comment", "CMT-1", "Bob's"]))["id"].clone();
    let (mine, bobs) = (mine.to_string(), bobs.to_string());

    santi
        .with(&admin)
        .args([
            "issues",
            "comment-edit",
            "CMT-1",
            &mine,
            "First, **edited**",
        ])
        .assert()
        .success()
        .stdout(contains(format!("Edited comment {mine} on CMT-1")));
    santi
        .with(&admin)
        .args(["issues", "comments", "CMT-1"])
        .assert()
        .success()
        .stdout(contains(format!("#{mine} ")))
        .stdout(contains(" · just now · edited\nFirst, **edited**\n"))
        .stdout(contains(format!("#{bobs} ")));
    let edited = json(santi.with(&admin).args(["issues", "comments", "CMT-1"]));
    assert_eq!(edited[0]["body"], "First, **edited**");
    assert!(edited[0]["edited_at"].is_string());

    santi
        .with(&bob)
        .args(["issues", "comment-edit", "CMT-1", &mine, "Hijacked"])
        .assert()
        .code(3)
        .stderr(contains("You are not allowed to do this."));
    santi
        .with(&bob)
        .args(["issues", "comment-delete", "CMT-1", &mine, "--yes"])
        .assert()
        .code(3);

    santi
        .with(&admin)
        .args(["issues", "comment-delete", "CMT-1", &bobs])
        .write_stdin("n\n")
        .assert()
        .code(10)
        .stdout("")
        .stderr(contains(format!("Delete comment {bobs} on CMT-1?")))
        .stderr(contains(format!("Kept comment {bobs}")));
    santi
        .with(&admin)
        .args(["issues", "comment-delete", "CMT-1", &bobs, "--yes"])
        .assert()
        .success()
        .stdout(contains(format!("Deleted comment {bobs} on CMT-1")));
    let left = json(santi.with(&admin).args(["issues", "comments", "CMT-1"]));
    assert_eq!(left.as_array().unwrap().len(), 1);
    santi
        .with(&admin)
        .args(["issues", "comment-delete", "CMT-1", &bobs, "--yes"])
        .assert()
        .code(4);
}

#[test]
fn issues_are_linked_shown_and_unlinked() {
    let santi = Santi::new();
    let token = server().user();
    server().project(&token, "LNK", "kanban");
    for summary in ["Source", "Target"] {
        santi
            .with(&token)
            .args(["issues", "create", "LNK", "--summary", summary])
            .assert()
            .success();
    }

    santi
        .with(&token)
        .args(["issues", "link", "LNK-1", "blocks", "lnk-2"])
        .assert()
        .success()
        .stdout("LNK-1 blocks LNK-2\n");
    santi
        .with(&token)
        .args(["issues", "link", "LNK-1", "relates", "LNK-2"])
        .assert()
        .success()
        .stdout("LNK-1 relates to LNK-2\n");
    santi
        .with(&token)
        .args(["issues", "link", "LNK-1", "sideways", "LNK-2"])
        .assert()
        .code(2);
    santi
        .with(&token)
        .args(["issues", "show", "LNK-2"])
        .assert()
        .success()
        .stdout(contains(
            "\n\nLinks:\n  is blocked by: LNK-1 Source [To Do]\n  relates to: LNK-1 Source [To Do]\n",
        ));
    let shown = json(santi.with(&token).args(["issues", "show", "LNK-1"]));
    assert_eq!(shown["key"], "LNK-1");
    assert_eq!(shown["links"][0]["relation"], "blocks");
    assert_eq!(shown["links"][0]["issue"]["key"], "LNK-2");

    santi
        .with(&token)
        .args(["issues", "unlink", "LNK-2", "LNK-1"])
        .assert()
        .code(2)
        .stderr(contains(
            "LNK-2 has 2 links to LNK-1 (is blocked by, relates to)",
        ));
    santi
        .with(&token)
        .args([
            "issues",
            "unlink",
            "LNK-2",
            "LNK-1",
            "--relation",
            "is-blocked-by",
        ])
        .assert()
        .success()
        .stdout("Unlinked LNK-2 is blocked by LNK-1\n");
    let removed = json(
        santi
            .with(&token)
            .args(["issues", "unlink", "LNK-1", "LNK-2"]),
    );
    assert_eq!(removed["relation"], "relates");
    santi
        .with(&token)
        .args(["issues", "unlink", "LNK-1", "LNK-2"])
        .assert()
        .code(1)
        .stderr(contains("no link between LNK-1 and LNK-2"));
    santi
        .with(&token)
        .args(["issues", "show", "LNK-1"])
        .assert()
        .success()
        .stdout(contains("Links:").not());
    santi
        .with(&token)
        .args(["issues", "link", "LNK-1", "blocks", "LNK-1"])
        .assert()
        .code(5);
}

#[test]
fn attachments_are_attached_listed_downloaded_and_deleted() {
    let santi = Santi::new();
    let token = server().user();
    server().project(&token, "ATT", "kanban");
    santi
        .with(&token)
        .args(["issues", "create", "ATT", "--summary", "Files"])
        .assert()
        .success();
    let comment = json(santi.with(&token).args(["comment", "ATT-1", "See file"]))["id"].to_string();
    let files = tempfile::tempdir().unwrap();
    let notes = files.path().join("notes.txt");
    std::fs::write(&notes, "hello notes").unwrap();
    let plan = files.path().join("plan.md");
    std::fs::write(&plan, "# Plan").unwrap();

    santi
        .with(&token)
        .args(["issues", "attach", "ATT-1"])
        .arg(&notes)
        .arg(&plan)
        .assert()
        .success()
        .stdout(contains("notes.txt  11 B\n"))
        .stdout(contains("plan.md  6 B\n"));
    let attached = json(
        santi
            .with(&token)
            .args(["issues", "attach", "ATT-1", "--comment", &comment])
            .arg(&notes),
    );
    assert_eq!(attached[0]["comment_id"].to_string(), comment);
    let listed = json(santi.with(&token).args(["issues", "attachments", "ATT-1"]));
    assert_eq!(listed.as_array().unwrap().len(), 3);
    santi
        .with(&token)
        .args(["issues", "attachments", "ATT-1"])
        .assert()
        .success()
        .stdout(contains("plan.md  6 B  user"))
        .stdout(contains(format!("  in comment {comment}\n")));

    let id = listed[0]["id"].to_string();
    let out = tempfile::tempdir().unwrap();
    let download = |extra: &[&str]| {
        let mut command = santi.with(&token);
        command
            .current_dir(out.path())
            .args(["issues", "attachments", "ATT-1", "--download", &id])
            .args(extra);
        command
    };
    download(&[])
        .assert()
        .success()
        .stdout(contains("Saved notes.txt (11 B)"));
    let saved = out.path().join("notes.txt");
    assert_eq!(std::fs::read(&saved).unwrap(), b"hello notes");
    std::fs::write(&saved, "mine").unwrap();
    download(&[]).assert().code(2).stderr(contains(
        "notes.txt already exists; add --force to overwrite it",
    ));
    assert_eq!(std::fs::read(&saved).unwrap(), b"mine");
    download(&["--force"]).assert().success();
    assert_eq!(std::fs::read(&saved).unwrap(), b"hello notes");
    download(&["-o", "copy.txt"]).assert().success();
    assert_eq!(
        std::fs::read(out.path().join("copy.txt")).unwrap(),
        b"hello notes"
    );
    std::fs::create_dir(out.path().join("into")).unwrap();
    download(&["-o", "into"]).assert().success();
    assert_eq!(
        std::fs::read(out.path().join("into/notes.txt")).unwrap(),
        b"hello notes"
    );

    santi
        .with(&token)
        .args(["issues", "attachments", "ATT-1", "--delete", &id])
        .write_stdin("n\n")
        .assert()
        .code(10)
        .stdout("")
        .stderr(contains(format!("Delete attachment {id} on ATT-1?")))
        .stderr(contains(format!("Kept attachment {id}")));
    santi
        .with(&token)
        .args(["issues", "attachments", "ATT-1", "--delete", &id, "--yes"])
        .assert()
        .success()
        .stdout(contains(format!("Deleted attachment {id} on ATT-1")));
    download(&["-o", "gone.txt"])
        .assert()
        .code(4)
        .stderr(contains("Nothing exists here, or you cannot see it."));
    assert!(!out.path().join("gone.txt").exists());

    let big = files.path().join("big.txt");
    std::fs::File::create(&big)
        .unwrap()
        .set_len(25 * 1024 * 1024 + 1)
        .unwrap();
    let script = files.path().join("run.sh");
    std::fs::write(&script, "echo hi").unwrap();
    for (file, message) in [
        (&big, "Larger than 25 MB."),
        (&script, "This file type is not allowed."),
    ] {
        santi
            .with(&token)
            .args(["issues", "attach", "ATT-1"])
            .arg(&notes)
            .arg(file)
            .assert()
            .code(2)
            .stderr(contains(message));
    }
    let eleven: Vec<_> = (0..11).map(|_| notes.clone()).collect();
    santi
        .with(&token)
        .args(["issues", "attach", "ATT-1"])
        .args(&eleven)
        .assert()
        .code(2)
        .stderr(contains("At most 10 files per upload."));
    let left = json(santi.with(&token).args(["issues", "attachments", "ATT-1"]));
    assert_eq!(left.as_array().unwrap().len(), 2);
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
fn report_people_prints_one_row_per_assignee() {
    let santi = Santi::new();
    let admin = server().user();
    let bob = server().user();
    server().project(&admin, "PPL", "scrum");
    server().member(&admin, "PPL", &bob);
    santi
        .with(&admin)
        .args(["report", "people", "PPL"])
        .assert()
        .success()
        .stdout("No sprint is running or the board is empty.\n");
    let sprint = server().post(&admin, "/api/projects/PPL/sprints", json!({}));
    for (token, points) in [(&admin, 3), (&bob, 2)] {
        let id = server().get(token, "/api/me")["id"].clone();
        let issue = json!({ "summary": "Ship", "assignee_id": id, "points": points, "sprint_id": sprint["id"] });
        server().post(&admin, "/api/projects/PPL/issues", issue);
    }
    let path = format!("/api/projects/PPL/sprints/{}/start", sprint["id"]);
    server().post(&admin, &path, json!({}));
    let bob_name = server().get(&bob, "/api/me")["display_name"].clone();

    santi
        .with(&admin)
        .args(["report", "people", "ppl"])
        .assert()
        .success()
        .stdout(contains(format!("#{} ", sprint["id"])))
        .stdout(contains(format!(
            "{}  0/1 issues  0/2 pts\n",
            bob_name.as_str().unwrap()
        )))
        .stdout(contains("  0/1 issues  0/3 pts"));
    let people = json(santi.with(&admin).args(["report", "people", "PPL"]));
    assert_eq!(people, server().get(&admin, "/api/projects/PPL/people"));
    assert_eq!(people["people"].as_array().unwrap().len(), 2);
    santi
        .with(&admin)
        .args(["report", "people", "NOPE"])
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
    let run = |args: &[&str]| santi.with(&token).args(args).assert();

    run(&["projects", "create", "life", "--name", "Life cycle"])
        .success()
        .stdout(contains("LIFE").and(contains("Life cycle (scrum, admin)")));
    let kanban = json(santi.with(&token).args([
        "projects", "create", "FLOW", "--name", "Flow", "--type", "kanban",
    ]));
    assert_eq!(kanban["key"], "FLOW");
    assert_eq!(kanban["board_type"], "kanban");
    run(&["projects", "create", "LIFE", "--name", "Again"])
        .code(5)
        .stderr(contains("already exists"));
    run(&["projects", "create", "../x", "--name", "Bad"])
        .code(2)
        .stderr(contains("project key"));
    run(&[
        "projects", "create", "FLAW", "--name", "Bad", "--type", "list",
    ])
    .code(2);
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

#[test]
fn issue_listings_page_by_cursor_or_follow_every_page() {
    let santi = Santi::new();
    let token = server().user();
    server().project(&token, "PAG", "kanban");
    for n in 1..=5 {
        let issue = json!({ "summary": format!("Paged {n}") });
        server().post(&token, "/api/projects/PAG/issues", issue);
    }
    let keys = |page: &Value| -> Vec<String> {
        let items = page["items"].as_array().unwrap();
        items.iter().map(|issue| issue["key"].to_string()).collect()
    };

    let first = json(
        santi
            .with(&token)
            .args(["issues", "list", "PAG", "--limit", "2"]),
    );
    let cursor = first["next_cursor"].as_i64().unwrap().to_string();
    santi
        .with(&token)
        .args(["issues", "list", "PAG", "--limit", "2"])
        .assert()
        .success()
        .stdout(contains(format!(
            "\n… more issues not shown; see them with --cursor {cursor}"
        )));
    let list = ["issues", "list", "PAG", "--limit", "2", "--cursor", &cursor];
    let second = json(santi.with(&token).args(list));
    assert_eq!(second["items"].as_array().unwrap().len(), 2);
    assert!(keys(&second).iter().all(|key| !keys(&first).contains(key)));

    let every = ["issues", "list", "PAG", "--limit", "2", "--all"];
    let all = json(santi.with(&token).args(every));
    assert_eq!(keys(&all).len(), 5);
    assert_eq!(all["next_cursor"], Value::Null);
    santi
        .with(&token)
        .args(every)
        .assert()
        .success()
        .stdout(contains("Paged 1").and(contains("Paged 5")))
        .stdout(contains("more issues").not());
    let found = ["search", "PAG", "Paged", "--limit", "2", "--all"];
    assert_eq!(keys(&json(santi.with(&token).args(found))).len(), 5);
}

#[test]
fn restore_recreates_each_project_of_an_export_then_skips_existing_keys() {
    let santi = Santi::new();
    let token = server().user();
    let run = |args: &[&str]| santi.with(&token).args(args).assert();
    server().project(&token, "BAK", "scrum");
    run(&["issues", "create", "BAK", "--summary", "Keep me"]).success();
    run(&["issues", "create", "BAK", "--summary", "Me too"]).success();
    run(&["sprints", "create", "BAK", "--goal", "Ship"]).success();
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("export.json");
    let export = server().get(&token, "/api/me/export");
    std::fs::write(&file, export.to_string()).unwrap();
    let file = file.to_str().unwrap();
    run(&["projects", "trash", "BAK", "--yes"]).success();
    run(&["projects", "purge", "BAK", "--yes"]).success();

    run(&["restore", file])
        .success()
        .stdout(contains("restored BAK (2 issues, 1 sprints, 0 comments)"))
        .stdout(contains("not restored"));
    run(&["issues", "list", "BAK"])
        .success()
        .stdout(contains("BAK-1").and(contains("Me too")));
    run(&["restore", file]).success().stdout(contains(
        "skipped BAK: a project with this key already exists",
    ));
    let answers = json(
        santi
            .with(&token)
            .args(["restore", file, "--project", "bak"]),
    );
    assert_eq!(answers, json!([{ "key": "BAK", "skipped": "exists" }]));
    run(&["restore", file, "--project", "NOPE"])
        .code(2)
        .stderr(contains("no project NOPE").and(contains("BAK")));
    std::fs::write(dir.path().join("csv.json"), "[1, 2]").unwrap();
    run(&["restore", dir.path().join("csv.json").to_str().unwrap()])
        .code(2)
        .stderr(contains("not a santi export: "));
}

#[test]
fn password_changes_and_signs_out_the_other_sessions() {
    let santi = Santi::new();
    let token = server().user();
    santi
        .with(&token)
        .arg("password")
        .write_stdin("correct horse battery\nstaple battery horse\nstaple battery horse\n")
        .assert()
        .success()
        .stdout("Password changed. 1 other session was signed out.\n")
        .stderr(contains("Current password:"))
        .stderr(contains("Repeat new password:"));
    let changed = json(
        santi
            .with(&token)
            .arg("password")
            .write_stdin("staple battery horse\nthird horse battery\nthird horse battery\n"),
    );
    assert_eq!(changed, json!({ "signed_out": 0 }));
}

#[test]
fn password_with_a_wrong_current_one_shows_the_api_message() {
    let santi = Santi::new();
    let token = server().user();
    santi
        .with(&token)
        .arg("password")
        .write_stdin("wrong horse battery\nstaple battery horse\nstaple battery horse\n")
        .assert()
        .code(5)
        .stderr(contains("The current password is not right."));
}

#[test]
fn password_mismatch_is_refused_before_any_request() {
    let santi = Santi::new();
    let token = server().user();
    santi
        .with(&token)
        .arg("password")
        .write_stdin("wrong horse battery\nstaple battery horse\nstaple battery hors\n")
        .assert()
        .code(2)
        .stderr(contains("Passwords do not match."));
}
