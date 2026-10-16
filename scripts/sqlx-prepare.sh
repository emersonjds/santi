#!/usr/bin/env bash
# Regenerates `.sqlx/` against a fresh, empty database migrated from scratch.
# sqlx infers column nullability from EXPLAIN plans, and plans change with table data:
# preparing against a dev database full of rows writes files that CI (empty database) rejects.
# Usage: scripts/sqlx-prepare.sh [--check]
set -euo pipefail

base_url="${SANTI_SQLX_BASE_URL:-postgres://santi:santi@localhost:5440}"
database="santi_sqlx_$$"
export DATABASE_URL="$base_url/$database"

cleanup() { sqlx database drop -y >/dev/null 2>&1 || true; }
trap cleanup EXIT

sqlx database create
sqlx migrate run --source crates/santi-server/migrations >/dev/null
cargo sqlx prepare --workspace "$@"
