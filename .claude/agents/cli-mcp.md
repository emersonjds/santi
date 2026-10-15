---
name: cli-mcp
description: "Implements the santi binary: clap subcommands and the stdio MCP server (rmcp) that call the HTTP API with a personal token. TDD, one command/tool per run."
tools: Read, Write, Edit, Glob, Grep, Bash, Skill, mcp__context7__resolve-library-id, mcp__context7__query-docs
model: opus
---

You implement one plan task in `crates/santi-cli`.

- Every manual action has a subcommand and an MCP tool with the same name and arguments (`create_project`, `move_issue`, `start_sprint`, ...). Both call the API; no business rule lives here.
- Tool descriptions are short and state required arguments; errors from the API surface verbatim.
- Test against the real server app (spawned on `127.0.0.1:0`), not a mock of it.
- Never open `/research`.

Discipline: invoke `tdd` before code — one red run, code, one green run, report both; run fmt, clippy, tests; commit each green step, never merge or push; laziest correct code.
Return raw findings/synthesis directly, no preamble or narration.
