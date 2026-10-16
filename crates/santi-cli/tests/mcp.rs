mod common;

use std::process::Stdio;

use common::server;
use rmcp::ServiceExt;
use rmcp::model::{CallToolRequestParams, CallToolResult};
use rmcp::service::{RoleClient, RunningService};
use rmcp::transport::streamable_http_client::StreamableHttpClientTransportConfig;
use rmcp::transport::{StreamableHttpClientTransport, TokioChildProcess};
use serde_json::{Value, json};
use tokio::io::{AsyncBufReadExt, BufReader};

type Client = RunningService<RoleClient, ()>;

const TOOLS: [&str; 22] = [
    "add_comment",
    "archive_project",
    "complete_sprint",
    "create_issue",
    "create_sprint",
    "delete_issue",
    "get_backlog",
    "get_board",
    "get_issue",
    "list_comments",
    "list_epics",
    "list_projects",
    "list_sprints",
    "move_issue",
    "plan_issue",
    "purge_project",
    "restore_project",
    "search_issues",
    "start_sprint",
    "trash_project",
    "unarchive_project",
    "update_issue",
];

fn santi(config: &tempfile::TempDir) -> tokio::process::Command {
    let mut command = tokio::process::Command::new(env!("CARGO_BIN_EXE_santi"));
    command
        .arg("mcp")
        .env("XDG_CONFIG_HOME", config.path())
        .env("SANTI_URL", &server().url)
        .env_remove("SANTI_TOKEN")
        .kill_on_drop(true);
    command
}

async fn call(client: &Client, tool: &'static str, arguments: Value) -> CallToolResult {
    let Value::Object(arguments) = arguments else {
        panic!("arguments are an object");
    };
    let request = CallToolRequestParams::new(tool).with_arguments(arguments);
    client.call_tool(request).await.unwrap()
}

/// The tool error's text; panics when the call succeeded.
async fn rejected(client: &Client, tool: &'static str, arguments: Value) -> String {
    let result = call(client, tool, arguments).await;
    assert_eq!(result.is_error, Some(true), "{tool}: {}", text(&result));
    text(&result).to_string()
}

fn text(result: &CallToolResult) -> &str {
    result.content[0].as_text().unwrap().text.as_str()
}

/// The tool's JSON answer; panics with the tool error when it failed.
async fn ok(client: &Client, tool: &'static str, arguments: Value) -> Value {
    let result = call(client, tool, arguments).await;
    assert_ne!(result.is_error, Some(true), "{tool}: {}", text(&result));
    serde_json::from_str(text(&result)).unwrap()
}

