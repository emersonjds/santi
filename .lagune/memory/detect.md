# santi Detect Map

- **Scope:** full project scan of the server, CLI and MCP crates, the web app source, the Dockerfile, the compose file, the CI workflows and the scripts (dependencies, build output, generated API types and the offline query cache skipped)
- **Mapped:** 2026-10-19

## Findings

### Add member by email reveals accounts and adds people without consent

- **What it is:** any project admin can send an email address to the "add member" API. If no account uses that email the answer says so; if one does, that person is added to the project at once, and the answer shows their name and email. Anyone can become an admin by signing up and creating a project, and this API has no rate limit. Neither the web app, the CLI nor the MCP server calls it; invite links cover the same need.
- **Why it matters:** a stranger can test unlimited email addresses to learn who uses santi and read their display names, then aim phishing or password guessing at exactly those people. The sign-in page hides this on purpose, so this API undoes that defense. It also lets anyone push a project (with any name) into another person's project list without asking.
- **Evidence:** the `add_member` handler for `POST /api/projects/{key}/members` calls the members service with no rate-limit check; the service looks the email up and answers "no account uses this email; send an invite link" when it is missing, and otherwise inserts the membership and returns the member's details.

### No HTTPS-only instruction to browsers

- **What it is:** the server adds `nosniff`, a referrer policy and a Content-Security-Policy to its answers, but never sends `Strict-Transport-Security`, the header that tells a browser to always use HTTPS for this site.
- **Why it matters:** without it, the first visit typed as `santi.example` or followed from an `http://` link goes out in clear text, and an attacker on the same network (public Wi-Fi) can answer with a fake sign-in page and collect the password before the redirect to HTTPS happens.
- **Evidence:** the `app` router's response-header layers in the server library set only `X-Content-Type-Options` and `Referrer-Policy`, and the SPA router sets `Content-Security-Policy` and `Cache-Control`; no layer anywhere sets the HSTS header.

### CI workflow runs with default token permissions

- **What it is:** the CI workflow does not declare `permissions`, so every job gets the repository's default `GITHUB_TOKEN` rights on pushes.
- **Why it matters:** if any step or third-party action in the build is compromised, it acts with whatever the default token allows, which can include writing to the repository, instead of read-only access.
- **Evidence:** the `ci` workflow defines its triggers, environment and five jobs (`check`, `branch-coverage`, `web`, `e2e`, `docker`) with no top-level or per-job `permissions` block.

### CI actions pinned to movable tags

- **What it is:** the workflow uses third-party actions by version tag (`dtolnay/rust-toolchain@stable`, `Swatinem/rust-cache@v2`, `taiki-e/install-action@cargo-llvm-cov`, `pnpm/action-setup@v4`, and the official checkout and setup-node actions) rather than by commit hash.
- **Why it matters:** a tag can be moved to new code by whoever controls the action's repository; a hijacked action then runs inside santi's build with its source and token, which is how several real supply-chain attacks spread.
- **Evidence:** every `uses:` line in the `check`, `branch-coverage`, `web` and `e2e` jobs names a tag or branch.

### Container images pinned to movable tags

- **What it is:** the Dockerfile builds from `node:24-trixie-slim`, `rust:slim-trixie` and `busybox:1.37-musl`, and ships on `gcr.io/distroless/cc-debian13:nonroot`, all by tag with no `@sha256` digest.
- **Why it matters:** the same tag can point at different images over time; a replaced or poisoned upstream image would be built into the release that Railway deploys, unnoticed, and builds are not reproducible.
- **Evidence:** the four `FROM` lines of the web, server, busybox and final stages.

### Rust dependencies are not checked for known vulnerabilities

- **What it is:** CI runs `pnpm audit --prod` for the web app's packages, but nothing checks the Rust crates in `Cargo.lock` against the RustSec advisory database.
- **Why it matters:** the server's security rests on crates such as axum, sqlx, argon2, tower-http and rustls; a published advisory for one of them would ship to production without anyone being told.
- **Evidence:** the `web` job's audit step is the only dependency audit; the `check` and `branch-coverage` jobs run fmt, clippy, sqlx checks and coverage, with no `cargo audit` or `cargo deny` step.

### Compose publishes the app on every network interface over plain HTTP

- **What it is:** `docker compose up` maps the santi port to all of the host's network interfaces with plain HTTP, while the database port next to it is limited to the local machine.
- **Why it matters:** on a laptop on a shared network, other devices can reach santi and anyone sending a sign-in from another machine sends the password in clear text; the session cookie is `Secure`, so the app cannot even work there, which makes the exposure all risk and no use.
- **Evidence:** the `santi` service's `ports` entry has no host address, unlike the `postgres` service's entry bound to `127.0.0.1`.

## Applied sub-skills

- .lagune/skills/regex.md: the required checker ran over the whole project and listed 8 patterns as unsafe (plus SQL and text strings it mistook for patterns). Each was replayed against adversarial inputs of 40,000 characters: the mention and editor-autocomplete patterns in the rich-text feature finished in under 3 ms (their alternatives cannot overlap), and the only slow one, the trailing-slash trim in the Vite config, runs once at build time on an operator-set address. None is reachable with attacker input, so none is recorded as a finding.
- .lagune/skills/access-control.md: "Add member by email reveals accounts and adds people without consent"; membership loading, admin checks and per-project id scoping were confirmed across every project route.
- .lagune/skills/credential-endpoint.md: "Add member by email reveals accounts and adds people without consent" (an unthrottled account-existence answer); sign-in, sign-up, token, invite and reset limits confirmed.
- .lagune/skills/transport.md: "No HTTPS-only instruction to browsers", "Compose publishes the app on every network interface over plain HTTP".
- .lagune/skills/infra.md: "CI workflow runs with default token permissions", "CI actions pinned to movable tags", "Container images pinned to movable tags" (its checker flagged the tag-pinned actions and the final `FROM`).
- .lagune/skills/container.md: "Container images pinned to movable tags"; non-root distroless runtime confirmed.
- .lagune/skills/rust.md: "Rust dependencies are not checked for known vulnerabilities"; `unsafe_code = "forbid"` confirmed workspace-wide.
- .lagune/skills/secrets.md: the checker flagged the local development connection string in the sqlx prepare script and a test fixture; both are throwaway local database credentials, not secrets, so nothing is recorded.
- .lagune/skills/javascript.md, .lagune/skills/browser.md, .lagune/skills/sql.md, .lagune/skills/path.md, .lagune/skills/upload.md, .lagune/skills/http-request.md, .lagune/skills/crypto.md, .lagune/skills/interpreter.md, .lagune/skills/network.md, .lagune/skills/api-endpoint.md, .lagune/skills/llm.md, .lagune/skills/csv.md: applied and confirmed the existing controls hold (markdown rendered as React elements with a URL sanitizer and strict CSP, compile-checked parameterized SQL with escaped `LIKE` patterns, static file serving through tower-http with the legal-page guard, bounded multipart import, same-origin write guard and rightmost `X-Forwarded-For` parsing, OS randomness with SHA-256 for high-entropy tokens and Argon2id for passwords, process spawning only in tests, no server-side fetch of user-chosen URLs, MCP sessions bound to their token owner with host allowlist and a session cap, untrusted-data notes and destructive hints on MCP tools, and no CSV output); none surfaced a finding.

## Not determined

- Whether Railway's edge adds `Strict-Transport-Security` on its own for the hosted instance; the code sets none, which still leaves self-hosted instances without it.
