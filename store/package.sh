#!/usr/bin/env bash
# Builds the Chrome Web Store upload zip for the version in manifest.json:
#   store/v<version>/navigator-for-salesforce-<version>.zip
# Only files the extension needs at runtime go in the zip, plus the licenses.
set -euo pipefail
cd "$(dirname "$0")/.."
version=$(node -p "require('./manifest.json').version")
out="store/v${version}/navigator-for-salesforce-${version}.zip"
# A published version's zip is the record of what's live: never overwrite it.
if [ -e "$out" ]; then
    echo "$out already exists. Bump the version in manifest.json and package.json first." >&2
    exit 1
fi
mkdir -p "store/v${version}"
zip -qr -X "$out" manifest.json popup.html settings.html LICENSE THIRD_PARTY_NOTICES.md images fonts styles src -x "*.DS_Store"
echo "$out"
unzip -l "$out" | tail -1
