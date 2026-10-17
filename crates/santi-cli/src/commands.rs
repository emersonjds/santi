use std::io::{BufRead, IsTerminal, Write};
use std::path::PathBuf;

use chrono::{DateTime, NaiveTime, Utc};
use santi_types::boards::{Backlog, BoardView, Card};
use santi_types::imports::{ImportMapping, ImportPreview, ImportResult, SprintAction};
use santi_types::issues::{
    Comment, CreateIssue, Issue, IssueFilter, MoveIssue, Page, PageParams, StatusFilter,
    UpdateIssue,
};
use santi_types::projects::{Project, ProjectState};
use santi_types::reports::{ReportGroup, ReportIssue, ReportOutcome, SprintReport};
use santi_types::sprints::{CompleteSprint, CreateSprint, Sprint, StartSprint};
use serde::Serialize;

use crate::cli::{
    Cli, Command, CommentArgs, Filter, IssuesCommand, PlanArgs, ProjectsCommand, SprintsCommand,
};
use crate::client::{Client, ProjectKey};
use crate::config::{self, Config};
use crate::error::Error;

pub async fn run(cli: Cli) -> Result<(), Error> {
    let path = config::path();
    let file = match (&path, cli.url.is_some() && cli.token.is_some()) {
        (Some(path), false) => config::load(path)?,
        _ => Config::default(),
    };
    if let Command::Login = cli.command {
        return login(cli.url.or(file.url), cli.token, path).await;
    }
    let resolved = config::resolve(cli.url, cli.token, file);
    let client = Client::new(
        resolved.url.as_deref().unwrap_or(config::DEFAULT_URL),
        resolved.token,
    )?;
    let json = cli.json;
    match cli.command {
        Command::Login => Ok(()),
        Command::Whoami => {
            let me = client.me().await?;
            show(json, &me, |me| {
                format!("{} <{}>", me.display_name, me.email)
            })
        }
        Command::Projects(command) => projects(&client, command, json).await,
        Command::Issues(command) => issues(&client, command, json).await,
        Command::Board { project } => show(json, &client.board(&project).await?, board_text),
        Command::Backlog { project } => show(json, &client.backlog(&project).await?, backlog_text),
        Command::Sprints(command) => sprints(&client, command, json).await,
        Command::Plan(args) => plan(&client, args, json).await,
        Command::Search {
            project,
            text,
            filter,
        } => {
            let (filter, status, page) = filters(Some(text), filter);
            let found = client.issues(&project, &filter, &status, &page).await?;
            show(json, &found, page_text)
        }
        Command::Comment(args) => comment(&client, args, json).await,
        Command::Import { project, file, yes } => import(&client, &project, file, yes, json).await,
        Command::Mcp { http, allowed_host } => match http {
            Some(address) => crate::mcp::serve_http(client, address, allowed_host).await,
            None => crate::mcp::serve_stdio(client).await,
        },
    }
}

async fn projects(client: &Client, command: ProjectsCommand, json: bool) -> Result<(), Error> {
    let (project, action, done) = match command {
        ProjectsCommand::List { state } => {
            let projects = client.projects(state).await?;
            return show(json, &projects, |projects| lines(projects, project_line));
        }
        ProjectsCommand::Archive { project } => (project, "archive", "Archived"),
        ProjectsCommand::Unarchive { project } => (project, "unarchive", "Unarchived"),
        ProjectsCommand::Restore { project } => (project, "restore", "Restored"),
        ProjectsCommand::Trash { project, yes } => {
            let question =
                format!("Move {project} to the trash? It is deleted for good after 60 days.");
            if !yes && !confirm(&question)? {
                return Err(Error::Declined(format!("Kept {project}")));
            }
            client.change_project(&project, "trash").await?;
            return show(json, &(), |()| {
                format!(
                    "Moved {project} to the trash; `santi projects restore {project}` brings it back"
                )
            });
        }
        ProjectsCommand::Purge { project, yes } => {
            let question =
                format!("Delete {project} and all its issues for good? This cannot be undone.");
            if !yes && !confirm(&question)? {
                return Err(Error::Declined(format!("Kept {project}")));
            }
            client.purge_project(&project).await?;
            return show(json, &(), |()| format!("Purged {project}"));
        }
    };
    client.change_project(&project, action).await?;
    show(json, &(), |()| format!("{done} {project}"))
}

