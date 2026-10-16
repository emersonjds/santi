//! Synthetic dataset for load tests and the query-budget guard (D39): one scrum and one kanban project.

use chrono::{Duration, Utc};
use santi_types::auth::Register;
use santi_types::boards::StatusCategory;
use santi_types::projects::{BoardType, CreateProject};
use sqlx::{PgConnection, PgPool};

use crate::auth::extract::CurrentUser;
use crate::error::AppError;
use crate::issues::domain::rank_between;
use crate::{auth, boards, projects, sprints};

pub const OWNER_EMAIL: &str = "owner@perf.santi.test";
pub const PASSWORD: &str = "santi-perf-password";
pub const SCRUM_KEY: &str = "PERF";
pub const KANBAN_KEY: &str = "FLOW";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SeedSize {
    pub issues: usize,
    pub users: usize,
    pub sprints: usize,
}

impl Default for SeedSize {
    fn default() -> Self {
        SeedSize {
            issues: 5000,
            users: 50,
            sprints: 20,
        }
    }
}

impl SeedSize {
    /// `--issues N --users N --sprints N`, each optional.
    pub fn from_args(args: &[String]) -> Result<Self, String> {
        let mut size = SeedSize::default();
        for pair in args.chunks(2) {
            let value = pair.get(1).and_then(|value| value.parse().ok());
            let value = value.ok_or_else(|| format!("{} needs a number", pair[0]))?;
            match pair[0].as_str() {
                "--issues" => size.issues = value,
                "--users" => size.users = value,
                "--sprints" => size.sprints = value,
                flag => return Err(format!("unknown flag {flag}")),
            }
        }
        Ok(size)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Slot {
    Closed(usize),
    Active,
    Future,
    Backlog,
}

#[derive(Debug, Clone, PartialEq)]
struct Row {
    number: i64,
    issue_type: &'static str,
    category: StatusCategory,
    parent: Option<i64>,
    slot: Slot,
    days_ago: i64,
}

const VERBS: [&str; 8] = [
    "Fix", "Add", "Refactor", "Improve", "Remove", "Document", "Migrate", "Optimize",
];
const NOUNS: [&str; 10] = [
    "login form",
    "sprint report",
    "board column",
    "search index",
    "comment thread",
    "export job",
    "rate limiter",
    "avatar upload",
    "webhook retry",
    "CSV import",
];
const LABELS: [&str; 6] = ["frontend", "backend", "infra", "ux", "perf", "security"];
const POINTS: [f64; 5] = [1.0, 2.0, 3.0, 5.0, 8.0];

/// Epics first, then parents (half under an epic), then subtasks; `closed` scrum sprints hold
/// ~60% of the parents as done work, then one active and one future sprint, the rest is backlog.
fn plan(issues: usize, closed: Option<usize>) -> Vec<Row> {
    let epics = (issues / 100).max(1);
    let parents = (issues * 4 / 5).saturating_sub(epics).max(1);
    let subtasks = issues.saturating_sub(epics + parents);
    let per_sprint = closed.map_or(0, |closed| parents * 3 / 5 / closed.max(1));
    let closed = closed.unwrap_or(0);
    let mut rows = Vec::with_capacity(issues);
    for index in 0..epics {
        rows.push(Row {
            number: rows.len() as i64 + 1,
            issue_type: "epic",
            category: if index % 3 == 0 {
                StatusCategory::Done
            } else {
                StatusCategory::Todo
            },
            parent: None,
            slot: Slot::Backlog,
            days_ago: 0,
        });
    }
    for index in 0..parents {
        let sprint = index / per_sprint.max(1);
        let slot = match sprint {
            _ if per_sprint == 0 => Slot::Backlog,
            sprint if sprint < closed => Slot::Closed(sprint),
            sprint if sprint == closed => Slot::Active,
            sprint if sprint == closed + 1 => Slot::Future,
            _ => Slot::Backlog,
        };
        let category = match (slot, index % 8) {
            (Slot::Closed(_), _) => StatusCategory::Done,
            (Slot::Active | Slot::Backlog, 0) => StatusCategory::InProgress,
            (Slot::Active, 1 | 2) => StatusCategory::Done,
            (Slot::Backlog, 2..) if per_sprint == 0 => StatusCategory::Done,
            _ => StatusCategory::Todo,
        };
        rows.push(Row {
            number: rows.len() as i64 + 1,
            issue_type: ["story", "task", "bug"][index % 3],
            category,
            parent: (index % 2 == 0).then_some((index % epics) as i64 + 1),
            slot,
            days_ago: (index % 365) as i64,
        });
    }
    for index in 0..subtasks {
        let parent = rows[epics + index % parents].clone();
        rows.push(Row {
            number: rows.len() as i64 + 1,
            issue_type: "subtask",
            category: parent.category,
            parent: Some(parent.number),
            slot: parent.slot,
            days_ago: parent.days_ago,
        });
    }
    rows
}

/// Seeds an empty database; returns the owner's user id. Everyone signs in with [`PASSWORD`].
pub async fn seed(pool: &PgPool, size: &SeedSize) -> Result<i64, AppError> {
    let register = Register {
        email: OWNER_EMAIL.into(),
        password: PASSWORD.into(),
        display_name: "Perf Owner".into(),
    };
    let (owner, _) = auth::service::register(pool, register).await?;
    let user = CurrentUser {
        id: owner.id,
        token_id: 0,
    };
    let scrum = new_project(pool, &user, SCRUM_KEY, BoardType::Scrum).await?;
    let kanban = new_project(pool, &user, KANBAN_KEY, BoardType::Kanban).await?;
    let mut tx = pool.begin().await?;
    let mut members = add_users(&mut tx, owner.id, size.users).await?;
    members.insert(0, owner.id);
    let closed = size.sprints.saturating_sub(2);
    let sprint_ids = add_sprints(&mut tx, scrum.board_id, size.sprints).await?;
    let scrum_issues = size.issues * 4 / 5;
    let scrum_rows = plan(scrum_issues, Some(closed));
    let kanban_rows = plan(size.issues - scrum_issues, None);
    add_issues(&mut tx, &scrum, &members, &scrum_rows, &sprint_ids).await?;
    add_issues(&mut tx, &kanban, &members, &kanban_rows, &[]).await?;
    for (index, sprint_id) in sprint_ids.iter().enumerate().take(closed + 1) {
        sprints::repo::snapshot_scope(&mut tx, *sprint_id).await?;
        if index < closed {
            sprints::repo::record_outcomes(&mut tx, *sprint_id).await?;
        }
    }
    sqlx::query!(
        "INSERT INTO issue_comment (issue_id, author_id, body)
         SELECT i.id, ($1::bigint[])[1 + (i.number + g) % cardinality($1::bigint[])],
                'Looked into this; next step noted in comment ' || g
         FROM issue i CROSS JOIN LATERAL generate_series(1, i.number % 5) g",
        &members[..]
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(owner.id)
}

struct SeedProject {
    id: i64,
    board_id: i64,
    todo: i64,
    in_progress: i64,
    done: i64,
}

async fn new_project(
    pool: &PgPool,
    user: &CurrentUser,
    key: &str,
    board_type: BoardType,
) -> Result<SeedProject, AppError> {
    let input = CreateProject {
        key: key.into(),
        name: format!("{key} load test"),
        board_type,
    };
    let project = projects::service::create_project(pool, user, input).await?;
    let mut conn = pool.acquire().await?;
    let board_id = sqlx::query_scalar!("SELECT id FROM board WHERE project_id = $1", project.id)
        .fetch_one(&mut *conn)
        .await?;
    let statuses = boards::repo::list_statuses(&mut conn, project.id).await?;
    let status = |category| {
        statuses
            .iter()
            .find(|status| status.category == category)
            .map_or(0, |status| status.id)
    };
    Ok(SeedProject {
        id: project.id,
        board_id,
        todo: status(StatusCategory::Todo),
        in_progress: status(StatusCategory::InProgress),
        done: status(StatusCategory::Done),
    })
}

/// `count - 1` more users sharing the owner's password hash, members of every project.
async fn add_users(
    conn: &mut PgConnection,
    owner_id: i64,
    count: usize,
) -> Result<Vec<i64>, sqlx::Error> {
    let others = count.saturating_sub(1) as i64;
    let ids = sqlx::query_scalar!(
        "INSERT INTO app_user (email, display_name, password_hash)
         SELECT 'user' || g || '@perf.santi.test', 'User ' || g, owner.password_hash
         FROM generate_series(1, $2::bigint) g, app_user owner WHERE owner.id = $1
         RETURNING id",
        owner_id,
        others
    )
    .fetch_all(&mut *conn)
    .await?;
    sqlx::query!(
        "INSERT INTO member (project_id, user_id, role)
         SELECT p.id, u, 'member' FROM project p, unnest($1::bigint[]) u",
        &ids[..]
    )
    .execute(&mut *conn)
    .await?;
    Ok(ids)
}

/// Two-week sprints: all but the last two closed, then one active and one future.
async fn add_sprints(
    conn: &mut PgConnection,
    board_id: i64,
    count: usize,
) -> Result<Vec<i64>, sqlx::Error> {
    let today = Utc::now().date_naive();
    let mut ids = Vec::with_capacity(count);
    for index in 0..count {
        let number = sprints::repo::take_sprint_number(conn, board_id).await?;
        let name = format!("{SCRUM_KEY} Sprint {number}");
        let id = sprints::repo::insert_sprint(conn, board_id, &name, "").await?;
        let weeks_back = 2 * (count as i64 - 1 - index as i64);
        let start = today - Duration::weeks(weeks_back) - Duration::days(7);
        if index + 1 < count {
            sprints::repo::mark_started(conn, id, start, start + Duration::days(14)).await?;
        }
        if index + 2 < count {
            sprints::repo::mark_closed(conn, id).await?;
        }
        ids.push(id);
    }
    Ok(ids)
}

async fn add_issues(
    conn: &mut PgConnection,
    project: &SeedProject,
    members: &[i64],
    rows: &[Row],
    sprint_ids: &[i64],
) -> Result<(), sqlx::Error> {
    let mut rank: Option<String> = None;
    let mut ranks = Vec::with_capacity(rows.len());
    for _ in rows {
        let next = rank_between(rank.as_deref(), None);
        ranks.push(next.clone());
        rank = Some(next);
    }
    // Parents are inserted before children so the parent join resolves.
    for tier in [Some("epic"), None, Some("subtask")] {
        let picked: Vec<(usize, &Row)> = rows
            .iter()
            .enumerate()
            .filter(|(_, row)| match tier {
                Some(kind) => row.issue_type == kind,
                None => !matches!(row.issue_type, "epic" | "subtask"),
            })
            .collect();
        let number: Vec<i64> = picked.iter().map(|(_, row)| row.number).collect();
        let issue_type: Vec<&str> = picked.iter().map(|(_, row)| row.issue_type).collect();
        let summary: Vec<String> = picked.iter().map(|(_, row)| summary(row.number)).collect();
        let priority: Vec<&str> = picked
            .iter()
            .map(|(_, row)| ["medium", "high", "low", "medium", "urgent"][row.number as usize % 5])
            .collect();
        let status_id: Vec<i64> = picked
            .iter()
            .map(|(_, row)| match row.category {
                StatusCategory::Todo => project.todo,
                StatusCategory::InProgress => project.in_progress,
                StatusCategory::Done => project.done,
            })
            .collect();
        // Arrays carry no NULLs through the checked macro: 0 and -1 stand for "none".
        let assignee_id: Vec<i64> = picked
            .iter()
            .map(|(_, row)| match row.number % 5 {
                0 => 0,
                _ => members[row.number as usize % members.len()],
            })
            .collect();
        let points: Vec<f64> = picked
            .iter()
            .map(|(_, row)| {
                let estimated =
                    row.number % 6 != 0 && !matches!(row.issue_type, "epic" | "subtask");
                if estimated {
                    POINTS[row.number as usize % POINTS.len()]
                } else {
                    -1.0
                }
            })
            .collect();
        let labels: Vec<String> = picked
            .iter()
            .map(|(_, row)| {
                let first = LABELS[row.number as usize % LABELS.len()];
                let second = LABELS[row.number as usize / 7 % LABELS.len()];
                match row.number % 3 {
                    0 => String::new(),
                    1 => first.to_string(),
                    _ if first == second => first.to_string(),
                    _ => format!("{first},{second}"),
                }
            })
            .collect();
        let parent: Vec<i64> = picked
            .iter()
            .map(|(_, row)| row.parent.unwrap_or(0))
            .collect();
        let sprint_id: Vec<i64> = picked
            .iter()
            .map(|(_, row)| match (row.issue_type, row.slot) {
                ("epic", _) | (_, Slot::Backlog) => None,
                (_, Slot::Closed(index)) => sprint_ids.get(index).copied(),
                (_, Slot::Active) => sprint_ids.get(sprint_ids.len().wrapping_sub(2)).copied(),
                (_, Slot::Future) => sprint_ids.last().copied(),
            })
            .map(|sprint| sprint.unwrap_or(0))
            .collect();
        let rank: Vec<&str> = picked
            .iter()
            .map(|(index, _)| ranks[*index].as_str())
            .collect();
        let done_days: Vec<i32> = picked
            .iter()
            .map(|(_, row)| match row.category {
                StatusCategory::Done => row.days_ago as i32,
                _ => -1,
            })
            .collect();
        sqlx::query!(
            "INSERT INTO issue (project_id, number, issue_type, summary, priority, status_id, assignee_id,
                                reporter_id, points, labels, parent_id, sprint_id, rank, done_at)
             SELECT $1, r.number, r.issue_type, r.summary, r.priority, r.status_id, nullif(r.assignee_id, 0),
                    $2, nullif(r.points, -1), coalesce(string_to_array(nullif(r.labels, ''), ','), '{}'),
                    parent.id, nullif(r.sprint_id, 0), r.rank,
                    CASE WHEN r.done_days >= 0 THEN now() - make_interval(days => r.done_days) END
             FROM unnest($3::bigint[], $4::text[], $5::text[], $6::text[], $7::bigint[], $8::bigint[],
                         $9::float8[], $10::text[], $11::bigint[], $12::bigint[], $13::text[],
                         $14::int[])
                  AS r(number, issue_type, summary, priority, status_id, assignee_id, points, labels,
                       parent_number, sprint_id, rank, done_days)
             LEFT JOIN issue parent ON parent.project_id = $1 AND parent.number = r.parent_number",
            project.id,
            members[0],
            &number[..],
            &issue_type as &[&str],
            &summary[..],
            &priority as &[&str],
            &status_id[..],
            &assignee_id[..],
            &points[..],
            &labels[..],
            &parent[..],
            &sprint_id[..],
            &rank as &[&str],
            &done_days[..]
        )
        .execute(&mut *conn)
        .await?;
    }
    sqlx::query!(
        "UPDATE project SET next_issue_number = $2 WHERE id = $1",
        project.id,
        rows.len() as i64 + 1
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

fn summary(number: i64) -> String {
    let verb = VERBS[number as usize % VERBS.len()];
    let noun = NOUNS[number as usize / VERBS.len() % NOUNS.len()];
    format!("{verb} {noun} ({number})")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(text: &str) -> Vec<String> {
        text.split_whitespace().map(String::from).collect()
    }

    #[test]
    fn size_reads_flags_and_keeps_defaults() {
        let size = SeedSize::from_args(&args("--issues 1000 --sprints 6")).unwrap();
        assert_eq!(
            size,
            SeedSize {
                issues: 1000,
                users: 50,
                sprints: 6
            }
        );
        assert_eq!(SeedSize::from_args(&[]).unwrap(), SeedSize::default());
    }

    #[test]
    fn size_rejects_unknown_flags_and_missing_numbers() {
        assert_eq!(
            SeedSize::from_args(&args("--users 5 --bogus 1")),
            Err("unknown flag --bogus".into())
        );
        assert_eq!(
            SeedSize::from_args(&args("--issues")),
            Err("--issues needs a number".into())
        );
    }

    #[test]
    fn scrum_plan_fills_closed_sprints_then_active_future_and_backlog() {
        let rows = plan(1000, Some(4));
        assert_eq!(rows.len(), 1000);
        let count = |slot| rows.iter().filter(|row| row.slot == slot).count();
        assert_eq!(
            rows.iter().filter(|row| row.issue_type == "epic").count(),
            10
        );
        assert_eq!(
            rows.iter()
                .filter(|row| row.issue_type == "subtask")
                .count(),
            200
        );
        assert!(count(Slot::Closed(0)) > 100);
        assert!(count(Slot::Active) > 100);
        assert!(count(Slot::Future) > 100);
        assert!(count(Slot::Backlog) > 50);
        let closed = rows
            .iter()
            .filter(|row| matches!(row.slot, Slot::Closed(_)));
        assert!(
            closed
                .into_iter()
                .all(|row| row.category == StatusCategory::Done)
        );
    }

    #[test]
    fn kanban_plan_marks_most_work_done_and_subtasks_follow_parents() {
        let rows = plan(200, None);
        assert!(rows.iter().all(|row| row.slot == Slot::Backlog));
        let done = rows
            .iter()
            .filter(|row| row.category == StatusCategory::Done);
        assert!(done.count() > 100);
        for row in rows.iter().filter(|row| row.issue_type == "subtask") {
            let parent = &rows[row.parent.unwrap() as usize - 1];
            assert!(matches!(parent.issue_type, "story" | "task" | "bug"));
            assert_eq!(parent.category, row.category);
        }
    }
}
