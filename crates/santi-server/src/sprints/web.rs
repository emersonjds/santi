use askama::Template;
use axum::Router;
use axum::extract::{Form, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Redirect, Response};
use axum::routing::{get, post};
use chrono::{Days, NaiveDate, Utc};
use santi_types::FieldError;
use santi_types::boards::{Backlog, BacklogSection, Card, EpicSummary, Status, StatusCategory};
use santi_types::issues::{CreateIssue, IssueFilter, IssueType, MoveIssue};
use santi_types::projects::{BoardType, MemberInfo, Project};
use santi_types::sprints::{
    CompleteSprint, CreateSprint, OpenIssuesDestination, Sprint, SprintState, StartSprint,
    UpdateSprint,
};
use serde::Deserialize;

use super::{domain, service};
use crate::AppState;
use crate::auth::extract::CurrentUser;
use crate::error::AppError;
use crate::extract::PathParams;
use crate::members::Member;
use crate::projects::web::{board_path, place_anchor};
use crate::web::{PageUser, Shell, render, shell, wants_fragment};
use crate::{boards, issues, projects};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/p/{key}/backlog", get(backlog_page))
        .route("/p/{key}/backlog/issues", post(create_issue))
        .route("/p/{key}/sprints", post(create_sprint))
        .route("/p/{key}/sprints/{id}", post(edit_sprint))
        .route("/p/{key}/sprints/{id}/delete", post(delete_sprint))
        .route("/p/{key}/sprints/{id}/start", post(start_sprint))
        .route("/p/{key}/sprints/{id}/complete", post(complete_sprint))
        .route("/p/{key}/issues/{number}/plan", post(plan_issue))
}

#[derive(Template)]
#[template(path = "app/backlog.html", blocks = ["backlog"])]
struct BacklogPage {
    shell: Shell,
    project: Project,
    members: Vec<MemberInfo>,
    backlog: Backlog,
    statuses: Vec<Status>,
    today: NaiveDate,
    draft: IssueDraft,
    refusal: Option<Refusal>,
}

#[derive(Default)]
struct IssueDraft {
    summary: String,
    issue_type: IssueType,
    /// The section the inline create posted from: a sprint id, or empty for the backlog.
    sprint: String,
    errors: Vec<FieldError>,
}

/// Why the last action was refused, shown in the section of the sprint it touched.
struct Refusal {
    sprint_id: Option<i64>,
    message: String,
}

impl BacklogPage {
    fn issue_types(&self) -> [IssueType; 3] {
        [IssueType::Story, IssueType::Task, IssueType::Bug]
    }

    fn error(&self, field: &str) -> &str {
        self.draft
            .errors
            .iter()
            .find(|error| error.field == field)
            .map_or("", |error| error.message.as_str())
    }

    fn open_sprints(&self) -> Vec<&Sprint> {
        self.backlog
            .sections
            .iter()
            .filter_map(|section| section.sprint.as_ref())
            .collect()
    }

    /// Where a closing sprint's unfinished issues may go besides the backlog and a new sprint.
    fn future_sprints(&self) -> Vec<&Sprint> {
        self.open_sprints()
            .into_iter()
            .filter(|sprint| sprint.state == SprintState::Future)
            .collect()
    }

    fn sprint_error(&self, sprint_id: &i64) -> &str {
        self.refusal
            .as_ref()
            .filter(|refusal| refusal.sprint_id.as_ref() == Some(sprint_id))
            .map_or("", |refusal| refusal.message.as_str())
    }

    /// A refusal that has no open sprint section to sit in.
    fn page_error(&self) -> &str {
        let open: Vec<i64> = self.open_sprints().iter().map(|sprint| sprint.id).collect();
        self.refusal
            .as_ref()
            .filter(|refusal| refusal.sprint_id.is_none_or(|id| !open.contains(&id)))
            .map_or("", |refusal| refusal.message.as_str())
    }

    fn default_end(&self) -> NaiveDate {
        self.today + Days::new(domain::DEFAULT_SPRINT_DAYS)
    }

    /// The section whose inline create holds a refused draft; an unknown sprint falls back to the backlog.
    fn drafts_into(&self, section: &BacklogSection) -> bool {
        if self.draft.errors.is_empty() {
            return false;
        }
        let target = self
            .open_sprints()
            .into_iter()
            .find(|sprint| sprint.id.to_string() == self.draft.sprint)
            .map(|sprint| sprint.id);
        section.sprint.as_ref().map(|sprint| sprint.id) == target
    }

