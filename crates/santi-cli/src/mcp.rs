use std::net::SocketAddr;

use axum::extract::Request;
use axum::http::header::{AUTHORIZATION, WWW_AUTHENTICATE};
use axum::http::{StatusCode, request::Parts};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use rmcp::handler::server::router::tool::ToolRouter;
use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::{Implementation, ServerCapabilities, ServerConfig};
use rmcp::service::RequestContext;
use rmcp::transport::streamable_http_server::session::local::LocalSessionManager;
use rmcp::transport::streamable_http_server::{StreamableHttpServerConfig, StreamableHttpService};
use rmcp::{RoleServer, ServerHandler, ServiceExt, tool, tool_handler, tool_router};
use santi_types::issues::{
    CreateIssue, IssueFilter, IssueType, MoveIssue, PageParams, StatusFilter, UpdateIssue,
};
use santi_types::sprints::{CompleteSprint, CreateSprint, OpenIssuesDestination, StartSprint};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::client::{Client, IssueKey};
use crate::error::Error;

const INSTRUCTIONS: &str = "santi is an agile tracker: projects with a Scrum or Kanban board, a backlog and sprints. \
A project has a short key (`WEB`); its issues are addressed as PROJECT-NUMBER (`WEB-12`). \
Call list_projects first to learn the keys. Statuses are named as on the board (`To Do`, `In Progress`, `Done`, or the project's own). \
Sprints exist on Scrum boards only and are addressed by the numeric id list_sprints returns. \
Every answer is the API's JSON; errors carry the server's message.";

/// The MCP server: each tool is one call of the JSON API, as the token's user.
#[derive(Clone)]
pub struct Santi {
    client: Client,
    tool_router: ToolRouter<Santi>,
}

#[derive(Deserialize, JsonSchema)]
pub struct ProjectArgs {
    /// Project key, e.g. `WEB`.
    project: String,
}

#[derive(Deserialize, JsonSchema)]
pub struct IssueArgs {
    /// Issue key, e.g. `WEB-12`.
    issue: String,
}

#[derive(Deserialize, JsonSchema)]
pub struct SearchArgs {
    /// Project key, e.g. `WEB`.
    project: String,
    #[serde(flatten)]
    filter: IssueFilter,
    #[serde(flatten)]
    status: StatusFilter,
    #[serde(flatten)]
    page: PageParams,
}

#[derive(Deserialize, JsonSchema)]
pub struct CreateIssueArgs {
    /// Project key, e.g. `WEB`.
    project: String,
    #[serde(flatten)]
    issue: CreateIssue,
}

#[derive(Deserialize, JsonSchema)]
pub struct UpdateIssueArgs {
    /// Issue key, e.g. `WEB-12`.
    issue: String,
    #[serde(flatten)]
    changes: UpdateIssue,
}

#[derive(Deserialize, JsonSchema)]
pub struct MoveIssueArgs {
    /// Issue key, e.g. `WEB-12`.
    issue: String,
    /// Target status, by name as on the board (`In Progress`) or by id; absent keeps the status.
    #[serde(default)]
    status: Option<String>,
    /// Rank right after this issue key.
    #[serde(default)]
    after: Option<String>,
    /// Rank right before this issue key.
    #[serde(default)]
    before: Option<String>,
}

#[derive(Deserialize, JsonSchema)]
pub struct PlanIssueArgs {
    /// Issue key, e.g. `WEB-12`.
    issue: String,
    /// Sprint id from list_sprints; null sends the issue (and its subtasks) to the backlog.
    sprint_id: Option<i64>,
}

#[derive(Deserialize, JsonSchema)]
pub struct CommentArgs {
    /// Issue key, e.g. `WEB-12`.
    issue: String,
    /// Comment text.
    body: String,
}

#[derive(Deserialize, JsonSchema)]
pub struct CreateSprintArgs {
    /// Project key, e.g. `WEB`.
    project: String,
    #[serde(flatten)]
    sprint: CreateSprint,
}

