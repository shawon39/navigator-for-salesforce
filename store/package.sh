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
zip -qr -X "$out" popup.html settings.html LICENSE THIRD_PARTY_NOTICES.md images fonts styles src -x "*.DS_Store"
# manifest.json's "key" only gives a folder loaded unpacked the store's
# extension ID; the store sets the ID itself, so the upload leaves it out.
tmp=$(mktemp -d)
grep -v '^    "key": ' manifest.json > "$tmp/manifest.json"
node -e 'if ("key" in require(process.argv[1])) process.exit(1)' "$tmp/manifest.json"
(cd "$tmp" && zip -q -X "$OLDPWD/$out" manifest.json)
rm -rf "$tmp"
echo "$out"
unzip -l "$out" | tail -1
