# santi

Free, open-source agile tracker written in Rust: Scrum and Kanban boards, backlog and
sprints, driven from the web, the `santi` CLI, or any agent through MCP.
Self-hosted, no per-seat pricing.

> **Status:** early development. The workspace builds and CI is green; features land
> epic by epic. See the [v1 design](docs/specs/2026-10-15-santi-v1-design.md).

## Roadmap

1. Open-source foundation: workspace, CI, contribution guides. *(in progress)*
2. Behavior specs for boards, backlog and sprints, written clean-room.
3. Domain and HTTP API: projects, members, issues, boards, sprints.
4. `santi` CLI and MCP server: every manual action available to scripts and agents.
5. Web boards with accessible drag and drop.
6. Importer for existing Jira projects.

## Build from source

Needs PostgreSQL 17 (see [CONTRIBUTING.md](CONTRIBUTING.md#database)) and, for the web UI, Node and pnpm.

```bash
export DATABASE_URL=postgres://santi:santi@localhost:5440/santi
(cd web && pnpm install && pnpm build)   # the web UI, served from web/dist
cargo run -p santi-server                # http://127.0.0.1:8080 (override with SANTI_ADDR)
cargo run -p santi-cli -- --version
```

For UI work, run `pnpm dev` in `web/` instead of building: Vite on http://localhost:5173 proxies
the API to the server on 8080.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

Licensed under either of [Apache License 2.0](LICENSE-APACHE) or [MIT](LICENSE-MIT), at your option.
