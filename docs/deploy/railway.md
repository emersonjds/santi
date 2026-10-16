# Deploy on Railway

santi ships as one Docker image (API + web app) plus PostgreSQL. Railway builds the image from
`Dockerfile` using `railway.toml`, runs migrations on start, and serves HTTPS on its domain.

## One-time setup

1. **Project**: create a project and add the `santi` service from the GitHub repository.
2. **Database**: in the project, *Add* → *Database* → *PostgreSQL*.
3. **Variables** on the `santi` service:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (reference to the database service; private network)
   - `PORT` = `8080` (the port the image listens on)
   - optional `SANTI_DB_POOL` = `10` (connection pool size; Railway's smaller plans allow few connections)
   - the privacy policy and terms (`/privacy`, `/terms`, D45) show placeholders until these build variables are set:
     `VITE_OPERATOR_NAME` (who runs the instance), `VITE_PRIVACY_EMAIL` (privacy and contact address),
     `VITE_HOSTING_REGION` (the Railway region; defaults to `EU West (Railway europe-west4)`), `VITE_LEGAL_VENUE` (city and state for the venue clause).
     They are read at build time: redeploy after changing them.
   - self-hosting without the hosted instance's legal pages: `SANTI_LEGAL_PAGES` = `off` (no `/privacy`, `/terms`, sign-up checkboxes or acceptance gate).
4. **Public address**: the landing page's canonical/social links, `robots.txt` and `sitemap.xml` use the
   Railway domain automatically (`RAILWAY_PUBLIC_DOMAIN`). For a custom domain, set the variable
   `VITE_SITE_URL` = `https://your.domain` and redeploy.
5. **Networking**: *Settings* → *Networking* → *Generate Domain*, target port `8080`. The session cookie is
   `Secure`, so always use the `https://` domain (Safari works there too).
6. **Continuous deployment**: *Settings* → *Source*:
   - branch **`main`** (releases only, per gitflow);
   - enable **Wait for CI**, so Railway deploys only after the GitHub Actions checks pass.
7. **Staging (optional)**: duplicate the environment as `staging`, point its source branch at `developer`, and give it
   its own PostgreSQL.

## Every deploy

- Merge to `main` (through the release PR) → CI runs → Railway builds the image → `/health` must answer within
  120 s → traffic switches. A failed health check keeps the previous version running.
- Database migrations run when the new container starts. Migrations after the first release follow the rules in
  `CONTRIBUTING.md` (batched backfills, `CREATE INDEX CONCURRENTLY`).

## Before inviting real users

- Run `docs/deploy/checklist.md` against the public URL.
- Backups: turn on PostgreSQL backups for the project.
- Sign-up is open to anyone with the URL; login, sign-up, tokens, invites and imports are rate limited (D44).
  Behind Railway the server trusts one proxy hop in `X-Forwarded-For` (`SANTI_TRUSTED_PROXIES`, default 1 there).
- There is no email yet: invites are links you share.
