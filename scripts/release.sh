#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
  echo "Usage: $0 v0.1.0"
  exit 1
fi

git add -A
git commit -m "release: $VERSION" || true
git tag -a "$VERSION" -m "Release $VERSION"
git push --follow-tags
echo "🚀 Release $VERSION poussée (code + tag)."