    /// Element id suffix of a section: the sprint id, or `backlog`.
    fn slot(&self, section: &BacklogSection) -> String {
        section
            .sprint
            .as_ref()
            .map_or_else(|| "backlog".into(), |sprint| sprint.id.to_string())
    }

    fn status_of(&self, status_id: &i64) -> Option<&Status> {
        self.statuses.iter().find(|status| status.id == *status_id)
    }

    /// Visible issues per status category: to do, in progress, done.
    fn tally(&self, section: &BacklogSection) -> [usize; 3] {
        let mut tally = [0; 3];
        for card in &section.cards {
            let category = self
                .status_of(&card.status_id)
                .map_or(StatusCategory::Todo, |status| status.category);
            tally[category as usize] += 1;
        }
        tally
    }

    fn visible_points(&self, section: &BacklogSection) -> f64 {
        section.cards.iter().filter_map(|card| card.points).sum()
    }

    fn epic_of(&self, card: &Card) -> Option<&EpicSummary> {
        let parent = card.parent_key.as_deref()?;
        self.backlog.epics.iter().find(|epic| epic.key == parent)
    }

    fn count(&self, count: &i64) -> String {
        if *count == 1 {
            return "1 issue".into();
        }
        format!("{count} issues")
    }

    fn issue_path(&self, key: &str) -> String {
        crate::web::issue_path(&self.project.key, key)
    }
}

async fn load_page(
    state: &AppState,
    user: &CurrentUser,
    member: &Member,
    draft: IssueDraft,
    refusal: Option<Refusal>,
) -> Result<BacklogPage, AppError> {
    let filter = IssueFilter::default();
    let settings = boards::service::get_settings(&state.pool, member).await?;
    let mapped = settings
        .columns
        .into_iter()
        .flat_map(|column| column.statuses);
    Ok(BacklogPage {
        shell: shell(&state.pool, user, &member.project_key)
            .await?
            .on("backlog"),
        project: projects::service::get_project(&state.pool, member).await?,
        members: crate::members::service::list_members(&state.pool, member).await?,
        backlog: boards::service::backlog(&state.pool, member, &filter).await?,
        statuses: mapped.collect(),
        today: Utc::now().date_naive(),
        draft,
        refusal,
    })
}

fn backlog_path(member: &Member) -> String {
    format!("/p/{}/backlog", member.project_key)
}

/// Turns a refused action into its status and a sentence; other errors pass through.
fn refusal_of(error: AppError) -> Result<(StatusCode, String), AppError> {
    match error {
        AppError::Validation(errors) => {
            let sentences: Vec<String> = errors
                .into_iter()
                .map(|error| format!("{} {}.", field_label(&error.field), error.message))
                .collect();
            Ok((StatusCode::UNPROCESSABLE_ENTITY, sentences.join(" ")))
        }
        AppError::Conflict { detail, .. } => Ok((StatusCode::CONFLICT, detail)),
        other => Err(other),
    }
}

fn field_label(field: &str) -> String {
    let words = field.trim_end_matches("_id").replace('_', " ");
    let mut chars = words.chars();
    chars.next().map_or_else(String::new, |first| {
        first.to_uppercase().chain(chars).collect()
    })
}

/// Success goes to `done_path` (htmx gets the fresh backlog); a refusal re-renders the backlog with it.
async fn respond(
    state: &AppState,
    user: &CurrentUser,
    member: &Member,
    headers: &HeaderMap,
    sprint_id: Option<i64>,
    done_path: String,
    result: Result<(), AppError>,
) -> Result<Response, AppError> {
    let (status, refusal) = match result {
        Ok(()) => (StatusCode::OK, None),
        Err(error) => {
            let (status, message) = refusal_of(error)?;
            (status, Some(Refusal { sprint_id, message }))
        }
    };
    let from_htmx = headers.contains_key("hx-request");
    if !from_htmx && refusal.is_none() {
        return Ok(Redirect::to(&done_path).into_response());
    }
    let page = load_page(state, user, member, IssueDraft::default(), refusal).await?;
    if from_htmx {
        return render(status, &page.as_backlog());
    }
    render(status, &page)
}

