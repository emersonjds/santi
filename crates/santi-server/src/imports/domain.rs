use std::collections::HashMap;

use chrono::{DateTime, NaiveDate, Utc};
use santi_types::boards::{Status, StatusCategory};
use santi_types::imports::{
    ColumnUse, ImportMapping, ImportPreview, ImportSource, PersonFound, RowProblem, SprintAction,
    SprintFound, StatusFound, TypeFound,
};
use santi_types::issues::{IssueType, Priority};
use santi_types::projects::MemberInfo;

use crate::error::AppError;
use crate::issues;

pub const MAX_FILE_BYTES: usize = 10 * 1024 * 1024;
pub const MAX_PROBLEMS: usize = 100;
pub const BATCH_SIZE: usize = 500;

pub struct Table {
    pub header: Vec<String>,
    pub records: Vec<Record>,
}

pub struct Record {
    pub line: i64,
    pub fields: Vec<String>,
}

/// One row of the export, read into santi's vocabulary but not yet mapped.
#[derive(Debug, Clone, PartialEq)]
pub struct SourceRow {
    pub line: i64,
    pub key: String,
    pub external_id: Option<String>,
    pub issue_type: String,
    pub summary: String,
    pub description: String,
    pub status: String,
    pub status_category: Option<StatusCategory>,
    pub priority: Priority,
    pub assignee: Option<String>,
    pub reporter: Option<String>,
    pub created: Option<DateTime<Utc>>,
    pub updated: Option<DateTime<Utc>>,
    pub labels: Vec<String>,
    /// Oldest first; the last one is where the issue is now.
    pub sprints: Vec<String>,
    pub sprint_start: Option<NaiveDate>,
    pub sprint_end: Option<NaiveDate>,
    pub parent: Option<String>,
    pub points: Option<f64>,
    pub comments: Vec<SourceComment>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SourceComment {
    pub body: String,
    pub created: Option<DateTime<Utc>>,
}

pub struct Export {
    pub source: ImportSource,
    pub columns: Vec<ColumnUse>,
    pub row_count: i64,
    pub rows: Vec<SourceRow>,
    /// Rows that cannot be imported at all (no key, no summary, repeated key).
    pub failed: i64,
    pub problems: Vec<RowProblem>,
}

/// RFC 4180: quoted fields may hold commas, `""` and line breaks; blank lines are dropped.
pub fn parse_csv(text: &str) -> Result<Table, AppError> {
    let text = text
        .strip_prefix('\u{feff}')
        .unwrap_or(text)
        .replace("\r\n", "\n");
    let mut records = Vec::new();
    let mut fields = Vec::new();
    let mut field = String::new();
    let (mut quoted, mut line, mut start) = (false, 1, 1);
    let mut chars = text.chars().peekable();
    while let Some(char) = chars.next() {
        if quoted {
            match char {
                '"' if chars.peek() == Some(&'"') => {
                    chars.next();
                    field.push('"');
                }
                '"' => quoted = false,
                _ => {
                    line += i64::from(char == '\n');
                    field.push(char);
                }
            }
            continue;
        }
        match char {
            '"' if field.is_empty() => quoted = true,
            ',' => fields.push(std::mem::take(&mut field)),
            '\n' => {
                fields.push(std::mem::take(&mut field));
                records.push(Record {
                    line: start,
                    fields: std::mem::take(&mut fields),
                });
                line += 1;
                start = line;
            }
            _ => field.push(char),
        }
    }
    if quoted {
        return Err(AppError::invalid(
            "file",
            "a quoted field is never closed; is this a CSV file?",
        ));
    }
    if !field.is_empty() || !fields.is_empty() {
        fields.push(field);
        records.push(Record {
            line: start,
            fields,
        });
    }
    records.retain(|record| record.fields.iter().any(|field| !field.is_empty()));
    let mut records = records.into_iter();
    let header = records
        .next()
        .ok_or_else(|| AppError::invalid("file", "the file is empty"))?;
    Ok(Table {
        header: header
            .fields
            .iter()
            .map(|name| name.trim().to_string())
            .collect(),
        records: records.collect(),
    })
}

/// Each source's export always has these columns.
pub fn detect_source(header: &[String]) -> Option<ImportSource> {
    let has = |name: &str| {
        header
            .iter()
            .any(|column| column.eq_ignore_ascii_case(name))
    };
    if has("Issue key") && has("Summary") {
        return Some(ImportSource::Jira);
    }
    if has("ID") && has("Title") {
        return Some(ImportSource::Linear);
    }
    None
}

/// santi field → the export's column names for it; every column with one of the names is read,
/// so repeated columns (labels, sprints, comments) come back in file order.
fn field_columns(source: ImportSource) -> &'static [(&'static str, &'static [&'static str])] {
    match source {
        ImportSource::Jira => &[
            ("key", &["Issue key"]),
            ("external_id", &["Issue id"]),
            ("issue_type", &["Issue Type"]),
            ("summary", &["Summary"]),
            ("description", &["Description"]),
            ("status", &["Status"]),
            ("status_category", &["Status Category"]),
            ("priority", &["Priority"]),
            ("assignee", &["Assignee"]),
            ("reporter", &["Reporter"]),
            ("created", &["Created"]),
            ("updated", &["Updated"]),
            ("labels", &["Labels"]),
            ("sprint", &["Sprint"]),
            (
                "parent",
                &[
                    "Parent",
                    "Parent id",
                    "Parent key",
                    "Custom field (Epic Link)",
                ],
            ),
            (
                "points",
                &[
                    "Custom field (Story Points)",
                    "Custom field (Story point estimate)",
                ],
            ),
            ("comments", &["Comment"]),
        ],
        ImportSource::Linear => &[
            ("key", &["ID"]),
            ("summary", &["Title"]),
            ("description", &["Description"]),
            ("status", &["Status"]),
            ("priority", &["Priority"]),
            ("assignee", &["Assignee"]),
            ("reporter", &["Creator"]),
            ("created", &["Created"]),
            ("updated", &["Updated"]),
            ("labels", &["Labels"]),
            ("sprint", &["Cycle Name"]),
            ("cycle_number", &["Cycle Number"]),
            ("sprint_start", &["Cycle Start"]),
            ("sprint_end", &["Cycle End"]),
            ("points", &["Estimate"]),
            ("parent", &["Parent issue"]),
        ],
    }
}

