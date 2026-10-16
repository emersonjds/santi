use askama::Template;
use axum::Router;
use axum::extract::{Form, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Redirect, Response};
use axum::routing::{get, post};
use chrono::{DateTime, Utc};
use santi_types::FieldError;
use santi_types::boards::{Status, StatusCategory};
use santi_types::issues::{
    CreateComment, CreateIssue, Issue, IssueFilter, IssueType, MoveIssue, PageParams, Priority,
    UpdateIssue,
};
use santi_types::projects::{BoardType, MemberInfo};
use santi_types::sprints::{Sprint, SprintState};
use serde::Deserialize;

use super::service;
use crate::AppState;
use crate::auth::extract::CurrentUser;
use crate::error::AppError;
use crate::extract::{PathParams, QueryParams};
use crate::members::{self, Member};
use crate::projects::web::board_path;
use crate::web::{PageUser, Shell, optional_number, render, shell, wants_fragment};
use crate::{boards, pagination, sprints};

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/p/{key}/issues/new",
            get(new_issue_page).post(create_from_form),
        )
        .route("/p/{key}/issues/{number}", get(issue_page).post(edit_issue))
        .route("/p/{key}/issues/{number}/comments", post(add_comment))
        .route("/p/{key}/search", get(search_page))
}

/// Any subset of the detail fields: the dialog posts them all, a card menu just one.
#[derive(Default, Deserialize)]
struct EditIssue {
    summary: Option<String>,
    description: Option<String>,
    status_id: Option<i64>,
    priority: Option<Priority>,
    /// A user id; blank unassigns.
    assignee: Option<String>,
    /// Blank clears.
    points: Option<String>,
}

impl EditIssue {
    fn to_change(&self) -> Result<UpdateIssue, AppError> {
        let assignee = self.assignee.as_deref();
        let points = self.points.as_deref();
        Ok(UpdateIssue {
            summary: self.summary.clone(),
            description: self.description.clone(),
            priority: self.priority,
            assignee_id: assignee
                .map(|value| optional_number(value, "assignee"))
                .transpose()?,
            points: points
                .map(|value| optional_number(value, "points"))
                .transpose()?,
            ..UpdateIssue::default()
        })
    }
}

#[derive(Template)]
#[template(path = "app/issue.html", blocks = ["detail"])]
struct IssuePage {
    shell: Shell,
    /// Shown values; after a refused save, the typed title and description.
    issue: Issue,
    /// Mapped statuses, column by column: the move-to choices (D1 keyboard fallback).
    statuses: Vec<Status>,
    status_category: StatusCategory,
    people: Vec<MemberInfo>,
    sprint_name: String,
    subtasks: Vec<Issue>,
    comments: Vec<CommentView>,
    /// Typed text of a refused comment.
    comment: String,
    errors: Vec<FieldError>,
}

struct CommentView {
    author: String,
    created_at: DateTime<Utc>,
    body: String,
}

#[derive(Template)]
#[template(path = "app/search.html")]
struct SearchPage {
    shell: Shell,
    q: String,
    issues: Vec<Issue>,
}

impl IssuePage {
    fn error(&self, field: &str) -> &str {
        field_error(&self.errors, field)
    }

    fn person(&self, user_id: &i64) -> String {
        self.people
            .iter()
            .find(|person| person.user_id == *user_id)
            .map_or_else(
                || "Former member".into(),
                |person| person.display_name.clone(),
            )
    }

    /// D36 status colors: grey to do, purple in progress, teal done.
    fn status_tone(&self) -> &'static str {
        match self.status_category {
            StatusCategory::Todo => "bg-status-todo-bg text-status-todo",
            StatusCategory::InProgress => "bg-status-progress-bg text-status-progress",
            StatusCategory::Done => "bg-status-done-bg text-status-done",
        }
    }
}

fn field_error<'a>(errors: &'a [FieldError], field: &str) -> &'a str {
    errors
        .iter()
        .find(|error| error.field == field)
        .map_or("", |error| error.message.as_str())
}

fn render_issue(
    status: StatusCode,
    page: &IssuePage,
    headers: &HeaderMap,
) -> Result<Response, AppError> {
    if wants_fragment(headers) {
        return render(status, &page.as_detail());
    }
    render(status, page)
}

async fn issue_page(
    State(state): State<AppState>,
    PageUser(user): PageUser,
    member: Member,
    PathParams((_key, number)): PathParams<(String, i64)>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    let issue = service::get_issue(&state.pool, &member, number).await?;
    let page = load_issue_page(&state, &user, &member, issue, Vec::new()).await?;
    render_issue(StatusCode::OK, &page, &headers)
}