async fn backlog_page(
    State(state): State<AppState>,
    PageUser(user): PageUser,
    member: Member,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    if member.board_type == BoardType::Kanban {
        return Ok(Redirect::to(&board_path(&member.project_key)).into_response());
    }
    let page = load_page(&state, &user, &member, IssueDraft::default(), None).await?;
    if wants_fragment(&headers) {
        return render(StatusCode::OK, &page.as_backlog());
    }
    render(StatusCode::OK, &page)
}

/// A date input: empty means none.
fn optional_date(field: &str, text: &str) -> Result<Option<NaiveDate>, AppError> {
    if text.is_empty() {
        return Ok(None);
    }
    text.parse()
        .map(Some)
        .map_err(|_| AppError::invalid(field, "must be a date"))
}

/// A sprint pick: empty means the backlog.
fn optional_sprint(text: &str) -> Result<Option<i64>, AppError> {
    if text.is_empty() {
        return Ok(None);
    }
    text.parse()
        .map(Some)
        .map_err(|_| AppError::invalid("sprint_id", "must be a sprint of this board"))
}

#[derive(Deserialize)]
struct NewIssueForm {
    summary: String,
    #[serde(default)]
    issue_type: IssueType,
    #[serde(default)]
    sprint: String,
}

async fn create_issue(
    State(state): State<AppState>,
    PageUser(user): PageUser,
    member: Member,
    Form(input): Form<NewIssueForm>,
) -> Result<Response, AppError> {
    let created = match optional_sprint(&input.sprint) {
        Ok(sprint_id) => {
            let issue = CreateIssue {
                summary: input.summary.clone(),
                issue_type: input.issue_type,
                sprint_id,
                ..CreateIssue::default()
            };
            issues::service::create_issue(&state.pool, &member, issue).await
        }
        Err(error) => Err(error),
    };
    let (status, errors) = match created {
        Ok(_) => return Ok(Redirect::to(&backlog_path(&member)).into_response()),
        Err(AppError::Validation(errors)) => (StatusCode::UNPROCESSABLE_ENTITY, errors),
        Err(error) => {
            let (status, message) = refusal_of(error)?;
            let blocked = FieldError {
                field: "form".into(),
                message,
            };
            (status, vec![blocked])
        }
    };
    let draft = IssueDraft {
        summary: input.summary,
        issue_type: input.issue_type,
        sprint: input.sprint,
        errors,
    };
    let page = load_page(&state, &user, &member, draft, None).await?;
    render(status, &page)
}

#[derive(Deserialize)]
struct SprintForm {
    #[serde(default)]
    name: String,
    #[serde(default)]
    goal: String,
    #[serde(default)]
    start_date: String,
    #[serde(default)]
    end_date: String,
}

impl SprintForm {
    fn into_update(self) -> Result<UpdateSprint, AppError> {
        Ok(UpdateSprint {
            start_date: optional_date("start_date", &self.start_date)?,
            end_date: optional_date("end_date", &self.end_date)?,
            name: self.name,
            goal: self.goal,
        })
    }
}

async fn create_sprint(
    State(state): State<AppState>,
    PageUser(user): PageUser,
    member: Member,
    headers: HeaderMap,
    Form(input): Form<SprintForm>,
) -> Result<Response, AppError> {
    let sprint = CreateSprint {
        name: Some(input.name).filter(|name| !name.trim().is_empty()),
        goal: Some(input.goal),
    };
    let result = service::create_sprint(&state.pool, &member, sprint).await;
    let done = backlog_path(&member);
    respond(
        &state,
        &user,
        &member,
        &headers,
        None,
        done,
        result.map(drop),
    )
    .await
}

async fn edit_sprint(
    State(state): State<AppState>,
    PageUser(user): PageUser,
    member: Member,
    PathParams((_key, sprint_id)): PathParams<(String, i64)>,
    headers: HeaderMap,
    Form(input): Form<SprintForm>,
) -> Result<Response, AppError> {
    let result = match input.into_update() {
        Ok(update) => service::update_sprint(&state.pool, &member, sprint_id, update)
            .await
            .map(drop),
        Err(error) => Err(error),
    };
    let done = backlog_path(&member);
    respond(
        &state,
        &user,
        &member,
        &headers,
        Some(sprint_id),
        done,
        result,
    )
    .await
}

async fn delete_sprint(
    State(state): State<AppState>,
    PageUser(user): PageUser,
    member: Member,
    PathParams((_key, sprint_id)): PathParams<(String, i64)>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    let result = service::delete_sprint(&state.pool, &member, sprint_id).await;
    let done = backlog_path(&member);
    respond(
        &state,
        &user,
        &member,
        &headers,
        Some(sprint_id),
        done,
        result,
    )
    .await
}

