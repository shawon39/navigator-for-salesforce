#!/usr/bin/env bash
# Builds the Chrome Web Store upload zip for the version in manifest.json:
#   store/v<version>/navigator-for-salesforce-<version>.zip
# Only files the extension needs at runtime go in the zip.
set -euo pipefail
cd "$(dirname "$0")/.."
version=$(node -p "require('./manifest.json').version")
out="store/v${version}/navigator-for-salesforce-${version}.zip"
mkdir -p "store/v${version}"
rm -f "$out"
zip -qr -X "$out" manifest.json popup.html settings.html images fonts styles src -x "*.DS_Store"
echo "$out"
unzip -l "$out" | tail -1