struct Columns(HashMap<&'static str, Vec<usize>>);

impl Columns {
    fn values<'a>(&self, record: &'a Record, field: &str) -> Vec<&'a str> {
        let indexes = self.0.get(field).map(Vec::as_slice).unwrap_or_default();
        indexes
            .iter()
            .filter_map(|index| record.fields.get(*index))
            .map(|value| value.trim())
            .filter(|value| !value.is_empty())
            .collect()
    }

    fn first<'a>(&self, record: &'a Record, field: &str) -> Option<&'a str> {
        self.values(record, field).first().copied()
    }

    fn text(&self, record: &Record, field: &str) -> String {
        self.first(record, field).unwrap_or_default().to_string()
    }
}

pub fn read_export(text: &str) -> Result<Export, AppError> {
    let table = parse_csv(text)?;
    let source = detect_source(&table.header).ok_or_else(|| {
        AppError::invalid(
            "file",
            "not a recognized export: expected a CSV with the columns of a Jira or Linear export",
        )
    })?;
    let mut map = HashMap::new();
    let mut columns = Vec::new();
    for (field, names) in field_columns(source) {
        let indexes: Vec<usize> = (0..table.header.len())
            .filter(|index| {
                let column = &table.header[*index];
                names.iter().any(|name| column.eq_ignore_ascii_case(name))
            })
            .collect();
        if indexes.is_empty() {
            continue;
        }
        let mut used: Vec<String> = indexes
            .iter()
            .map(|index| table.header[*index].clone())
            .collect();
        used.dedup();
        columns.push(ColumnUse {
            field: field.to_string(),
            columns: used,
        });
        map.insert(*field, indexes);
    }
    let columns_map = Columns(map);
    let mut export = Export {
        source,
        columns,
        row_count: table.records.len() as i64,
        rows: Vec::new(),
        failed: 0,
        problems: Vec::new(),
    };
    let mut seen = std::collections::HashSet::new();
    for record in &table.records {
        let problem = |message: String| RowProblem {
            line: record.line,
            message,
        };
        let row = read_row(source, &columns_map, record, &mut export.problems);
        let fatal = match &row {
            row if row.key.is_empty() => Some("no issue key; row skipped".to_string()),
            row if row.summary.is_empty() => Some("no summary; row skipped".to_string()),
            row if !seen.insert(row.key.clone()) => {
                Some(format!("issue key {} appears twice; row skipped", row.key))
            }
            _ => None,
        };
        if let Some(message) = fatal {
            export.failed += 1;
            export.problems.push(problem(message));
            continue;
        }
        export.rows.push(row);
    }
    Ok(export)
}

fn read_row(
    source: ImportSource,
    columns: &Columns,
    record: &Record,
    problems: &mut Vec<RowProblem>,
) -> SourceRow {
    let mut messages: Vec<String> = Vec::new();
    let mut date = |field: &str| {
        let value = columns.first(record, field)?;
        let parsed = parse_date(value);
        if parsed.is_none() {
            messages.push(format!(
                "{field} date \"{value}\" is not understood; left empty"
            ));
        }
        parsed
    };
    let created = date("created");
    let updated = date("updated");
    let sprint_start = date("sprint_start").map(|start| start.date_naive());
    let sprint_end = date("sprint_end").map(|end| end.date_naive());
    let points = columns.first(record, "points").and_then(|value| {
        let points = value
            .parse::<f64>()
            .ok()
            .filter(|points| points.is_finite() && *points >= 0.0);
        if points.is_none() {
            messages.push(format!("points \"{value}\" is not a number; left empty"));
        }
        points
    });
    let parent = columns.first(record, "parent").map(str::to_string);
    let mut sprints: Vec<String> = columns
        .values(record, "sprint")
        .into_iter()
        .map(str::to_string)
        .collect();
    if let (true, Some(number)) = (sprints.is_empty(), columns.first(record, "cycle_number")) {
        sprints.push(format!("Cycle {number}"));
    }
    problems.extend(messages.into_iter().map(|message| RowProblem {
        line: record.line,
        message,
    }));
    let issue_type = match source {
        ImportSource::Jira => columns.text(record, "issue_type"),
        ImportSource::Linear if parent.is_some() => "Sub-issue".to_string(),
        ImportSource::Linear => "Issue".to_string(),
    };
    SourceRow {
        line: record.line,
        key: columns.text(record, "key"),
        external_id: columns.first(record, "external_id").map(str::to_string),
        issue_type,
        summary: columns.text(record, "summary"),
        description: columns.text(record, "description"),
        status: columns.text(record, "status"),
        status_category: columns
            .first(record, "status_category")
            .map(category_from_name),
        priority: priority_from_name(columns.first(record, "priority").unwrap_or_default()),
        assignee: columns.first(record, "assignee").map(str::to_string),
        reporter: columns.first(record, "reporter").map(str::to_string),
        created,
        updated,
        labels: clean_labels(&columns.values(record, "labels")),
        sprints,
        sprint_start,
        sprint_end,
        parent,
        points,
        comments: columns
            .values(record, "comments")
            .into_iter()
            .map(read_comment)
            .collect(),
    }
}