async fn login(
    url: Option<String>,
    token: Option<String>,
    path: Option<PathBuf>,
) -> Result<(), Error> {
    let path = path.ok_or_else(|| {
        Error::Other("no home directory for the config file; set XDG_CONFIG_HOME".into())
    })?;
    let url = url.unwrap_or_else(|| config::DEFAULT_URL.into());
    let client = Client::new(&url, None)?;
    if client.is_plain_http_to_another_host() {
        eprintln!(
            "santi: warning: {} is plain HTTP to another host; the token travels unencrypted. Use https://.",
            client.shown_url()
        );
    }
    let question = "API token (account menu → API tokens): ";
    let token = match token {
        Some(token) => token,
        None if std::io::stdin().is_terminal() => {
            eprint!("{question}");
            rpassword::read_password().map_err(|error| Error::Other(error.to_string()))?
        }
        None => ask(question)?,
    };
    let me = client.with_token(Some(token.clone())).me().await?;
    config::save(
        &path,
        &Config {
            url: Some(url.clone()),
            token: Some(token),
        },
    )?;
    println!(
        "Logged in to {url} as {} <{}>; saved {}",
        me.display_name,
        me.email,
        path.display()
    );
    Ok(())
}

async fn issues(client: &Client, command: IssuesCommand, json: bool) -> Result<(), Error> {
    match command {
        IssuesCommand::List { project, filter } => {
            let (filter, status, page) = filters(None, filter);
            let found = client.issues(&project, &filter, &status, &page).await?;
            show(json, &found, page_text)
        }
        IssuesCommand::Show { issue } => show(json, &client.issue(&issue).await?, issue_text),
        IssuesCommand::Create {
            project,
            summary,
            fields,
            parent,
            sprint,
        } => {
            let issue = CreateIssue {
                summary,
                issue_type: fields.issue_type.unwrap_or_default(),
                description: fields.description.unwrap_or_default(),
                priority: fields.priority.unwrap_or_default(),
                status_id: None,
                assignee_id: fields.assignee.flatten(),
                points: fields.points.flatten(),
                labels: fields.labels,
                parent,
                sprint_id: sprint,
            };
            show(
                json,
                &client.create_issue(&project, &issue).await?,
                issue_line,
            )
        }
        IssuesCommand::Edit {
            issue,
            summary,
            fields,
            parent,
            sprint,
        } => {
            let changes = UpdateIssue {
                summary,
                description: fields.description,
                issue_type: fields.issue_type,
                priority: fields.priority,
                assignee_id: fields.assignee,
                points: fields.points,
                labels: match fields.labels.as_slice() {
                    [] => None,
                    [none] if none == "none" => Some(vec![]),
                    _ => Some(fields.labels),
                },
                parent,
                sprint_id: sprint,
            };
            show(
                json,
                &client.update_issue(&issue, &changes).await?,
                issue_line,
            )
        }
        IssuesCommand::Move {
            issue,
            status,
            after,
            before,
        } => {
            let status_id = match status {
                Some(status) => Some(client.status_id(&issue.project, &status).await?),
                None => None,
            };
            let change = MoveIssue {
                status_id,
                after,
                before,
                sprint_id: None,
            };
            show(json, &client.move_issue(&issue, &change).await?, issue_line)
        }
        IssuesCommand::Delete { issue, yes } => {
            if !yes && !confirm(&format!("Delete {issue} and its subtasks?"))? {
                return Err(Error::Declined(format!("Kept {issue}")));
            }
            client.delete_issue(&issue).await?;
            show(json, &(), |()| format!("Deleted {issue}"))
        }
        IssuesCommand::Plan(args) => plan(client, args, json).await,
        IssuesCommand::Comment(args) => comment(client, args, json).await,
        IssuesCommand::Comments { issue } => {
            let comments = client.all_comments(&issue).await?;
            show(json, &comments, |comments| {
                comments_text(comments, Utc::now())
            })
        }
    }
}