#[test]
fn stdio_lists_described_tools_and_drives_a_sprint() {
    let token = server().user();
    server().project(&token, "MCP", "scrum");
    let config = tempfile::tempdir().unwrap();
    server().block_on(async {
        let mut command = santi(&config);
        command.env("SANTI_TOKEN", &token);
        let client = ().serve(TokioChildProcess::new(command).unwrap()).await.unwrap();

        let info = client.peer_info().unwrap();
        assert!(info.instructions.as_deref().unwrap().contains("WEB-12"));
        let tools = client.list_all_tools().await.unwrap();
        let mut names: Vec<&str> = tools.iter().map(|tool| tool.name.as_ref()).collect();
        names.sort_unstable();
        assert_eq!(names, TOOLS);
        let tool = |name: &str| tools.iter().find(|tool| tool.name == name).unwrap();
        let hints = |name: &str| tool(name).annotations.clone().unwrap();
        assert_eq!(hints("get_board").read_only_hint, Some(true));
        assert_eq!(hints("list_comments").read_only_hint, Some(true));
        assert_eq!(hints("delete_issue").destructive_hint, Some(true));
        assert_eq!(hints("purge_project").destructive_hint, Some(true));
        assert_eq!(hints("trash_project").destructive_hint, Some(false));
        assert_eq!(hints("archive_project").destructive_hint, Some(false));
        assert_eq!(hints("create_issue").destructive_hint, Some(false));
        let schema = Value::Object((*tool("create_issue").input_schema).clone());
        assert_eq!(schema["required"], json!(["project", "summary"]));
        assert!(
            tool("move_issue")
                .description
                .as_deref()
                .unwrap()
                .contains("WEB-12")
        );

        let projects = ok(&client, "list_projects", json!({})).await;
        assert!(
            projects
                .as_array()
                .unwrap()
                .iter()
                .any(|p| p["key"] == "MCP")
        );
        let epic = ok(
            &client,
            "create_issue",
            json!({ "project": "MCP", "summary": "Checkout", "issue_type": "epic" }),
        )
        .await;
        assert_eq!(epic["key"], "MCP-1");
        let story = ok(
            &client,
            "create_issue",
            json!({ "project": "MCP", "summary": "Pay by card", "parent": "MCP-1" }),
        )
        .await;
        assert_eq!(story["key"], "MCP-2");
        let epics = ok(&client, "list_epics", json!({ "project": "MCP" })).await;
        assert_eq!(epics["items"][0]["key"], "MCP-1");

        let edited = ok(
            &client,
            "update_issue",
            json!({ "issue": "MCP-2", "points": 3, "priority": "high" }),
        )
        .await;
        assert_eq!(edited["points"], 3.0);
        let cleared = ok(
            &client,
            "update_issue",
            json!({ "issue": "MCP-2", "points": null }),
        )
        .await;
        assert_eq!(cleared["points"], Value::Null);
        ok(
            &client,
            "add_comment",
            json!({ "issue": "MCP-2", "body": "Needs 3DS" }),
        )
        .await;
        let comments = ok(
            &client,
            "list_comments",
            json!({ "issue": "MCP-2", "limit": 1 }),
        )
        .await;
        assert_eq!(comments["items"][0]["body"], "Needs 3DS");
        assert_eq!(comments["next_cursor"], Value::Null);

        let sprint = ok(
            &client,
            "create_sprint",
            json!({ "project": "MCP", "goal": "Ship it" }),
        )
        .await;
        let sprint_id = sprint["id"].as_i64().unwrap();
        let planned = ok(
            &client,
            "plan_issue",
            json!({ "issue": "MCP-2", "sprint_id": sprint_id }),
        )
        .await;
        assert_eq!(planned["sprint_id"], sprint_id);
        let sprints = ok(&client, "list_sprints", json!({ "project": "MCP" })).await;
        assert_eq!(sprints[0]["state"], "future");
        let started = ok(
            &client,
            "start_sprint",
            json!({ "project": "MCP", "sprint_id": sprint_id }),
        )
        .await;
        assert_eq!(started["state"], "active");

        let moved = ok(
            &client,
            "move_issue",
            json!({ "issue": "mcp-2", "status": "in progress" }),
        )
        .await;
        let board = ok(&client, "get_board", json!({ "project": "MCP" })).await;
        let column = board["columns"]
            .as_array()
            .unwrap()
            .iter()
            .find(|column| column["name"] == "In Progress")
            .unwrap();
        assert_eq!(column["cards"][0]["key"], "MCP-2");
        assert_eq!(column["cards"][0]["status_id"], moved["status_id"]);
        let found = ok(
            &client,
            "search_issues",
            json!({ "project": "MCP", "q": "card", "status": ["in_progress"] }),
        )
        .await;
        assert_eq!(found["items"][0]["key"], "MCP-2");

        let closed = ok(
            &client,
            "complete_sprint",
            json!({ "project": "MCP", "sprint_id": sprint_id }),
        )
        .await;
        assert_eq!(closed["state"], "closed");
        let backlog = ok(&client, "get_backlog", json!({ "project": "MCP" })).await;
        assert!(
            backlog["sections"]
                .as_array()
                .unwrap()
                .iter()
                .any(|section| section["cards"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|card| card["key"] == "MCP-2"))
        );
        let unplanned = ok(
            &client,
            "plan_issue",
            json!({ "issue": "MCP-2", "sprint_id": null }),
        )
        .await;
        assert_eq!(unplanned["sprint_id"], Value::Null);

        ok(&client, "delete_issue", json!({ "issue": "MCP-2" })).await;
        let missing = call(&client, "get_issue", json!({ "issue": "MCP-2" })).await;
        assert_eq!(missing.is_error, Some(true));
        assert_eq!(text(&missing), "Nothing exists here, or you cannot see it.");
        let bad_key = call(&client, "get_issue", json!({ "issue": "MCP" })).await;
        assert!(text(&bad_key).contains("PROJECT-NUMBER"));
        let bad_status = call(
            &client,
            "move_issue",
            json!({ "issue": "MCP-1", "status": "Nowhere" }),
        )
        .await;
        assert!(text(&bad_status).contains("To Do"), "{}", text(&bad_status));
        assert_eq!(
            ok(&client, "get_issue", json!({ "issue": "MCP-1" })).await["key"],
            "MCP-1"
        );

        client.cancel().await.unwrap();
    });
}