/// Labels become single words of up to 50 characters, 20 per issue at most.
fn clean_labels(values: &[&str]) -> Vec<String> {
    let mut labels: Vec<String> = Vec::new();
    for value in values {
        for label in value.split(',') {
            let words: Vec<&str> = label.split_whitespace().collect();
            let label: String = words.join("-").chars().take(50).collect();
            if !label.is_empty() && !labels.contains(&label) && labels.len() < 20 {
                labels.push(label);
            }
        }
    }
    labels
}

/// Jira writes `date;author;body`; anything else is all body.
fn read_comment(value: &str) -> SourceComment {
    let mut parts = value.splitn(3, ';');
    if let (Some(date), Some(_author), Some(body)) = (parts.next(), parts.next(), parts.next())
        && let Some(created) = parse_date(date)
    {
        return SourceComment {
            body: body.trim().to_string(),
            created: Some(created),
        };
    }
    SourceComment {
        body: value.to_string(),
        created: None,
    }
}

/// Times without an offset are read as UTC.
pub fn parse_date(value: &str) -> Option<DateTime<Utc>> {
    use chrono::NaiveDateTime;
    let value = value.trim();
    if let Ok(date) = DateTime::parse_from_rfc3339(value) {
        return Some(date.to_utc());
    }
    // A JavaScript date string: `Wed Sep 09 2026 20:00:00 GMT-0400 (Eastern Daylight Time)`.
    let without_zone_name = value.split(" (").next().unwrap_or(value);
    if let Ok(date) = DateTime::parse_from_str(without_zone_name, "%a %b %d %Y %H:%M:%S GMT%z") {
        return Some(date.to_utc());
    }
    const FORMATS: [&str; 6] = [
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%dT%H:%M:%S",
        "%d/%b/%y %I:%M %p",
        "%d/%b/%y %H:%M",
        "%d/%b/%Y %I:%M %p",
    ];
    if let Some(date) = FORMATS
        .iter()
        .find_map(|format| NaiveDateTime::parse_from_str(value, format).ok())
    {
        return Some(date.and_utc());
    }
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .ok()
        .and_then(|date| date.and_hms_opt(0, 0, 0))
        .map(|date| date.and_utc())
}

fn priority_from_name(name: &str) -> Priority {
    match name.to_lowercase().as_str() {
        "urgent" | "highest" | "blocker" | "critical" => Priority::Urgent,
        "high" | "major" => Priority::High,
        "low" | "lowest" | "minor" | "trivial" => Priority::Low,
        _ => Priority::Medium,
    }
}

/// Status categories as exports name them, or a guess from a status name.
fn category_from_name(name: &str) -> StatusCategory {
    match name.to_lowercase().as_str() {
        "done" | "closed" | "resolved" | "complete" | "completed" | "canceled" | "cancelled"
        | "duplicate" | "won't do" => StatusCategory::Done,
        "in progress" | "in review" | "review" | "doing" | "started" | "in development"
        | "testing" | "in testing" => StatusCategory::InProgress,
        _ => StatusCategory::Todo,
    }
}

fn type_from_name(name: &str) -> IssueType {
    match name.to_lowercase().as_str() {
        "epic" => IssueType::Epic,
        "task" => IssueType::Task,
        "bug" | "defect" => IssueType::Bug,
        "sub-task" | "subtask" | "sub-issue" | "sub-bug" => IssueType::Subtask,
        _ => IssueType::Story,
    }
}

/// Counts by name, in order of first appearance.
fn tally<'a>(names: impl Iterator<Item = &'a str>) -> Vec<(&'a str, i64)> {
    let mut counts: Vec<(&str, i64)> = Vec::new();
    for name in names {
        match counts.iter_mut().find(|(seen, _)| *seen == name) {
            Some((_, count)) => *count += 1,
            None => counts.push((name, 1)),
        }
    }
    counts
}

fn sprint_closed(export: &Export, name: &str, today: NaiveDate) -> bool {
    export.rows.iter().any(|row| {
        let listed = row.sprints.iter().position(|sprint| sprint == name);
        let moved_on = listed.is_some_and(|index| index + 1 < row.sprints.len());
        let ended = listed.is_some() && row.sprint_end.is_some_and(|end| end < today);
        moved_on || ended
    })
}