async fn plan(client: &Client, args: PlanArgs, json: bool) -> Result<(), Error> {
    let changes = UpdateIssue {
        sprint_id: Some(args.sprint),
        ..UpdateIssue::default()
    };
    let issue = client.update_issue(&args.issue, &changes).await?;
    show(json, &issue, issue_line)
}

async fn comment(client: &Client, args: CommentArgs, json: bool) -> Result<(), Error> {
    let comment = client.comment(&args.issue, &args.body).await?;
    show(json, &comment, |_| format!("Commented on {}", args.issue))
}

async fn sprints(client: &Client, command: SprintsCommand, json: bool) -> Result<(), Error> {
    let sprint = match command {
        SprintsCommand::List { project } => {
            let sprints = client.sprints(&project).await?;
            return show(json, &sprints, |sprints| lines(sprints, sprint_line));
        }
        SprintsCommand::Report { project, sprint } => {
            let report = client.sprint_report(&project, sprint).await?;
            return show(json, &report, report_text);
        }
        SprintsCommand::Create {
            project,
            name,
            goal,
        } => {
            let sprint = CreateSprint { name, goal };
            client.create_sprint(&project, &sprint).await?
        }
        SprintsCommand::Start {
            project,
            sprint,
            start,
            end,
        } => {
            let dates = StartSprint {
                starts_at: start.map(|day| day.and_time(NaiveTime::MIN).and_utc()),
                ends_at: end.map(|day| day.and_hms_opt(23, 59, 0).expect("23:59 exists").and_utc()),
            };
            client.start_sprint(&project, sprint, &dates).await?
        }
        SprintsCommand::Complete {
            project,
            sprint,
            to,
        } => {
            let complete = CompleteSprint { open_issues: to };
            client.complete_sprint(&project, sprint, &complete).await?
        }
    };
    show(json, &sprint, sprint_line)
}

async fn import(
    client: &Client,
    project: &ProjectKey,
    file: PathBuf,
    yes: bool,
    json: bool,
) -> Result<(), Error> {
    let csv = std::fs::read(&file)
        .map_err(|error| Error::Usage(format!("{}: {error}", file.display())))?;
    let preview = client.import_preview(project, csv.clone()).await?;
    show(json, &preview, preview_text)?;
    let question = format!("Import {} rows into {project}?", preview.row_count);
    if !yes && !confirm(&question)? {
        return Err(Error::Declined("Nothing imported".into()));
    }
    let result = client
        .import(project, csv, &suggested_mapping(&preview))
        .await?;
    show(json, &result, result_text)
}

/// The preview's suggestions, as the web importer pre-fills them.
fn suggested_mapping(preview: &ImportPreview) -> ImportMapping {
    ImportMapping {
        statuses: preview
            .statuses
            .iter()
            .filter_map(|status| Some((status.name.clone(), status.suggested_status_id?)))
            .collect(),
        people: preview
            .people
            .iter()
            .map(|person| (person.name.clone(), person.member_id))
            .collect(),
        sprints: preview
            .sprints
            .iter()
            .map(|sprint| {
                let action = match sprint.closed {
                    true => SprintAction::Closed,
                    false => SprintAction::Future,
                };
                (sprint.name.clone(), action)
            })
            .collect(),
        types: preview
            .issue_types
            .iter()
            .map(|found| (found.name.clone(), found.suggested))
            .collect(),
    }
}

