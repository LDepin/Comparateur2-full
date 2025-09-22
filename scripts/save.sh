#!/usr/bin/env bash
set -euo pipefail

MSG="${1:-"savepoint"}"

git add -A
git commit -m "$MSG" || echo "Rien à committer (ok)"
git tag -f last-good
echo "✅ Snapshot créé. Tag: last-good"
