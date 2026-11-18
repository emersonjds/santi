#!/usr/bin/env bash
# The CI gate (.github/workflows/ci.yml) run locally, against a throwaway database so the dev
# database `santi` never gets this branch's migrations. Run it before opening a PR.
# Needs: Docker Desktop with `docker compose up -d postgres`, sqlx-cli 0.9, cargo-llvm-cov,
# cargo-deny, pnpm. Without rustup, point LLVM_COV/LLVM_PROFDATA at Homebrew's llvm.
set -euo pipefail
cd "$(dirname "$0")/.."

db=santi_gate
export DATABASE_URL="postgres://santi:santi@localhost:5440/$db"
export CI=true
coverage_ignore='/main\.rs$'

if [[ -z "${LLVM_COV:-}" ]] && command -v brew >/dev/null && [[ -d "$(brew --prefix llvm@22 2>/dev/null)" ]]; then
  llvm="$(brew --prefix llvm@22)"
  export LLVM_COV="$llvm/bin/llvm-cov" LLVM_PROFDATA="$llvm/bin/llvm-profdata"
fi

docker exec santi-postgres-1 dropdb -U santi --if-exists "$db"
docker exec santi-postgres-1 createdb -U santi "$db"
trap 'docker exec santi-postgres-1 dropdb -U santi --if-exists "$db" >/dev/null; [[ -n "${server:-}" ]] && kill "$server" 2>/dev/null' EXIT

echo "== rust"
cargo deny check advisories
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
sqlx migrate run --source crates/santi-server/migrations
cargo sqlx prepare --workspace --check
cargo llvm-cov --workspace --ignore-filename-regex "$coverage_ignore" \
  --fail-under-lines 90 --fail-under-functions 90 --fail-under-regions 90

echo "== web"
(
  cd web
  pnpm install --frozen-lockfile
  pnpm typecheck
  pnpm lint
  pnpm format:check
  pnpm test:coverage
  pnpm build
  pnpm size
  pnpm audit --prod
  pnpm gen:api && git diff --exit-code src/shared/api/schema.d.ts
)

echo "== e2e"
cargo build -p santi-server
SANTI_ADDR=127.0.0.1:8089 SANTI_WEB_DIR=web/dist SANTI_IP_LIMITS=off target/debug/santi-server > /tmp/santi-gate-server.log 2>&1 &
server=$!
for _ in $(seq 60); do curl -sf http://127.0.0.1:8089/health >/dev/null && break; sleep 1; done
(cd web && pnpm e2e)

echo "gate: all green"
