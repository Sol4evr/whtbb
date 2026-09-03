#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SWF_URL="https://archive.org/download/whtbb/brain_game_2_6_7_translated_v1.swf"
PREVIEW_URL="https://archive.org/download/whtbb/00_coverscreenshot.png"
RUFFLE_URL="https://github.com/ruffle-rs/ruffle/releases/download/v0.3.0/ruffle-0.3.0-web-selfhosted.zip"
ORIG="$ROOT/games/whtbb/brain_game_2_6_7_translated_v1_original.swf"
SWF="$ROOT/games/whtbb/brain_game_2_6_7_translated_v1.swf"
PREVIEW="$ROOT/games/whtbb/preview.png"
RUFFLE_DIR="$ROOT/vendor/ruffle"
TMP="${TMPDIR:-/tmp}/whtbb-ruffle.zip"

mkdir -p "$(dirname "$ORIG")" "$RUFFLE_DIR"

echo "Fetching preserved original SWF from $SWF_URL"
curl --fail --location --silent --show-error "$SWF_URL" -o "$ORIG"
SWF_SIZE=$(wc -c < "$ORIG" | tr -d ' ')
[ "$SWF_SIZE" -eq 1771296 ] || { echo "Unexpected original SWF size: $SWF_SIZE" >&2; exit 21; }

if command -v sha256sum >/dev/null 2>&1; then SHA=$(sha256sum "$ORIG" | awk '{print $1}'); else SHA=$(shasum -a 256 "$ORIG" | awk '{print $1}'); fi
EXPECTED_SHA="a2bc047379274cc0f1556749c326b47d971849aa4a87c70a88da80aca448af96"
[ "$SHA" = "$EXPECTED_SHA" ] || { echo "Original SWF SHA-256 mismatch: $SHA" >&2; exit 25; }
printf '%s  %s\n' "$SHA" "games/whtbb/brain_game_2_6_7_translated_v1_original.swf" > "$ROOT/SHA256.txt"

echo "Building verified preservation bridge"
bash "$ROOT/scripts/build-stable-swf.sh" "$ORIG" "$SWF"
[ -s "$SWF" ] || { echo "Bridged SWF missing after build" >&2; exit 27; }

echo "Fetching optional preview"
if ! curl --fail --location --silent --show-error "$PREVIEW_URL" -o "$PREVIEW"; then rm -f "$PREVIEW"; fi

echo "Fetching pinned Ruffle v0.3.0"
curl --fail --location --silent --show-error "$RUFFLE_URL" -o "$TMP"
ZIP_SIZE=$(wc -c < "$TMP" | tr -d ' ')
[ "$ZIP_SIZE" -ge 5000000 ] || { echo "Unexpected Ruffle zip size: $ZIP_SIZE" >&2; exit 22; }
rm -rf "$RUFFLE_DIR"/*
unzip -q "$TMP" -d "$RUFFLE_DIR"
rm -f "$TMP"
[ -f "$RUFFLE_DIR/ruffle.js" ] || { echo "Ruffle archive missing ruffle.js" >&2; exit 23; }
find "$RUFFLE_DIR" -maxdepth 1 -name '*.wasm' -print -quit | grep -q . || { echo "Ruffle archive missing wasm" >&2; exit 24; }

python3 - "$ROOT" <<'PY'
import json,pathlib,sys
root=pathlib.Path(sys.argv[1])
paths=["/games/whtbb/brain_game_2_6_7_translated_v1.swf?v=15.1.0"]
if (root/"games/whtbb/preview.png").exists(): paths.append("/games/whtbb/preview.png")
for p in sorted((root/"vendor/ruffle").iterdir()):
    if p.is_file(): paths.append("/vendor/ruffle/"+p.name)
(root/"precache-assets.json").write_text(json.dumps(paths,indent=2)+"\n")
PY

echo "Original SWF bytes: $SWF_SIZE"
echo "Original SWF SHA-256: $SHA"
echo "Bridged SWF verified and served at canonical game path"
echo "Assets ready."
