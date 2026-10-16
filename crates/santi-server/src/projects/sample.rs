//! "Start with a sample project": a small scrum project written through the same use cases a
//! user would call, so it always obeys the current rules.

use santi_types::issues::{CreateComment, CreateIssue, Issue, IssueType, Priority};
use santi_types::projects::{BoardType, CreateProject, Project};
use santi_types::sprints::{CreateSprint, StartSprint};
use sqlx::PgPool;

use super::{domain, repo, service};
use crate::auth::extract::CurrentUser;
use crate::error::AppError;
use crate::members::{self, Member};
use crate::{boards, issues, sprints};

pub const SAMPLE_NAME: &str = "Sample: Mobile app";

/// Returns the caller's sample project and whether this call created it. A second call, or one
/// racing the first, gets the existing project.
pub async fn create_sample(pool: &PgPool, user: &CurrentUser) -> Result<(Project, bool), AppError> {
    let key = domain::sample_key(user.id);
    if let Some(project) = existing(pool, user, &key).await? {
        return Ok((project, false));
    }
    let input = CreateProject {
        key: key.clone(),
        name: SAMPLE_NAME.into(),
        board_type: BoardType::Scrum,
    };
    let project = match service::create_project(pool, user, input).await {
        Err(AppError::Conflict { .. }) => {
            let project = existing(pool, user, &key).await?;
            let taken = || {
                AppError::conflict(
                    "already-exists",
                    "Another project already uses the sample's key.",
                )
            };
            return Ok((project.ok_or_else(taken)?, false));
        }
        created => created?,
    };
    let mut conn = pool.acquire().await?;
    let member = members::repo::find_member(&mut conn, &key, user.id)
        .await?
        .ok_or(AppError::NotFound)?;
    drop(conn);
    // ponytail: not one transaction; a failure midway leaves a partial sample that the next
    // call opens as is. One transaction would need every use case to take a connection.
    seed(pool, &member).await?;
    Ok((project, true))
}

async fn existing(
    pool: &PgPool,
    user: &CurrentUser,
    key: &str,
) -> Result<Option<Project>, AppError> {
    let mut conn = pool.acquire().await?;
    let Some(member) = members::repo::find_member(&mut conn, key, user.id).await? else {
        return Ok(None);
    };
    Ok(Some(
        repo::find_project(&mut conn, member.project_id, user.id).await?,
    ))
}

struct Draft {
    summary: &'static str,
    issue_type: IssueType,
    column: usize,
    points: Option<f64>,
    labels: &'static [&'static str],
    mine: bool,
    priority: Priority,
}

const fn draft(summary: &'static str, issue_type: IssueType, column: usize) -> Draft {
    Draft {
        summary,
        issue_type,
        column,
        points: None,
        labels: &[],
        mine: false,
        priority: Priority::Medium,
    }
}

