#!/usr/bin/env bash
# D39 load test: p50/p95/p99 per hot endpoint against a server running on a seeded database.
# Setup and usage: docs/perf.md.
set -euo pipefail

base=${SANTI_URL:-http://127.0.0.1:8089}
duration=${DURATION:-10s}
connections=${CONNECTIONS:-10}
scrum=${SCRUM_KEY:-PERF}
kanban=${KANBAN_KEY:-FLOW}

command -v oha >/dev/null || { echo "oha not found: brew install oha (or cargo install oha)" >&2; exit 1; }

cookie=$(curl -fsS -D - -o /dev/null -H 'content-type: application/json' \
  -d '{"email":"owner@perf.santi.test","password":"santi-perf-password"}' \
  "$base/api/auth/login" | tr -d '\r' | sed -nE 's/^[Ss]et-[Cc]ookie: *([^;]+).*/\1/p')
[ -n "$cookie" ] || { echo "login failed: seed the database first" >&2; exit 1; }

run() { # name method path [body]
  local name=$1 method=$2 path=$3 body=${4:-}
  local args=(-z "$duration" -c "$connections" --no-tui --output-format json -m "$method"
    -H "Cookie: $cookie" -H "Accept-Encoding: gzip, br" -H "Sec-Fetch-Site: same-origin")
  [ -n "$body" ] && args+=(-H "Content-Type: application/json" -d "$body")
  oha "${args[@]}" "$base$path" 2>/dev/null | python3 -c '
import json, sys
name = sys.argv[1]
report = json.load(sys.stdin)
p = report["latencyPercentiles"]
ms = [(p.get(key) or 0) * 1000 for key in ("p50", "p95", "p99")]
codes = ",".join(sorted(report.get("statusCodeDistribution", {})))
rate = report["summary"]["requestsPerSec"]
print("%-14s%8.2f%8.2f%8.2f%9.0f  %s" % (name, *ms, rate, codes))
' "$name"
}

printf '%-14s%8s%8s%8s%9s  %s\n' endpoint p50 p95 p99 req/s status
run board        GET  "/api/projects/$scrum/board"
run kanban-board GET  "/api/projects/$kanban/board"
run backlog      GET  "/api/projects/$scrum/backlog"
run issue        GET  "/api/projects/$scrum/issues/2000"
run search       GET  "/api/projects/$scrum/issues?q=search%20index&limit=50"
run search-type  GET  "/api/projects/$scrum/issues?type=bug&label=perf&limit=50"
run move         POST "/api/projects/$scrum/issues/3000/move" "{\"after\":\"$scrum-3100\"}"
