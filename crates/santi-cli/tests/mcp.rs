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

const TOOLS: [&str; 31] = [
    "add_attachment",
    "add_comment",
    "archive_project",
    "complete_sprint",
    "create_issue",
    "create_project",
    "create_sprint",
    "delete_comment",
    "delete_issue",
    "edit_comment",
    "get_backlog",
    "get_board",
    "get_issue",
    "get_sprint_report",
    "list_attachments",
    "list_comments",
    "list_epics",
    "list_invites",
    "list_members",
    "list_projects",
    "list_sprints",
    "move_issue",
    "plan_issue",
    "purge_project",
    "restore_project",
    "revoke_invite",
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
    server().post(
        &token,
        "/api/projects/MCP/invites",
        json!({ "role": "member" }),
    );
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
        assert_eq!(hints("get_sprint_report").read_only_hint, Some(true));
        assert_eq!(hints("delete_issue").destructive_hint, Some(true));
        assert_eq!(hints("delete_comment").destructive_hint, Some(true));
        assert_eq!(hints("edit_comment").destructive_hint, Some(false));
        assert_eq!(hints("edit_comment").idempotent_hint, Some(true));
        assert_eq!(hints("purge_project").destructive_hint, Some(true));
        assert_eq!(hints("trash_project").destructive_hint, Some(true));
        assert_eq!(hints("archive_project").destructive_hint, Some(false));
        assert_eq!(hints("create_issue").destructive_hint, Some(false));
        let schema = Value::Object((*tool("create_issue").input_schema).clone());
        assert_eq!(schema["required"], json!(["project", "summary"]));
        let start = Value::Object((*tool("start_sprint").input_schema).clone());
        for field in ["starts_at", "ends_at", "length"] {
            assert!(start["properties"].get(field).is_some(), "{field}");
        }
        assert!(start["properties"].get("start_date").is_none());
        assert!(
            tool("start_sprint")
                .description
                .as_deref()
                .unwrap()
                .contains("RFC 3339")
        );
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
        let members = ok(&client, "list_members", json!({ "project": "MCP" })).await;
        assert_eq!(members[0]["role"], "admin");
        assert_eq!(hints("list_members").read_only_hint, Some(true));
        let invites = ok(&client, "list_invites", json!({ "project": "MCP" })).await;
        assert_eq!(
            (&invites[0]["uses"], &invites[0]["max_uses"]),
            (&json!(0), &json!(1))
        );
        let revoke = json!({ "project": "MCP", "invite_id": invites[0]["id"] });
        ok(&client, "revoke_invite", revoke).await;
        assert_eq!(
            ok(&client, "list_invites", json!({ "project": "MCP" })).await,
            json!([])
        );
        assert_eq!(hints("list_invites").read_only_hint, Some(true));
        assert_eq!(hints("revoke_invite").destructive_hint, Some(true));
        for name in [
            "create_issue",
            "update_issue",
            "add_comment",
            "edit_comment",
        ] {
            let description = tool(name).description.as_deref().unwrap();
            assert!(
                description.contains("Markdown")
                    && description.contains("[@Name](mention:<user_id>)"),
                "{name}: {description}"
            );
        }

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
            json!({ "issue": "MCP-2", "body": "Needs 3DS, [@Ana](mention:1)" }),
        )
        .await;
        let comments = ok(
            &client,
            "list_comments",
            json!({ "issue": "MCP-2", "limit": 1 }),
        )
        .await;
        assert_eq!(comments["items"][0]["body"], "Needs 3DS, [@Ana](mention:1)");
        assert_eq!(comments["next_cursor"], Value::Null);
        let comment_id = comments["items"][0]["id"].clone();
        let changed = ok(
            &client,
            "edit_comment",
            json!({ "issue": "MCP-2", "comment_id": comment_id, "body": "Needs 3DS v2" }),
        )
        .await;
        assert_eq!(changed["body"], "Needs 3DS v2");
        assert!(changed["edited_at"].is_string());
        let empty = rejected(
            &client,
            "edit_comment",
            json!({ "issue": "MCP-2", "comment_id": comment_id, "body": " " }),
        )
        .await;
        assert!(empty.contains("body"), "{empty}");
        ok(
            &client,
            "delete_comment",
            json!({ "issue": "MCP-2", "comment_id": comment_id }),
        )
        .await;
        let gone = rejected(
            &client,
            "delete_comment",
            json!({ "issue": "MCP-2", "comment_id": comment_id }),
        )
        .await;
        assert_eq!(gone, "Nothing exists here, or you cannot see it.");
        let none = ok(&client, "list_comments", json!({ "issue": "MCP-2" })).await;
        assert_eq!(none["items"], json!([]));

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
            json!({
                "project": "MCP", "sprint_id": sprint_id,
                "starts_at": "2026-10-16T09:00:00-03:00", "ends_at": "2026-10-16T22:00:00-03:00",
                "length": "1d",
            }),
        )
        .await;
        assert_eq!(started["state"], "active");
        assert_eq!(started["starts_at"], "2026-10-16T12:00:00Z");
        let backlog = ok(&client, "get_backlog", json!({ "project": "MCP" })).await;
        assert_eq!(backlog["sprint_length"], "1d");

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
        let report = ok(
            &client,
            "get_sprint_report",
            json!({ "project": "MCP", "sprint_id": sprint_id }),
        )
        .await;
        let api: Value = reqwest::Client::new()
            .get(format!(
                "{}/api/projects/MCP/sprints/{sprint_id}/report",
                server().url
            ))
            .bearer_auth(&token)
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(report, api);
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
            "list_members",
            "list_invites",
            "list_attachments",
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
        let tools = client.list_all_tools().await.unwrap();
        assert_eq!(tools.len(), TOOLS.len() - 1);
        assert!(!tools.iter().any(|tool| tool.name == "add_attachment"));
        let file = json!({ "issue": "HTP-1", "path": "Cargo.toml" });
        let Value::Object(file) = file else {
            unreachable!()
        };
        let request = CallToolRequestParams::new("add_attachment").with_arguments(file);
        assert!(client.call_tool(request).await.is_err());
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
    let config = tempfile::tempdir().unwrap();
    server().block_on(async {
        let mut command = santi(&config);
        command.env("SANTI_TOKEN", &token);
        let client = ().serve(TokioChildProcess::new(command).unwrap()).await.unwrap();
        let created = ok(
            &client,
            "create_project",
            json!({ "key": "gone", "name": "Gone soon", "board_type": "kanban" }),
        )
        .await;
        assert_eq!(created["key"], "GONE");
        assert_eq!(created["board_type"], "kanban");
        assert_eq!(created["role"], "admin");
        let scrum = ok(
            &client,
            "create_project",
            json!({ "key": "GONES", "name": "Scrum by default" }),
        )
        .await;
        assert_eq!(scrum["board_type"], "scrum");
        let duplicate = rejected(
            &client,
            "create_project",
            json!({ "key": "GONE", "name": "Again" }),
        )
        .await;
        assert!(duplicate.contains("already exists"), "{duplicate}");
        let malformed = rejected(
            &client,
            "create_project",
            json!({ "key": "../x", "name": "Bad" }),
        )
        .await;
        assert!(malformed.contains("project key"), "{malformed}");
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
        assert_eq!(
            keys(ok(&client, "list_projects", json!({})).await),
            ["GONES"]
        );
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

#[test]
fn stdio_attaches_files_only_from_its_working_directory() {
    let token = server().user();
    server().project(&token, "ATF", "kanban");
    let (config, work, outside) = (
        tempfile::tempdir().unwrap(),
        tempfile::tempdir().unwrap(),
        tempfile::tempdir().unwrap(),
    );
    let work_path = work.path();
    std::fs::write(work_path.join("notes.txt"), "hello").unwrap();
    std::fs::create_dir(work_path.join("docs")).unwrap();
    std::fs::write(work_path.join("docs/plan.md"), "# Plan").unwrap();
    std::fs::write(work_path.join(".env"), "TOKEN=x").unwrap();
    std::fs::create_dir(work_path.join(".git")).unwrap();
    std::fs::write(work_path.join(".git/notes.txt"), "x").unwrap();
    let secret = outside.path().join("secret.txt");
    std::fs::write(&secret, "secret").unwrap();
    std::os::unix::fs::symlink(&secret, work_path.join("link.txt")).unwrap();
    std::os::unix::fs::symlink(outside.path(), work_path.join("linked")).unwrap();
    std::fs::File::create(work_path.join("big.txt"))
        .unwrap()
        .set_len(25 * 1024 * 1024 + 1)
        .unwrap();
    let spawn = |cwd: &std::path::Path, attach_dir: Option<&std::path::Path>| {
        let mut command = santi(&config);
        command
            .env("SANTI_TOKEN", &token)
            .env_remove("SANTI_MCP_ATTACH_DIR")
            .current_dir(cwd);
        if let Some(dir) = attach_dir {
            command.env("SANTI_MCP_ATTACH_DIR", dir);
        }
        TokioChildProcess::new(command).unwrap()
    };
    server().block_on(async {
        let client = ().serve(spawn(work_path, None)).await.unwrap();
        let tools = client.list_all_tools().await.unwrap();
        let tool = |name: &str| tools.iter().find(|tool| tool.name == name).unwrap();
        let hints = |name: &str| tool(name).annotations.clone().unwrap();
        assert_eq!(hints("list_attachments").read_only_hint, Some(true));
        assert_eq!(hints("add_attachment").read_only_hint, Some(false));
        assert_eq!(hints("add_attachment").destructive_hint, Some(false));
        let description = tool("add_attachment").description.as_deref().unwrap();
        for needle in ["working directory", "SANTI_MCP_ATTACH_DIR", "hidden"] {
            assert!(description.contains(needle), "{needle}: {description}");
        }
        let schema = Value::Object((*tool("add_attachment").input_schema).clone());
        assert_eq!(schema["required"], json!(["issue", "path"]));

        ok(
            &client,
            "create_issue",
            json!({ "project": "ATF", "summary": "Files" }),
        )
        .await;
        let added = ok(
            &client,
            "add_attachment",
            json!({ "issue": "ATF-1", "path": "notes.txt" }),
        )
        .await;
        assert_eq!(added[0]["file_name"], "notes.txt");
        assert_eq!(added[0]["size_bytes"], 5);
        let absolute = work_path.join("docs/plan.md");
        ok(
            &client,
            "add_attachment",
            json!({ "issue": "ATF-1", "path": absolute }),
        )
        .await;
        let comment = ok(
            &client,
            "add_comment",
            json!({ "issue": "ATF-1", "body": "Plan attached" }),
        )
        .await;
        let on_comment = ok(
            &client,
            "add_attachment",
            json!({ "issue": "ATF-1", "path": "docs/../docs/plan.md", "comment_id": comment["id"] }),
        )
        .await;
        assert_eq!(on_comment[0]["comment_id"], comment["id"]);

        let escape = format!(
            "../{}/secret.txt",
            outside.path().file_name().unwrap().to_str().unwrap()
        );
        let secret = secret.to_str().unwrap();
        for (path, message) in [
            (secret, "outside"),
            (escape.as_str(), "outside"),
            ("link.txt", "outside"),
            ("linked/secret.txt", "outside"),
            (".env", "hidden"),
            (".git/notes.txt", "hidden"),
            ("docs", "not a file"),
            ("missing.txt", "missing.txt"),
            ("big.txt", "Larger than 25 MB."),
        ] {
            let refused = rejected(
                &client,
                "add_attachment",
                json!({ "issue": "ATF-1", "path": path }),
            )
            .await;
            assert!(refused.contains(message), "{path}: {refused}");
            assert!(!refused.contains("secret\n"), "{refused}");
        }

        let listed = ok(&client, "list_attachments", json!({ "issue": "ATF-1" })).await;
        assert_eq!(listed.as_array().unwrap().len(), 3);
        let issue = ok(&client, "get_issue", json!({ "issue": "ATF-1" })).await;
        assert_eq!(issue["key"], "ATF-1");
        assert_eq!(issue["attachments"], listed);
        client.cancel().await.unwrap();

        let rooted = ().serve(spawn("/".as_ref(), Some(outside.path()))).await.unwrap();
        let added = ok(
            &rooted,
            "add_attachment",
            json!({ "issue": "ATF-1", "path": "secret.txt" }),
        )
        .await;
        assert_eq!(added[0]["file_name"], "secret.txt");
        let refused = rejected(
            &rooted,
            "add_attachment",
            json!({ "issue": "ATF-1", "path": work_path.join("notes.txt") }),
        )
        .await;
        assert!(refused.contains("outside"), "{refused}");
        rooted.cancel().await.unwrap();

        let everywhere = ().serve(spawn("/".as_ref(), None)).await.unwrap();
        let refused = rejected(
            &everywhere,
            "add_attachment",
            json!({ "issue": "ATF-1", "path": work_path.join("notes.txt") }),
        )
        .await;
        assert!(refused.contains("SANTI_MCP_ATTACH_DIR"), "{refused}");
        everywhere.cancel().await.unwrap();
    });
}
