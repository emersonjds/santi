# Pricing model C: free for every team, paid for scale and for what IT requires (SAN-240)

Owner, 2026-11-18: a hosted Free plan of 5 people and 1 project reads as stingy for an open-source tool.
Solo founders, startups, small teams inside large companies (for example 7 people with one admin adding
whoever they need), students and universities must use santi at no cost. Large companies pay for what
they cannot get elsewhere. Goal: santi becomes the first choice for startups, tech teams, students and
universities.

Amends D56 (business model) for the hosted plans only. Self-host stays as it is.

## Market (sources in the research note, accessed 2026-11-18)

- Hosted free tiers: Jira 10 people and 2 GB; Plane 12 people; Huly unlimited people and 10 GB; Linear
  unlimited people but 250 issues; Asana and Monday cut to 2 seats in 2025; Taiga cut to 2 projects. The
  market is tightening, which leaves room to be the generous one.
- Open-source peers seen as honest (Zulip, PostHog, Sentry self-host) charge for hosting, usage or support,
  never for capability. Peers that gate capability behind seats (GitLab, Mattermost) carry an
  "open core" reputation.
- Enterprises in this category pay for SSO/SAML, SCIM provisioning, audit logs, SLAs, data residency,
  compliance paperwork and dedicated support; white-label sells as a cosmetic unlock.
- A seat cap cannot tell a 7-person startup from a 7-person team inside a corporation, and it is easy to
  dodge with several workspaces. The need for SSO, audit and an SLA tracks "large company" far better.

## Decision

| Plan | For | What it includes | Price |
|---|---|---|---|
| Self-host | anyone with a server | everything, no limits (unchanged) | free |
| Free (hosted) | anyone: solo, startups, small teams, students, universities | unlimited people and projects, every product feature, 2 GB of attachments per workspace, 25 MB per file | free |
| Team (hosted) | teams that outgrow the free storage or want help | everything in Free, 100 GB of attachments, e-mail support, downloadable backups | US$ 19 a month flat per workspace (US$ 190 a year); R$ 97 / R$ 970 |
| Enterprise | large companies, hosted or self-hosted | SSO/SAML, SCIM, audit log, SLA, data residency, white-label, dedicated support, as a licensed add-on or a service contract | quoted |
| Services | teams moving from another tracker | migration, training, support contracts | quoted |

Rules:

- No product feature is ever locked: boards, backlog, sprints, reports, CLI, MCP, imports, exports and
  backups are the same on every plan and in self-host.
- Enterprise items are things only a company's IT asks for. They unlock with the SAN-191 offline license
  key (self-host) or a contract (hosted); an expired key switches the add-on off and never locks data.
- "Workspace" is the paying unit. Until organizations exist (SAN-64) it is the account that owns the
  projects: the storage cap counts every attachment in the projects that account created.
- Storage is the only free limit because it is the only cost that grows with use (about US$ 15 per TB a
  month on the current bucket). People and projects cost database rows.
- Abandoned storage: a workspace with no sign-in for 12 months gets a warning e-mail, then its attachments
  are removed after 30 more days; issues, comments and history stay. Needs e-mail (SAN-193).
- The operator gets an alert when total attachment storage passes 500 GB and 1 TB, to revisit the cap
  with data. Raising the free cap later is welcome; lowering it is not, so it starts at 2 GB.
- Education gets the Free plan with no paperwork. A "santi for Education" badge or program can come later.
- Marketing never presents santi as a free copy of another product (D56).

## Positioning (for the landing copy)

- Free for every team, with no limit on people or projects; companies pay only for what their IT requires.
- Fast: measured with 5,000 issues in CI, and the build fails if it slows down.
- Simple: a team starts in minutes; nothing to configure before the first sprint.
- Open: AGPL, self-host in one command, full export, an API and MCP for AI agents.

## Work

1. This spec, D63 and `docs/pricing.md` (this branch).
2. A `copy` agent in `.claude/agents/` for product and marketing text.
3. Landing: pricing section with the four plans, and the copy rewritten around the positioning above;
   README pricing lines.
4. Backend card: storage cap per workspace (2 GB Free, 100 GB Team) and 25 MB per file, enforced on
   upload with a clear message, plus the operator alerts.
5. Backend card: inactive-workspace notice and attachment cleanup, after SAN-193.
6. SAN-221 (Team billing with Stripe) follows the new Team definition.

## Risks

- Revenue comes slower: enterprise sales take months and a generous Free reduces pressure to buy Team.
  Before building SSO, talk to two or three companies (the owner's team at Porto first) about what would
  make them pay.
- Download traffic can cost more than storage; the egress price of the current bucket must be checked
  before the storage cap ships.
