# Operating the hosted instance

Runbook for getsanti.app (Railway project `loyal-ambition`, services `santi`, `Postgres` and the
`santi-attachments` bucket). Target: 99% monthly uptime, about 7 hours of downtime a month.

## What is watched

- `GET https://getsanti.app/health` answers `{"status":"ok","version":"…"}` after a database query.
  It is the Railway healthcheck (120 s on deploy) and the external monitor's target.
- External monitor (Better Stack, free tier): checks `/health` every 3 minutes from several regions,
  alerts the maintainer by app push and e-mail, and publishes the public status page linked from the
  landing footer.
- Deploys: Railway builds `main` on every merge (settings in `.railway/railway.ts`); a failed
  healthcheck keeps the previous deployment serving.

## On an alert

1. Open the status page and `https://status.railway.com`: if Railway reports an incident, post it on
   the status page and wait; deploys may be paused (as on 2026-10-21).
2. `curl -si https://getsanti.app/health`:
   - `503 busy`: the pool or a query timed out. Check Postgres CPU and connections in the Railway
     dashboard; `railway logs --service santi` shows the slow routes (JSON request logs).
   - `500` or no answer: `railway logs --service santi` for the panic or the database error.
3. Did a deploy just land? `railway deployment list --service santi`. Roll back by redeploying the
   previous successful deployment from the dashboard (Deployments → ⋯ → Redeploy), then revert the
   merge on `developer` and release a patch.
4. Database: the `Postgres` service must be running and its volume below 80% full. Never run a
   branch's migrations against production by hand.
5. Attachments failing but the app up: bucket credentials (`SANTI_S3_*` on `santi`) or the bucket
   itself; a smoke test is upload, download and delete of one file on a test issue.
6. After recovery: note the cause, duration and fix on the status page incident and in a SAN card.

## Secrets

Rotate a secret (database password, bucket keys) only when a deploy can run right after: the running
container keeps the old values until it is redeployed. During a Railway incident with paused deploys,
rotating the database password takes the app down until deploys resume.

## People

The maintainer gets every alert. Hosted customers learn about an incident from the status page;
paying teams also get an e-mail once transactional e-mail exists (SAN-193).
