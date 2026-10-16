# santi MCP server

`santi mcp` lets AI agents read and change your boards through the
[Model Context Protocol](https://modelcontextprotocol.io). It is part of the `santi` binary, talks
to a santi server over its JSON API, and acts with the rights of the API token it is given: an
agent sees exactly what that user sees.

- **stdio** (default): the client starts `santi mcp` itself. Use it for local clients.
- **Streamable HTTP**: `santi mcp --http 127.0.0.1:8765` serves `http://127.0.0.1:8765/mcp`.
  Every request needs `Authorization: Bearer <santi API token>`, and the server forwards that
  token to the API, so one HTTP server can serve several people. It holds no token of its own.
  The token is checked against the API when a session opens (an invalid one gets 401), the
  session then answers only to that same token (any other gets 404, `GET` and `DELETE`
  included), and at most 100 sessions are open at once (503 beyond that).

## Your data and the AI provider

santi never sends data to an AI provider on its own. Whatever an agent reads through `santi mcp`
(projects, issues, comments, member names and emails) goes to the AI provider behind the client
you connect, under that provider's terms and privacy policy. Give the agent a token of an account
that should see that data, and revoke the token to cut it off. The hosted instance's privacy
policy (`/privacy`, D45) says the same to its users.

## Setup

1. Install the binary: `cargo install --path crates/santi-cli` (puts `santi` in `~/.cargo/bin`).
2. Create a token in the web UI: account menu → **API tokens**. It starts with `santi_` and is
   shown once.
3. Either run `santi login --url http://localhost:8080` once (saves URL and token to
   `~/.config/santi/config.toml`, mode 0600), or give the client `SANTI_URL` and `SANTI_TOKEN`
   as environment variables. Environment and flags win over the file.

Check it with `santi whoami`. The configs below pass the variables explicitly so they work
without `santi login`; drop the `env` block if you logged in. Many clients start servers with a
short `PATH`: if `santi` is not found, use the absolute path from `which santi`.

## Tools

Issues are addressed by key, `PROJECT-NUMBER` (`WEB-12`); projects by key (`WEB`); statuses by
the name the board shows (`In Progress`); sprints by the id `list_sprints` returns. Every tool
answers with the API's JSON; a failed call is a tool error carrying the server's message.

- Project keys are letters and digits only; anything else is refused before any request.
- An argument the tool does not declare (a typo such as `summry`) is a tool error naming it, not
  silently dropped. Every schema says `additionalProperties: false`.
- `plan_issue` requires `sprint_id`: a sprint id, or `null` to send the issue to the backlog.
- Summaries, descriptions and comments in an answer are text written by users. The server
  instructions and the reading tools tell the agent to treat them as data, never as instructions.

| Tool | Does | Hint |
|---|---|---|
| `list_projects` | projects you belong to | read-only |
| `get_board` | a board: columns and cards | read-only |
| `get_backlog` | sprint sections, the backlog and epics | read-only |
| `search_issues` | text (`q`) and filters, paged | read-only |
| `get_issue` | one issue | read-only |
| `list_sprints` | a board's sprints | read-only |
| `list_epics` | a project's epics | read-only |
| `create_issue` | new issue (story by default) | additive |
| `update_issue` | change fields; `null` clears | idempotent |
| `move_issue` | status and/or rank | idempotent |
| `plan_issue` | into a sprint, or `null` for the backlog (`sprint_id` required) | idempotent |
| `add_comment` | comment on an issue | additive |
| `create_sprint` | new future sprint | additive |
| `start_sprint` | start a future sprint | |
| `complete_sprint` | close the active sprint, open work to the backlog by default | |
| `delete_issue` | delete with subtasks and comments | destructive |

## Clients

Status: **run** means it was exercised against a real server while building santi;
**documented** means the config follows the client's current documentation but was not run.

### Claude Code — run

```bash
claude mcp add santi --env SANTI_URL=http://localhost:8080 --env SANTI_TOKEN=santi_… -- santi mcp
# or over HTTP
claude mcp add --transport http santi http://127.0.0.1:8765/mcp --header "Authorization: Bearer santi_…"
```

A project-scoped `.mcp.json` takes the same shape as the Claude Desktop config below.

### MCP Inspector — run

```bash
npx @modelcontextprotocol/inspector --cli -e SANTI_URL=http://localhost:8080 -e SANTI_TOKEN=santi_… \
  santi mcp --method tools/list
npx @modelcontextprotocol/inspector --cli http://127.0.0.1:8765/mcp --transport http \
  --header "Authorization: Bearer santi_…" --method tools/call --tool-name list_projects
```

Drop `--cli` for the browser UI.

### VS Code (GitHub Copilot agent mode) — config verified, in-editor run manual

`.vscode/mcp.json` in a workspace, or **MCP: Open User Configuration**. VS Code asks for the token
once and stores it encrypted.

```json
{
  "inputs": [
    { "type": "promptString", "id": "santi-token", "description": "santi API token", "password": true }
  ],
  "servers": {
    "santi": {
      "type": "stdio",
      "command": "santi",
      "args": ["mcp"],
      "env": { "SANTI_URL": "http://localhost:8080", "SANTI_TOKEN": "${input:santi-token}" }
    }
  }
}
```

Over HTTP, replace the server with
`{ "type": "http", "url": "http://127.0.0.1:8765/mcp", "headers": { "Authorization": "Bearer ${input:santi-token}" } }`.
Both entries were accepted by `code --add-mcp` in a throwaway profile (VS Code 1.142).

### Zed — config per docs, in-editor run manual

`~/.config/zed/settings.json` (or **zed: open settings**), then enable the server in the Agent
panel's settings:

```json
{
  "context_servers": {
    "santi": {
      "command": "santi",
      "args": ["mcp"],
      "env": { "SANTI_URL": "http://localhost:8080", "SANTI_TOKEN": "santi_…" }
    }
  }
}
```

Over HTTP: `"santi": { "url": "http://127.0.0.1:8765/mcp", "headers": { "Authorization": "Bearer santi_…" } }`.

### Cursor — documented

`~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project); `${env:…}` reads your shell:

```json
{
  "mcpServers": {
    "santi": {
      "type": "stdio",
      "command": "santi",
      "args": ["mcp"],
      "env": { "SANTI_URL": "http://localhost:8080", "SANTI_TOKEN": "${env:SANTI_TOKEN}" }
    }
  }
}
```

Over HTTP: `"santi": { "url": "http://127.0.0.1:8765/mcp", "headers": { "Authorization": "Bearer ${env:SANTI_TOKEN}" } }`.

### Windsurf (Cascade) — documented

Cascade panel → **…** → MCPs → **Open MCP config file** (`mcp_config.json`):

```json
{
  "mcpServers": {
    "santi": {
      "command": "santi",
      "args": ["mcp"],
      "env": { "SANTI_URL": "http://localhost:8080", "SANTI_TOKEN": "${env:SANTI_TOKEN}" }
    }
  }
}
```

Over HTTP: `"santi": { "serverUrl": "http://127.0.0.1:8765/mcp", "headers": { "Authorization": "Bearer ${env:SANTI_TOKEN}" } }`.

### JetBrains AI Assistant — documented

**Settings | Tools | AI Assistant | Model Context Protocol (MCP)** → Add → **As JSON**:

```json
{
  "mcpServers": {
    "santi": {
      "command": "/absolute/path/to/santi",
      "args": ["mcp"],
      "env": { "SANTI_URL": "http://localhost:8080", "SANTI_TOKEN": "santi_…" }
    }
  }
}
```

Use stdio: the documented HTTP entry takes only a `url`, with no header for the token.

### Claude Desktop — documented

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or
`%APPDATA%\Claude\claude_desktop_config.json` (Windows); restart the app afterwards. The command
must be an absolute path.

```json
{
  "mcpServers": {
    "santi": {
      "command": "/absolute/path/to/santi",
      "args": ["mcp"],
      "env": { "SANTI_URL": "http://localhost:8080", "SANTI_TOKEN": "santi_…" }
    }
  }
}
```

### OpenAI Codex CLI — documented

`codex mcp add santi --env SANTI_URL=http://localhost:8080 --env SANTI_TOKEN=santi_… -- santi mcp`,
or in `~/.codex/config.toml`:

```toml
[mcp_servers.santi]
command = "santi"
args = ["mcp"]
env_vars = ["SANTI_TOKEN"]          # forwarded from your shell

[mcp_servers.santi.env]
SANTI_URL = "http://localhost:8080"

# over HTTP instead:
# [mcp_servers.santi]
# url = "http://127.0.0.1:8765/mcp"
# bearer_token_env_var = "SANTI_TOKEN"
```

### Gemini CLI — documented

`gemini mcp add -e SANTI_URL=http://localhost:8080 -e SANTI_TOKEN=santi_… santi santi mcp`, or in
`~/.gemini/settings.json` (project: `.gemini/settings.json`):

```json
{
  "mcpServers": {
    "santi": {
      "command": "santi",
      "args": ["mcp"],
      "env": { "SANTI_URL": "http://localhost:8080", "SANTI_TOKEN": "santi_…" }
    }
  }
}
```

Over HTTP: `"santi": { "httpUrl": "http://127.0.0.1:8765/mcp", "headers": { "Authorization": "Bearer santi_…" } }`.
Nullable fields use `"type": ["string", "null"]`, which the MCP Inspector flags as less portable
to Gemini's schema dialect; if a tool is rejected, report it.

### Cline — documented

MCP Servers icon → Configure (`cline_mcp_settings.json`; CLI: `~/.cline/data/settings/cline_mcp_settings.json`):

```json
{
  "mcpServers": {
    "santi": {
      "command": "santi",
      "args": ["mcp"],
      "env": { "SANTI_URL": "http://localhost:8080", "SANTI_TOKEN": "santi_…" },
      "disabled": false,
      "autoApprove": ["list_projects", "get_board", "get_backlog", "search_issues", "get_issue"]
    }
  }
}
```

Over HTTP set `"type": "streamableHttp"` (without it Cline assumes legacy SSE):
`"santi": { "type": "streamableHttp", "url": "http://127.0.0.1:8765/mcp", "headers": { "Authorization": "Bearer santi_…" } }`.

### Continue — documented

`.continue/mcpServers/santi.yaml` in the workspace (agent mode only):

```yaml
name: santi
version: 0.1.0
schema: v1
mcpServers:
  - name: santi
    type: stdio
    command: santi
    args: ["mcp"]
    env:
      SANTI_URL: http://localhost:8080
      SANTI_TOKEN: ${{ secrets.SANTI_TOKEN }}
```

Continue also picks up a Claude Desktop-style JSON file dropped into `.continue/mcpServers/`.

### Claude.ai custom connector — documented

Remote connectors are called from Anthropic's cloud, so santi needs a public HTTPS address:
run `santi mcp --http 127.0.0.1:8765 --allowed-host santi.example.com` behind a TLS proxy that
forwards `https://santi.example.com/mcp`. Then **Customize → Connectors → Add custom connector**:
URL `https://santi.example.com/mcp`, Authentication **No sign in**, and under request headers add
`Authorization: Bearer santi_…`. On Team and Enterprise plans everyone using the connector shares
that token, so make it a dedicated account's.

### ChatGPT apps (developer mode) — documented

ChatGPT also needs the public HTTPS `/mcp` URL above. santi authenticates with a bearer token only;
it has no OAuth server yet. If ChatGPT's authentication step offers no fixed header for the token,
santi cannot connect from ChatGPT until OAuth lands.

## Troubleshooting

- **`… Run santi login with a valid API token.`** No token reached the server, or it was revoked.
  `santi whoami` with the same variables tells which.
- **`Nothing exists here, or you cannot see it.`** Wrong key, or the token's user is not a member
  of that project; `list_projects` shows what it can see.
- **`no status X in WEB; statuses: …`** `move_issue` takes the board's status names; the error
  lists them.
- **HTTP 401 on connect.** The client sent no `Authorization: Bearer …` header to `santi mcp --http`,
  or the API rejected its token. Over HTTP a tool's 401 says to send a valid token in that header.
- **HTTP 404 on a session.** The request carried a different token than the one that opened the
  session, or the session expired; reconnect.
- **HTTP 503 on connect.** 100 sessions are already open; idle ones close after five minutes.
- **Requests rejected for their `Host`.** The HTTP server accepts `localhost`, `127.0.0.1` and
  `::1` only; add `--allowed-host <name>` for each public host name.
- **The client shows the server as failed at start.** Run the configured command by hand
  (`SANTI_URL=… SANTI_TOKEN=… santi mcp`); it should wait silently on stdin. Protocol messages go
  to stdout and nothing else is printed there.
