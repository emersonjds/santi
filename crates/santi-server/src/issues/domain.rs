use chrono::{DateTime, Duration, Utc};
use santi_types::boards::StatusCategory;
use santi_types::issues::{IssueFilter, IssueType, NO_PARENT, Priority, UpdateIssue};
use santi_types::projects::MemberRole;

use crate::error::{AppError, reject_nul};

/// Base-62 digits in ASCII order, so Rust and PostgreSQL (`COLLATE "C"`) sort keys the same way.
const DIGITS: &[u8] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/// D21: a key that sorts strictly between `before` and `after`; `None` means open-ended.
/// Keys never end in '0', so there is always room before any key.
pub fn rank_between(before: Option<&str>, after: Option<&str>) -> String {
    if let (Some(before), Some(after)) = (before, after) {
        assert!(
            before < after,
            "rank_between needs before < after, got {before} and {after}"
        );
    }
    let key = match (before, after) {
        (Some(before), None) => step(before.as_bytes(), true),
        (None, Some(after)) => step(after.as_bytes(), false),
        _ => midpoint(before.unwrap_or("").as_bytes(), after.map(str::as_bytes)),
    };
    String::from_utf8(key).expect("rank digits are ASCII")
}

/// A key `rank_between` can place others around: base-62 digits, not ending in '0'.
pub fn is_rank(key: &str) -> bool {
    !key.is_empty() && !key.ends_with('0') && key.bytes().all(|digit| DIGITS.contains(&digit))
}

/// D39: open-ended keys step one unit, with escape levels.
fn step(key: &[u8], up: bool) -> Vec<u8> {
    let top = DIGITS.len() - 1;
    let edge = if up { top } else { 0 };
    let level = key
        .iter()
        .take_while(|digit| digit_value(**digit) == edge)
        .count();
    let mut counter: Vec<usize> = (level..=2 * level)
        .map(|index| key.get(index).map_or(0, |digit| digit_value(*digit)))
        .collect();
    loop {
        if !nudge(&mut counter, up) || counter[0] == edge {
            let mut next = vec![DIGITS[edge]; level + 1];
            next.extend(vec![DIGITS[if up { 1 } else { top }]; level + 2]);
            return next;
        }
        if counter[level] != 0 {
            break;
        }
    }
    let mut next = vec![DIGITS[edge]; level];
    next.extend(counter.iter().map(|digit| DIGITS[*digit]));
    next
}

/// One unit up or down at the last place; false when it carries out of the first digit.
fn nudge(counter: &mut [usize], up: bool) -> bool {
    let top = DIGITS.len() - 1;
    for digit in counter.iter_mut().rev() {
        match (up, *digit) {
            (true, value) if value == top => *digit = 0,
            (false, 0) => *digit = top,
            (true, value) => {
                *digit = value + 1;
                return true;
            }
            (false, value) => {
                *digit = value - 1;
                return true;
            }
        }
    }
    false
}

/// Fractional-index midpoint of two digit strings read as fractions (0.low and 0.high; missing high = 1).
fn midpoint(low: &[u8], high: Option<&[u8]>) -> Vec<u8> {
    if let Some(high) = high {
        let shared = common_prefix_length(low, high);
        if shared > 0 {
            let mut key = high[..shared].to_vec();
            key.extend(midpoint(
                low.get(shared..).unwrap_or_default(),
                Some(&high[shared..]),
            ));
            return key;
        }
    }
    let low_digit = low.first().map_or(0, |digit| digit_value(*digit));
    let high_digit = high.map_or(DIGITS.len(), |high| digit_value(high[0]));
    if high_digit - low_digit > 1 {
        return vec![DIGITS[(low_digit + high_digit) / 2]];
    }
    if let Some(high) = high
        && high.len() > 1
    {
        return vec![high[0]];
    }
    let mut key = vec![DIGITS[low_digit]];
    key.extend(midpoint(low.get(1..).unwrap_or_default(), None));
    key
}

