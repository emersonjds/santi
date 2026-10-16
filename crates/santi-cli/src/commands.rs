use std::io::{BufRead, Write};
use std::path::PathBuf;

use santi_types::boards::{Backlog, BoardView, Card};
use santi_types::imports::{ImportMapping, ImportPreview, ImportResult, SprintAction};
use santi_types::issues::{
    CreateIssue, Issue, IssueFilter, MoveIssue, Page, PageParams, StatusFilter, UpdateIssue,
};
use santi_types::projects::Project;
use santi_types::sprints::{CompleteSprint, CreateSprint, Sprint, StartSprint};
use serde::Serialize;

use crate::cli::{Cli, Command, Filter, IssuesCommand, ProjectsCommand, SprintsCommand};
use crate::client::Client;
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
        Command::Projects(ProjectsCommand::List) => {
            show(json, &client.projects().await?, |projects| {
                lines(projects, project_line)
            })
        }
        Command::Issues(command) => issues(&client, command, json).await,
        Command::Board { project } => show(json, &client.board(&project).await?, board_text),
        Command::Backlog { project } => show(json, &client.backlog(&project).await?, backlog_text),
        Command::Sprints(command) => sprints(&client, command, json).await,
        Command::Plan { issue, sprint, .. } => {
            let changes = UpdateIssue {
                sprint_id: Some(sprint),
                ..UpdateIssue::default()
            };
            show(
                json,
                &client.update_issue(&issue, &changes).await?,
                issue_line,
            )
        }
        Command::Search {
            project,
            text,
            filter,
        } => {
            let (filter, status, page) = filters(Some(text), filter);
            let found = client.issues(&project, &filter, &status, &page).await?;
            show(json, &found, page_text)
        }
        Command::Comment { issue, body } => {
            let comment = client.comment(&issue, &body).await?;
            show(json, &comment, |_| format!("Commented on {issue}"))
        }
        Command::Import { project, file, yes } => import(&client, &project, file, yes, json).await,
        Command::Mcp { http, allowed_host } => match http {
            Some(address) => crate::mcp::serve_http(client, address, allowed_host).await,
            None => crate::mcp::serve_stdio(client).await,
        },
    }
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
    let token = match token {
        Some(token) => token,
        None => ask("API token (account menu → API tokens): ")?,
    };
    let me = Client::new(&url, Some(token.clone()))?.me().await?;
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
        } => {
            let changes = UpdateIssue {
                summary,
                description: fields.description,
                issue_type: fields.issue_type,
                priority: fields.priority,
                assignee_id: fields.assignee,
                points: fields.points,
                labels: Some(fields.labels).filter(|labels| !labels.is_empty()),
                parent,
                sprint_id: None,
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
                println!("Kept {issue}");
                return Ok(());
            }
            client.delete_issue(&issue).await?;
            show(json, &(), |()| format!("Deleted {issue}"))
        }
    }
}

async fn sprints(client: &Client, command: SprintsCommand, json: bool) -> Result<(), Error> {
    let sprint = match command {
        SprintsCommand::List { project } => {
            let sprints = client.sprints(&project).await?;
            return show(json, &sprints, |sprints| lines(sprints, sprint_line));
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
                start_date: start,
                end_date: end,
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
    project: &str,
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
        println!("Nothing imported");
        return Ok(());
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
    format!(
        "{:<8} {} ({}, {})",
        project.key,
        project.name,
        name(&project.board_type),
        name(&project.role)
    )
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
    let assignee = card.assignee_name.as_deref().unwrap_or("-");
    format!(
        "  {:<10} {kind:<8} {priority:<7} {}  @{assignee}",
        card.key, card.summary
    )
}

fn optional<T: ToString>(value: &Option<T>) -> String {
    value.as_ref().map_or("-".into(), ToString::to_string)
}

fn issue_text(issue: &Issue) -> String {
    let mut text = format!(
        "{}  {}\nType: {}  Priority: {}  Status: #{}  Points: {}\nAssignee: #{}  Parent: {}  Sprint: #{}  Labels: {}",
        issue.key,
        issue.summary,
        issue.issue_type.label(),
        issue.priority.label(),
        issue.status_id,
        optional(&issue.points),
        optional(&issue.assignee_id),
        optional(&issue.parent_key),
        optional(&issue.sprint_id),
        issue.labels.join(", "),
    );
    if !issue.description.is_empty() {
        text.push_str("\n\n");
        text.push_str(&issue.description);
    }
    text
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
    let dates = match (sprint.start_date, sprint.end_date) {
        (Some(start), Some(end)) => format!(" {start} → {end}"),
        _ => String::new(),
    };
    format!(
        "#{} {} ({}){dates}",
        sprint.id,
        sprint.name,
        name(&sprint.state)
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