/// SP-6: the start step confirms name, goal and dates, saved first, then the sprint starts.
async fn start_sprint(
    State(state): State<AppState>,
    PageUser(user): PageUser,
    member: Member,
    PathParams((_key, sprint_id)): PathParams<(String, i64)>,
    headers: HeaderMap,
    Form(input): Form<SprintForm>,
) -> Result<Response, AppError> {
    let result = start(&state, &member, sprint_id, input).await;
    let board = board_path(&member.project_key);
    respond(
        &state,
        &user,
        &member,
        &headers,
        Some(sprint_id),
        board,
        result,
    )
    .await
}

async fn start(
    state: &AppState,
    member: &Member,
    sprint_id: i64,
    input: SprintForm,
) -> Result<(), AppError> {
    let update = input.into_update()?;
    let window = StartSprint {
        start_date: update.start_date,
        end_date: update.end_date,
    };
    service::update_sprint(&state.pool, member, sprint_id, update).await?;
    service::start_sprint(&state.pool, member, sprint_id, window).await?;
    Ok(())
}

#[derive(Deserialize)]
struct CompleteForm {
    /// `backlog`, `new_sprint` or the id of a future sprint.
    open_issues: String,
}

async fn complete_sprint(
    State(state): State<AppState>,
    PageUser(user): PageUser,
    member: Member,
    PathParams((_key, sprint_id)): PathParams<(String, i64)>,
    headers: HeaderMap,
    Form(input): Form<CompleteForm>,
) -> Result<Response, AppError> {
    let open_issues = match input.open_issues.as_str() {
        "backlog" => Ok(OpenIssuesDestination::Backlog),
        "new_sprint" => Ok(OpenIssuesDestination::NewSprint),
        other => other
            .parse()
            .map(|sprint_id| OpenIssuesDestination::Sprint { sprint_id })
            .map_err(|_| AppError::invalid("open_issues", "pick where open issues go")),
    };
    let result = match open_issues {
        Ok(open_issues) => service::complete_sprint(
            &state.pool,
            &member,
            sprint_id,
            CompleteSprint { open_issues },
        )
        .await
        .map(drop),
        Err(error) => Err(error),
    };
    let done = backlog_path(&member);
    respond(
        &state,
        &user,
        &member,
        &headers,
        Some(sprint_id),
        done,
        result,
    )
    .await
}

/// A drop on a section or a "Move to…" pick: the target section plus a neighbour key (drag) or top/bottom (form).
#[derive(Deserialize)]
struct PlanForm {
    #[serde(default)]
    sprint: String,
    #[serde(default)]
    after: String,
    #[serde(default)]
    before: String,
    #[serde(default)]
    place: String,
}

/// D1: drag and drop and the "Move to…" control both post here; htmx gets the backlog fragment back.
async fn plan_issue(
    State(state): State<AppState>,
    PageUser(user): PageUser,
    member: Member,
    PathParams((_key, number)): PathParams<(String, i64)>,
    headers: HeaderMap,
    Form(input): Form<PlanForm>,
) -> Result<Response, AppError> {
    let result = plan(&state, &member, number, input).await;
    let done = backlog_path(&member);
    respond(&state, &user, &member, &headers, None, done, result).await
}

async fn plan(
    state: &AppState,
    member: &Member,
    number: i64,
    input: PlanForm,
) -> Result<(), AppError> {
    let target = optional_sprint(&input.sprint)?;
    let issue = issues::service::get_issue(&state.pool, member, number).await?;
    let (after, before) = if input.after.is_empty() && input.before.is_empty() {
        let filter = IssueFilter::default();
        let backlog = boards::service::backlog(&state.pool, member, &filter).await?;
        let section = backlog
            .sections
            .iter()
            .find(|section| section.sprint.as_ref().map(|sprint| sprint.id) == target);
        section.map_or((None, None), |section| {
            place_anchor(&section.cards, &issue.key, &input.place)
        })
    } else {
        (
            Some(input.after).filter(|key| !key.is_empty()),
            Some(input.before).filter(|key| !key.is_empty()),
        )
    };
    let change = MoveIssue {
        status_id: None,
        after,
        before,
        sprint_id: (issue.sprint_id != target).then_some(target),
    };
    issues::service::move_issue(&state.pool, member, number, change).await?;
    Ok(())
}
