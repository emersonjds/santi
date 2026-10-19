use std::path::PathBuf;

use chrono::{DateTime, Local, NaiveTime};
use clap::{Args, Parser, Subcommand};
use santi_types::boards::StatusCategory;
use santi_types::issues::{IssueType, Priority};
use santi_types::projects::{BoardType, ProjectState};
use santi_types::sprints::{OpenIssuesDestination, SprintLength};

use crate::client::{IssueKey, ProjectKey};
use crate::sprint_time::{end_of_day, parse_moment};

#[derive(Debug, Parser)]
#[command(
    name = "santi",
    version,
    about = "Agile tracker: boards, backlog and sprints"
)]
pub struct Cli {
    /// Server URL [default: from `santi login`, else http://127.0.0.1:8080]
    #[arg(long, global = true, env = "SANTI_URL")]
    pub url: Option<String>,
    /// Personal API token (`santi_…`) [default: from `santi login`]. Flags are visible in `ps`:
    /// prefer SANTI_TOKEN, or `santi login` without --token to type it in
    #[arg(long, global = true, env = "SANTI_TOKEN", hide_env_values = true)]
    pub token: Option<String>,
    /// Print the API's JSON instead of text
    #[arg(long, global = true)]
    pub json: bool,
    #[command(subcommand)]
    pub command: Command,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    /// Check the URL and token, then save them to ~/.config/santi/config.toml (token read from stdin when not given)
    Login,
    /// Show the signed-in user
    Whoami,
    #[command(subcommand)]
    Projects(ProjectsCommand),
    #[command(subcommand)]
    Issues(IssuesCommand),
    /// Show a project's board
    Board { project: ProjectKey },
    /// Show a project's backlog: sprints first, then the backlog
    Backlog { project: ProjectKey },
    /// List a project's members: user id (for `--assignee` and mentions), name, email and role
    Members { project: ProjectKey },
    #[command(subcommand)]
    Sprints(SprintsCommand),
    /// Plan an issue into a sprint, or send it back to the backlog
    Plan(PlanArgs),
    /// Search a project's issues by summary or key
    Search {
        project: ProjectKey,
        text: String,
        #[command(flatten)]
        filter: Filter,
    },
    /// Comment on an issue
    Comment(CommentArgs),
    /// Import a Jira or Linear CSV export: shows a preview, then asks before importing
    Import {
        project: ProjectKey,
        file: PathBuf,
        /// Import without asking
        #[arg(long)]
        yes: bool,
    },
    /// Run the MCP server: stdio by default, Streamable HTTP with --http
    Mcp {
        /// Serve Streamable HTTP at ADDR/mcp instead of stdio; every request needs `Authorization: Bearer <santi token>`
        #[arg(long, value_name = "ADDR")]
        http: Option<std::net::SocketAddr>,
        /// Host header to accept besides localhost (when served behind a domain)
        #[arg(long, requires = "http")]
        allowed_host: Vec<String>,
    },
}

#[derive(Debug, Subcommand)]
pub enum ProjectsCommand {
    /// Create a project; you become its admin
    Create {
        project: ProjectKey,
        #[arg(long)]
        name: String,
        /// scrum or kanban
        #[arg(long = "type", default_value = "scrum", value_parser = enum_value::<BoardType>)]
        board_type: BoardType,
    },
    /// List the projects you belong to
    List {
        /// active, archived or trashed; archived and trashed list only projects you administer
        #[arg(long, default_value = "active", value_parser = enum_value::<ProjectState>)]
        state: ProjectState,
    },
    /// Archive a project: read-only and out of every list until unarchived (admins)
    Archive { project: ProjectKey },
    /// Make an archived project active again (admins)
    Unarchive { project: ProjectKey },
    /// Move a project to the trash; it is deleted for good 60 days later (admins)
    Trash {
        project: ProjectKey,
        /// Trash without asking
        #[arg(long)]
        yes: bool,
    },
    /// Bring a project back from the trash (admins)
    Restore { project: ProjectKey },
    /// Delete a trashed project for good, with all its issues; cannot be undone (admins)
    Purge {
        project: ProjectKey,
        /// Purge without asking
        #[arg(long)]
        yes: bool,
    },
}