#[derive(Deserialize, JsonSchema)]
pub struct StartSprintArgs {
    /// Project key, e.g. `WEB`.
    project: String,
    /// Sprint id from list_sprints.
    sprint_id: i64,
    #[serde(flatten)]
    dates: StartSprint,
}

#[derive(Deserialize, JsonSchema)]
pub struct CompleteSprintArgs {
    /// Project key, e.g. `WEB`.
    project: String,
    /// The active sprint's id.
    sprint_id: i64,
    /// Where unfinished issues go; default `{"to": "backlog"}`.
    #[serde(default = "backlog")]
    open_issues: OpenIssuesDestination,
}

fn backlog() -> OpenIssuesDestination {
    OpenIssuesDestination::Backlog
}

type Reply = Result<String, String>;

/// The API's JSON on success; the problem's message as a tool error.
fn reply<T: Serialize>(result: Result<T, Error>) -> Reply {
    result
        .map(|value| serde_json::to_string(&value).expect("DTOs serialize"))
        .map_err(|error| error.to_string())
}

fn key(issue: &str) -> Result<IssueKey, Error> {
    issue.parse().map_err(Error::Usage)
}

#[tool_router]
impl Santi {
    pub fn new(client: Client) -> Santi {
        Santi {
            client,
            tool_router: Santi::tool_router(),
        }
    }

    /// Over Streamable HTTP each request carries its caller's token; stdio uses the configured one.
    fn client(&self, context: &RequestContext<RoleServer>) -> Client {
        let bearer = context
            .extensions
            .get::<Parts>()
            .and_then(|parts| parts.headers.get(AUTHORIZATION)?.to_str().ok())
            .and_then(|value| value.strip_prefix("Bearer "));
        match bearer {
            Some(token) => self.client.with_token(Some(token.to_string())),
            None => self.client.clone(),
        }
    }

