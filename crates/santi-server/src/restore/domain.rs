use std::collections::{HashMap, HashSet};

use santi_types::FieldError;
use santi_types::auth::{ExportedComment, ProjectExport};
use santi_types::boards::{BoardSettings, Status, StatusCategory};
use santi_types::issues::{Issue, IssueType};
use santi_types::projects::{BoardType, RestoreProblem};
use santi_types::sprints::{Sprint, SprintState};

use crate::boards::domain::{
    LayoutColumn, check_board_shape, check_done_mapping, check_done_window, check_name,
    check_wip_limit,
};
use crate::error::{AppError, wrong_shape};
use crate::imports::domain::MAX_PROBLEMS;
use crate::issues::domain::{
    check_comment_body, check_description, check_parent, check_points, check_summary, is_rank,
    normalize_labels,
};
use crate::projects::domain::{check_project_key, check_project_name};
use crate::sprints::domain::{
    check_goal, check_issue_can_change_sprint, check_sprint_name, check_window, require_scrum,
};

pub const MAX_ISSUES: usize = 50_000;
pub const MAX_STATUSES: usize = 500;
pub const MAX_SPRINTS: usize = 2_000;
pub const MAX_COMMENTS: usize = 200_000;

pub const NOT_RESTORED: &str = "Attachments, notifications and issue history are not in an export \
and were not restored; closed sprints report their issues as they are now.";

/// The body as one project of `GET /api/me/export`; a wrong shape names the field.
pub fn read(bytes: &[u8]) -> Result<ProjectExport, AppError> {
    let mut json = serde_json::Deserializer::from_slice(bytes);
    serde_path_to_error::deserialize(&mut json).map_err(|error| wrong_shape(&error.to_string()))
}

/// Refuses a file santi could not have written: limits first, then every field through the
/// validators of a normal write, normalised in place, and every reference against the file
/// itself. Returns the project key.
pub fn check(export: &mut ProjectExport) -> Result<String, AppError> {
    let ProjectExport {
        project,
        board,
        sprints,
        issues,
        comments,
        ..
    } = export;
    let key = check_project_key(&project.key)?;
    project.name = check_project_name(&project.name)?;
    let statuses: usize = board
        .columns
        .iter()
        .map(|column| column.statuses.len())
        .sum();
    if statuses + board.unmapped.len() > MAX_STATUSES || board.columns.len() > MAX_STATUSES {
        return Err(AppError::invalid(
            "board",
            "a project holds at most 500 statuses and 500 columns",
        ));
    }
    let limits = [
        ("issues", issues.len(), MAX_ISSUES),
        ("sprints", sprints.len(), MAX_SPRINTS),
        ("comments", comments.len(), MAX_COMMENTS),
    ];
    for (field, count, limit) in limits {
        if count > limit {
            return Err(AppError::invalid(
                field,
                &format!("a restore takes at most {limit} {field}"),
            ));
        }
    }
    let categories = check_board(project.board_type, board)?;
    let sprint_ids = check_sprints(project.board_type, sprints)?;
    check_issues(&key, issues, &categories, &sprint_ids)?;
    check_comments(issues, comments)?;
    Ok(key)
}