/// Leading digits both keys share, padding `low` with '0' (0.5 equals 0.50).
fn common_prefix_length(low: &[u8], high: &[u8]) -> usize {
    high.iter()
        .enumerate()
        .take_while(|(index, digit)| low.get(*index).copied().unwrap_or(b'0') == **digit)
        .count()
}

fn digit_value(digit: u8) -> usize {
    DIGITS
        .iter()
        .position(|candidate| *candidate == digit)
        .expect("rank keys use base-62 digits")
}

/// The fields PATCH may change, as stored.
#[derive(Debug, Clone, PartialEq)]
pub struct EditableIssue {
    pub id: i64,
    pub summary: String,
    pub description: String,
    pub issue_type: IssueType,
    pub priority: Priority,
    pub assignee_id: Option<i64>,
    pub points: Option<f64>,
    pub labels: Vec<String>,
    pub parent_id: Option<i64>,
    /// Read for sprint planning; written by `change_sprint`, not with the plain fields.
    pub sprint_id: Option<i64>,
}

pub fn check_summary(summary: &str) -> Result<String, AppError> {
    reject_nul("summary", summary)?;
    let summary = summary.trim();
    if summary.is_empty() || summary.chars().count() > 255 {
        return Err(AppError::invalid(
            "summary",
            "must have 1 to 255 characters",
        ));
    }
    Ok(summary.to_string())
}

/// Characters (Unicode scalars) of a description or comment body (D50); migrations 0013 and 0021
/// hold the same limit.
pub const MAX_RICH_TEXT: usize = 65_536;

pub fn check_description(description: &str) -> Result<String, AppError> {
    reject_nul("description", description)?;
    if description.chars().count() > MAX_RICH_TEXT {
        return Err(AppError::invalid(
            "description",
            "must have at most 65536 characters",
        ));
    }
    Ok(description.to_string())
}

pub fn normalize_labels(labels: Vec<String>) -> Result<Vec<String>, AppError> {
    let mut normalized: Vec<String> = Vec::new();
    for label in labels {
        reject_nul("labels", &label)?;
        let label = label.trim().to_string();
        if label.is_empty() || normalized.contains(&label) {
            continue;
        }
        if label.chars().count() > 50 || label.contains(char::is_whitespace) {
            return Err(AppError::invalid(
                "labels",
                "labels are single words of up to 50 characters",
            ));
        }
        normalized.push(label);
    }
    if normalized.len() > 20 {
        return Err(AppError::invalid(
            "labels",
            "an issue takes at most 20 labels",
        ));
    }
    Ok(normalized)
}

/// D11: subtasks carry no points; points are finite and not negative.
pub fn check_points(issue_type: IssueType, points: Option<f64>) -> Result<(), AppError> {
    let Some(points) = points else {
        return Ok(());
    };
    if issue_type == IssueType::Subtask {
        return Err(AppError::invalid("points", "subtasks carry no points"));
    }
    if !points.is_finite() || points < 0.0 {
        return Err(AppError::invalid("points", "must be zero or more"));
    }
    Ok(())
}

/// A subtask hangs under a story, task or bug; those hang under an epic or nothing; an epic has no parent.
pub fn check_parent(child: IssueType, parent: Option<IssueType>) -> Result<(), AppError> {
    let (allowed, message) = match child {
        IssueType::Subtask => (
            matches!(
                parent,
                Some(IssueType::Story | IssueType::Task | IssueType::Bug)
            ),
            "a subtask needs a story, task or bug as parent",
        ),
        IssueType::Epic => (parent.is_none(), "an epic has no parent"),
        _ => (
            matches!(parent, None | Some(IssueType::Epic)),
            "only an epic can be the parent",
        ),
    };
    if !allowed {
        return Err(AppError::invalid("parent", message));
    }
    Ok(())
}

pub fn check_type_change(from: IssueType, to: IssueType) -> Result<(), AppError> {
    let standard = |issue_type| {
        matches!(
            issue_type,
            IssueType::Story | IssueType::Task | IssueType::Bug
        )
    };
    if from != to && !(standard(from) && standard(to)) {
        return Err(AppError::invalid(
            "issue_type",
            "only stories, tasks and bugs can change type",
        ));
    }
    Ok(())
}