fn filters(q: Option<String>, filter: Filter) -> (IssueFilter, StatusFilter, PageParams) {
    let issues = IssueFilter {
        assignee: filter.assignee,
        issue_type: filter.issue_type,
        label: filter.label,
        q,
        ..IssueFilter::default()
    };
    let page = PageParams {
        limit: filter.limit,
        cursor: None,
    };
    (
        issues,
        StatusFilter {
            status: filter.status,
        },
        page,
    )
}

fn show<T: Serialize>(json: bool, value: &T, text: impl Fn(&T) -> String) -> Result<(), Error> {
    match json {
        true => println!(
            "{}",
            serde_json::to_string_pretty(value).expect("DTOs serialize")
        ),
        false => println!("{}", text(value)),
    }
    Ok(())
}

/// Asked on stderr, so `--json` output stays clean.
fn ask(question: &str) -> Result<String, Error> {
    eprint!("{question}");
    std::io::stderr().flush().ok();
    let mut answer = String::new();
    std::io::stdin()
        .lock()
        .read_line(&mut answer)
        .map_err(|error| Error::Other(error.to_string()))?;
    Ok(answer.trim().to_string())
}

fn confirm(question: &str) -> Result<bool, Error> {
    let answer = ask(&format!("{question} [y/N] "))?;
    Ok(answer.eq_ignore_ascii_case("y") || answer.eq_ignore_ascii_case("yes"))
}

/// The API's own spelling of an enum (`in_progress`, `scrum`).
fn name<T: Serialize>(value: &T) -> String {
    match serde_json::to_value(value) {
        Ok(serde_json::Value::String(text)) => text,
        _ => String::new(),
    }
}

fn lines<T>(items: &[T], line: fn(&T) -> String) -> String {
    match items.is_empty() {
        true => "(none)".into(),
        false => items.iter().map(line).collect::<Vec<_>>().join("\n"),
    }
}

fn project_line(project: &Project) -> String {
    let line = format!(
        "{:<8} {} ({}, {})",
        project.key,
        project.name,
        name(&project.board_type),
        name(&project.role)
    );
    let by = |who: &Option<String>| {
        who.as_deref()
            .map(|who| format!(" by {who}"))
            .unwrap_or_default()
    };
    let day = |at: Option<DateTime<Utc>>| {
        at.map(|at| at.format("%Y-%m-%d").to_string())
            .unwrap_or_default()
    };
    match project.state {
        ProjectState::Active => line,
        ProjectState::Archived => format!(
            "{line} archived {}{}",
            day(project.archived_at),
            by(&project.archived_by)
        ),
        ProjectState::Trashed => format!(
            "{line} trashed {}{}, purged on {}",
            day(project.trashed_at),
            by(&project.trashed_by),
            day(project.purge_at)
        ),
    }
}

fn issue_line(issue: &Issue) -> String {
    let (kind, priority) = (issue.issue_type.label(), issue.priority.label());
    format!(
        "{:<10} {kind:<8} {priority:<7} {}",
        issue.key, issue.summary
    )
}

fn card_line(card: &Card) -> String {
    let (kind, priority) = (card.issue_type.label(), card.priority.label());
    let assignee = card.assignee_name.as_deref().map_or("-".into(), short_name);
    format!(
        "  {:<10} {kind:<8} {priority:<7} {}  @{assignee}",
        card.key, card.summary
    )
}

/// SAN-100: first and last word; title case only when the whole name is in capitals.
fn short_name(name: &str) -> String {
    let words: Vec<&str> = name.split_whitespace().collect();
    let short = match words.as_slice() {
        [first, .., last] if words.len() > 2 => format!("{first} {last}"),
        _ => words.join(" "),
    };
    let shouting = short.chars().any(char::is_alphabetic) && !short.chars().any(char::is_lowercase);
    if !shouting {
        return short;
    }
    let mut word_start = true;
    short
        .chars()
        .flat_map(|letter| {
            let cased: Vec<char> = match word_start {
                true => letter.to_uppercase().collect(),
                false => letter.to_lowercase().collect(),
            };
            word_start = letter.is_whitespace() || matches!(letter, '-' | '\'' | '’');
            cased
        })
        .collect()
}