/// Columns, statuses and the done mapping as a board edit checks them. Returns each status's
/// category by name.
fn check_board(
    board_type: BoardType,
    board: &mut BoardSettings,
) -> Result<HashMap<String, StatusCategory>, AppError> {
    if board.board_type != board_type {
        return Err(AppError::invalid(
            "board.board_type",
            "must match the project's board type",
        ));
    }
    check_done_window(board_type, board.done_window_days).map_err(at("board.done_window_days"))?;
    let mut categories = HashMap::new();
    let mut layout = Vec::with_capacity(board.columns.len());
    let mut last_position = None;
    for (index, column) in board.columns.iter_mut().enumerate() {
        let field = |name: &str| format!("board.columns[{index}].{name}");
        column.name = check_name("name", &column.name).map_err(at(&field("name")))?;
        check_wip_limit(board_type, column.wip_limit).map_err(at(&field("wip_limit")))?;
        if last_position.is_some_and(|last| last >= column.position) {
            return Err(AppError::invalid(
                &field("position"),
                "columns run left to right by position",
            ));
        }
        last_position = Some(column.position);
        for (inner, status) in column.statuses.iter_mut().enumerate() {
            add_status(
                &mut categories,
                status,
                &field(&format!("statuses[{inner}].name")),
            )?;
        }
        layout.push(LayoutColumn {
            id: column.id,
            categories: column
                .statuses
                .iter()
                .map(|status| status.category)
                .collect(),
        });
    }
    for (index, status) in board.unmapped.iter_mut().enumerate() {
        add_status(
            &mut categories,
            status,
            &format!("board.unmapped[{index}].name"),
        )?;
    }
    check_done_mapping(&layout).map_err(at("board.columns"))?;
    check_board_shape(&layout).map_err(at("board.columns"))?;
    Ok(categories)
}

fn add_status(
    categories: &mut HashMap<String, StatusCategory>,
    status: &mut Status,
    field: &str,
) -> Result<(), AppError> {
    status.name = check_name("name", &status.name).map_err(at(field))?;
    if categories
        .insert(status.name.clone(), status.category)
        .is_some()
    {
        return Err(AppError::invalid(field, "repeats another status's name"));
    }
    Ok(())
}

/// D6 and the sprint lifecycle: scrum only, times that fit the state, one running. Returns the ids.
fn check_sprints(board_type: BoardType, list: &mut [Sprint]) -> Result<HashSet<i64>, AppError> {
    if !list.is_empty() {
        require_scrum(board_type).map_err(at("sprints"))?;
    }
    let mut ids = HashSet::with_capacity(list.len());
    let mut running = false;
    for (index, sprint) in list.iter_mut().enumerate() {
        let field = |name: &str| format!("sprints[{index}].{name}");
        if !ids.insert(sprint.id) {
            return Err(AppError::invalid(
                &field("id"),
                "repeats another sprint's id",
            ));
        }
        sprint.name = check_sprint_name(&sprint.name).map_err(at(&field("name")))?;
        sprint.goal = check_goal(&sprint.goal).map_err(at(&field("goal")))?;
        check_window(sprint.starts_at, sprint.ends_at).map_err(at(&field("ends_at")))?;
        let (started, closed) = (sprint.started_at.is_some(), sprint.closed_at.is_some());
        let fits = match sprint.state {
            SprintState::Future => !started && !closed,
            SprintState::Active => started && !closed,
            SprintState::Closed => started && closed,
        };
        if !fits {
            return Err(AppError::invalid(
                &field("state"),
                "a future sprint has no start or close time, an active one a start, a closed one both",
            ));
        }
        if sprint.state == SprintState::Active {
            if running {
                return Err(AppError::invalid(
                    "sprints",
                    "at most one sprint runs at a time",
                ));
            }
            running = true;
        }
    }
    Ok(ids)
}