pub fn check_parent_change(issue_type: IssueType) -> Result<(), AppError> {
    if issue_type == IssueType::Subtask {
        return Err(AppError::invalid("parent", "a subtask keeps its parent"));
    }
    Ok(())
}

/// `SANTI-12` → 12, only for keys of this project.
pub fn parse_issue_key(field: &str, project_key: &str, key: &str) -> Result<i64, AppError> {
    let number = key
        .trim()
        .strip_prefix(project_key)
        .and_then(|rest| rest.strip_prefix('-'))
        .and_then(|digits| digits.parse::<i64>().ok());
    number.filter(|number| *number > 0).ok_or_else(|| {
        AppError::invalid(field, "must be an issue key of this project, like SANTI-12")
    })
}

/// D8: the done timer starts when an issue is created straight into a done status.
pub fn done_at_on_create(category: StatusCategory, now: DateTime<Utc>) -> Option<DateTime<Utc>> {
    (category == StatusCategory::Done).then_some(now)
}

/// D8: the done timer starts on entering a done status and stops on leaving it.
pub fn next_done_at(
    from: StatusCategory,
    to: StatusCategory,
    current: Option<DateTime<Utc>>,
    now: DateTime<Utc>,
) -> Option<DateTime<Utc>> {
    if to != StatusCategory::Done {
        return None;
    }
    if from == StatusCategory::Done {
        return current;
    }
    Some(now)
}