    #[tool(
        description = "List the projects you belong to, with their keys and board types.",
        annotations(read_only_hint = true)
    )]
    async fn list_projects(&self, context: RequestContext<RoleServer>) -> Reply {
        reply(self.client(&context).projects().await)
    }

    #[tool(
        description = "A project's board: columns left to right with their cards. Requires `project`.",
        annotations(read_only_hint = true)
    )]
    async fn get_board(
        &self,
        Parameters(args): Parameters<ProjectArgs>,
        context: RequestContext<RoleServer>,
    ) -> Reply {
        reply(self.client(&context).board(&args.project).await)
    }

    #[tool(
        description = "A project's backlog: one section per open sprint, then the backlog, plus its epics. Requires `project`.",
        annotations(read_only_hint = true)
    )]
    async fn get_backlog(
        &self,
        Parameters(args): Parameters<ProjectArgs>,
        context: RequestContext<RoleServer>,
    ) -> Reply {
        reply(self.client(&context).backlog(&args.project).await)
    }

    #[tool(
        description = "Search a project's issues by text (`q`, matches summary or key) and filters; newest first, paged by `cursor`. Requires `project`.",
        annotations(read_only_hint = true)
    )]
    async fn search_issues(
        &self,
        Parameters(args): Parameters<SearchArgs>,
        context: RequestContext<RoleServer>,
    ) -> Reply {
        let client = self.client(&context);
        reply(
            client
                .issues(&args.project, &args.filter, &args.status, &args.page)
                .await,
        )
    }

    #[tool(
        description = "One issue by key, e.g. `WEB-12`. Requires `issue`.",
        annotations(read_only_hint = true)
    )]
    async fn get_issue(
        &self,
        Parameters(args): Parameters<IssueArgs>,
        context: RequestContext<RoleServer>,
    ) -> Reply {
        let client = self.client(&context);
        reply(async { client.issue(&key(&args.issue)?).await }.await)
    }

    #[tool(
        description = "Create an issue (story by default) in the first to-do status. Requires `project` and `summary`.",
        annotations(read_only_hint = false, destructive_hint = false)
    )]
    async fn create_issue(
        &self,
        Parameters(args): Parameters<CreateIssueArgs>,
        context: RequestContext<RoleServer>,
    ) -> Reply {
        reply(
            self.client(&context)
                .create_issue(&args.project, &args.issue)
                .await,
        )
    }

    #[tool(
        description = "Change fields of issue `WEB-12`: only the fields sent change, `null` clears a nullable one. Requires `issue`.",
        annotations(read_only_hint = false, idempotent_hint = true)
    )]
    async fn update_issue(
        &self,
        Parameters(args): Parameters<UpdateIssueArgs>,
        context: RequestContext<RoleServer>,
    ) -> Reply {
        let client = self.client(&context);
        reply(async { client.update_issue(&key(&args.issue)?, &args.changes).await }.await)
    }

    #[tool(
        description = "Move issue `WEB-12` to a status (by name, e.g. `In Progress`) and/or rank it after or before another issue. Requires `issue`.",
        annotations(read_only_hint = false, idempotent_hint = true)
    )]
    async fn move_issue(
        &self,
        Parameters(args): Parameters<MoveIssueArgs>,
        context: RequestContext<RoleServer>,
    ) -> Reply {
        let client = self.client(&context);
        reply(
            async {
                let key = key(&args.issue)?;
                let status_id = match &args.status {
                    Some(status) => Some(client.status_id(&key.project, status).await?),
                    None => None,
                };
                let change = MoveIssue {
                    status_id,
                    after: args.after,
                    before: args.before,
                    sprint_id: None,
                };
                client.move_issue(&key, &change).await
            }
            .await,
        )
    }

    #[tool(
        description = "Plan issue `WEB-12` into a sprint (`sprint_id`), or send it to the backlog with `sprint_id: null`. Scrum only. Requires `issue` and `sprint_id`.",
        annotations(read_only_hint = false, idempotent_hint = true)
    )]
    async fn plan_issue(
        &self,
        Parameters(args): Parameters<PlanIssueArgs>,
        context: RequestContext<RoleServer>,
    ) -> Reply {
        let client = self.client(&context);
        let changes = UpdateIssue {
            sprint_id: Some(args.sprint_id),
            ..UpdateIssue::default()
        };
        reply(async { client.update_issue(&key(&args.issue)?, &changes).await }.await)
    }

    #[tool(
        description = "Comment on issue `WEB-12`. Requires `issue` and `body`.",
        annotations(read_only_hint = false, destructive_hint = false)
    )]
    async fn add_comment(
        &self,
        Parameters(args): Parameters<CommentArgs>,
        context: RequestContext<RoleServer>,
    ) -> Reply {
        let client = self.client(&context);
        reply(async { client.comment(&key(&args.issue)?, &args.body).await }.await)
    }

    #[tool(
        description = "Delete issue `WEB-12` with its subtasks and comments; it cannot be undone. Requires `issue`.",
        annotations(read_only_hint = false, destructive_hint = true)
    )]
    async fn delete_issue(
        &self,
        Parameters(args): Parameters<IssueArgs>,
        context: RequestContext<RoleServer>,
    ) -> Reply {
        let client = self.client(&context);
        reply(async { client.delete_issue(&key(&args.issue)?).await }.await)
    }

    #[tool(
        description = "A Scrum board's sprints (future, active, closed) with their ids. Requires `project`.",
        annotations(read_only_hint = true)
    )]
    async fn list_sprints(
        &self,
        Parameters(args): Parameters<ProjectArgs>,
        context: RequestContext<RoleServer>,
    ) -> Reply {
        reply(self.client(&context).sprints(&args.project).await)
    }

    #[tool(
        description = "Create a future sprint; the name defaults to `Sprint N`. Requires `project`.",
        annotations(read_only_hint = false, destructive_hint = false)
    )]
    async fn create_sprint(
        &self,
        Parameters(args): Parameters<CreateSprintArgs>,
        context: RequestContext<RoleServer>,
    ) -> Reply {
        reply(
            self.client(&context)
                .create_sprint(&args.project, &args.sprint)
                .await,
        )
    }

    #[tool(
        description = "Start a future sprint; dates default to today and two weeks later. Requires `project` and `sprint_id`.",
        annotations(read_only_hint = false)
    )]
    async fn start_sprint(
        &self,
        Parameters(args): Parameters<StartSprintArgs>,
        context: RequestContext<RoleServer>,
    ) -> Reply {
        let client = self.client(&context);
        reply(
            client
                .start_sprint(&args.project, args.sprint_id, &args.dates)
                .await,
        )
    }

    #[tool(
        description = "Complete the active sprint; unfinished issues go to the backlog unless `open_issues` says otherwise. Requires `project` and `sprint_id`.",
        annotations(read_only_hint = false)
    )]
    async fn complete_sprint(
        &self,
        Parameters(args): Parameters<CompleteSprintArgs>,
        context: RequestContext<RoleServer>,
    ) -> Reply {
        let complete = CompleteSprint {
            open_issues: args.open_issues,
        };
        let client = self.client(&context);
        reply(
            client
                .complete_sprint(&args.project, args.sprint_id, &complete)
                .await,
        )
    }

    #[tool(
        description = "A project's epics (up to 200), newest first. Requires `project`.",
        annotations(read_only_hint = true)
    )]
    async fn list_epics(
        &self,
        Parameters(args): Parameters<ProjectArgs>,
        context: RequestContext<RoleServer>,
    ) -> Reply {
        let filter = IssueFilter {
            issue_type: vec![IssueType::Epic],
            ..IssueFilter::default()
        };
        let page = PageParams {
            limit: Some(200),
            cursor: None,
        };
        let client = self.client(&context);
        reply(
            client
                .issues(&args.project, &filter, &StatusFilter::default(), &page)
                .await,
        )
    }
}