#[test]
fn stdio_rejects_missing_unknown_and_malformed_arguments() {
    let token = server().user();
    server().project(&token, "ARG", "scrum");
    let config = tempfile::tempdir().unwrap();
    server().block_on(async {
        let mut command = santi(&config);
        command.env("SANTI_TOKEN", &token);
        let client = ().serve(TokioChildProcess::new(command).unwrap()).await.unwrap();

        let info = client.peer_info().unwrap();
        assert!(info.instructions.as_deref().unwrap().contains("untrusted"));
        let tools = client.list_all_tools().await.unwrap();
        for tool in &tools {
            let schema = Value::Object((*tool.input_schema).clone());
            assert_eq!(schema["additionalProperties"], false, "{}", tool.name);
        }
        let tool = |name: &str| tools.iter().find(|tool| tool.name == name).unwrap();
        let plan = Value::Object((*tool("plan_issue").input_schema).clone());
        assert_eq!(plan["required"], json!(["issue", "sprint_id"]));
        for name in [
            "get_issue",
            "get_board",
            "get_backlog",
            "search_issues",
            "list_epics",
        ] {
            let description = tool(name).description.as_deref().unwrap();
            assert!(description.contains("untrusted"), "{name}: {description}");
        }

        ok(
            &client,
            "create_issue",
            json!({ "project": "ARG", "summary": "Keep" }),
        )
        .await;
        let sprint = ok(&client, "create_sprint", json!({ "project": "ARG" })).await;
        ok(
            &client,
            "plan_issue",
            json!({ "issue": "ARG-1", "sprint_id": sprint["id"] }),
        )
        .await;
        let unplanned = rejected(&client, "plan_issue", json!({ "issue": "ARG-1" })).await;
        assert!(unplanned.contains("sprint_id"), "{unplanned}");
        let issue = ok(&client, "get_issue", json!({ "issue": "ARG-1" })).await;
        assert_eq!(issue["sprint_id"], sprint["id"]);

        let typo = rejected(
            &client,
            "update_issue",
            json!({ "issue": "ARG-1", "summry": "Oops" }),
        )
        .await;
        assert!(typo.contains("unknown argument `summry`"), "{typo}");
        let flattened = rejected(
            &client,
            "search_issues",
            json!({ "project": "ARG", "qq": "x" }),
        )
        .await;
        assert!(flattened.contains("unknown argument `qq`"), "{flattened}");
        for (tool, arguments, name) in [
            (
                "update_issue",
                json!({ "issue": "ARG-1", "parent_key": "ARG-2" }),
                "parent_key",
            ),
            (
                "create_issue",
                json!({ "project": "ARG", "summary": "x", "status": "todo" }),
                "status",
            ),
            (
                "create_sprint",
                json!({ "project": "ARG", "goals": "x" }),
                "goals",
            ),
            (
                "start_sprint",
                json!({ "project": "ARG", "sprint_id": sprint["id"], "end": "2026-01-01" }),
                "end",
            ),
        ] {
            let message = rejected(&client, tool, arguments).await;
            assert!(message.contains(&format!("`{name}`")), "{tool}: {message}");
        }
        let untouched = ok(&client, "get_issue", json!({ "issue": "ARG-1" })).await;
        assert_eq!(untouched["parent_key"], Value::Null);

        for project in ["../tokens", "ARG/x", ""] {
            let message = rejected(&client, "get_board", json!({ "project": project })).await;
            assert!(message.contains("project key"), "{message}");
        }
        let lower = ok(&client, "get_board", json!({ "project": "arg" })).await;
        assert!(lower["columns"].is_array());
        client.cancel().await.unwrap();
    });
}

#[test]
fn stdio_without_a_token_answers_tool_errors() {
    let config = tempfile::tempdir().unwrap();
    server().block_on(async {
        let client = ().serve(TokioChildProcess::new(santi(&config)).unwrap()).await.unwrap();
        let result = call(&client, "list_projects", json!({})).await;
        assert_eq!(result.is_error, Some(true));
        assert!(text(&result).contains("santi login"), "{}", text(&result));
        client.cancel().await.unwrap();
    });
}