fn optional<T: ToString>(value: &Option<T>) -> String {
    value.as_ref().map_or("-".into(), ToString::to_string)
}

fn issue_text(issue: &Issue) -> String {
    let points = optional(&issue.points);
    let labels = match issue.labels.is_empty() {
        true => "-".into(),
        false => issue.labels.join(", "),
    };
    let fields = [
        ("Type", issue.issue_type.label().to_string()),
        ("Priority", issue.priority.label().to_string()),
        ("Status", issue.status_name.clone()),
        (
            "Assignee",
            issue
                .assignee_name
                .as_deref()
                .map_or("Unassigned".into(), short_name),
        ),
        ("Reporter", short_name(&issue.reporter_name)),
        (
            "Sprint",
            issue.sprint_name.clone().unwrap_or("Backlog".into()),
        ),
        ("Points", points),
        ("Parent", optional(&issue.parent_key)),
        ("Labels", labels),
    ];
    let mut text = format!("{}  {}", issue.key, issue.summary);
    for (label, value) in fields {
        text.push_str(&format!("\n{:<10}{value}", format!("{label}:")));
    }
    if !issue.description.is_empty() {
        text.push_str("\n\n");
        text.push_str(&issue.description);
    }
    text
}

fn comments_text(comments: &[Comment], now: DateTime<Utc>) -> String {
    if comments.is_empty() {
        return "(no comments)".into();
    }
    comments
        .iter()
        .map(|comment| {
            let author = short_name(&comment.author_name);
            let age = ago(comment.created_at, now);
            format!("{author} · {age}\n{}", comment.body)
        })
        .collect::<Vec<_>>()
        .join("\n\n")
}

/// Whole units, rounded down; a month is 30 days. A time ahead of the clock shows its date.
fn ago(then: DateTime<Utc>, now: DateTime<Utc>) -> String {
    let seconds = (now - then).num_seconds();
    let (count, unit) = match seconds {
        ..-60 => return then.date_naive().to_string(),
        -60..60 => return "just now".into(),
        60..3_600 => (seconds / 60, "minute"),
        3_600..86_400 => (seconds / 3_600, "hour"),
        86_400..2_592_000 => (seconds / 86_400, "day"),
        2_592_000..31_536_000 => (seconds / 2_592_000, "month"),
        _ => (seconds / 31_536_000, "year"),
    };
    let plural = if count == 1 { "" } else { "s" };
    format!("{count} {unit}{plural} ago")
}

fn page_text(page: &Page<Issue>) -> String {
    let mut text = lines(&page.items, issue_line);
    if page.next_cursor.is_some() {
        text.push_str("\n… more issues; raise --limit");
    }
    text
}

fn board_text(board: &BoardView) -> String {
    let mut text = Vec::new();
    if let Some(sprint) = &board.sprint {
        text.push(sprint_line(sprint));
    }
    for column in &board.columns {
        let limit = column
            .wip_limit
            .map_or(String::new(), |limit| format!("/{limit}"));
        text.push(format!("{} ({}{limit})", column.name, column.issue_count));
        text.extend(column.cards.iter().map(card_line));
    }
    text.join("\n")
}

fn backlog_text(backlog: &Backlog) -> String {
    let mut text = Vec::new();
    for section in &backlog.sections {
        let title = section
            .sprint
            .as_ref()
            .map_or("Backlog".into(), sprint_line);
        text.push(format!(
            "{title} — {} issues, {} points",
            section.issue_count, section.total_points
        ));
        text.extend(section.cards.iter().map(card_line));
    }
    text.join("\n")
}

