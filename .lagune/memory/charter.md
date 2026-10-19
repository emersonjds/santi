# santi Security Charter

## Principles

### I. Secrets never live in code, logs or plain storage

Never commit a secret, token, password or real connection string. Always load secrets from the environment. Always store session tokens, API tokens, invite links and reset links only as a one-way hash, and show a raw token to its owner once. Never write a token or password to a log or an error message.

- Why: a leaked secret in git history or a database dump hands an attacker a working account, and history is forever. A stored hash is useless to whoever steals it.

### II. Every project belongs only to its members

Always load the caller's membership before reading or changing anything inside a project, and answer strangers as if the project does not exist. Always require the admin role for actions that manage the project, its board or its people. Never trust an id from a request (issue, sprint, status, column, member) without checking it belongs to the same project.

- Why: santi is multi-tenant. One missing membership check lets any signed-up user read or change another team's work, which is a full data breach.

### III. Sign-in never helps an attacker guess

Always hash passwords with Argon2id. Always answer a wrong email and a wrong password the same way and in the same time. Never offer an endpoint that confirms whether an email has an account without a rate limit, and prefer one that does not confirm it at all. Always rate limit every endpoint that checks a password, a token or a link.

- Why: an attacker who can learn which emails have accounts, or guess passwords quickly, turns a list of leaked passwords into taken-over accounts.

### IV. Sessions are server-side, revocable and same-origin

Always keep the browser session in an `HttpOnly`, `Secure`, `SameSite=Lax`, `__Host-` cookie that scripts cannot read. Always end sessions server-side on logout, password reset and account deletion. Always reject browser writes that come from another site. Never put a session token where page scripts can read it.

- Why: a session readable by scripts or usable from another site lets a single injected script or a malicious page act as the user.

### V. All input is untrusted until validated

Treat every request body, path, query string, uploaded file, CLI argument and MCP tool argument as untrusted. Always validate length, shape and allowed values at the boundary. Always run database queries through compile-checked, parameterized `sqlx` macros, and never build SQL from text.

- Why: unchecked input is how injection, corrupted data and crashes start; one string-built query is enough to read the whole database.

### VI. User text is shown as text, never run as code

Never render user-written text (summaries, descriptions, comments, names) as raw HTML. Always pass links in user text through a URL sanitizer that drops script URLs. Always serve the web app with a strict Content-Security-Policy that allows scripts from santi's own origin only.

- Why: one comment that runs as script can steal every viewer's session and act as them on every project they can reach.

### VII. Every request has a bounded cost

Always cap request body sizes, upload sizes, rows per import, page sizes and text lengths. Always rate limit public endpoints and expensive operations (sign-up, sign-in, tokens, invites, resets, imports, project creation). Always run slow work such as password hashing off the request threads.

- Why: an unbounded request lets one client exhaust memory, CPU or the database and take santi down for everyone.

### VIII. Data travels encrypted

Always serve santi over HTTPS outside localhost, and always tell browsers to keep using HTTPS. Never send a password or token over plain HTTP to another host without warning the user first. Always connect to a hosted database with TLS.

- Why: anything sent in clear text on a shared network can be read or changed in transit, including passwords and tokens.

### IX. Errors explain without exposing

Always answer errors in the documented problem format with a safe message. Never return stack traces, SQL errors, internal ids of other tenants or server paths to a client.

- Why: detailed errors map the system for an attacker and can leak data from other projects.

### X. What ships is pinned, minimal and checked

Always build from locked dependency versions and keep lockfiles committed. Always run the server as a non-root user in a minimal image. Always pin build images and CI actions to immutable versions, give CI the least permissions it needs, and check both Rust and JavaScript dependencies for known vulnerabilities on every change. Never keep an endpoint, dependency or feature that nothing uses.

- Why: a compromised base image, action or package runs with full trust inside the build, and every unused endpoint is attack surface no one is watching.

### XI. AI agents act only as their user, on data they treat as data

Always run each MCP request with the caller's own token and the caller's rights, never a shared credential. Always mark issue and comment text returned to an agent as untrusted data, and mark destructive tools as destructive. Never let one MCP caller reach another caller's session.

- Why: an agent can be steered by text planted in an issue; if it holds more rights than its user, or treats that text as orders, it becomes a remote control for the attacker.

### XII. Local credentials are private to their owner

Always write CLI credential files readable by their owner only, and never write a token through a symlink or into a shared directory.

- Why: a token file other local users can read gives them the owner's full santi account.

### XIII. Personal data is minimal and the user stays in control

Always let users export and delete their own data. Always purge expired sessions, links and trashed projects on a schedule. Never collect personal data the product does not use.

- Why: data kept longer or wider than needed is data that can leak, and privacy law expects users to be able to take it out or erase it.

## Baseline discipline

Lagune holds this charter, every principle, every time. A principle is not suspended because a control looks small, familiar, or unlikely to be hit. This is not a judgement call.

### Only the controls the project needs

Lagune recommends and applies only the controls this project's context calls for. A control the project does not need is never added for completeness, and a generic checklist is not thoroughness. Every later phase acts on what the system actually does, never on what it might hypothetically do.

- Why: effort spent on risks the project does not have buries the risks it does have. Fewer, right-sized controls are easier to apply, prove, and keep true than a checklist no one finishes.

### Prefer the simplest vetted control

When a control is needed, reach for the safest option already proven, in order: a control this project already has, then a platform or framework built-in, then a well-maintained vetted library, and only then custom code. Never hand-roll a security primitive (cryptography, escaping, authentication, sessions) that a vetted standard already provides. A new dependency is new attack surface, justified and not assumed. Code, an endpoint, or a feature the project does not use is attack surface too, so removing it is itself a control.

- Why: hand-rolled security is where subtle, unaudited bugs live, and a second control duplicating an existing one is the one that gets forgotten and drifts. Boring, standard controls are easier to audit and harder to get wrong, and less surface is less to defend.

### When a control seems skippable

A control is held even when a reason to skip it feels reasonable:

- "Too small to need a control": small gaps are where breaches start.
- "Already handled elsewhere": assumed coverage is exactly how gaps hide.
- "Unlikely to be hit": attackers target the path no one is watching.
- "It works, ship it": working and safe are different claims, and the charter requires both.

## Governance

This charter supersedes ad hoc security choices in santi. Product and architecture decisions that touch a principle (sessions, tokens, rate limits, tenancy, rendering) are recorded in `docs/specs/decisions.md` and must not contradict this charter; when one has to, the charter is amended first. Changes go through a pull request on a `SAN-` card, reviewed by the adversarial `qa` agent, and bump the version: MAJOR when a principle is removed or redefined, MINOR when one is added or widened, PATCH for wording. Assumptions made when writing this version: the hosted instance runs on Railway behind one TLS-terminating proxy; santi has no outgoing email, payments or file storage beyond CSV import; API tokens deliberately carry the user's full rights with no scopes (D23); and resetting a password deliberately keeps API tokens (SAN-171).

Version: 1.0.0 | Ratified: 2026-10-19