/// Starts `santi mcp --http 127.0.0.1:0` and returns the child with the endpoint it printed.
async fn http_server(
    config: &tempfile::TempDir,
    extra: &[&str],
) -> (tokio::process::Child, String) {
    let mut command = santi(config);
    command
        .args(["--http", "127.0.0.1:0"])
        .args(extra)
        .stderr(Stdio::piped());
    let mut child = command.spawn().unwrap();
    let mut lines = BufReader::new(child.stderr.take().unwrap()).lines();
    let line = lines.next_line().await.unwrap().unwrap();
    let endpoint = line
        .split_whitespace()
        .find(|word| word.starts_with("http://"))
        .unwrap();
    (child, endpoint.to_string())
}

/// Ctrl-C shuts the server down cleanly.
async fn interrupt(mut child: tokio::process::Child) {
    let pid = child.id().unwrap().to_string();
    let interrupted = std::process::Command::new("kill")
        .args(["-INT", &pid])
        .status();
    assert!(interrupted.unwrap().success());
    let exit = tokio::time::timeout(std::time::Duration::from_secs(10), child.wait()).await;
    assert!(exit.unwrap().unwrap().success());
}

fn initialize() -> Value {
    json!({ "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": { "protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": { "name": "test", "version": "1" } } })
}

/// A hand-made Streamable HTTP request, for what the rmcp client never sends.
fn raw(method: reqwest::Method, endpoint: &str, authorization: &str) -> reqwest::RequestBuilder {
    reqwest::Client::new()
        .request(method, endpoint)
        .header("accept", "application/json, text/event-stream")
        .header("authorization", authorization)
}

async fn connect(endpoint: &str, token: &str) -> Result<Client, String> {
    let config = StreamableHttpClientTransportConfig::with_uri(endpoint).auth_header(token);
    ().serve(StreamableHttpClientTransport::from_config(config))
        .await
        .map_err(|error| error.to_string())
}

#[test]
fn streamable_http_requires_a_bearer_and_acts_as_its_user() {
    let token = server().user();
    server().project(&token, "HTP", "kanban");
    let config = tempfile::tempdir().unwrap();
    server().block_on(async {
        let (child, endpoint) = http_server(&config, &[]).await;

        let anonymous = reqwest::Client::new()
            .post(&endpoint)
            .header("accept", "application/json, text/event-stream")
            .json(&initialize())
            .send()
            .await
            .unwrap();
        assert_eq!(anonymous.status(), 401);
        assert_eq!(anonymous.headers()["www-authenticate"], "Bearer");

        let lowercase = raw(
            reqwest::Method::POST,
            &endpoint,
            &format!("bearer  {token}"),
        )
        .json(&initialize())
        .send()
        .await
        .unwrap();
        assert_eq!(lowercase.status(), 200);
        assert!(lowercase.headers().contains_key("mcp-session-id"));

        let client = connect(&endpoint, &token).await.unwrap();
        assert_eq!(client.list_all_tools().await.unwrap().len(), TOOLS.len());
        let created = ok(
            &client,
            "create_issue",
            json!({ "project": "HTP", "summary": "Over HTTP" }),
        )
        .await;
        assert_eq!(created["key"], "HTP-1");
        ok(
            &client,
            "move_issue",
            json!({ "issue": "HTP-1", "status": "Done" }),
        )
        .await;
        let found = ok(
            &client,
            "search_issues",
            json!({ "project": "HTP", "q": "http", "status": ["done"] }),
        )
        .await;
        assert_eq!(found["items"][0]["key"], "HTP-1");
        client.cancel().await.unwrap();

        let stranger = raw(reqwest::Method::POST, &endpoint, "Bearer santi_unknown")
            .json(&initialize())
            .send()
            .await
            .unwrap();
        assert_eq!(stranger.status(), 401);
        let message = stranger.text().await.unwrap();
        assert!(
            message.ends_with("Send a valid santi API token as `Authorization: Bearer <token>`."),
            "{message}"
        );
        assert!(connect(&endpoint, "santi_unknown").await.is_err());

        interrupt(child).await;
    });
}