// ponytail: fields and status are two writes; a refused status keeps the saved fields.
async fn edit_issue(
    State(state): State<AppState>,
    PageUser(user): PageUser,
    member: Member,
    PathParams((_key, number)): PathParams<(String, i64)>,
    headers: HeaderMap,
    Form(edit): Form<EditIssue>,
) -> Result<Response, AppError> {
    let saved = match edit.to_change() {
        Ok(change) => service::update_issue(&state.pool, &member, number, change).await,
        Err(error) => Err(error),
    };
    let saved = match (saved, edit.status_id) {
        (Ok(issue), Some(status_id)) if issue.status_id != status_id => {
            let to_status = MoveIssue {
                status_id: Some(status_id),
                ..MoveIssue::default()
            };
            service::move_issue(&state.pool, &member, number, to_status).await
        }
        (saved, _) => saved,
    };
    let (status, errors) = match saved {
        Ok(issue) if wants_fragment(&headers) => {
            let page = load_issue_page(&state, &user, &member, issue, Vec::new()).await?;
            let mut response = render(StatusCode::OK, &page.as_detail())?;
            let saved = HeaderValue::from_static("issue-saved");
            response.headers_mut().insert("hx-trigger", saved);
            return Ok(response);
        }
        Ok(_) => {
            let path = format!("/p/{}/issues/{number}", member.project_key);
            return Ok(Redirect::to(&path).into_response());
        }
        Err(AppError::Validation(errors)) => (StatusCode::UNPROCESSABLE_ENTITY, errors),
        Err(AppError::Conflict { detail, .. }) => {
            let refused = FieldError {
                field: "status_id".into(),
                message: detail,
            };
            (StatusCode::CONFLICT, vec![refused])
        }
        Err(error) => return Err(error),
    };
    let mut issue = service::get_issue(&state.pool, &member, number).await?;
    issue.summary = edit.summary.unwrap_or(issue.summary);
    issue.description = edit.description.unwrap_or(issue.description);
    let page = load_issue_page(&state, &user, &member, issue, errors).await?;
    render_issue(status, &page, &headers)
}

async fn load_issue_page(
    state: &AppState,
    user: &CurrentUser,
    member: &Member,
    issue: Issue,
    errors: Vec<FieldError>,
) -> Result<IssuePage, AppError> {
    let settings = boards::service::get_settings(&state.pool, member).await?;
    let mapped = settings
        .columns
        .into_iter()
        .flat_map(|column| column.statuses);
    let all: Vec<Status> = mapped.chain(settings.unmapped).collect();
    let status_category = all
        .iter()
        .find(|status| status.id == issue.status_id)
        .map_or(StatusCategory::Todo, |status| status.category);
    let statuses = all
        .into_iter()
        .filter(|status| status.column_id.is_some())
        .collect();
    // ponytail: first 200 comments; page with next_cursor when issues get longer threads.
    let first_page = PageParams {
        limit: Some(pagination::MAX_LIMIT),
        cursor: None,
    };
    let comments = service::list_comments(&state.pool, member, issue.number, first_page).await?;
    let people = members::service::list_members(&state.pool, member).await?;
    let comments = comments
        .items
        .into_iter()
        .map(|comment| CommentView {
            author: people
                .iter()
                .find(|person| person.user_id == comment.author_id)
                .map_or_else(
                    || "Former member".into(),
                    |person| person.display_name.clone(),
                ),
            created_at: comment.created_at,
            body: comment.body,
        })
        .collect();
    let sprint_name = match issue.sprint_id {
        Some(sprint_id) => {
            sprints::service::get_sprint(&state.pool, member, sprint_id)
                .await?
                .name
        }
        None => String::new(),
    };
    let subtasks = if issue.issue_type == IssueType::Subtask {
        Vec::new()
    } else {
        let children = IssueFilter {
            parent: vec![issue.key.clone()],
            ..IssueFilter::default()
        };
        // ponytail: first page of subtasks (50); nobody splits an issue further.
        service::search_issues(&state.pool, member, children, PageParams::default())
            .await?
            .items
    };
    Ok(IssuePage {
        shell: shell(&state.pool, user, &member.project_key).await?,
        issue,
        statuses,
        status_category,
        people,
        sprint_name,
        subtasks,
        comments,
        comment: String::new(),
        errors,
    })
}

async fn add_comment(
    State(state): State<AppState>,
    PageUser(user): PageUser,
    member: Member,
    PathParams((_key, number)): PathParams<(String, i64)>,
    headers: HeaderMap,
    Form(input): Form<CreateComment>,
) -> Result<Response, AppError> {
    let typed = input.body.clone();
    let errors = match service::add_comment(&state.pool, &member, number, input).await {
        Ok(_) if wants_fragment(&headers) => Vec::new(),
        Ok(_) => {
            let path = format!("/p/{}/issues/{number}#comments", member.project_key);
            return Ok(Redirect::to(&path).into_response());
        }
        Err(AppError::Validation(errors)) => errors,
        Err(error) => return Err(error),
    };
    let issue = service::get_issue(&state.pool, &member, number).await?;
    let status = if errors.is_empty() {
        StatusCode::OK
    } else {
        StatusCode::UNPROCESSABLE_ENTITY
    };
    let mut page = load_issue_page(&state, &user, &member, issue, errors).await?;
    if status != StatusCode::OK {
        page.comment = typed;
    }
    render_issue(status, &page, &headers)
}