pub fn preview(
    export: &Export,
    statuses: &[Status],
    members: &[MemberInfo],
    today: NaiveDate,
) -> ImportPreview {
    let status_names = tally(export.rows.iter().map(|row| row.status.as_str()));
    let people = tally(export.rows.iter().flat_map(|row| {
        [row.assignee.as_deref(), row.reporter.as_deref()]
            .into_iter()
            .flatten()
    }));
    let sprints = tally(
        export
            .rows
            .iter()
            .flat_map(|row| row.sprints.iter().map(String::as_str)),
    );
    let types = tally(export.rows.iter().map(|row| row.issue_type.as_str()));
    ImportPreview {
        source: export.source,
        row_count: export.row_count,
        columns: export.columns.clone(),
        statuses: status_names
            .into_iter()
            .map(|(name, count)| {
                let category = export
                    .rows
                    .iter()
                    .find(|row| row.status == name)
                    .and_then(|row| row.status_category)
                    .unwrap_or_else(|| category_from_name(name));
                StatusFound {
                    name: name.to_string(),
                    count,
                    category,
                    suggested_status_id: suggest_status(name, category, statuses),
                }
            })
            .collect(),
        people: people
            .into_iter()
            .map(|(name, count)| PersonFound {
                name: name.to_string(),
                count,
                member_id: members
                    .iter()
                    .find(|member| member.email.eq_ignore_ascii_case(name))
                    .map(|member| member.user_id),
            })
            .collect(),
        sprints: sprints
            .into_iter()
            .map(|(name, count)| SprintFound {
                name: name.to_string(),
                count,
                closed: sprint_closed(export, name, today),
            })
            .collect(),
        issue_types: types
            .into_iter()
            .map(|(name, count)| TypeFound {
                name: name.to_string(),
                count,
                suggested: type_from_name(name),
            })
            .collect(),
        problems: export.problems.iter().take(MAX_PROBLEMS).cloned().collect(),
    }
}

fn suggest_status(name: &str, category: StatusCategory, statuses: &[Status]) -> Option<i64> {
    let same_name = statuses
        .iter()
        .find(|status| status.name.eq_ignore_ascii_case(name));
    same_name
        .or_else(|| statuses.iter().find(|status| status.category == category))
        .map(|status| status.id)
}

#[derive(Debug, Clone, PartialEq)]
pub struct PlannedIssue {
    pub line: i64,
    pub key: String,
    pub issue_type: IssueType,
    pub summary: String,
    pub description: String,
    pub priority: Priority,
    pub status_id: i64,
    pub done: bool,
    pub assignee_id: Option<i64>,
    pub reporter_id: i64,
    pub points: Option<f64>,
    pub labels: Vec<String>,
    pub parent_key: Option<String>,
    /// Name of the sprint it joins; subtasks follow their parent instead (D6).
    pub sprint: Option<String>,
    pub created: DateTime<Utc>,
    pub updated: DateTime<Utc>,
    pub comments: Vec<(String, DateTime<Utc>)>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct PlannedSprint {
    pub name: String,
    pub closed: bool,
    pub start: NaiveDate,
    pub end: NaiveDate,
}

pub struct Plan {
    /// File order.
    pub issues: Vec<PlannedIssue>,
    pub sprints: Vec<PlannedSprint>,
    pub skipped: i64,
    pub failed: i64,
    pub problems: Vec<RowProblem>,
}

/// `categories` holds the project's statuses; `existing` the keys already imported from this source.
pub fn plan_import(
    export: &Export,
    mapping: &ImportMapping,
    categories: &HashMap<i64, StatusCategory>,
    existing: &HashMap<String, IssueType>,
    reporter_id: i64,
    now: DateTime<Utc>,
) -> Plan {
    let mut plan = Plan {
        issues: Vec::new(),
        sprints: Vec::new(),
        skipped: 0,
        failed: export.failed,
        problems: export.problems.clone(),
    };
    let mut rows = Vec::new();
    for row in &export.rows {
        if existing.contains_key(&row.key) {
            plan.skipped += 1;
            continue;
        }
        let Some(status_id) = mapping.statuses.get(&row.status).copied() else {
            plan.failed += 1;
            plan.problems.push(RowProblem {
                line: row.line,
                message: format!("status \"{}\" is not mapped; row skipped", row.status),
            });
            continue;
        };
        rows.push((row, status_id));
    }
    let ids: HashMap<&str, &str> = export
        .rows
        .iter()
        .filter_map(|row| Some((row.external_id.as_deref()?, row.key.as_str())))
        .collect();
    let mapped: HashMap<&str, IssueType> = rows
        .iter()
        .map(|(row, _)| {
            let issue_type = mapping
                .types
                .get(&row.issue_type)
                .copied()
                .unwrap_or_else(|| type_from_name(&row.issue_type));
            (row.key.as_str(), issue_type)
        })
        .collect();
    let parents: HashMap<&str, String> = rows
        .iter()
        .filter_map(|(row, _)| {
            let parent = row.parent.as_deref()?;
            let key = ids.get(parent).copied().unwrap_or(parent);
            Some((row.key.as_str(), key.to_string()))
        })
        .collect();
    let types = Types {
        mapped: &mapped,
        parents: &parents,
        existing,
    };
    for (row, status_id) in rows {
        let mut problem = |message: String| {
            plan.problems.push(RowProblem {
                line: row.line,
                message,
            })
        };
        let wanted = mapped[row.key.as_str()];
        let issue_type = types.effective(&row.key, 0);
        let resolved = parents.get(row.key.as_str());
        let parent_type = resolved.and_then(|parent| types.of(parent, 0));
        let parent = resolved.filter(|_| parent_type.is_some());
        let allowed = issues::domain::check_parent(issue_type, parent_type).is_ok();
        if wanted == IssueType::Subtask && issue_type != wanted {
            problem("a subtask needs a story, task or bug as parent; imported as a task".into());
        } else if let (Some(raw), None) = (row.parent.as_deref(), parent) {
            problem(format!("parent \"{raw}\" not found; imported without it"));
        } else if let (Some(parent), false) = (parent, allowed) {
            problem(format!(
                "{parent} cannot be its parent in santi; imported without it"
            ));
        }
        let parent = parent.filter(|_| allowed);
        let summary: String = row.summary.chars().take(255).collect();
        if summary.len() < row.summary.len() {
            problem("summary cut to 255 characters".into());
        }
        let done = categories.get(&status_id) == Some(&StatusCategory::Done);
        let created = row.created.unwrap_or(now);
        let sprint = row.sprints.last().filter(|name| {
            let action = mapping
                .sprints
                .get(*name)
                .copied()
                .unwrap_or(SprintAction::Skip);
            let plannable = !matches!(issue_type, IssueType::Epic | IssueType::Subtask);
            plannable && (action == SprintAction::Future || action == SprintAction::Closed && done)
        });
        let person = |name: &Option<String>| {
            name.as_ref()
                .and_then(|name| mapping.people.get(name).copied().flatten())
        };
        plan.issues.push(PlannedIssue {
            line: row.line,
            key: row.key.clone(),
            issue_type,
            summary,
            description: row.description.clone(),
            priority: row.priority,
            status_id,
            done,
            assignee_id: person(&row.assignee),
            reporter_id: person(&row.reporter).unwrap_or(reporter_id),
            points: row.points.filter(|_| issue_type != IssueType::Subtask),
            labels: row.labels.clone(),
            parent_key: parent.cloned(),
            sprint: sprint.cloned(),
            created,
            updated: row.updated.unwrap_or(created).max(created),
            comments: row
                .comments
                .iter()
                .map(|comment| {
                    let body: String = comment.body.chars().take(20_000).collect();
                    (body, comment.created.unwrap_or(created))
                })
                .collect(),
        });
    }
    plan.sprints = plan_sprints(export, mapping);
    plan
}

/// Effective issue types: a subtask whose parent is not a story, task or bug becomes a task.
struct Types<'a> {
    mapped: &'a HashMap<&'a str, IssueType>,
    parents: &'a HashMap<&'a str, String>,
    existing: &'a HashMap<String, IssueType>,
}

