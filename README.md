<p align="center">
  <img src="web/public/brand/icon-512.png" alt="santi logo" width="112" height="112">
</p>

<h1 align="center">santi</h1>

<p align="center">
  <strong>A free, open-source agile tracker you host yourself.</strong>
</p>

<p align="center">
  <a href="https://github.com/emersonjds/santi/actions/workflows/ci.yml"><img src="https://github.com/emersonjds/santi/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
  <a href="https://github.com/emersonjds/santi/releases/latest"><img src="https://img.shields.io/github/v/release/emersonjds/santi?label=release" alt="Latest release"></a>
  <a href="#license"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue" alt="License: AGPL-3.0"></a>
</p>

<p align="center">
  <a href="https://getsanti.app">Website</a> ·
  <a href="docs/self-hosting.md">Self-hosting</a> ·
  <a href="#documentation">Docs</a> ·
  <a href="CHANGELOG.md">Changelog</a> ·
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

santi gives a team boards, a backlog, sprints, epics and sprint reports, from the web, the command
line or an AI agent. The server is Rust and PostgreSQL, the UI is React, and it ships as one
container image with no per-seat pricing and no telemetry. It is pre-1.0 and released often; the
HTTP API may change between minor versions until 1.0.

![Board with an active sprint](docs/screenshots/board.webp)

## Highlights

- **Scrum and Kanban boards:** columns with WIP limits; move cards by drag and drop or the keyboard.
- **Backlog and sprints:** plan by dragging, timed sprints, a report for every completed sprint and a velocity chart.
- **Issues and epics:** stories, tasks, bugs and subtasks with points, labels, comments and an epic panel.
- **CLI and MCP:** the `santi` CLI and `santi mcp` give scripts and AI agents what the web UI does.
- **Import from Jira or Linear:** upload a CSV export and review the mapping before it imports.
- **Fast Rust server:** p95 under 30 ms on 5,000 issues; under 170 KB of JavaScript per page.
- **One container to self-host:** the image plus PostgreSQL; export your data as JSON any time.

## Get started

The website is [getsanti.app](https://getsanti.app). Hosted plans are not open yet, so today you
run santi yourself.

### Self-host

**Docker Compose** (the image and PostgreSQL from [`compose.yaml`](compose.yaml)):

```bash
git clone https://github.com/emersonjds/santi.git
cd santi
docker compose up -d
```

Open <http://localhost:8080>, choose **Create account**, then **New project**. The image is
`linux/amd64`; on Apple Silicon or other ARM hosts, run
`docker pull --platform linux/amd64 ghcr.io/emersonjds/santi:latest` before `docker compose up -d`.

**Docker with your own PostgreSQL 17:**

```bash
docker run -d --name santi --restart unless-stopped \
  -p 127.0.0.1:8080:8080 \
  -e DATABASE_URL=postgres://santi:PASSWORD@db.example.com:5432/santi \
  -v santi-attachments:/data \
  ghcr.io/emersonjds/santi:latest
curl http://localhost:8080/health
```

**Railway:** see [Deploy on Railway](docs/deploy/railway.md).

Any address other than `localhost` needs HTTPS in front. Configuration, reverse proxy, upgrades and
backups: [docs/self-hosting.md](docs/self-hosting.md).

### CLI

From the checkout, with Rust 1.97 or newer. Create an API token in the account menu first.

```bash
cargo install --path crates/santi-cli
santi login --url http://localhost:8080
santi projects list
```

## Documentation

- [Self-hosting](docs/self-hosting.md): configuration, upgrades, backups and restore, reverse proxy, importing, API and CLI reference
- [MCP setup](docs/mcp.md) for AI agents and editors
- [Deploy on Railway](docs/deploy/railway.md)
- [Performance](docs/perf.md): budgets, numbers and the load script
- API: interactive docs at `/docs`, OpenAPI 3.1 at `/openapi.json` on your server
- [Changelog](CHANGELOG.md)

## Contributing

Setup, quality gate and workflow are in [CONTRIBUTING.md](CONTRIBUTING.md). Never paste code, text
or assets from proprietary trackers; follow the [Code of Conduct](CODE_OF_CONDUCT.md) and report
vulnerabilities as described in [SECURITY.md](SECURITY.md).

## Pricing and sustainability

santi is free and open source, and every feature ships in the open code. Self-hosting is free with
no user or project limits; hosting and services fund the work, never features locked out of the
code. Plans and prices: [docs/pricing.md](docs/pricing.md).

## License

santi is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0-only).
Use it, change it and run it for your team freely; if you offer a modified santi to others over a
network, publish your changes under the same license. Versions up to 0.24.1 were released under
MIT OR Apache-2.0 and stay available under those terms. The name and logo are covered by the
[trademark policy](TRADEMARK.md). The web UI started from [shadcn-admin](https://github.com/satnaing/shadcn-admin) (MIT);
its notice is in [web/LICENSE-shadcn-admin](web/LICENSE-shadcn-admin).