#[derive(Debug, Subcommand)]
pub enum IssuesCommand {
    /// List a project's issues, newest first
    List {
        project: ProjectKey,
        #[command(flatten)]
        filter: Filter,
    },
    /// Show one issue
    Show { issue: IssueKey },
    /// Create an issue
    Create {
        project: ProjectKey,
        #[arg(long)]
        summary: String,
        #[command(flatten)]
        fields: Fields,
        /// Parent issue key (an epic, or the story of a subtask)
        #[arg(long)]
        parent: Option<String>,
        /// Plan it into this sprint id
        #[arg(long)]
        sprint: Option<i64>,
    },
    /// Change an issue's fields; `none` clears assignee, points, parent or sprint
    Edit {
        issue: IssueKey,
        #[arg(long)]
        summary: Option<String>,
        #[command(flatten)]
        fields: Fields,
        #[arg(long, value_parser = nullable_text)]
        parent: Option<Nullable<String>>,
        /// Sprint id, or `none` for the backlog
        #[arg(long, value_parser = nullable_number::<i64>)]
        sprint: Option<Nullable<i64>>,
    },
    /// Move an issue to a status and/or next to another issue
    Move {
        issue: IssueKey,
        /// Status name as on the board (e.g. "In Progress") or its id
        #[arg(long, required_unless_present_any = ["after", "before"])]
        status: Option<String>,
        #[arg(long, conflicts_with = "before")]
        after: Option<String>,
        #[arg(long)]
        before: Option<String>,
    },
    /// Delete an issue and its subtasks
    Delete {
        issue: IssueKey,
        /// Delete without asking
        #[arg(long)]
        yes: bool,
    },
    /// Plan an issue into a sprint, or send it back to the backlog
    Plan(PlanArgs),
    /// Comment on an issue
    Comment(CommentArgs),
    /// Show an issue's comments, oldest first
    Comments { issue: IssueKey },
    /// Change a comment's text (its author or a project admin)
    CommentEdit {
        issue: IssueKey,
        /// Comment id, as `issues comments` shows it (`#7`)
        id: i64,
        body: String,
    },
    /// Delete a comment (its author or a project admin)
    CommentDelete {
        issue: IssueKey,
        /// Comment id, as `issues comments` shows it (`#7`)
        id: i64,
        /// Delete without asking
        #[arg(long)]
        yes: bool,
    },
}

#[derive(Debug, Args)]
pub struct PlanArgs {
    pub issue: IssueKey,
    #[arg(long, required_unless_present = "backlog")]
    pub sprint: Option<i64>,
    #[arg(long, conflicts_with = "sprint")]
    pub backlog: bool,
}

#[derive(Debug, Args)]
pub struct CommentArgs {
    pub issue: IssueKey,
    pub body: String,
}

/// A value or `none`; the alias keeps clap from reading `Option<Option<_>>` as "flag with an optional value".
pub type Nullable<T> = Option<T>;

/// Fields shared by `issues create` and `issues edit`.
#[derive(Debug, Args)]
pub struct Fields {
    /// epic, story, task, bug or subtask
    #[arg(long = "type", value_parser = enum_value::<IssueType>)]
    pub issue_type: Option<IssueType>,
    /// urgent, high, medium or low
    #[arg(long, value_parser = enum_value::<Priority>)]
    pub priority: Option<Priority>,
    #[arg(long)]
    pub description: Option<String>,
    /// Story points, or `none`
    #[arg(long, value_parser = nullable_number::<f64>)]
    pub points: Option<Nullable<f64>>,
    /// Assignee user id, or `none`
    #[arg(long, value_parser = nullable_number::<i64>)]
    pub assignee: Option<Nullable<i64>>,
    /// Repeat for several labels; `--label none` clears them on edit
    #[arg(long = "label")]
    pub labels: Vec<String>,
}

