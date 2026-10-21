use std::collections::{HashMap, HashSet};

use santi_types::FieldError;
use santi_types::auth::ProjectExport;
use santi_types::boards::Status;
use santi_types::issues::IssueType;
use santi_types::projects::RestoreProblem;
use santi_types::sprints::SprintState;

use crate::error::{AppError, wrong_shape};
use crate::imports::domain::MAX_PROBLEMS;
use crate::{boards, issues, projects};

pub const MAX_ISSUES: usize = 50_000;
pub const MAX_STATUSES: usize = 500;

pub const NOT_RESTORED: &str = "Attachments, notifications and issue history are not in an export \
and were not restored; closed sprints report their issues as they are now.";

/// The body as one project of `GET /api/me/export`; a wrong shape names the field.
pub fn read(bytes: &[u8]) -> Result<ProjectExport, AppError> {
    let mut json = serde_json::Deserializer::from_slice(bytes);
    serde_path_to_error::deserialize(&mut json).map_err(|error| wrong_shape(&error.to_string()))
}

/// Refuses a file santi could not have written: limits, then every key, number, parent, status,
/// sprint and label against the file itself. Returns the project key.
pub fn check(export: &ProjectExport) -> Result<String, AppError> {
    let key = projects::domain::check_project_key(&export.project.key)?;
    projects::domain::check_project_name(&export.project.name)?;
    let board = &export.board;
    let board_type = export.project.board_type;
    let statuses: Vec<&Status> = board
        .columns
        .iter()
        .flat_map(|column| &column.statuses)
        .chain(&board.unmapped)
        .collect();
    if statuses.len() > MAX_STATUSES || board.columns.len() > MAX_STATUSES {
        return Err(AppError::invalid(
            "board",
            "a project holds at most 500 statuses and 500 columns",
        ));
    }
    boards::domain::check_done_window(board_type, board.done_window_days).map_err(at("board"))?;
    for column in &board.columns {
        boards::domain::check_wip_limit(board_type, column.wip_limit).map_err(at("board"))?;
    }
    let status_names: HashSet<&str> = statuses.iter().map(|status| status.name.as_str()).collect();
    if export.issues.len() > MAX_ISSUES {
        return Err(AppError::invalid(
            "issues",
            "a project holds at most 50,000 issues",
        ));
    }
    let running = export
        .sprints
        .iter()
        .filter(|sprint| sprint.state == SprintState::Active);
    if running.count() > 1 {
        return Err(AppError::invalid(
            "sprints",
            "at most one sprint runs at a time",
        ));
    }
    let sprint_ids: HashSet<i64> = export.sprints.iter().map(|sprint| sprint.id).collect();
    let mut types: HashMap<&str, IssueType> = HashMap::with_capacity(export.issues.len());
    let mut numbers = HashSet::with_capacity(export.issues.len());
    for (index, issue) in export.issues.iter().enumerate() {
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
        if !status_names.contains(issue.status_name.as_str()) {
            return Err(AppError::invalid(
                &field("status_name"),
                "names no status of the board",
            ));
        }
        if issue.sprint_id.is_some_and(|id| !sprint_ids.contains(&id)) {
            return Err(AppError::invalid(
                &field("sprint_id"),
                "names no sprint in the file",
            ));
        }
        issues::domain::normalize_labels(issue.labels.clone()).map_err(at(&field("labels")))?;
        types.insert(&issue.key, issue.issue_type);
    }
    for (index, issue) in export.issues.iter().enumerate() {
        let parent = match &issue.parent_key {
            Some(parent) => Some(*types.get(parent.as_str()).ok_or_else(|| {
                AppError::invalid(
                    &format!("issues[{index}].parent_key"),
                    "names no issue in the file",
                )
            })?),
            None => None,
        };
        issues::domain::check_parent(issue.issue_type, parent)
            .map_err(at(&format!("issues[{index}].parent_key")))?;
    }
    for (index, comment) in export.comments.iter().enumerate() {
        if !types.contains_key(comment.issue_key.as_str()) {
            return Err(AppError::invalid(
                &format!("comments[{index}].issue_key"),
                "names no issue in the file",
            ));
        }
    }
    Ok(key)
}

/// Moves a validation error onto the field of the file it came from.
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
        other => other,
    }
}

pub fn exists(key: &str) -> AppError {
    AppError::conflict(
        "project-exists",
        &format!("A project with the key {key} already exists here; nothing was restored."),
    )
}