async fn seed(pool: &PgPool, member: &Member) -> Result<(), AppError> {
    let settings = boards::service::get_settings(pool, member).await?;
    let statuses: Vec<i64> = settings
        .columns
        .iter()
        .filter_map(|column| column.statuses.first().map(|status| status.id))
        .collect();
    let (todo, doing, done) = (0, 1, statuses.len() - 1);
    let sprint = |name: &str, goal: &str| CreateSprint {
        name: Some(name.into()),
        goal: Some(goal.into()),
    };
    let current = sprints::service::create_sprint(
        pool,
        member,
        sprint("Sprint 1", "Sign-in that remembers you"),
    )
    .await?;
    let next = sprints::service::create_sprint(
        pool,
        member,
        sprint("Sprint 2", "Read projects without a connection"),
    )
    .await?;

    let add = |draft: Draft, parent: Option<&Issue>, sprint_id: Option<i64>| {
        let input = CreateIssue {
            summary: draft.summary.into(),
            issue_type: draft.issue_type,
            priority: draft.priority,
            status_id: Some(statuses[draft.column]),
            assignee_id: draft.mine.then_some(member.user_id),
            points: draft.points,
            labels: draft.labels.iter().map(|label| label.to_string()).collect(),
            parent: parent.map(|parent| parent.key.clone()),
            sprint_id,
            ..CreateIssue::default()
        };
        issues::service::create_issue(pool, member, input)
    };
    let comment = |issue: &Issue, body: &str| {
        let input = CreateComment { body: body.into() };
        issues::service::add_comment(pool, member, issue.number, input)
    };

    let onboarding = add(
        Draft {
            labels: &["onboarding"],
            ..draft("Sign-in and onboarding", IssueType::Epic, todo)
        },
        None,
        None,
    )
    .await?;
    let offline = add(
        Draft {
            labels: &["offline"],
            ..draft("Offline mode", IssueType::Epic, todo)
        },
        None,
        None,
    )
    .await?;

    let sign_in = add(
        Draft {
            points: Some(3.0),
            labels: &["auth"],
            mine: true,
            priority: Priority::High,
            ..draft("Sign in with email and password", IssueType::Story, done)
        },
        Some(&onboarding),
        Some(current.id),
    )
    .await?;
    comment(
        &sign_in,
        "Shipped behind the new sign-in screen; works on both platforms.",
    )
    .await?;
    let remember = add(
        Draft {
            points: Some(2.0),
            labels: &["auth"],
            mine: true,
            ..draft(
                "Remember the last signed-in account",
                IssueType::Story,
                doing,
            )
        },
        Some(&onboarding),
        Some(current.id),
    )
    .await?;
    comment(
        &remember,
        "Keychain on iOS, encrypted shared preferences on Android.",
    )
    .await?;
    add(
        draft(
            "Store the session in the keychain",
            IssueType::Subtask,
            done,
        ),
        Some(&remember),
        None,
    )
    .await?;
    add(
        draft("Clear the session on sign-out", IssueType::Subtask, todo),
        Some(&remember),
        None,
    )
    .await?;
    let crash = add(
        Draft {
            points: Some(1.0),
            labels: &["android"],
            priority: Priority::Urgent,
            ..draft(
                "App crashes when the sign-in screen rotates",
                IssueType::Bug,
                doing,
            )
        },
        None,
        Some(current.id),
    )
    .await?;
    comment(
        &crash,
        "Happens on a Pixel 7 with auto-rotate on; the form state is lost first.",
    )
    .await?;
    add(
        Draft {
            points: Some(1.0),
            labels: &["onboarding"],
            ..draft("Write the welcome screen copy", IssueType::Task, todo)
        },
        Some(&onboarding),
        Some(current.id),
    )
    .await?;
    add(
        Draft {
            points: Some(5.0),
            labels: &["offline"],
            ..draft(
                "Cache the project list for offline reading",
                IssueType::Story,
                todo,
            )
        },
        Some(&offline),
        Some(current.id),
    )
    .await?;

    add(
        Draft {
            points: Some(8.0),
            labels: &["offline"],
            ..draft(
                "Queue changes made offline and send them later",
                IssueType::Story,
                todo,
            )
        },
        Some(&offline),
        Some(next.id),
    )
    .await?;
    add(
        Draft {
            points: Some(3.0),
            labels: &["offline", "ui"],
            ..draft(
                "Show a banner while the app is offline",
                IssueType::Story,
                todo,
            )
        },
        Some(&offline),
        Some(next.id),
    )
    .await?;

    add(
        Draft {
            points: Some(5.0),
            labels: &["ui"],
            ..draft("Dark theme", IssueType::Story, todo)
        },
        None,
        None,
    )
    .await?;
    add(
        draft("Push notifications for mentions", IssueType::Story, todo),
        None,
        None,
    )
    .await?;
    add(
        Draft {
            labels: &["ui"],
            priority: Priority::Low,
            ..draft(
                "App icon looks blurry on older phones",
                IssueType::Bug,
                todo,
            )
        },
        None,
        None,
    )
    .await?;

    let start = StartSprint::default();
    sprints::service::start_sprint(pool, member, current.id, start).await?;
    Ok(())
}