/// Quick filters shared by `issues list` and `search`.
#[derive(Debug, Args)]
pub struct Filter {
    /// todo, in_progress or done; repeat for several
    #[arg(long, value_parser = enum_value::<StatusCategory>)]
    pub status: Vec<StatusCategory>,
    /// Repeat for several types
    #[arg(long = "type", value_parser = enum_value::<IssueType>)]
    pub issue_type: Vec<IssueType>,
    /// Assignee user id; repeat for several
    #[arg(long)]
    pub assignee: Vec<i64>,
    #[arg(long)]
    pub label: Vec<String>,
    /// 1 to 200
    #[arg(long)]
    pub limit: Option<i64>,
}

#[derive(Debug, Subcommand)]
pub enum SprintsCommand {
    /// List a board's sprints
    List { project: ProjectKey },
    /// Create a future sprint
    Create {
        project: ProjectKey,
        #[arg(long)]
        name: Option<String>,
        #[arg(long)]
        goal: Option<String>,
    },
    /// Start a sprint: now and two weeks later unless --start, --end or --for say otherwise
    Start {
        project: ProjectKey,
        sprint: i64,
        /// `YYYY-MM-DD HH:MM` or `YYYY-MM-DD` (00:00) in your time zone, or RFC 3339; default now. Maps to starts_at
        #[arg(long, value_parser = start_moment)]
        start: Option<DateTime<Local>>,
        /// `YYYY-MM-DD HH:MM` or `YYYY-MM-DD` (23:59) in your time zone, or RFC 3339. Maps to ends_at
        #[arg(long, value_parser = end_moment)]
        end: Option<DateTime<Local>>,
        /// 4h, 1d (until 23:59 that day), 1w, 2w or 1m (same day next month)
        #[arg(long = "for", value_parser = preset, conflicts_with = "end")]
        length: Option<SprintLength>,
    },
    /// Complete the active sprint; open issues go to --to
    Complete {
        project: ProjectKey,
        sprint: i64,
        /// backlog, new (a new sprint) or a future sprint's id
        #[arg(long, default_value = "backlog", value_parser = destination)]
        to: OpenIssuesDestination,
    },
    /// A started sprint's report: completed, not completed and removed issues
    Report { project: ProjectKey, sprint: i64 },
}

/// Parses a snake_case value the way the API spells it (`in_progress`, `bug`).
pub fn enum_value<T: serde::de::DeserializeOwned>(text: &str) -> Result<T, String> {
    serde_json::from_value(serde_json::Value::String(text.to_string()))
        .map_err(|error| error.to_string())
}

fn nullable_number<T: std::str::FromStr>(text: &str) -> Result<Option<T>, String> {
    if text == "none" {
        return Ok(None);
    }
    text.parse()
        .map(Some)
        .map_err(|_| format!("`{text}` is not a number or `none`"))
}

fn nullable_text(text: &str) -> Result<Option<String>, String> {
    Ok(Some(text.to_string()).filter(|text| text != "none"))
}

fn destination(text: &str) -> Result<OpenIssuesDestination, String> {
    match text {
        "backlog" => Ok(OpenIssuesDestination::Backlog {}),
        "new" => Ok(OpenIssuesDestination::NewSprint {}),
        id => id
            .parse()
            .map(|sprint_id| OpenIssuesDestination::Sprint { sprint_id })
            .map_err(|_| format!("`{id}` is not backlog, new or a sprint id")),
    }
}

fn start_moment(text: &str) -> Result<DateTime<Local>, String> {
    parse_moment(text, &Local, NaiveTime::MIN, "--start")
}

fn end_moment(text: &str) -> Result<DateTime<Local>, String> {
    parse_moment(text, &Local, end_of_day(), "--end")
}

fn preset(text: &str) -> Result<SprintLength, String> {
    match text.parse() {
        Ok(SprintLength::Minutes(_)) | Err(_) => Err(format!(
            "`{text}` is not 4h, 1d, 1w, 2w or 1m; use --end for other lengths"
        )),
        length => length,
    }
}

#[cfg(test)]
mod tests {
    use clap::{CommandFactory, Parser};

    use super::*;