fn sprint_line(sprint: &Sprint) -> String {
    let dates = match (sprint.starts_at, sprint.ends_at) {
        (Some(start), Some(end)) => format!(
            " {} → {}",
            start.format("%Y-%m-%d %H:%M"),
            end.format("%Y-%m-%d %H:%M")
        ),
        _ => String::new(),
    };
    format!(
        "#{} {} ({}){dates}",
        sprint.id,
        sprint.name,
        name(&sprint.state)
    )
}

/// Absent points read "—", never 0 (RP-26).
fn points(points: Option<f64>) -> String {
    points.map_or("—".into(), |points| points.to_string())
}

fn report_text(report: &SprintReport) -> String {
    let mut text = vec![
        sprint_line(&report.sprint),
        format!(
            "Committed {} · Completed {}",
            points(report.committed),
            points(report.completed)
        ),
    ];
    for group in &report.groups {
        text.extend(group_lines(group));
    }
    text.join("\n")
}

fn group_lines(group: &ReportGroup) -> Vec<String> {
    let title = match group.outcome {
        ReportOutcome::Completed => "Completed",
        ReportOutcome::NotCompleted => "Not completed",
        ReportOutcome::Removed => "Removed from sprint",
    };
    let count = match group.issues.len() {
        1 => "1 issue".to_string(),
        count => format!("{count} issues"),
    };
    let mut text = vec![format!(
        "{title} — {count}, {} → {} points",
        points(group.points_at_start),
        points(group.points_at_end)
    )];
    text.extend(group.issues.iter().map(report_issue_line));
    if let Some(deleted) = &group.deleted {
        text.push(format!(
            "  Deleted issues {} → {}",
            points(deleted.points_at_start),
            points(deleted.points_at_end)
        ));
    }
    if text.len() == 1 {
        text.push("  (none)".into());
    }
    text
}

fn report_issue_line(issue: &ReportIssue) -> String {
    let added = if issue.added_after_start {
        " Added"
    } else {
        ""
    };
    format!(
        "  {} {} ({}, {}) {} → {}{added}",
        issue.key,
        issue.summary,
        issue.issue_type.label(),
        issue.status_name,
        points(issue.points_at_start),
        points(issue.points_at_end)
    )
}

fn preview_text(preview: &ImportPreview) -> String {
    let mut text = vec![format!(
        "{} export: {} rows",
        name(&preview.source),
        preview.row_count
    )];
    for status in &preview.statuses {
        let target = status
            .suggested_status_id
            .map_or("no status (rows fail)".into(), |id| format!("status #{id}"));
        text.push(format!(
            "Status {} ({}) → {target}",
            status.name, status.count
        ));
    }
    for person in &preview.people {
        let target = person
            .member_id
            .map_or("nobody".into(), |id| format!("member #{id}"));
        text.push(format!(
            "Person {} ({}) → {target}",
            person.name, person.count
        ));
    }
    for sprint in &preview.sprints {
        let state = if sprint.closed { "closed" } else { "future" };
        text.push(format!(
            "Sprint {} ({}) → {state}",
            sprint.name, sprint.count
        ));
    }
    for found in &preview.issue_types {
        let target = found.suggested.label();
        text.push(format!("Type {} ({}) → {target}", found.name, found.count));
    }
    text.extend(problem_lines(&preview.problems));
    text.join("\n")
}

fn result_text(result: &ImportResult) -> String {
    let mut text = vec![format!(
        "Created {}, skipped {} already imported, failed {}",
        result.created, result.skipped, result.failed
    )];
    text.extend(problem_lines(&result.problems));
    text.join("\n")
}