impl Types<'_> {
    const MAX_DEPTH: usize = 8;

    fn of(&self, key: &str, depth: usize) -> Option<IssueType> {
        if self.mapped.contains_key(key) {
            return Some(self.effective(key, depth + 1));
        }
        self.existing.get(key).copied()
    }

    fn effective(&self, key: &str, depth: usize) -> IssueType {
        let issue_type = self.mapped[key];
        if issue_type != IssueType::Subtask {
            return issue_type;
        }
        let parent = (depth < Self::MAX_DEPTH)
            .then(|| self.parents.get(key))
            .flatten()
            .and_then(|parent| self.of(parent, depth));
        match issues::domain::check_parent(IssueType::Subtask, parent) {
            Ok(()) => IssueType::Subtask,
            Err(_) => IssueType::Task,
        }
    }
}

/// Sprints the mapping creates, dated by their cycle or by the issues in them.
fn plan_sprints(export: &Export, mapping: &ImportMapping) -> Vec<PlannedSprint> {
    let mut sprints: Vec<PlannedSprint> = Vec::new();
    for row in &export.rows {
        for name in &row.sprints {
            let action = mapping
                .sprints
                .get(name)
                .copied()
                .unwrap_or(SprintAction::Skip);
            if action == SprintAction::Skip {
                continue;
            }
            let start = row
                .sprint_start
                .or(row.created.map(|created| created.date_naive()));
            let end = row
                .sprint_end
                .or(row.updated.or(row.created).map(|date| date.date_naive()));
            let Some(sprint) = sprints.iter_mut().find(|sprint| &sprint.name == name) else {
                let today = Utc::now().date_naive();
                let start = start.unwrap_or(today);
                sprints.push(PlannedSprint {
                    name: name.clone(),
                    closed: action == SprintAction::Closed,
                    start,
                    end: end.unwrap_or(start).max(start),
                });
                continue;
            };
            sprint.start = start.map_or(sprint.start, |start| start.min(sprint.start));
            sprint.end = end
                .map_or(sprint.end, |end| end.max(sprint.end))
                .max(sprint.start);
        }
    }
    sprints
}