    fn parse(args: &[&str]) -> Command {
        Cli::try_parse_from(args).unwrap().command
    }

    #[test]
    fn command_definition_is_valid() {
        Cli::command().debug_assert();
    }

    #[test]
    fn create_reads_api_spelled_enums_and_repeated_labels() {
        let Command::Issues(IssuesCommand::Create {
            project, fields, ..
        }) = parse(&[
            "santi",
            "issues",
            "create",
            "WEB",
            "--summary",
            "Fix it",
            "--type",
            "bug",
            "--priority",
            "high",
            "--label",
            "ui",
            "--label",
            "api",
            "--points",
            "3",
        ])
        else {
            panic!("not create");
        };
        assert_eq!(project.as_str(), "WEB");
        assert_eq!(fields.issue_type, Some(IssueType::Bug));
        assert_eq!(fields.priority, Some(Priority::High));
        assert_eq!(fields.labels, ["ui", "api"]);
        assert_eq!(fields.points, Some(Some(3.0)));
    }

    #[test]
    fn none_clears_nullable_fields() {
        let Command::Issues(IssuesCommand::Edit { fields, parent, .. }) = parse(&[
            "santi",
            "issues",
            "edit",
            "WEB-1",
            "--assignee",
            "none",
            "--points",
            "none",
            "--parent",
            "none",
        ]) else {
            panic!("not edit");
        };
        assert_eq!(fields.assignee, Some(None));
        assert_eq!(fields.points, Some(None));
        assert_eq!(parent, Some(None));
    }

    #[test]
    fn bad_values_are_usage_errors() {
        for args in [
            &[
                "santi",
                "issues",
                "create",
                "WEB",
                "--summary",
                "x",
                "--type",
                "saga",
            ][..],
            &["santi", "issues", "show", "WEB12"],
            &["santi", "issues", "edit", "WEB-1", "--points", "lots"],
            &["santi", "plan", "WEB-1"],
            &["santi", "plan", "WEB-1", "--sprint", "2", "--backlog"],
            &["santi", "issues", "plan", "WEB-1"],
            &["santi", "issues", "edit", "WEB-1", "--sprint", "next"],
            &["santi", "issues", "comments", "WEB12"],
            &["santi", "issues", "move", "WEB-1"],
            &["santi", "sprints", "complete", "WEB", "1", "--to", "later"],
        ] {
            let error = Cli::try_parse_from(args).unwrap_err();
            assert_eq!(error.exit_code(), 2, "{args:?}");
        }
    }

    #[test]
    fn issues_plan_and_comment_take_the_top_level_arguments() {
        let Command::Issues(IssuesCommand::Plan(plan)) =
            parse(&["santi", "issues", "plan", "WEB-1", "--backlog"])
        else {
            panic!("not issues plan");
        };
        assert!(plan.backlog);
        assert_eq!(plan.sprint, None);
        let Command::Plan(plan) = parse(&["santi", "plan", "WEB-1", "--sprint", "3"]) else {
            panic!("not plan");
        };
        assert_eq!(plan.sprint, Some(3));
        let Command::Issues(IssuesCommand::Comment(comment)) =
            parse(&["santi", "issues", "comment", "WEB-1", "Looks good"])
        else {
            panic!("not issues comment");
        };
        assert_eq!(comment.body, "Looks good");
        let Command::Issues(IssuesCommand::Comments { issue }) =
            parse(&["santi", "issues", "comments", "web-1"])
        else {
            panic!("not issues comments");
        };
        assert_eq!(issue.to_string(), "WEB-1");
    }

