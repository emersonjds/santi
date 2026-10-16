use std::collections::{HashMap, HashSet};

use chrono::Utc;
use santi_types::imports::{ImportMapping, ImportPreview, ImportResult};
use santi_types::issues::IssueType;
use santi_types::sprints::SprintState;
use sqlx::PgPool;

use super::domain::{self, BATCH_SIZE, Export, Plan};
use super::repo::{self, ImportedIssue};
use crate::error::AppError;
use crate::issues::domain::rank_between;
use crate::members::Member;
use crate::{boards, issues, members, projects, sprints};

pub async fn preview(
    pool: &PgPool,
    member: &Member,
    file: Vec<u8>,
) -> Result<ImportPreview, AppError> {
    members::domain::require_admin(member)?;
    let (statuses, people) = {
        let mut conn = pool.acquire().await?;
        let statuses = boards::repo::list_statuses(&mut conn, member.project_id).await?;
        let people = members::repo::list_members(&mut conn, member.project_id).await?;
        (statuses, people)
    };
    let today = Utc::now().date_naive();
    in_background(move || {
        let export = domain::read_file(&file)?;
        Ok(domain::preview(&export, &statuses, &people, today))
    })
    .await?
}

/// Parsing and planning 10 MB is CPU work: off the async workers, holding no connection.
async fn in_background<T: Send + 'static>(
    work: impl FnOnce() -> T + Send + 'static,
) -> Result<T, AppError> {
    tokio::task::spawn_blocking(work)
        .await
        .map_err(|error| AppError::Internal(error.to_string()))
}

/// D41: one transaction for numbers and sprints, one per batch of 500 issues, then one that
/// ranks the new issues in file order.
pub async fn import(
    pool: &PgPool,
    member: &Member,
    file: Vec<u8>,
    mapping: ImportMapping,
) -> Result<ImportResult, AppError> {
    members::domain::require_admin(member)?;
    let export = in_background(move || domain::read_file(&file)).await??;
    let (export, plan) = plan(pool, member, export, mapping).await?;
    let mut tx = pool.begin().await?;
    let count = plan.issues.len() as i64;
    let first_number = repo::take_issue_numbers(&mut tx, member.project_id, count).await?;
    let sprint_ids = create_sprints(&mut tx, member, &plan).await?;
    tx.commit().await?;
    let mut created = HashSet::with_capacity(plan.issues.len());
    for batch in domain::insert_order(&plan.issues).chunks(BATCH_SIZE) {
        let mut tx = pool.begin().await?;
        projects::repo::lock_project(&mut tx, member.project_id).await?; // D21: ranks are taken in order
        let mut rank = issues::repo::last_rank(&mut tx, member.project_id).await?;
        let mut keys = HashSet::new();
        for tier in batch.chunk_by(|a, b| {
            domain::tier(plan.issues[*a].issue_type) == domain::tier(plan.issues[*b].issue_type)
        }) {
            let rows: Vec<ImportedIssue> = tier
                .iter()
                .map(|index| {
                    let next = rank_between(rank.as_deref(), None);
                    rank = Some(next.clone());
                    to_row(&plan, *index, first_number, &sprint_ids, next)
                })
                .collect();
            keys.extend(
                repo::insert_issues(&mut tx, member.project_id, export.source, &rows).await?,
            );
        }
        let comments: Vec<(String, String, chrono::DateTime<Utc>)> = batch
            .iter()
            .map(|index| &plan.issues[*index])
            .filter(|issue| keys.contains(&issue.key))
            .flat_map(|issue| {
                issue
                    .comments
                    .iter()
                    .map(|(body, at)| (issue.key.clone(), body.clone(), *at))
            })
            .collect();
        if !comments.is_empty() {
            repo::insert_comments(
                &mut tx,
                member.project_id,
                export.source,
                member.user_id,
                &comments,
            )
            .await?;
        }
        let inserted: Vec<String> = keys.iter().cloned().collect();
        repo::record_joins(&mut tx, member.project_id, export.source, &inserted).await?;
        tx.commit().await?;
        created.extend(keys);
    }
    if !created.is_empty() {
        finish(pool, member, &export, &plan, &created).await?;
    }
    let raced = plan.issues.len() - created.len();
    Ok(ImportResult {
        source: export.source,
        created: created.len() as i64,
        skipped: plan.skipped + raced as i64,
        failed: plan.failed,
        problems: plan
            .problems
            .into_iter()
            .take(domain::MAX_PROBLEMS)
            .collect(),
    })
}