/// Every user the file names.
pub fn people(export: &ProjectExport) -> Vec<i64> {
    let members = export.members.iter().map(|member| member.user_id);
    let issues = export
        .issues
        .iter()
        .flat_map(|issue| [Some(issue.reporter_id), issue.assignee_id])
        .flatten();
    let comments = export
        .comments
        .iter()
        .flat_map(|comment| [Some(comment.author_id), comment.edited_by_id])
        .flatten();
    let all: HashSet<i64> = members.chain(issues).chain(comments).collect();
    all.into_iter().collect()
}

/// Users missing on this instance give way to the caller: assignees are cleared, reporters and
/// comment authors become the caller. Members are kept once each, the caller left out (it joins
/// as admin). Returns the changes, the first `MAX_PROBLEMS`.
pub fn resolve_people(
    export: &mut ProjectExport,
    live: &HashSet<i64>,
    caller: i64,
) -> Vec<RestoreProblem> {
    let mut seen = HashSet::from([caller]);
    export
        .members
        .retain(|member| live.contains(&member.user_id) && seen.insert(member.user_id));
    let mut problems = Vec::new();
    let mut note = |issue_key: &str, message: String| {
        problems.push(RestoreProblem {
            issue_key: issue_key.into(),
            message,
        })
    };
    for issue in &mut export.issues {
        if issue.assignee_id.is_some_and(|id| !live.contains(&id)) {
            issue.assignee_id = None;
            let name = issue.assignee_name.take().unwrap_or_default();
            note(
                &issue.key,
                format!("assignee {name} is not on this instance; left unassigned"),
            );
        }
        if !live.contains(&issue.reporter_id) {
            issue.reporter_id = caller;
            let name = &issue.reporter_name;
            note(
                &issue.key,
                format!("reporter {name} is not on this instance; you are the reporter now"),
            );
        }
    }
    for comment in &mut export.comments {
        if !live.contains(&comment.author_id) {
            comment.author_id = caller;
            note(
                &comment.issue_key,
                "a comment's author is not on this instance; you are its author now".into(),
            );
        }
        if comment.edited_by_id.is_some_and(|id| !live.contains(&id)) {
            comment.edited_by_id = Some(caller);
        }
    }
    problems.truncate(MAX_PROBLEMS);
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
                              "statuses": [{ "id": 1, "name": "To Do", "category": "todo", "column_id": 3 }] }],
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
        field(check(&export(value)).unwrap_err())
    }

    #[test]
    fn a_santi_export_passes_and_names_its_key() {
        assert_eq!(check(&export(file())).unwrap(), "SHOP");
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
    fn people_missing_here_are_replaced_and_listed() {
        let mut value = file();
        value["issues"][2]["assignee_id"] = json!(1);
        value["members"][1]["user_id"] = json!(1);
        let mut restored = export(value);
        let mut wanted = people(&restored);
        wanted.sort();
        assert_eq!(wanted, vec![1, 2]);

        let problems = resolve_people(&mut restored, &HashSet::from([1]), 9);

        assert_eq!(
            restored.members.len(),
            1,
            "user 2 is gone, user 1 is listed once"
        );
        let mut caller_listed = export(file());
        resolve_people(&mut caller_listed, &HashSet::from([1, 2]), 1);
        assert_eq!(
            caller_listed.members[0].user_id, 2,
            "the caller joins as admin"
        );
        let [epic, story, subtask] = &restored.issues[..] else {
            panic!()
        };
        assert_eq!((epic.assignee_id, epic.reporter_id), (None, 1));
        assert_eq!(story.assignee_id, None);
        assert_eq!(subtask.assignee_id, Some(1));
        let comment = &restored.comments[0];
        assert_eq!((comment.author_id, comment.edited_by_id), (9, Some(9)));
        let keys: Vec<&str> = problems
            .iter()
            .map(|problem| problem.issue_key.as_str())
            .collect();
        assert_eq!(keys, ["SHOP-1", "SHOP-2", "SHOP-2"]);
        assert!(
            problems[0].message.contains("Bob"),
            "{}",
            problems[0].message
        );

        let mut missing_reporter = export(file());
        let problems = resolve_people(&mut missing_reporter, &HashSet::from([2]), 9);
        assert!(
            missing_reporter
                .issues
                .iter()
                .all(|issue| issue.reporter_id == 9)
        );
        assert_eq!(missing_reporter.members.len(), 1);
        assert_eq!(problems.len(), 3);
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