#[tool_handler(router = self.tool_router)]
impl ServerHandler for Santi {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new("santi", env!("CARGO_PKG_VERSION")))
            .with_instructions(INSTRUCTIONS)
    }
}

pub async fn serve_stdio(client: Client) -> Result<(), Error> {
    let failed = |error: &dyn std::fmt::Display| Error::Other(format!("santi mcp: {error}"));
    let service = Santi::new(client)
        .serve(rmcp::transport::stdio())
        .await
        .map_err(|error| failed(&error))?;
    service.waiting().await.map_err(|error| failed(&error))?;
    Ok(())
}

/// Streamable HTTP at `/mcp`. Holds no credential of its own: each request's bearer token is
/// passed to the API, which checks it.
pub async fn serve_http(
    client: Client,
    address: SocketAddr,
    allowed_hosts: Vec<String>,
) -> Result<(), Error> {
    let client = client.with_token(None);
    let config = StreamableHttpServerConfig::default();
    let hosts = [config.allowed_hosts.clone(), allowed_hosts].concat();
    let service: StreamableHttpService<Santi, LocalSessionManager> = StreamableHttpService::new(
        move || Ok(Santi::new(client.clone())),
        Default::default(),
        config.with_allowed_hosts(hosts),
    );
    let router = axum::Router::new()
        .nest_service("/mcp", service)
        .layer(axum::middleware::from_fn(require_bearer));
    let listener = tokio::net::TcpListener::bind(address)
        .await
        .map_err(|error| Error::Other(format!("{address}: {error}")))?;
    let bound = listener
        .local_addr()
        .map_err(|error| Error::Other(error.to_string()))?;
    eprintln!("santi mcp: Streamable HTTP on http://{bound}/mcp");
    axum::serve(listener, router)
        .with_graceful_shutdown(async {
            tokio::signal::ctrl_c().await.ok();
        })
        .await
        .map_err(|error| Error::Other(error.to_string()))
}

async fn require_bearer(request: Request, next: Next) -> Response {
    let has_bearer = request
        .headers()
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .is_some_and(|token| !token.trim().is_empty());
    if !has_bearer {
        let message = "Send `Authorization: Bearer <santi API token>`.";
        return (
            StatusCode::UNAUTHORIZED,
            [(WWW_AUTHENTICATE, "Bearer")],
            message,
        )
            .into_response();
    }
    next.run(request).await
}