fn check_issues(
    key: &str,
    list: &mut [Issue],
    categories: &HashMap<String, StatusCategory>,
    sprint_ids: &HashSet<i64>,
) -> Result<(), AppError> {
    let mut numbers = HashSet::with_capacity(list.len());
    for (index, issue) in list.iter_mut().enumerate() {
        let field = |name: &str| format!("issues[{index}].{name}");
        if issue.key != format!("{key}-{}", issue.number) || issue.number < 1 {
            return Err(AppError::invalid(
                &field("key"),
                &format!("must be {key}-<number>"),
            ));
        }
        if !numbers.insert(issue.number) {
            return Err(AppError::invalid(
                &field("number"),
                "repeats another issue's number",
            ));
        }
        issue.summary = check_summary(&issue.summary).map_err(at(&field("summary")))?;
        issue.description =
            check_description(&issue.description).map_err(at(&field("description")))?;
        issue.labels =
            normalize_labels(std::mem::take(&mut issue.labels)).map_err(at(&field("labels")))?;
        check_points(issue.issue_type, issue.points).map_err(at(&field("points")))?;
        let Some(category) = categories.get(&issue.status_name) else {
            return Err(AppError::invalid(
                &field("status_name"),
                "names no status of the board",
            ));
        };
        if issue.done_at.is_some() != (*category == StatusCategory::Done) {
            return Err(AppError::invalid(
                &field("done_at"),
                "is set exactly when the status is in the done category",
            ));
        }
        if issue.sprint_id.is_some_and(|id| !sprint_ids.contains(&id)) {
            return Err(AppError::invalid(
                &field("sprint_id"),
                "names no sprint in the file",
            ));
        }
        if issue.issue_type == IssueType::Epic && issue.sprint_id.is_some() {
            check_issue_can_change_sprint(IssueType::Epic).map_err(at(&field("sprint_id")))?;
        }
    }
    let by_key: HashMap<&str, &Issue> = list
        .iter()
        .map(|issue| (issue.key.as_str(), issue))
        .collect();
    let mut ranks = HashSet::with_capacity(list.len());
    for (index, issue) in list.iter().enumerate() {
        let field = |name: &str| format!("issues[{index}].{name}");
        if !is_rank(&issue.rank) || !ranks.insert(issue.rank.as_str()) {
            return Err(AppError::invalid(
                &field("rank"),
                "must be base-62 digits, not ending in 0, unique in the file",
            ));
        }
        let parent = match &issue.parent_key {
            Some(parent) => Some(*by_key.get(parent.as_str()).ok_or_else(|| {
                AppError::invalid(&field("parent_key"), "names no issue in the file")
            })?),
            None => None,
        };
        check_parent(issue.issue_type, parent.map(|parent| parent.issue_type))
            .map_err(at(&field("parent_key")))?;
        if issue.issue_type == IssueType::Subtask
            && parent.is_some_and(|parent| parent.sprint_id != issue.sprint_id)
        {
            check_issue_can_change_sprint(IssueType::Subtask).map_err(at(&field("sprint_id")))?;
        }
    }
    Ok(())
}

fn check_comments(issues: &[Issue], comments: &mut [ExportedComment]) -> Result<(), AppError> {
    let keys: HashSet<&str> = issues.iter().map(|issue| issue.key.as_str()).collect();
    for (index, comment) in comments.iter_mut().enumerate() {
        if !keys.contains(comment.issue_key.as_str()) {
            return Err(AppError::invalid(
                &format!("comments[{index}].issue_key"),
                "names no issue in the file",
            ));
        }
        comment.body =
            check_comment_body(&comment.body).map_err(at(&format!("comments[{index}].body")))?;
    }
    Ok(())
}

/// Moves a validation error or a refused board rule onto the field of the file it came from.
fn at(field: &str) -> impl Fn(AppError) -> AppError {
    move |error| match error {
        AppError::Validation(errors) => AppError::Validation(
            errors
                .into_iter()
                .map(|error| FieldError {
                    field: field.into(),
                    message: error.message,
                })
                .collect(),
        ),
        AppError::Conflict { detail, .. } => AppError::invalid(field, &detail),
        other => other,
    }
}

pub fn exists(key: &str) -> AppError {
    AppError::conflict(
        "project-exists",
        &format!("A project with the key {key} already exists here; nothing was restored."),
    )
}