    #[test]
    fn comment_edit_and_delete_take_the_issue_and_comment_id() {
        let Command::Issues(IssuesCommand::CommentEdit { issue, id, body }) =
            parse(&["santi", "issues", "comment-edit", "web-1", "7", "Fixed"])
        else {
            panic!("not issues comment-edit");
        };
        assert_eq!(
            (issue.to_string(), id, body.as_str()),
            ("WEB-1".into(), 7, "Fixed")
        );
        for (args, expected) in [
            (
                &["santi", "issues", "comment-delete", "WEB-1", "7"][..],
                false,
            ),
            (
                &["santi", "issues", "comment-delete", "WEB-1", "7", "--yes"],
                true,
            ),
        ] {
            let Command::Issues(IssuesCommand::CommentDelete { issue, id, yes }) = parse(args)
            else {
                panic!("not issues comment-delete");
            };
            assert_eq!((issue.to_string(), id, yes), ("WEB-1".into(), 7, expected));
        }
        for args in [
            &["santi", "issues", "comment-edit", "WEB-1", "seven", "x"][..],
            &["santi", "issues", "comment-edit", "WEB-1", "7"],
            &["santi", "issues", "comment-delete", "WEB-1"],
        ] {
            let error = Cli::try_parse_from(args).unwrap_err();
            assert_eq!(error.exit_code(), 2, "{args:?}");
        }
    }

    #[test]
    fn members_takes_a_project_key() {
        let Command::Members { project } = parse(&["santi", "members", "web"]) else {
            panic!("not members");
        };
        assert_eq!(project.as_str(), "WEB");
    }

    #[test]
    fn edit_sprint_takes_an_id_or_none() {
        let sprint = |value: &str| {
            let Command::Issues(IssuesCommand::Edit { sprint, .. }) =
                parse(&["santi", "issues", "edit", "WEB-1", "--sprint", value])
            else {
                panic!("not edit");
            };
            sprint
        };
        assert_eq!(sprint("4"), Some(Some(4)));
        assert_eq!(sprint("none"), Some(None));
    }

    #[test]
    fn complete_destination_accepts_backlog_new_or_a_sprint_id() {
        let to = |value: &str| {
            let Command::Sprints(SprintsCommand::Complete { to, .. }) =
                parse(&["santi", "sprints", "complete", "WEB", "1", "--to", value])
            else {
                panic!("not complete");
            };
            to
        };
        assert_eq!(to("backlog"), OpenIssuesDestination::Backlog {});
        assert_eq!(to("new"), OpenIssuesDestination::NewSprint {});
        assert_eq!(to("7"), OpenIssuesDestination::Sprint { sprint_id: 7 });
    }

    #[test]
    fn for_takes_presets_only() {
        let Command::Sprints(SprintsCommand::Start { length, .. }) =
            parse(&["santi", "sprints", "start", "WEB", "1", "--for", "4h"])
        else {
            panic!("not start");
        };
        assert_eq!(length, Some(SprintLength::FourHours));
        for value in ["90", "3w"] {
            let error =
                Cli::try_parse_from(["santi", "sprints", "start", "WEB", "1", "--for", value])
                    .unwrap_err();
            assert!(error.to_string().contains("--end"), "{error}");
        }
    }

    #[test]
    fn for_conflicts_with_end() {
        let error = Cli::try_parse_from([
            "santi",
            "sprints",
            "start",
            "WEB",
            "1",
            "--for",
            "1d",
            "--end",
            "2026-10-16",
        ])
        .unwrap_err();
        assert_eq!(error.kind(), clap::error::ErrorKind::ArgumentConflict);
    }

    #[test]
    fn search_and_global_flags() {
        let cli = Cli::try_parse_from([
            "santi",
            "search",
            "WEB",
            "login",
            "--status",
            "in_progress",
            "--json",
            "--url",
            "http://x",
        ])
        .unwrap();
        assert!(cli.json);
        assert_eq!(cli.url.as_deref(), Some("http://x"));
        let Command::Search { text, filter, .. } = cli.command else {
            panic!("not search");
        };
        assert_eq!(text, "login");
        assert_eq!(filter.status, [StatusCategory::InProgress]);
    }

    #[test]
    fn mcp_http_takes_a_socket_address() {
        let Command::Mcp { http, .. } = parse(&["santi", "mcp", "--http", "127.0.0.1:8765"]) else {
            panic!("not mcp");
        };
        assert_eq!(http, Some("127.0.0.1:8765".parse().unwrap()));
        assert!(matches!(
            parse(&["santi", "mcp"]),
            Command::Mcp { http: None, .. }
        ));
    }
}