/// Epics, then their children, then subtasks, so every parent exists before its children.
pub fn insert_order(issues: &[PlannedIssue]) -> Vec<usize> {
    let tier = |issue_type| match issue_type {
        IssueType::Epic => 0,
        IssueType::Subtask => 2,
        _ => 1,
    };
    let mut order: Vec<usize> = (0..issues.len()).collect();
    order.sort_by_key(|index| tier(issues[*index].issue_type));
    order
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;
    use santi_types::projects::MemberRole;

    const JIRA: &str = include_str!("../../tests/fixtures/imports/jira.csv");
    const LINEAR: &str = include_str!("../../tests/fixtures/imports/linear.csv");

    fn today() -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 10, 16).unwrap()
    }

    fn at(y: i32, m: u32, d: u32, h: u32, min: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(y, m, d, h, min, 0).unwrap()
    }

    fn row<'a>(export: &'a Export, key: &str) -> &'a SourceRow {
        export.rows.iter().find(|row| row.key == key).unwrap()
    }

    fn statuses() -> Vec<Status> {
        let status = |id, name: &str, category| Status {
            id,
            name: name.into(),
            category,
            column_id: Some(1),
        };
        vec![
            status(11, "To Do", StatusCategory::Todo),
            status(12, "In Progress", StatusCategory::InProgress),
            status(13, "Done", StatusCategory::Done),
        ]
    }

    fn members() -> Vec<MemberInfo> {
        vec![MemberInfo {
            user_id: 7,
            email: "Bob@Example.com".into(),
            display_name: "Bob".into(),
            role: MemberRole::Member,
        }]
    }

    fn categories() -> HashMap<i64, StatusCategory> {
        statuses()
            .into_iter()
            .map(|status| (status.id, status.category))
            .collect()
    }

    #[test]
    fn csv_keeps_quoted_commas_quotes_and_newlines_and_numbers_lines() {
        let table =
            parse_csv("\u{feff}a,b\r\n\"x, y\",\"say \"\"hi\"\"\nthere\"\r\n\r\nlast,\n").unwrap();

        assert_eq!(table.header, ["a", "b"]);
        assert_eq!(table.records.len(), 2);
        assert_eq!(table.records[0].fields, ["x, y", "say \"hi\"\nthere"]);
        assert_eq!(table.records[0].line, 2);
        assert_eq!(table.records[1].fields, ["last", ""]);
        assert_eq!(table.records[1].line, 5);
    }

    #[test]
    fn csv_rejects_an_open_quote_and_an_empty_file() {
        assert!(parse_csv("a,b\n\"never closed,1\n").is_err());
        assert!(parse_csv("\n\n").is_err());
    }

    #[test]
    fn the_header_tells_the_source() {
        let header = |names: &[&str]| {
            names
                .iter()
                .map(|name| name.to_string())
                .collect::<Vec<_>>()
        };

        assert_eq!(
            detect_source(&header(&["Summary", "Issue key", "Status"])),
            Some(ImportSource::Jira)
        );
        assert_eq!(
            detect_source(&header(&["ID", "Title", "Status"])),
            Some(ImportSource::Linear)
        );
        assert_eq!(detect_source(&header(&["name", "email"])), None);
        assert!(read_export("name,email\nana,ana@example.com\n").is_err());
    }

    #[test]
    fn dates_in_the_formats_exports_use() {
        assert_eq!(parse_date("01/Oct/26 9:00 AM"), Some(at(2026, 10, 1, 9, 0)));
        assert_eq!(
            parse_date("05/OCT/26 2:30 PM"),
            Some(at(2026, 10, 5, 14, 30))
        );
        assert_eq!(parse_date("05/Oct/26 14:30"), Some(at(2026, 10, 5, 14, 30)));
        assert_eq!(parse_date("2026-10-04 12:00"), Some(at(2026, 10, 4, 12, 0)));
        assert_eq!(
            parse_date("2026-10-04 12:00:00"),
            Some(at(2026, 10, 4, 12, 0))
        );
        assert_eq!(
            parse_date("2026-09-02T10:00:00.000Z"),
            Some(at(2026, 9, 2, 10, 0))
        );
        assert_eq!(
            parse_date("Wed Sep 09 2026 20:00:00 GMT-0400 (Eastern Daylight Time)"),
            Some(at(2026, 9, 10, 0, 0))
        );
        assert_eq!(parse_date("2026-09-14"), Some(at(2026, 9, 14, 0, 0)));
        assert_eq!(parse_date("not a date"), None);
    }

    #[test]
    fn a_jira_export_collects_repeated_columns_and_reports_bad_rows() {
        let export = read_export(JIRA).unwrap();

        assert_eq!(export.source, ImportSource::Jira);
        assert_eq!(export.row_count, 5);
        assert_eq!(export.rows.len(), 4);
        assert_eq!(export.failed, 1);
        let story = row(&export, "ACME-2");
        assert_eq!(story.description, "Line one\nline two with \"quotes\"");
        assert_eq!(story.labels, ["payments", "web"]);
        assert_eq!(story.sprints, ["Sprint 1", "Sprint 2"]);
        assert_eq!(story.parent.as_deref(), Some("10001"));
        assert_eq!(story.priority, Priority::Urgent);
        assert_eq!(story.points, Some(5.0));
        assert_eq!(story.status_category, Some(StatusCategory::Done));
        assert_eq!(story.created, Some(at(2026, 10, 2, 10, 15)));
        assert_eq!(story.updated, Some(at(2026, 10, 6, 16, 45)));
        assert_eq!(
            story.comments,
            [SourceComment {
                body: "Looks good".into(),
                created: Some(at(2026, 10, 3, 11, 0))
            }]
        );
        let bug = row(&export, "ACME-4");
        assert_eq!(bug.points, None);
        assert_eq!(bug.status_category, None);
        assert_eq!(bug.reporter, None);
        assert_eq!(bug.updated, None);
        let lines: Vec<(i64, &str)> = export
            .problems
            .iter()
            .map(|problem| (problem.line, problem.message.as_str()))
            .collect();
        assert_eq!(
            lines,
            [
                (6, "points \"abc\" is not a number; left empty"),
                (7, "no summary; row skipped")
            ]
        );
        let fields: Vec<&str> = export
            .columns
            .iter()
            .map(|column| column.field.as_str())
            .collect();
        assert!(fields.contains(&"labels") && fields.contains(&"points"));
    }

    #[test]
    fn a_linear_export_splits_labels_and_names_cycles() {
        let export = read_export(LINEAR).unwrap();

        assert_eq!(export.source, ImportSource::Linear);
        assert_eq!(export.rows.len(), 3);
        let onboarding = row(&export, "ENG-1");
        assert_eq!(onboarding.description, "Steps:\n1. sign up");
        assert_eq!(onboarding.labels, ["Feature", "Tech-debt"]);
        assert_eq!(onboarding.sprints, ["Cycle 4"]);
        assert_eq!(onboarding.sprint_end, NaiveDate::from_ymd_opt(2026, 9, 14));
        assert_eq!(onboarding.issue_type, "Issue");
        assert_eq!(onboarding.priority, Priority::Urgent);
        assert_eq!(onboarding.points, Some(3.0));
        assert_eq!(onboarding.reporter.as_deref(), Some("ana@example.com"));
        let email = row(&export, "ENG-2");
        assert_eq!(email.issue_type, "Sub-issue");
        assert_eq!(email.parent.as_deref(), Some("ENG-1"));
        assert_eq!(email.sprints, ["Cycle Five"]);
        assert_eq!(email.priority, Priority::Medium);
        let cleanup = row(&export, "ENG-3");
        assert_eq!(cleanup.created, Some(at(2026, 9, 10, 0, 0)));
        assert_eq!(cleanup.updated, None);
        assert_eq!(export.problems.len(), 1);
        assert_eq!(export.problems[0].line, 5);
    }

    #[test]
    fn optional_columns_may_be_missing() {
        let export = read_export("Issue key,Summary,Status\nX-1,Only the basics,Open\n").unwrap();

        let only = row(&export, "X-1");
        assert_eq!(only.issue_type, "");
        assert_eq!(only.priority, Priority::Medium);
        assert!(only.labels.is_empty() && only.sprints.is_empty() && only.comments.is_empty());
        assert_eq!(only.created, None);
    }

    #[test]
    fn preview_suggests_statuses_people_sprints_and_types() {
        let export = read_export(JIRA).unwrap();

        let preview = preview(&export, &statuses(), &members(), today());

        let statuses: Vec<(&str, StatusCategory, Option<i64>)> = preview
            .statuses
            .iter()
            .map(|found| {
                (
                    found.name.as_str(),
                    found.category,
                    found.suggested_status_id,
                )
            })
            .collect();
        assert_eq!(
            statuses,
            [
                ("In Progress", StatusCategory::InProgress, Some(12)),
                ("Done", StatusCategory::Done, Some(13)),
                ("Waiting", StatusCategory::Todo, Some(11)),
                ("Blocked", StatusCategory::Todo, Some(11)),
            ]
        );
        let people: Vec<(&str, i64, Option<i64>)> = preview
            .people
            .iter()
            .map(|person| (person.name.as_str(), person.count, person.member_id))
            .collect();
        assert_eq!(
            people,
            [
                ("ana@example.com", 2, None),
                ("bob@example.com", 2, Some(7)),
                ("Carol Smith", 1, None),
            ]
        );
        assert_eq!(
            preview.sprints,
            [
                SprintFound {
                    name: "Sprint 1".into(),
                    count: 1,
                    closed: true
                },
                SprintFound {
                    name: "Sprint 2".into(),
                    count: 2,
                    closed: false
                },
            ]
        );
        let types: Vec<(&str, i64, IssueType)> = preview
            .issue_types
            .iter()
            .map(|found| (found.name.as_str(), found.count, found.suggested))
            .collect();
        assert_eq!(
            types,
            [
                ("Epic", 1, IssueType::Epic),
                ("Story", 1, IssueType::Story),
                ("Sub-task", 1, IssueType::Subtask),
                ("Bug", 1, IssueType::Bug),
            ]
        );
        assert_eq!(preview.row_count, 5);
        assert_eq!(preview.problems.len(), 2);
    }

    #[test]
    fn linear_cycles_close_by_their_end_date_and_statuses_by_name() {
        let export = read_export(LINEAR).unwrap();

        let preview = preview(&export, &statuses(), &members(), today());

        let closed: Vec<(&str, bool)> = preview
            .sprints
            .iter()
            .map(|sprint| (sprint.name.as_str(), sprint.closed))
            .collect();
        assert_eq!(closed, [("Cycle 4", true), ("Cycle Five", false)]);
        let categories: Vec<(&str, StatusCategory)> = preview
            .statuses
            .iter()
            .map(|found| (found.name.as_str(), found.category))
            .collect();
        assert_eq!(
            categories,
            [
                ("In Progress", StatusCategory::InProgress),
                ("Todo", StatusCategory::Todo),
                ("Canceled", StatusCategory::Done),
            ]
        );
        assert_eq!(preview.issue_types[1].suggested, IssueType::Subtask);
    }

    fn jira_mapping() -> ImportMapping {
        ImportMapping {
            statuses: [("In Progress", 12), ("Done", 13), ("Waiting", 11)]
                .into_iter()
                .map(|(name, id)| (name.to_string(), id))
                .collect(),
            people: [("bob@example.com".to_string(), Some(7))]
                .into_iter()
                .collect(),
            sprints: [
                ("Sprint 1".to_string(), SprintAction::Closed),
                ("Sprint 2".to_string(), SprintAction::Future),
            ]
            .into_iter()
            .collect(),
            types: Default::default(),
        }
    }

    #[test]
    fn plan_maps_rows_and_fails_unmapped_statuses() {
        let export = read_export(JIRA).unwrap();
        let now = at(2026, 10, 16, 12, 0);

        let plan = plan_import(
            &export,
            &jira_mapping(),
            &categories(),
            &HashMap::new(),
            1,
            now,
        );

        let keys: Vec<&str> = plan.issues.iter().map(|issue| issue.key.as_str()).collect();
        assert_eq!(keys, ["ACME-1", "ACME-2", "ACME-3"]);
        assert_eq!(plan.failed, 2);
        assert!(plan.problems.iter().any(|problem| problem.line == 6
            && problem.message == "status \"Blocked\" is not mapped; row skipped"));
        let story = &plan.issues[1];
        assert_eq!(story.parent_key.as_deref(), Some("ACME-1"));
        assert_eq!(story.assignee_id, Some(7));
        assert_eq!(story.reporter_id, 1);
        assert!(story.done);
        assert_eq!(story.sprint.as_deref(), Some("Sprint 2"));
        assert_eq!(
            story.comments,
            [("Looks good".to_string(), at(2026, 10, 3, 11, 0))]
        );
        let subtask = &plan.issues[2];
        assert_eq!(subtask.issue_type, IssueType::Subtask);
        assert_eq!(subtask.parent_key.as_deref(), Some("ACME-2"));
        assert_eq!(subtask.points, None);
        assert_eq!(subtask.sprint, None);
        assert_eq!(subtask.updated, at(2026, 10, 3, 8, 0));
        assert_eq!(plan.issues[0].sprint, None);
        assert_eq!(plan.issues[0].issue_type, IssueType::Epic);
        let sprints: Vec<(&str, bool)> = plan
            .sprints
            .iter()
            .map(|sprint| (sprint.name.as_str(), sprint.closed))
            .collect();
        assert_eq!(sprints, [("Sprint 1", true), ("Sprint 2", false)]);
        assert_eq!(
            plan.sprints[0].start,
            NaiveDate::from_ymd_opt(2026, 10, 2).unwrap()
        );
        assert_eq!(
            plan.sprints[0].end,
            NaiveDate::from_ymd_opt(2026, 10, 6).unwrap()
        );
    }

    #[test]
    fn plan_skips_imported_keys_and_links_to_them() {
        let export = read_export(JIRA).unwrap();
        let existing: HashMap<String, IssueType> = [
            ("ACME-1".to_string(), IssueType::Epic),
            ("ACME-2".to_string(), IssueType::Story),
        ]
        .into_iter()
        .collect();

        let plan = plan_import(
            &export,
            &jira_mapping(),
            &categories(),
            &existing,
            1,
            Utc::now(),
        );

        assert_eq!(plan.skipped, 2);
        assert_eq!(plan.issues.len(), 1);
        assert_eq!(plan.issues[0].parent_key.as_deref(), Some("ACME-2"));
        assert_eq!(plan.issues[0].issue_type, IssueType::Subtask);
    }

    #[test]
    fn a_subtask_without_a_valid_parent_becomes_a_task_and_closed_sprints_keep_only_done_work() {
        let csv = "Issue key,Summary,Issue Type,Status,Parent,Sprint\n\
                   A-1,Orphan,Sub-task,Open,A-9,\n\
                   A-2,Story under story,Story,Open,A-3,Old\n\
                   A-3,Plain story,Story,Open,,Old\n";
        let export = read_export(csv).unwrap();
        let mapping = ImportMapping {
            statuses: [("Open".to_string(), 11)].into_iter().collect(),
            sprints: [("Old".to_string(), SprintAction::Closed)]
                .into_iter()
                .collect(),
            ..Default::default()
        };

        let plan = plan_import(
            &export,
            &mapping,
            &categories(),
            &HashMap::new(),
            1,
            Utc::now(),
        );

        assert_eq!(plan.issues[0].issue_type, IssueType::Task);
        assert_eq!(plan.issues[0].parent_key, None);
        assert_eq!(plan.issues[1].parent_key, None);
        assert_eq!(plan.issues[1].sprint, None);
        assert_eq!(plan.problems.len(), 2);
        assert_eq!(plan.sprints.len(), 1);
    }

    #[test]
    fn insert_order_puts_epics_first_and_subtasks_last() {
        let export = read_export(JIRA).unwrap();
        let mut plan = plan_import(
            &export,
            &jira_mapping(),
            &categories(),
            &HashMap::new(),
            1,
            Utc::now(),
        );
        plan.issues.reverse();

        let order: Vec<&str> = insert_order(&plan.issues)
            .into_iter()
            .map(|index| plan.issues[index].key.as_str())
            .collect();

        assert_eq!(order, ["ACME-1", "ACME-2", "ACME-3"]);
    }
}
