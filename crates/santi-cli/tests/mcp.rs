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

const TOOLS: [&str; 16] = [
    "add_comment",
    "complete_sprint",
    "create_issue",
    "create_sprint",
    "delete_issue",
    "get_backlog",
    "get_board",
    "get_issue",
    "list_epics",
    "list_projects",
    "list_sprints",
    "move_issue",
    "plan_issue",
    "search_issues",
    "start_sprint",
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
        assert_eq!(hints("delete_issue").destructive_hint, Some(true));
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
async fn http_server(config: &tempfile::TempDir) -> (tokio::process::Child, String) {
    let mut command = santi(config);
    command
        .args(["--http", "127.0.0.1:0"])
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

#[test]
fn streamable_http_requires_a_bearer_and_acts_as_its_user() {
    let token = server().user();
    server().project(&token, "HTP", "kanban");
    let config = tempfile::tempdir().unwrap();
    server().block_on(async {
        let (mut child, endpoint) = http_server(&config).await;

        let initialize = json!({ "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": { "protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": { "name": "test", "version": "1" } } });
        let anonymous = reqwest::Client::new()
            .post(&endpoint)
            .header("accept", "application/json, text/event-stream")
            .json(&initialize)
            .send()
            .await
            .unwrap();
        assert_eq!(anonymous.status(), 401);
        assert_eq!(anonymous.headers()["www-authenticate"], "Bearer");

        let config = StreamableHttpClientTransportConfig::with_uri(endpoint.as_str()).auth_header(token);
        let client = ().serve(StreamableHttpClientTransport::from_config(config)).await.unwrap();
        assert_eq!(client.list_all_tools().await.unwrap().len(), TOOLS.len());
        let created = ok(&client, "create_issue", json!({ "project": "HTP", "summary": "Over HTTP" })).await;
        assert_eq!(created["key"], "HTP-1");
        ok(&client, "move_issue", json!({ "issue": "HTP-1", "status": "Done" })).await;
        let found = ok(&client, "search_issues", json!({ "project": "HTP", "q": "http", "status": ["done"] })).await;
        assert_eq!(found["items"][0]["key"], "HTP-1");
        client.cancel().await.unwrap();

        let stranger = StreamableHttpClientTransportConfig::with_uri(endpoint.as_str()).auth_header("santi_unknown");
        let client = ().serve(StreamableHttpClientTransport::from_config(stranger)).await.unwrap();
        let denied = call(&client, "list_projects", json!({})).await;
        assert_eq!(denied.is_error, Some(true));
        client.cancel().await.unwrap();

        // Ctrl-C shuts the server down cleanly.
        let pid = child.id().unwrap().to_string();
        let interrupted = std::process::Command::new("kill").args(["-INT", &pid]).status();
        assert!(interrupted.unwrap().success());
        let exit = tokio::time::timeout(std::time::Duration::from_secs(10), child.wait()).await;
        assert!(exit.unwrap().unwrap().success());
    });
}