fn problem_lines(problems: &[santi_types::imports::RowProblem]) -> Vec<String> {
    problems
        .iter()
        .map(|problem| format!("  line {}: {}", problem.line, problem.message))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn short_name_keeps_first_and_last_word() {
        for (name, short) in [
            ("Alice", "Alice"),
            ("Bob Stone", "Bob Stone"),
            ("Emerson Junior Daniel Silva", "Emerson Silva"),
            ("EMERSON JUNIOR DANIEL SILVA", "Emerson Silva"),
            ("  Bob   Stone  ", "Bob Stone"),
            ("Ana McDonald da Silva", "Ana Silva"),
            ("JOÃO ÁVILA", "João Ávila"),
            ("CAÇA ÇARAN", "Caça Çaran"),
            ("MARIA-JOSÉ D’ÁVILA", "Maria-José D’Ávila"),
            ("42", "42"),
            ("", ""),
        ] {
            assert_eq!(short_name(name), short, "{name:?}");
        }
    }

    #[test]
    fn card_line_shows_the_assignee_short() {
        let card: Card = serde_json::from_value(serde_json::json!({
            "id": 1, "key": "WEB-1", "summary": "Ship it", "issue_type": "story",
            "priority": "high", "status_id": 1, "column_id": 1, "assignee_id": 2,
            "assignee_name": "EMERSON JUNIOR DANIEL SILVA", "reporter_id": 2,
            "points": null, "labels": [], "parent_key": null, "sprint_id": null,
            "open_subtasks": 0, "total_subtasks": 0, "rank": "a",
            "updated_at": "2026-10-16T00:00:00Z",
        }))
        .unwrap();
        assert!(card_line(&card).ends_with("Ship it  @Emerson Silva"));
        let unassigned = Card {
            assignee_name: None,
            ..card
        };
        assert!(card_line(&unassigned).ends_with("@-"));
    }

    fn issue() -> Issue {
        serde_json::from_value(serde_json::json!({
            "id": 1, "key": "SAN-97", "number": 97, "summary": "CLI and API gaps",
            "description": "Make it so.", "issue_type": "story", "priority": "high",
            "status_id": 2, "status_name": "In Progress", "assignee_id": 3,
            "assignee_name": "EMERSON JUNIOR DANIEL SILVA", "reporter_id": 4,
            "reporter_name": "Ana Maria Lima", "points": 5.0, "labels": ["dogfood", "cli"],
            "parent_key": "SAN-90", "sprint_id": 39, "sprint_name": "Sprint 39", "rank": "a",
            "done_at": null, "created_at": "2026-10-16T00:00:00Z",
            "updated_at": "2026-10-16T00:00:00Z",
        }))
        .unwrap()
    }

    #[test]
    fn issue_text_names_status_people_and_sprint() {
        assert_eq!(
            issue_text(&issue()),
            "SAN-97  CLI and API gaps\n\
             Type:     Story\n\
             Priority: High\n\
             Status:   In Progress\n\
             Assignee: Emerson Silva\n\
             Reporter: Ana Lima\n\
             Sprint:   Sprint 39\n\
             Points:   5\n\
             Parent:   SAN-90\n\
             Labels:   dogfood, cli\n\
             \n\
             Make it so."
        );
    }

    #[test]
    fn issue_text_spells_out_what_is_missing() {
        let bare = Issue {
            assignee_id: None,
            assignee_name: None,
            sprint_id: None,
            sprint_name: None,
            points: None,
            parent_key: None,
            labels: vec![],
            description: String::new(),
            ..issue()
        };
        let text = issue_text(&bare);
        assert!(text.contains("Assignee: Unassigned\n"), "{text}");
        assert!(text.contains("Sprint:   Backlog\n"), "{text}");
        assert!(
            text.ends_with("Points:   -\nParent:   -\nLabels:   -"),
            "{text}"
        );
    }

    #[test]
    fn ago_reads_like_a_person_would_say_it() {
        let now: DateTime<Utc> = "2026-10-16T12:00:00Z".parse().unwrap();
        for (seconds, said) in [
            (-61, "2026-10-16"),
            (-2 * 86_400, "2026-10-18"),
            (-60, "just now"),
            (-5, "just now"),
            (0, "just now"),
            (59, "just now"),
            (60, "1 minute ago"),
            (119, "1 minute ago"),
            (3_599, "59 minutes ago"),
            (3_600, "1 hour ago"),
            (7_200, "2 hours ago"),
            (86_399, "23 hours ago"),
            (86_400, "1 day ago"),
            (29 * 86_400, "29 days ago"),
            (30 * 86_400, "1 month ago"),
            (364 * 86_400, "12 months ago"),
            (365 * 86_400, "1 year ago"),
            (800 * 86_400, "2 years ago"),
        ] {
            let then = now - chrono::TimeDelta::seconds(seconds);
            assert_eq!(ago(then, now), said, "{seconds}s");
        }
    }

    #[test]
    fn comments_show_author_and_age_then_the_body() {
        let now: DateTime<Utc> = "2026-10-16T12:00:00Z".parse().unwrap();
        let comment = |id: i64, author: &str, body: &str, at: &str| Comment {
            id,
            author_id: id,
            author_name: author.into(),
            body: body.into(),
            created_at: at.parse().unwrap(),
        };
        let comments = [
            comment(
                1,
                "EMERSON JUNIOR DANIEL SILVA",
                "First\nline two",
                "2026-10-16T10:00:00Z",
            ),
            comment(2, "Ana Lima", "Second", "2026-10-16T11:59:30Z"),
        ];
        assert_eq!(
            comments_text(&comments, now),
            "Emerson Silva · 2 hours ago\nFirst\nline two\n\nAna Lima · just now\nSecond"
        );
        assert_eq!(comments_text(&[], now), "(no comments)");
    }

    #[test]
    fn report_text_lists_groups_rows_and_dashes() {
        let row = |key: &str, start: Option<f64>, end: Option<f64>, added: bool| {
            serde_json::json!({
                "key": key, "summary": "Ship it", "issue_type": "story", "priority": "high",
                "status_name": "Done", "status_category": "done", "epic_key": null,
                "epic_summary": null, "points_at_start": start, "points_at_end": end,
                "added_after_start": added,
            })
        };
        let report: SprintReport = serde_json::from_value(serde_json::json!({
            "sprint": {
                "id": 3, "name": "Sprint 3", "goal": "", "state": "closed",
                "starts_at": "2026-10-01T00:00:00Z", "ends_at": "2026-10-14T23:59:00Z",
                "started_at": "2026-10-01T00:00:00Z", "closed_at": "2026-10-14T00:00:00Z",
                "overdue": false,
            },
            "newer_sprint_id": null, "older_sprint_id": 2,
            "committed": 5.0, "completed": null,
            "groups": [
                {
                    "outcome": "completed", "points_at_start": 5.0, "points_at_end": 8.0,
                    "issues": [row("WEB-1", Some(5.0), Some(5.5), false), row("WEB-2", None, Some(2.5), true)],
                    "deleted": { "points_at_start": 1.0, "points_at_end": null },
                },
                {
                    "outcome": "not_completed", "points_at_start": null, "points_at_end": null,
                    "issues": [], "deleted": null,
                },
                {
                    "outcome": "removed", "points_at_start": 3.0, "points_at_end": null,
                    "issues": [row("WEB-4", Some(3.0), None, false)], "deleted": null,
                },
            ],
        }))
        .unwrap();
        assert_eq!(
            report_text(&report),
            "#3 Sprint 3 (closed) 2026-10-01 00:00 → 2026-10-14 23:59\n\
             Committed 5 · Completed —\n\
             Completed — 2 issues, 5 → 8 points\n\
             \x20 WEB-1 Ship it (Story, Done) 5 → 5.5\n\
             \x20 WEB-2 Ship it (Story, Done) — → 2.5 Added\n\
             \x20 Deleted issues 1 → —\n\
             Not completed — 0 issues, — → — points\n\
             \x20 (none)\n\
             Removed from sprint — 1 issue, 3 → — points\n\
             \x20 WEB-4 Ship it (Story, Done) 3 → —"
        );
    }
}