/// D58: the caller is the only person the project keeps. Other assignees are cleared; other
/// reporters, comment authors and editors become the caller. Returns the changes with the names
/// the file gives, the first `MAX_PROBLEMS`.
pub fn resolve_people(export: &mut ProjectExport, caller: i64) -> Vec<RestoreProblem> {
    let names: HashMap<i64, &str> = export
        .members
        .iter()
        .map(|member| (member.user_id, member.display_name.as_str()))
        .collect();
    let name_of = |id: i64| names.get(&id).copied().unwrap_or("another person");
    let mut problems = Vec::new();
    let mut note = |issue_key: &str, message: String| {
        if problems.len() < MAX_PROBLEMS {
            problems.push(RestoreProblem {
                issue_key: issue_key.into(),
                message,
            });
        }
    };
    for issue in &mut export.issues {
        if issue.assignee_id.is_some_and(|id| id != caller) {
            issue.assignee_id = None;
            let name = issue.assignee_name.take();
            let name = name.as_deref().unwrap_or("another person");
            note(
                &issue.key,
                format!("assignee {name} was cleared; invite them to assign them again"),
            );
        }
        if issue.reporter_id != caller {
            issue.reporter_id = caller;
            let name = &issue.reporter_name;
            note(&issue.key, format!("reporter {name} is you now"));
        }
    }
    for comment in &mut export.comments {
        let author = comment.author_id;
        if author != caller {
            comment.author_id = caller;
            let name = name_of(author);
            note(
                &comment.issue_key,
                format!("a comment by {name} shows you as its author now"),
            );
        }
        let Some(editor) = comment.edited_by_id.filter(|editor| *editor != caller) else {
            continue;
        };
        comment.edited_by_id = Some(caller);
        if editor != author {
            let name = name_of(editor);
            note(
                &comment.issue_key,
                format!("a comment edited by {name} shows you as its editor now"),
            );
        }
    }
    problems
}