#[test]
fn streamable_http_keeps_each_session_to_its_token() {
    let (alice, bob) = (server().user(), server().user());
    server().project(&alice, "ALC", "kanban");
    server().project(&bob, "BOB", "kanban");
    let config = tempfile::tempdir().unwrap();
    server().block_on(async {
        let (child, endpoint) = http_server(&config, &[]).await;

        let (first, second) = tokio::join!(connect(&endpoint, &alice), connect(&endpoint, &bob));
        let (first, second) = (first.unwrap(), second.unwrap());
        let (seen_first, seen_second) = tokio::join!(
            ok(&first, "list_projects", json!({})),
            ok(&second, "list_projects", json!({}))
        );
        let keys = |projects: &Value| -> Vec<String> {
            let projects = projects.as_array().unwrap();
            projects
                .iter()
                .map(|project| project["key"].as_str().unwrap().to_string())
                .collect()
        };
        assert_eq!(keys(&seen_first), ["ALC"]);
        assert_eq!(keys(&seen_second), ["BOB"]);
        first.cancel().await.unwrap();
        second.cancel().await.unwrap();

        let opened = raw(reqwest::Method::POST, &endpoint, &format!("Bearer {alice}"))
            .json(&initialize())
            .send()
            .await
            .unwrap();
        let session = opened.headers()["mcp-session-id"]
            .to_str()
            .unwrap()
            .to_string();
        let list = json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list" });
        for method in [
            reqwest::Method::POST,
            reqwest::Method::GET,
            reqwest::Method::DELETE,
        ] {
            let hijack = raw(method.clone(), &endpoint, &format!("Bearer {bob}"))
                .header("mcp-session-id", &session)
                .json(&list)
                .send()
                .await
                .unwrap();
            assert_eq!(hijack.status(), 404, "{method}");
        }
        let closed = raw(
            reqwest::Method::DELETE,
            &endpoint,
            &format!("Bearer {alice}"),
        )
        .header("mcp-session-id", &session)
        .send()
        .await
        .unwrap();
        assert!(closed.status().is_success(), "{}", closed.status());

        interrupt(child).await;
    });
}

#[test]
fn streamable_http_checks_the_host_and_caps_sessions() {
    let token = server().user();
    let config = tempfile::tempdir().unwrap();
    server().block_on(async {
        let (child, endpoint) =
            http_server(&config, &["--allowed-host", "santi.example.com"]).await;
        let open = |host: &'static str| {
            raw(reqwest::Method::POST, &endpoint, &format!("Bearer {token}"))
                .header("host", host)
                .json(&initialize())
                .send()
        };
        assert_eq!(open("evil.example.com").await.unwrap().status(), 403);
        assert_eq!(open("santi.example.com").await.unwrap().status(), 200);
        for _ in 1..100 {
            assert_eq!(open("localhost").await.unwrap().status(), 200);
        }
        let full = open("localhost").await.unwrap();
        assert_eq!(full.status(), 503);

        interrupt(child).await;
    });
}

#[test]
fn stdio_archives_trashes_restores_and_purges_a_project() {
    let token = server().user();
    server().project(&token, "GONE", "kanban");
    let config = tempfile::tempdir().unwrap();
    server().block_on(async {
        let mut command = santi(&config);
        command.env("SANTI_TOKEN", &token);
        let client = ().serve(TokioChildProcess::new(command).unwrap()).await.unwrap();
        let project = json!({ "project": "GONE" });
        let keys = |projects: Value| -> Vec<String> {
            projects
                .as_array()
                .unwrap()
                .iter()
                .map(|project| project["key"].as_str().unwrap().to_string())
                .collect()
        };

        ok(&client, "archive_project", project.clone()).await;
        assert!(keys(ok(&client, "list_projects", json!({})).await).is_empty());
        let archived = ok(&client, "list_projects", json!({ "state": "archived" })).await;
        assert_eq!(keys(archived), ["GONE"]);
        let read_only = rejected(
            &client,
            "create_issue",
            json!({ "project": "GONE", "summary": "x" }),
        )
        .await;
        assert!(read_only.contains("archived"), "{read_only}");
        ok(&client, "unarchive_project", project.clone()).await;
        ok(&client, "trash_project", project.clone()).await;
        let trashed = ok(&client, "list_projects", json!({ "state": "trashed" })).await;
        assert_eq!(trashed[0]["state"], "trashed");
        ok(&client, "restore_project", project.clone()).await;
        ok(&client, "trash_project", project.clone()).await;
        ok(&client, "purge_project", project.clone()).await;
        assert!(keys(ok(&client, "list_projects", json!({ "state": "trashed" })).await).is_empty());
        client.cancel().await.unwrap();
    });
}
