#!/bin/sh
# Builds crates/santi-server/static/app.css from styles/app.css (D35). Pass --watch while editing.
set -eu
cd "$(dirname "$0")/../crates/santi-server"
exec tailwindcss -i styles/app.css -o static/app.css --minify "$@"