/// The number in a key `check` accepted.
pub fn key_number(key: &str) -> i64 {
    key.rsplit_once('-')
        .and_then(|(_, number)| number.parse().ok())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{Value, json};

    fn issue(number: i64, issue_type: &str, parent: Option<&str>) -> Value {
        json!({
            "id": number * 10, "key": format!("SHOP-{number}"), "number": number,
            "summary": format!("Issue {number}"), "description": "", "issue_type": issue_type,
            "priority": "medium", "status_id": 1, "status_name": "To Do",
            "assignee_id": 2, "assignee_name": "Bob", "reporter_id": 1, "reporter_name": "Ana",
            "points": null, "labels": ["web"], "parent_key": parent, "sprint_id": null,
            "sprint_name": null, "rank": format!("a{number}"), "done_at": null,
            "created_at": "2026-10-01T10:00:00Z", "updated_at": "2026-10-02T10:00:00Z"
        })
    }

    fn sprint(id: i64, state: &str) -> Value {
        json!({
            "id": id, "name": format!("Sprint {id}"), "goal": "", "state": state,
            "starts_at": "2026-10-01T00:00:00Z", "ends_at": "2026-10-14T23:59:00Z",
            "started_at": "2026-10-01T00:00:00Z", "closed_at": null, "overdue": false
        })
    }

    fn file() -> Value {
        json!({
            "project": {
                "id": 7, "key": "SHOP", "name": "Shop", "board_type": "scrum", "role": "admin",
                "state": "active", "archived_at": null, "archived_by": null, "trashed_at": null,
                "trashed_by": null, "purge_at": null
            },
            "members": [
                { "user_id": 1, "email": "ana@x.io", "display_name": "Ana", "role": "admin" },
                { "user_id": 2, "email": "bob@x.io", "display_name": "Bob", "role": "member" }
            ],
            "board": {
                "board_type": "scrum", "done_window_days": null,
                "columns": [{ "id": 3, "name": "To Do", "position": 0, "wip_limit": null,
                              "statuses": [{ "id": 1, "name": "To Do", "category": "todo", "column_id": 3 }] },
                            { "id": 6, "name": "Done", "position": 1, "wip_limit": null,
                              "statuses": [{ "id": 2, "name": "Done", "category": "done", "column_id": 6 }] }],
                "unmapped": [{ "id": 5, "name": "Blocked", "category": "todo", "column_id": null }]
            },
            "sprints": [sprint(4, "active")],
            "issues": [issue(1, "epic", None), issue(2, "story", Some("SHOP-1")), issue(3, "subtask", Some("SHOP-2"))],
            "comments": [{ "issue_key": "SHOP-2", "author_id": 2, "body": "Hi", "created_at": "2026-10-01T11:00:00Z",
                           "edited_at": "2026-10-01T12:00:00Z", "edited_by_id": 2 }]
        })
    }

    fn export(value: Value) -> ProjectExport {
        serde_json::from_value(value).unwrap()
    }

    fn field(error: AppError) -> String {
        match error {
            AppError::Validation(errors) => errors[0].field.clone(),
            AppError::WrongShape(error) => error.field,
            other => panic!("not a field error: {other:?}"),
        }
    }

    fn refused(change: impl FnOnce(&mut Value)) -> String {
        let mut value = file();
        change(&mut value);
        field(check(&mut export(value)).unwrap_err())
    }

    #[test]
    fn a_santi_export_passes_and_names_its_key() {
        assert_eq!(check(&mut export(file())).unwrap(), "SHOP");
    }

    #[test]
    fn limits_are_checked_before_anything_is_written() {
        let too_many_issues = refused(|value| {
            let one = issue(1, "story", None);
            value["issues"] = Value::Array(vec![one; MAX_ISSUES + 1]);
        });
        assert_eq!(too_many_issues, "issues");
        let too_many_statuses = refused(|value| {
            let statuses: Vec<Value> = (0..=MAX_STATUSES)
                .map(|n| json!({ "id": 100 + n, "name": format!("S{n}"), "category": "todo", "column_id": null }))
                .collect();
            value["board"]["unmapped"] = Value::Array(statuses);
        });
        assert_eq!(too_many_statuses, "board");
        let two_running = refused(|value| {
            value["sprints"] = json!([sprint(4, "active"), sprint(5, "active")]);
        });
        assert_eq!(two_running, "sprints");

        let mut many = export(file());
        many.sprints = vec![many.sprints[0].clone(); MAX_SPRINTS + 1];
        assert_eq!(field(check(&mut many).unwrap_err()), "sprints");
        let mut many = export(file());
        many.comments = vec![many.comments[0].clone(); MAX_COMMENTS + 1];
        assert_eq!(field(check(&mut many).unwrap_err()), "comments");
    }

    #[test]
    fn keys_and_numbers_must_belong_to_the_project() {
        assert_eq!(
            refused(|value| value["project"]["key"] = json!("no key")),
            "key"
        );
        assert_eq!(
            refused(|value| value["issues"][1]["key"] = json!("SHOP-9")),
            "issues[1].key"
        );
        assert_eq!(
            refused(|value| value["issues"][1]["key"] = json!("WEB-2")),
            "issues[1].key"
        );
        assert_eq!(
            refused(|value| value["issues"][2] = issue(2, "subtask", Some("SHOP-2"))),
            "issues[2].number"
        );
    }

    #[test]
    fn references_must_point_inside_the_file() {
        assert_eq!(
            refused(|value| value["issues"][2]["parent_key"] = json!("SHOP-99")),
            "issues[2].parent_key"
        );
        assert_eq!(
            refused(|value| value["issues"][2]["parent_key"] = json!("SHOP-1")),
            "issues[2].parent_key"
        );
        assert_eq!(
            refused(|value| value["issues"][0]["status_name"] = json!("Review")),
            "issues[0].status_name"
        );
        assert_eq!(
            refused(|value| value["issues"][0]["sprint_id"] = json!(99)),
            "issues[0].sprint_id"
        );
        assert_eq!(
            refused(|value| value["issues"][0]["labels"] = json!(["two words"])),
            "issues[0].labels"
        );
        assert_eq!(
            refused(|value| value["comments"][0]["issue_key"] = json!("SHOP-99")),
            "comments[0].issue_key"
        );
    }

    #[test]
    fn every_field_passes_the_validators_of_a_normal_write() {
        type Change = fn(&mut Value);
        let cases: [(&str, Change); 16] = [
            ("issues[0].summary", |v| {
                v["issues"][0]["summary"] = json!(" ")
            }),
            ("issues[1].description", |v| {
                v["issues"][1]["description"] = json!("a\0b")
            }),
            ("issues[1].points", |v| v["issues"][1]["points"] = json!(-1)),
            ("issues[2].points", |v| v["issues"][2]["points"] = json!(1)),
            ("comments[0].body", |v| {
                v["comments"][0]["body"] = json!("  ")
            }),
            ("sprints[0].name", |v| v["sprints"][0]["name"] = json!("")),
            ("sprints[0].goal", |v| {
                v["sprints"][0]["goal"] = json!("g".repeat(1001))
            }),
            ("sprints[0].ends_at", |v| {
                v["sprints"][0]["ends_at"] = json!("2026-09-01T00:00:00Z")
            }),
            ("sprints[1].id", |v| {
                v["sprints"] = json!([sprint(4, "active"), sprint(4, "closed")])
            }),
            ("board.columns[0].name", |v| {
                v["board"]["columns"][0]["name"] = json!(" ")
            }),
            ("board.columns[1].statuses[0].name", |v| {
                v["board"]["columns"][1]["statuses"][0]["name"] = json!("To Do")
            }),
            ("board.unmapped[0].name", |v| {
                v["board"]["unmapped"][0]["name"] = json!("Done")
            }),
            ("board.columns[1].position", |v| {
                v["board"]["columns"][1]["position"] = json!(0)
            }),
            ("board.columns", |v| {
                v["board"]["columns"][0]["statuses"][0]["category"] = json!("done")
            }),
            ("board.columns", |v| {
                v["board"]["columns"].as_array_mut().unwrap().truncate(1)
            }),
            ("board.board_type", |v| {
                v["board"]["board_type"] = json!("kanban")
            }),
        ];
        for (expected, change) in cases {
            assert_eq!(refused(change), expected);
        }
    }

    #[test]
    fn ranks_are_base_62_keys_not_ending_in_zero_and_unique() {
        for rank in ["", "a!", "a0"] {
            assert_eq!(
                refused(|value| value["issues"][1]["rank"] = json!(rank)),
                "issues[1].rank",
                "{rank:?}"
            );
        }
        assert_eq!(
            refused(|value| value["issues"][1]["rank"] = json!("a1")),
            "issues[1].rank"
        );
    }

    #[test]
    fn sprint_rules_hold_for_epics_subtasks_kanban_and_states() {
        let in_sprint =
            |value: &mut Value, index: usize| value["issues"][index]["sprint_id"] = json!(4);
        assert_eq!(refused(|value| in_sprint(value, 0)), "issues[0].sprint_id");
        assert_eq!(refused(|value| in_sprint(value, 1)), "issues[2].sprint_id");
        assert_eq!(refused(|value| in_sprint(value, 2)), "issues[2].sprint_id");
        let mut together = file();
        in_sprint(&mut together, 1);
        in_sprint(&mut together, 2);
        assert!(check(&mut export(together)).is_ok());
        assert_eq!(
            refused(|value| {
                value["project"]["board_type"] = json!("kanban");
                value["board"]["board_type"] = json!("kanban");
            }),
            "sprints"
        );
        let states: [fn(&mut Value); 3] = [
            |v| v["sprints"][0]["started_at"] = json!(null),
            |v| v["sprints"][0] = sprint(4, "closed"),
            |v| v["sprints"][0] = sprint(4, "future"),
        ];
        for change in states {
            assert_eq!(refused(change), "sprints[0].state");
        }
    }

    #[test]
    fn done_at_is_set_exactly_in_a_done_status() {
        assert_eq!(
            refused(|value| value["issues"][0]["done_at"] = json!("2026-10-03T00:00:00Z")),
            "issues[0].done_at"
        );
        assert_eq!(
            refused(|value| value["issues"][0]["status_name"] = json!("Done")),
            "issues[0].done_at"
        );
        let mut done = file();
        done["issues"][0]["status_name"] = json!("Done");
        done["issues"][0]["done_at"] = json!("2026-10-03T00:00:00Z");
        assert!(check(&mut export(done)).is_ok());
    }

    #[test]
    fn what_passes_is_stored_normalised() {
        let mut value = file();
        value["issues"][0]["labels"] = json!([" web ", "web", "pay"]);
        value["issues"][0]["summary"] = json!("  Checkout  ");
        let mut restored = export(value);
        check(&mut restored).unwrap();
        assert_eq!(restored.issues[0].labels, ["web", "pay"]);
        assert_eq!(restored.issues[0].summary, "Checkout");
    }

    #[test]
    fn only_the_caller_stays_and_everyone_else_is_listed_by_name() {
        let mut as_ana = export(file());
        let problems = resolve_people(&mut as_ana, 1);
        assert!(as_ana.issues.iter().all(|issue| issue.assignee_id.is_none()
            && issue.assignee_name.is_none()
            && issue.reporter_id == 1));
        let comment = &as_ana.comments[0];
        assert_eq!((comment.author_id, comment.edited_by_id), (1, Some(1)));
        let listed: Vec<(&str, &str)> = problems
            .iter()
            .map(|problem| (problem.issue_key.as_str(), problem.message.as_str()))
            .collect();
        assert_eq!(
            listed,
            [
                (
                    "SHOP-1",
                    "assignee Bob was cleared; invite them to assign them again"
                ),
                (
                    "SHOP-2",
                    "assignee Bob was cleared; invite them to assign them again"
                ),
                (
                    "SHOP-3",
                    "assignee Bob was cleared; invite them to assign them again"
                ),
                ("SHOP-2", "a comment by Bob shows you as its author now"),
            ]
        );

        let mut as_stranger = export(file());
        let problems = resolve_people(&mut as_stranger, 9);
        assert!(
            as_stranger
                .issues
                .iter()
                .all(|issue| issue.reporter_id == 9)
        );
        assert_eq!(problems.len(), 7);
        assert_eq!(problems[1].message, "reporter Ana is you now");
    }

    #[test]
    fn editors_and_unknown_people_are_replaced_too() {
        let mut value = file();
        value["issues"][2]["assignee_id"] = json!(9);
        value["issues"][1]["assignee_name"] = json!(null);
        value["comments"][0]["author_id"] = json!(77);
        let mut restored = export(value);

        let problems = resolve_people(&mut restored, 9);

        assert_eq!(restored.issues[2].assignee_id, Some(9), "the caller stays");
        let comment = &restored.comments[0];
        assert_eq!((comment.author_id, comment.edited_by_id), (9, Some(9)));
        let messages: Vec<&str> = problems
            .iter()
            .map(|problem| problem.message.as_str())
            .collect();
        assert!(
            messages
                .contains(&"assignee another person was cleared; invite them to assign them again")
        );
        assert!(messages.contains(&"a comment by another person shows you as its author now"));
        assert!(messages.contains(&"a comment edited by Bob shows you as its editor now"));
    }

    #[test]
    fn problems_stop_at_the_cap() {
        let mut many = export(file());
        many.comments = vec![many.comments[0].clone(); MAX_PROBLEMS * 2];
        assert_eq!(resolve_people(&mut many, 9).len(), MAX_PROBLEMS);
    }

    #[test]
    fn a_file_that_is_not_an_export_names_the_field() {
        assert_eq!(field(read(b"not json").unwrap_err()), "body");
        assert_eq!(field(read(br#"{"project": 5}"#).unwrap_err()), "project");
        assert_eq!(read(file().to_string().as_bytes()).unwrap().issues.len(), 3);
    }

    #[test]
    fn issue_numbers_come_from_keys() {
        assert_eq!(key_number("SHOP-12"), 12);
        assert_eq!(key_number("A1-B-3"), 3);
        assert_eq!(exists("SHOP").to_problem().status, 409);
        assert!(exists("SHOP").to_problem().detail.contains("SHOP"));
    }
}
