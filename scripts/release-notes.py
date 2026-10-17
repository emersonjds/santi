#!/usr/bin/env python3
"""Print the GitHub release title and notes for one version, built from CHANGELOG.md.

Usage: scripts/release-notes.py 0.7.0 [--title]
"""
import re
import sys
from pathlib import Path

REPO = "https://github.com/emersonjds/santi"
CHANGELOG = Path(__file__).resolve().parent.parent / "CHANGELOG.md"


def sections(text):
    found = {}
    for part in re.split(r"^## \[", text, flags=re.M)[1:]:
        head, _, body = part.partition("\n")
        version = head.split("]")[0]
        found[version] = re.split(r"^\[Unreleased\]:", body, flags=re.M)[0].strip()
    return found


def main():
    version = sys.argv[1]
    all_sections = sections(CHANGELOG.read_text())
    body = all_sections[version]
    highlight = re.match(r"> (.+)", body)
    if not highlight:
        sys.exit(f"CHANGELOG {version} needs a '> headline: summary' line first")
    headline, _, summary = highlight.group(1).partition(": ")
    if "--title" in sys.argv:
        print(f"santi {version} — {headline}")
        return
    versions = [v for v in all_sections if v != "Unreleased"]
    previous = versions[versions.index(version) + 1] if versions.index(version) + 1 < len(versions) else None
    details = body[highlight.end():].strip().replace("### ", "## ")
    print(f"**{summary[:1].upper()}{summary[1:]}**\n")
    print(details + "\n")
    print("## Install\n")
    print("```sh")
    print("docker compose up -d   # self-hosting and Railway: docs/deploy/")
    print(f"cargo install --git {REPO} --tag v{version} santi-cli   # CLI and MCP server")
    print("```")
    if previous:
        print(f"\n**Full changelog:** {REPO}/compare/v{previous}...v{version}")


main()
