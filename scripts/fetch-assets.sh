#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SWF_URL="https://archive.org/download/whtbb/brain_game_2_6_7_translated_v1.swf"
PREVIEW_URL="https://archive.org/download/whtbb/00_coverscreenshot.png"
RUFFLE_URL="https://github.com/ruffle-rs/ruffle/releases/download/v0.3.0/ruffle-0.3.0-web-selfhosted.zip"
SWF="$ROOT/games/whtbb/brain_game_2_6_7_translated_v1.swf"
PREVIEW="$ROOT/games/whtbb/preview.png"
RUFFLE_DIR="$ROOT/vendor/ruffle"
TMP="${TMPDIR:-/tmp}/whtbb-ruffle.zip"

mkdir -p "$(dirname "$SWF")" "$RUFFLE_DIR"

echo "Fetching preserved SWF from $SWF_URL"
curl --fail --location --silent --show-error "$SWF_URL" -o "$SWF"
SWF_SIZE=$(wc -c < "$SWF" | tr -d ' ')
if [ "$SWF_SIZE" -ne 1771296 ]; then
  echo "Unexpected SWF size: $SWF_SIZE bytes (expected 1771296)" >&2; exit 21
fi

echo "Fetching optional preview from $PREVIEW_URL"
if ! curl --fail --location --silent --show-error "$PREVIEW_URL" -o "$PREVIEW"; then
  echo "Preview unavailable; continuing without it" >&2
  rm -f "$PREVIEW"
fi

echo "Fetching official Ruffle self-hosted build from $RUFFLE_URL"
curl --fail --location --silent --show-error "$RUFFLE_URL" -o "$TMP"
ZIP_SIZE=$(wc -c < "$TMP" | tr -d ' ')
if [ "$ZIP_SIZE" -lt 5000000 ]; then
  echo "Unexpected Ruffle zip size: $ZIP_SIZE bytes" >&2; exit 22
fi
rm -rf "$RUFFLE_DIR"/*
unzip -q "$TMP" -d "$RUFFLE_DIR"
rm -f "$TMP"

if [ ! -f "$RUFFLE_DIR/ruffle.js" ]; then
  echo "Ruffle archive did not contain ruffle.js at expected path" >&2; exit 23
fi
if ! find "$RUFFLE_DIR" -maxdepth 1 -name '*.wasm' -print -quit | grep -q .; then
  echo "Ruffle archive did not contain a .wasm file" >&2; exit 24
fi

SHA=$(sha256sum "$SWF" | awk '{print $1}')
EXPECTED_SHA="a2bc047379274cc0f1556749c326b47d971849aa4a87c70a88da80aca448af96"
if [ "$SHA" != "$EXPECTED_SHA" ]; then
  echo "SWF SHA-256 mismatch: $SHA (expected $EXPECTED_SHA)" >&2; exit 25
fi
printf '%s  %s\n' "$SHA" "games/whtbb/brain_game_2_6_7_translated_v1.swf" > "$ROOT/SHA256.txt"

rm -f "$ROOT/swf-score-diagnostics.json" "$ROOT/summaryscreen-diagnostics.txt" "$ROOT/swf-diagnostics.txt" "$ROOT/minigamedefines-diagnostics.txt"

python3 - "$ROOT" <<'PY'
import json, pathlib, sys
root=pathlib.Path(sys.argv[1])
paths=["/games/whtbb/brain_game_2_6_7_translated_v1.swf"]
if (root/"games/whtbb/preview.png").exists(): paths.append("/games/whtbb/preview.png")
for p in sorted((root/"vendor/ruffle").iterdir()):
    if p.is_file(): paths.append("/vendor/ruffle/"+p.name)
(root/"precache-assets.json").write_text(json.dumps(paths,indent=2)+"\n")
PY

echo "SWF bytes: $SWF_SIZE"
echo "Ruffle ZIP bytes: $ZIP_SIZE"
echo "SWF SHA-256: $SHA"
echo "Assets ready."