/// Applies the plain fields of a PATCH; assignee and parent need the database and are applied by the service.
pub fn apply_field_changes(
    current: &EditableIssue,
    change: &UpdateIssue,
) -> Result<EditableIssue, AppError> {
    let mut next = current.clone();
    if let Some(summary) = &change.summary {
        next.summary = check_summary(summary)?;
    }
    if let Some(description) = &change.description {
        next.description = check_description(description)?;
    }
    if let Some(issue_type) = change.issue_type {
        check_type_change(current.issue_type, issue_type)?;
        next.issue_type = issue_type;
    }
    if let Some(priority) = change.priority {
        next.priority = priority;
    }
    if let Some(points) = change.points {
        next.points = points;
    }
    if let Some(labels) = &change.labels {
        next.labels = normalize_labels(labels.clone())?;
    }
    check_points(next.issue_type, next.points)?;
    Ok(next)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Anchor {
    Keep,
    After(i64),
    Before(i64),
}

pub fn anchor_for(
    project_key: &str,
    moving_number: i64,
    after: Option<&str>,
    before: Option<&str>,
) -> Result<Anchor, AppError> {
    let anchor = match (after, before) {
        (None, None) => return Ok(Anchor::Keep),
        (Some(_), Some(_)) => {
            return Err(AppError::invalid(
                "after",
                "send either after or before, not both",
            ));
        }
        (Some(key), None) => Anchor::After(parse_issue_key("after", project_key, key)?),
        (None, Some(key)) => Anchor::Before(parse_issue_key("before", project_key, key)?),
    };
    if matches!(anchor, Anchor::After(number) | Anchor::Before(number) if number == moving_number) {
        return Err(AppError::invalid(
            "after",
            "an issue cannot be placed next to itself",
        ));
    }
    Ok(anchor)
}

/// `ILIKE` pattern matching the text anywhere; `%`, `_` and `\` in the text match literally.
pub fn like_pattern(text: Option<&str>) -> Option<String> {
    let text = text?.trim();
    if text.is_empty() {
        return None;
    }
    let escaped = text
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_");
    Some(format!("%{escaped}%"))
}

/// SAN-214: the issue number a search names, as `12` or this project's `KEY-12` (any case).
pub fn search_number(project_key: &str, text: Option<&str>) -> Option<i64> {
    let text = text?.trim();
    let digits = match text.split_once('-') {
        Some((key, digits)) if key.eq_ignore_ascii_case(project_key) => digits,
        Some(_) => return None,
        None => text,
    };
    if digits.is_empty() || !digits.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    digits.parse().ok()
}

/// The filter in the shape the search query binds.
#[derive(Debug, Clone, PartialEq)]
pub struct SearchQuery {
    pub assignee_ids: Vec<i64>,
    pub unassigned: bool,
    pub types: Vec<IssueType>,
    pub labels: Vec<String>,
    pub parent_numbers: Vec<i64>,
    pub no_parent: bool,
    pub pattern: Option<String>,
    pub number: Option<i64>,
    pub updated_since: Option<DateTime<Utc>>,
    pub categories: Vec<StatusCategory>,
}

/// SB-26 and D18: "recently updated" means changed within the last 24 hours.
pub fn updated_since(recently_updated: bool, now: DateTime<Utc>) -> Option<DateTime<Utc>> {
    recently_updated.then(|| now - Duration::hours(24))
}

pub fn to_search_query(
    project_key: &str,
    filter: &IssueFilter,
    now: DateTime<Utc>,
) -> Result<SearchQuery, AppError> {
    reject_nul("q", filter.q.as_deref().unwrap_or_default())?;
    for label in &filter.label {
        reject_nul("label", label)?;
    }
    let parent_numbers = filter
        .parent
        .iter()
        .filter(|key| *key != NO_PARENT)
        .map(|key| parse_issue_key("parent", project_key, key))
        .collect::<Result<Vec<i64>, AppError>>()?;
    Ok(SearchQuery {
        assignee_ids: filter.assignee.clone(),
        unassigned: filter.unassigned,
        types: filter.issue_type.clone(),
        labels: filter.label.clone(),
        parent_numbers,
        no_parent: filter.parent.iter().any(|key| key == NO_PARENT),
        pattern: like_pattern(filter.q.as_deref()),
        number: search_number(project_key, filter.q.as_deref()),
        updated_since: updated_since(filter.recently_updated, now),
        categories: Vec::new(),
    })
}

pub fn check_comment_body(body: &str) -> Result<String, AppError> {
    reject_nul("body", body)?;
    let body = body.trim_end();
    let first = body
        .find(|letter: char| !letter.is_whitespace())
        .unwrap_or(0);
    let body = &body[body[..first].rfind('\n').map_or(0, |at| at + 1)..];
    if body.is_empty() || body.chars().count() > MAX_RICH_TEXT {
        return Err(AppError::invalid("body", "must have 1 to 65536 characters"));
    }
    Ok(body.to_string())
}

/// D52: the new body, or `None` when the text stays the same (OQ-13: no edited marker).
pub fn comment_edit(current: &str, input: &str) -> Result<Option<String>, AppError> {
    let body = check_comment_body(input)?;
    Ok((body != current).then_some(body))
}

/// D40: an admin, or the member who reported the issue.
pub fn check_delete(role: MemberRole, user_id: i64, reporter_id: i64) -> Result<(), AppError> {
    if role != MemberRole::Admin && user_id != reporter_id {
        return Err(AppError::Forbidden);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use santi_types::boards::StatusCategory;
    use santi_types::issues::{IssueFilter, IssueType::*, Priority, UpdateIssue};

    #[test]
    fn first_rank_is_the_middle_digit() {
        assert_eq!(rank_between(None, None), "V");
    }

    #[test]
    fn ranks_fall_strictly_between_their_neighbours() {
        let cases = [
            (Some("A"), Some("B")),
            (Some("A"), Some("A1")),
            (Some("Az"), Some("B")),
            (None, Some("1")),
            (Some("z"), None),
            (Some("A0V"), Some("A1")),
        ];
        for (before, after) in cases {
            let rank = rank_between(before, after);
            assert!(
                before.is_none_or(|before| before < rank.as_str()),
                "{before:?} < {rank}"
            );
            assert!(
                after.is_none_or(|after| rank.as_str() < after),
                "{rank} < {after:?}"
            );
            assert!(!rank.ends_with('0'));
        }
    }

    #[test]
    #[should_panic(expected = "before < after")]
    fn rank_between_refuses_inverted_bounds() {
        rank_between(Some("B"), Some("A"));
    }

    #[test]
    fn ranks_keep_order_over_many_random_inserts() {
        let mut ranks = vec![rank_between(None, None)];
        let mut seed: u64 = 42;
        for _ in 0..2000 {
            seed = seed
                .wrapping_mul(6_364_136_223_846_793_005)
                .wrapping_add(1_442_695_040_888_963_407);
            let slot = (seed >> 33) as usize % (ranks.len() + 1);
            let before = slot.checked_sub(1).map(|index| ranks[index].as_str());
            let after = ranks.get(slot).map(String::as_str);
            let rank = rank_between(before, after);
            assert!(before.is_none_or(|before| before < rank.as_str()));
            assert!(after.is_none_or(|after| rank.as_str() < after));
            ranks.insert(slot, rank);
        }
        assert!(ranks.windows(2).all(|pair| pair[0] < pair[1]));
    }

    #[test]
    fn repeated_inserts_into_one_gap_grow_slowly() {
        let mut after = rank_between(None, None);
        for _ in 0..60 {
            after = rank_between(Some("U"), Some(&after));
        }
        assert!(after.len() < 20, "{after}");
    }

    #[test]
    fn appending_or_prepending_ten_thousand_keys_stays_short() {
        let mut appended = vec![rank_between(None, None)];
        let mut prepended = appended.clone();
        for _ in 0..10_000 {
            appended.push(rank_between(appended.last().map(String::as_str), None));
            prepended.push(rank_between(None, prepended.last().map(String::as_str)));
        }
        assert!(appended.windows(2).all(|pair| pair[0] < pair[1]));
        assert!(prepended.windows(2).all(|pair| pair[0] > pair[1]));
        for key in appended.iter().chain(&prepended) {
            assert!(key.len() <= 5 && !key.ends_with('0'), "{key}");
        }
        let between = rank_between(Some(&appended[4_000]), Some(&appended[4_001]));
        assert!(appended[4_000] < between && between < appended[4_001]);
    }

    #[test]
    fn open_ended_keys_step_past_any_existing_key() {
        let cases = [
            "V", "y", "z", "zyz", "zzV", "zzVzzzz", "1", "0zz", "AB0C", "0V",
        ];
        for key in cases {
            let after = rank_between(Some(key), None);
            let before = rank_between(None, Some(key));
            assert!(
                key < after.as_str() && !after.ends_with('0'),
                "{key} < {after}"
            );
            assert!(
                before.as_str() < key && !before.ends_with('0'),
                "{before} < {key}"
            );
        }
    }

    #[test]
    fn parent_rules() {
        assert!(check_parent(Subtask, Some(Story)).is_ok());
        assert!(check_parent(Subtask, Some(Bug)).is_ok());
        assert!(check_parent(Subtask, Some(Epic)).is_err());
        assert!(check_parent(Subtask, None).is_err());
        assert!(check_parent(Story, Some(Epic)).is_ok());
        assert!(check_parent(Story, Some(Task)).is_err());
        assert!(check_parent(Story, None).is_ok());
        assert!(check_parent(Epic, Some(Epic)).is_err());
        assert!(check_parent(Epic, None).is_ok());
    }

    #[test]
    fn only_stories_tasks_and_bugs_change_type() {
        assert!(check_type_change(Story, Bug).is_ok());
        assert!(check_type_change(Epic, Epic).is_ok());
        assert!(check_type_change(Epic, Story).is_err());
        assert!(check_type_change(Task, Subtask).is_err());
    }

    #[test]
    fn subtasks_keep_their_parent() {
        assert!(check_parent_change(Subtask).is_err());
        assert!(check_parent_change(Story).is_ok());
    }

    #[test]
    fn points_rules() {
        assert!(check_points(Story, Some(3.5)).is_ok());
        assert!(check_points(Subtask, Some(1.0)).is_err());
        assert!(check_points(Story, Some(-1.0)).is_err());
        assert!(check_points(Story, Some(f64::NAN)).is_err());
        assert!(check_points(Subtask, None).is_ok());
    }

    #[test]
    fn labels_are_trimmed_deduplicated_and_single_words() {
        let labels =
            normalize_labels(vec![" ui ".into(), "ui".into(), "".into(), "api".into()]).unwrap();
        assert_eq!(labels, ["ui", "api"]);
        assert!(normalize_labels(vec!["two words".into()]).is_err());
        assert!(normalize_labels((0..21).map(|index| format!("l{index}")).collect()).is_err());
    }

    #[test]
    fn summary_is_trimmed_and_bounded() {
        assert_eq!(check_summary("  Fix login ").unwrap(), "Fix login");
        assert!(check_summary("   ").is_err());
        assert!(check_summary(&"x".repeat(256)).is_err());
    }

    fn invalid_message(error: AppError) -> String {
        let AppError::Validation(errors) = error else {
            panic!("expected a validation error");
        };
        format!("{}: {}", errors[0].field, errors[0].message)
    }

    #[test]
    fn description_and_comment_share_one_cap_in_unicode_scalars() {
        assert_eq!(MAX_RICH_TEXT, 65_536);
        let at_cap = "é".repeat(65_536);
        let over_cap = "é".repeat(65_537);

        assert!(check_description(&at_cap).is_ok());
        assert!(check_comment_body(&at_cap).is_ok());
        assert_eq!(
            invalid_message(check_description(&over_cap).unwrap_err()),
            "description: must have at most 65536 characters"
        );
        assert_eq!(
            invalid_message(check_comment_body(&over_cap).unwrap_err()),
            "body: must have 1 to 65536 characters"
        );
    }

    #[test]
    fn issue_keys_must_belong_to_the_project() {
        assert_eq!(parse_issue_key("parent", "SANTI", "SANTI-12").unwrap(), 12);
        assert!(parse_issue_key("parent", "SANTI", "OTHER-12").is_err());
        assert!(parse_issue_key("parent", "SANTI", "SANTI-0").is_err());
        assert!(parse_issue_key("parent", "SANTI", "SANTI12").is_err());
    }

    #[test]
    fn done_at_is_set_only_for_done_statuses() {
        let now = chrono::Utc::now();
        assert_eq!(done_at_on_create(StatusCategory::Done, now), Some(now));
        assert_eq!(done_at_on_create(StatusCategory::Todo, now), None);
    }

    #[test]
    fn done_timer_starts_on_entering_done_and_stops_on_leaving() {
        let then = chrono::Utc::now() - chrono::Duration::days(3);
        let now = chrono::Utc::now();
        assert_eq!(
            next_done_at(StatusCategory::Todo, StatusCategory::Done, None, now),
            Some(now)
        );
        assert_eq!(
            next_done_at(StatusCategory::Done, StatusCategory::Done, Some(then), now),
            Some(then)
        );
        assert_eq!(
            next_done_at(
                StatusCategory::Done,
                StatusCategory::InProgress,
                Some(then),
                now
            ),
            None
        );
        assert_eq!(
            next_done_at(StatusCategory::Todo, StatusCategory::InProgress, None, now),
            None
        );
    }

    #[test]
    fn field_changes_apply_only_what_is_sent() {
        let current = EditableIssue {
            id: 1,
            summary: "Old".into(),
            description: "".into(),
            issue_type: Story,
            priority: Priority::Medium,
            assignee_id: Some(7),
            points: Some(3.0),
            labels: vec![],
            parent_id: None,
            sprint_id: None,
        };
        let change = UpdateIssue {
            summary: Some("New".into()),
            points: Some(None),
            ..UpdateIssue::default()
        };

        let next = apply_field_changes(&current, &change).unwrap();

        assert_eq!(next.summary, "New");
        assert_eq!(next.points, None);
        assert_eq!(next.assignee_id, Some(7));
    }

    #[test]
    fn anchors_are_parsed_and_checked() {
        assert_eq!(anchor_for("SANTI", 1, None, None).unwrap(), Anchor::Keep);
        assert_eq!(
            anchor_for("SANTI", 1, Some("SANTI-2"), None).unwrap(),
            Anchor::After(2)
        );
        assert_eq!(
            anchor_for("SANTI", 1, None, Some("SANTI-3")).unwrap(),
            Anchor::Before(3)
        );
        assert!(anchor_for("SANTI", 1, Some("SANTI-2"), Some("SANTI-3")).is_err());
        assert!(anchor_for("SANTI", 1, Some("SANTI-1"), None).is_err());
        assert!(anchor_for("SANTI", 1, None, Some("OTHER-3")).is_err());
    }

    #[test]
    fn free_text_becomes_an_escaped_like_pattern() {
        assert_eq!(like_pattern(Some(" login ")), Some("%login%".into()));
        assert_eq!(
            like_pattern(Some("50%_off\\")),
            Some("%50\\%\\_off\\\\%".into())
        );
        assert_eq!(like_pattern(Some("  ")), None);
        assert_eq!(like_pattern(None), None);
    }

    #[test]
    fn search_text_names_an_issue_number_only_as_a_bare_number_or_this_projects_key() {
        assert_eq!(search_number("SAN", Some("12")), Some(12));
        assert_eq!(search_number("SAN", Some("san-12")), Some(12));
        assert_eq!(search_number("SAN", Some(" SAN-12 ")), Some(12));
        assert_eq!(search_number("SAN", Some("SAN-012")), Some(12));
        assert_eq!(search_number("SAN", Some("OPS-12")), None);
        assert_eq!(search_number("SAN", Some("SAN-")), None);
        assert_eq!(search_number("SAN", Some("SAN")), None);
        assert_eq!(search_number("SAN", Some("12a")), None);
        assert_eq!(search_number("SAN", Some("+12")), None);
        assert_eq!(search_number("SAN", Some("99999999999999999999")), None);
        assert_eq!(search_number("SAN", None), None);
    }

    #[test]
    fn filters_become_a_search_query() {
        let filter = IssueFilter {
            parent: vec!["SANTI-4".into()],
            q: Some("bug".into()),
            ..IssueFilter::default()
        };
        let query = to_search_query("SANTI", &filter, Utc::now()).unwrap();
        assert_eq!(query.parent_numbers, [4]);
        assert_eq!(query.pattern.as_deref(), Some("%bug%"));
        let bad = IssueFilter {
            parent: vec!["OTHER-4".into()],
            ..IssueFilter::default()
        };
        assert!(to_search_query("SANTI", &bad, Utc::now()).is_err());
    }

    #[test]
    fn recently_updated_means_the_last_day() {
        let now = "2026-10-16T12:00:00Z".parse::<DateTime<Utc>>().unwrap();
        assert_eq!(
            updated_since(true, now),
            Some("2026-10-15T12:00:00Z".parse().unwrap())
        );
        assert_eq!(updated_since(false, now), None);
        let filter = IssueFilter {
            recently_updated: true,
            ..IssueFilter::default()
        };
        let query = to_search_query("SANTI", &filter, now).unwrap();
        assert_eq!(query.updated_since, updated_since(true, now));
    }

    #[test]
    fn comment_body_loses_blank_lines_and_trailing_space_and_is_required() {
        assert_eq!(check_comment_body(" hi ").unwrap(), " hi");
        assert_eq!(
            check_comment_body(" \n\n    let x = 1\n  \n").unwrap(),
            "    let x = 1"
        );
        assert!(check_comment_body("  ").is_err());
        assert!(check_comment_body(" \n\t\n ").is_err());
    }

    #[test]
    fn a_comment_edit_that_keeps_the_text_changes_nothing() {
        assert_eq!(comment_edit("hi", "\nhi \n").unwrap(), None);
        assert_eq!(comment_edit("hi", "hello").unwrap(), Some("hello".into()));
        assert!(comment_edit("hi", "  ").is_err());
    }

    #[test]
    fn admins_and_the_reporter_delete_other_members_do_not() {
        assert_eq!(check_delete(MemberRole::Admin, 1, 2), Ok(()));
        assert_eq!(check_delete(MemberRole::Member, 2, 2), Ok(()));
        assert_eq!(
            check_delete(MemberRole::Member, 1, 2),
            Err(AppError::Forbidden)
        );
    }
}
