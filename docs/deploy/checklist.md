# Public URL checklist

Run these against the Railway domain before sharing it with testers, and again after each release.
Every check has the answer it must give. Set the address once:

```sh
URL=https://your-app.up.railway.app      # no trailing slash
HOST=${URL#https://}
EMAIL="check-$(date +%s)@example.com"    # a throwaway account; delete it later if you like
```

## 1. Server, database and migrations

```sh
curl -s "$URL/health"
```

`{"status":"ok","version":"<release>"}`. The health check runs a query, so a 200 also means the database answers.
Migrations ran on start: the Railway deploy log shows no `migrate` error, and in the database
(Railway → PostgreSQL → *Data*) `_sqlx_migrations` has one row per file in `crates/santi-server/migrations`, all `success = true`.

## 2. HTTPS and security headers

```sh
curl -sI "http://$HOST/" | head -3                  # must not serve the app over plain http: a redirect to https
for page in / /about /privacy /login /p/X/board; do
  echo "== $page"
  curl -sI "$URL$page" | grep -iE '^(HTTP|content-security-policy|x-content-type-options|referrer-policy|cache-control)'
done
curl -sI "$URL/health" | grep -iE '^(x-content-type-options|referrer-policy)'
```

Each page: `HTTP/2 200`, `content-security-policy: default-src 'self'; script-src 'self'; …; frame-ancestors 'none'; …`,
`x-content-type-options: nosniff`, `referrer-policy: strict-origin-when-cross-origin`, `cache-control: no-cache`.
API answers carry `nosniff` and the referrer policy too. A hashed file under `/assets/` answers
`cache-control: public, max-age=31536000, immutable`.

## 3. Session cookie over HTTPS

```sh
curl -s -D - -o /dev/null -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"correct horse battery\",\"display_name\":\"Check\"}" \
  "$URL/api/auth/register" | grep -iE '^(HTTP|set-cookie)'
```

`HTTP/2 201` and `set-cookie: __Host-santi_session=…; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`.
The `__Host-` prefix and `Secure` mean browsers keep the cookie only over HTTPS on this exact host;
on plain `http://` (other than `localhost` in Chrome and Firefox) sign-in looks like it works and the next page is signed out.

## 4. Writes behind the proxy (D22)

Railway's edge keeps the public `Host` and adds `X-Forwarded-Host`, `X-Forwarded-Proto` and `X-Forwarded-For`.
The cross-site check compares `Origin` with `Host`:

```sh
COOKIE=$(curl -s -D - -o /dev/null -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"correct horse battery\"}" "$URL/api/auth/login" \
  | grep -i '^set-cookie' | sed 's/^[^:]*: //; s/;.*//')
curl -s -o /dev/null -w '%{http_code}\n' -H "Cookie: $COOKIE" -H "Origin: $URL" \
  -H 'content-type: application/json' -d '{"key":"CHECK","name":"Check","board_type":"scrum"}' "$URL/api/projects"
curl -s -o /dev/null -w '%{http_code}\n' -H "Cookie: $COOKIE" -H 'Origin: https://evil.example' \
  -H 'content-type: application/json' -d '{"key":"EVIL","name":"Evil","board_type":"scrum"}' "$URL/api/projects"
```

`201`, then `403`. A `403` on the first call means the edge no longer forwards the public `Host`:
every browser write would fail, so stop and file a bug (the check would have to read `X-Forwarded-Host` from the trusted hop).

## 5. Rate limits behind the proxy (D44)

The server trusts one proxy hop (`SANTI_TRUSTED_PROXIES`, default 1 when `RAILWAY_PROJECT_ID` is set).
Wait a minute after section 4 so the login bucket (10, then one per 6 s) is full. A spoofed `X-Forwarded-For` must not buy new attempts:

```sh
for i in $(seq 1 11); do
  curl -s -o /dev/null -w '%{http_code} ' -H "X-Forwarded-For: 198.51.100.$i" \
    -H 'content-type: application/json' \
    -d "{\"email\":\"nobody$i@example.com\",\"password\":\"wrong password\"}" "$URL/api/auth/login"
done; echo
curl -s -D - -o /dev/null -H 'content-type: application/json' \
  -d '{"email":"nobody@example.com","password":"wrong password"}' "$URL/api/auth/login" \
  | grep -iE '^(HTTP|retry-after|content-type)'
```

Ten `401`, then `429`; the last call answers `429`, `retry-after: <seconds>` and `application/problem+json`.
If all eleven answer `401`, the edge adds more than one hop: set `SANTI_TRUSTED_PROXIES=2` and repeat.
If the first calls already answer `429` for everyone, the server sees the edge's address: check the variable is not `0`.
Wait a minute before the next check (the login bucket refills one attempt every 6 s).

Lockout per email, without revealing accounts:

```sh
for email in "$EMAIL" "ghost-$(date +%s)@example.com"; do
  for i in 1 2 3 4 5 6; do
    curl -s -o /dev/null -w '%{http_code} ' -H 'content-type: application/json' \
      -d "{\"email\":\"$email\",\"password\":\"wrong password\"}" "$URL/api/auth/login"
  done; echo
  sleep 40   # stay under the per-address login bucket
done
```

Both lines: `401 401 401 401 401 429`. The real account is locked for 30 s.

## 6. Browser walk-through

Do it once in Chrome or Firefox on a laptop and once in **Safari on an iPhone** (and Safari on macOS if at hand).
Safari never keeps a `Secure` cookie on plain `http://`, not even on `localhost`: test it on the HTTPS URL only.

1. Open `$URL` signed out: the landing page shows; the footer links to *Privacy* and *Send feedback*; *Privacy* opens `/privacy`.
2. *Try santi* → create an account (the sign-up page links the privacy note) → the empty home shows *New project* and *Start with a sample project*.
3. *Start with a sample project* → the board of *Sample: Mobile app* with Sprint 1 running and cards in every column. Click it again from *New project*: the same board opens, no second project.
4. Drag a card to another column (on the phone, use the card menu → *Move to…*), reload: it stays there.
5. Open an issue: subtasks, a comment and the details panel show; add a comment.
6. Backlog: the epic panel opens; Sprint 2 and the backlog section list their issues.
7. Account menu → *Send feedback* opens GitHub's new-issue chooser with the bug report and feature request forms.
8. Sign out, sign in again (Safari keeps the session across a reload and a tab close).
9. Web inspector console: no CSP violations on the landing page, the board or the issue dialog.
10. Wrong password six times in a row: the sixth answer says "Too many attempts. Try again in N seconds."

## 7. Before inviting testers

- PostgreSQL backups on (`docs/deploy/railway.md`).
- `/docs/` (Swagger UI) and `/openapi.json` are public by design: they show the API shape, no data.
- Delete the check accounts and the `CHECK` project if you want a clean list (no account deletion in the UI yet: SQL on the database).