async fn finish(
    pool: &PgPool,
    member: &Member,
    export: &Export,
    plan: &Plan,
    created: &HashSet<String>,
) -> Result<(), AppError> {
    let mut tx = pool.begin().await?;
    projects::repo::lock_project(&mut tx, member.project_id).await?;
    let mut rank = issues::repo::last_rank(&mut tx, member.project_id).await?;
    let finished: Vec<(String, String, chrono::DateTime<Utc>)> = plan
        .issues
        .iter()
        .filter(|issue| created.contains(&issue.key))
        .map(|issue| {
            let next = rank_between(rank.as_deref(), None);
            rank = Some(next.clone());
            (issue.key.clone(), next, issue.updated)
        })
        .collect();
    repo::finish(&mut tx, member.project_id, export.source, &finished).await?;
    tx.commit().await?;
    Ok(())
}

async fn plan(
    pool: &PgPool,
    member: &Member,
    export: Export,
    mapping: ImportMapping,
) -> Result<(Export, Plan), AppError> {
    let mut conn = pool.acquire().await?;
    let statuses = boards::repo::list_statuses(&mut conn, member.project_id).await?;
    let people = members::repo::list_members(&mut conn, member.project_id).await?;
    domain::check_mapping(&mapping, &statuses, &people, member.board_type)?;
    let keys: Vec<String> = export
        .rows
        .iter()
        .flat_map(|row| [Some(row.key.clone()), row.parent.clone()])
        .flatten()
        .collect();
    let existing: HashMap<String, IssueType> =
        repo::existing_keys(&mut conn, member.project_id, export.source, &keys)
            .await?
            .into_iter()
            .collect();
    drop(conn);
    let categories = statuses
        .iter()
        .map(|status| (status.id, status.category))
        .collect();
    let (reporter_id, now) = (member.user_id, Utc::now());
    in_background(move || {
        let plan = domain::plan_import(&export, &mapping, &categories, &existing, reporter_id, now);
        (export, plan)
    })
    .await
}

/// A sprint of the same name in the state the mapping asks for (future or closed) is reused, so a
/// second import creates none; a running sprint is never reused.
async fn create_sprints(
    conn: &mut sqlx::PgConnection,
    member: &Member,
    plan: &Plan,
) -> Result<HashMap<String, i64>, AppError> {
    let existing = sprints::repo::list_sprints(conn, member.board_id).await?;
    let mut ids = HashMap::new();
    for sprint in &plan.sprints {
        let state = match sprint.closed {
            true => SprintState::Closed,
            false => SprintState::Future,
        };
        let same = existing
            .iter()
            .find(|found| found.name == sprint.name && found.state == state);
        if let Some(found) = same {
            ids.insert(sprint.name.clone(), found.id);
            continue;
        }
        sprints::repo::take_sprint_number(conn, member.board_id).await?; // D12: never reused
        let id = if sprint.closed {
            repo::insert_closed_sprint(
                conn,
                member.board_id,
                &sprint.name,
                sprint.start,
                sprint.end,
            )
            .await?
        } else {
            sprints::repo::insert_sprint(conn, member.board_id, &sprint.name, "").await?
        };
        ids.insert(sprint.name.clone(), id);
    }
    Ok(ids)
}

fn to_row(
    plan: &Plan,
    index: usize,
    first_number: i64,
    sprint_ids: &HashMap<String, i64>,
    rank: String,
) -> ImportedIssue {
    let issue = &plan.issues[index];
    ImportedIssue {
        key: issue.key.clone(),
        number: first_number + index as i64,
        issue_type: issue.issue_type,
        summary: issue.summary.clone(),
        description: issue.description.clone(),
        priority: issue.priority,
        status_id: issue.status_id,
        done: issue.done,
        assignee_id: issue.assignee_id,
        reporter_id: issue.reporter_id,
        points: issue.points,
        labels: issue.labels.clone(),
        parent_key: issue.parent_key.clone(),
        sprint_id: issue
            .sprint
            .as_ref()
            .and_then(|name| sprint_ids.get(name).copied()),
        rank,
        created: issue.created,
        updated: issue.updated,
    }
}