// ponytail: first page only (50 by id); add next links when projects outgrow it.
async fn search_page(
    State(state): State<AppState>,
    PageUser(user): PageUser,
    member: Member,
    QueryParams(filter): QueryParams<IssueFilter>,
) -> Result<Response, AppError> {
    let q = filter.q.clone().unwrap_or_default();
    let found = service::search_issues(&state.pool, &member, filter, PageParams::default()).await?;
    let page = SearchPage {
        shell: shell(&state.pool, &user, &member.project_key).await?,
        q,
        issues: found.items,
    };
    render(StatusCode::OK, &page)
}

/// The create form's typed values; numbers stay text so a bad one comes back as typed.
#[derive(Default, Deserialize)]
#[serde(default)]
struct IssueForm {
    issue_type: IssueType,
    summary: String,
    description: String,
    assignee: String,
    priority: Priority,
    points: String,
    sprint_id: String,
}

impl IssueForm {
    fn to_create(&self) -> Result<CreateIssue, AppError> {
        Ok(CreateIssue {
            summary: self.summary.clone(),
            issue_type: self.issue_type,
            description: self.description.clone(),
            priority: self.priority,
            assignee_id: optional_number(&self.assignee, "assignee")?,
            points: optional_number(&self.points, "points")?,
            sprint_id: optional_number(&self.sprint_id, "sprint_id")?,
            ..CreateIssue::default()
        })
    }
}

#[derive(Template)]
#[template(path = "app/new_issue.html", blocks = ["form"])]
struct NewIssuePage {
    shell: Shell,
    people: Vec<MemberInfo>,
    /// Open sprints of a scrum project; none on kanban.
    sprints: Option<Vec<Sprint>>,
    draft: IssueForm,
    errors: Vec<FieldError>,
}

impl NewIssuePage {
    /// Subtasks need a parent; they are added from their parent's page.
    fn types(&self) -> [IssueType; 4] {
        [
            IssueType::Story,
            IssueType::Task,
            IssueType::Bug,
            IssueType::Epic,
        ]
    }

    fn error(&self, field: &str) -> &str {
        field_error(&self.errors, field)
    }
}

async fn load_new_issue(
    state: &AppState,
    user: &CurrentUser,
    member: &Member,
    draft: IssueForm,
    errors: Vec<FieldError>,
) -> Result<NewIssuePage, AppError> {
    let sprints = match member.board_type {
        BoardType::Scrum => {
            let all = sprints::service::list_sprints(&state.pool, member).await?;
            let open = all
                .into_iter()
                .filter(|sprint| sprint.state != SprintState::Closed);
            Some(open.collect())
        }
        BoardType::Kanban => None,
    };
    Ok(NewIssuePage {
        shell: shell(&state.pool, user, &member.project_key).await?,
        people: members::service::list_members(&state.pool, member).await?,
        sprints,
        draft,
        errors,
    })
}

fn render_new_issue(
    status: StatusCode,
    page: &NewIssuePage,
    headers: &HeaderMap,
) -> Result<Response, AppError> {
    if wants_fragment(headers) {
        return render(status, &page.as_form());
    }
    render(status, page)
}

async fn new_issue_page(
    State(state): State<AppState>,
    PageUser(user): PageUser,
    member: Member,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    let page = load_new_issue(&state, &user, &member, IssueForm::default(), Vec::new()).await?;
    render_new_issue(StatusCode::OK, &page, &headers)
}

/// The global create (IA §5): a plain post lands on the board, the dialog reloads the page behind it.
async fn create_from_form(
    State(state): State<AppState>,
    PageUser(user): PageUser,
    member: Member,
    headers: HeaderMap,
    Form(draft): Form<IssueForm>,
) -> Result<Response, AppError> {
    let created = match draft.to_create() {
        Ok(input) => service::create_issue(&state.pool, &member, input).await,
        Err(error) => Err(error),
    };
    let (status, errors) = match created {
        Ok(_) if wants_fragment(&headers) => {
            return Ok(([("hx-refresh", "true")], StatusCode::OK).into_response());
        }
        Ok(_) => return Ok(Redirect::to(&board_path(&member.project_key)).into_response()),
        Err(AppError::Validation(errors)) => (StatusCode::UNPROCESSABLE_ENTITY, errors),
        Err(AppError::Conflict { detail, .. }) => {
            let refused = FieldError {
                field: "form".into(),
                message: detail,
            };
            (StatusCode::CONFLICT, vec![refused])
        }
        Err(error) => return Err(error),
    };
    let page = load_new_issue(&state, &user, &member, draft, errors).await?;
    render_new_issue(status, &page, &headers)
}
