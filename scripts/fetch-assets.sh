#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SWF_URL="https://archive.org/download/whtbb/brain_game_2_6_7_translated_v1.swf"
PREVIEW_URL="https://archive.org/download/whtbb/00_coverscreenshot.png"
RUFFLE_URL="https://github.com/ruffle-rs/ruffle/releases/download/v0.3.0/ruffle-0.3.0-web-selfhosted.zip"
FFDEC_URL="https://github.com/jindrapetrik/jpexs-decompiler/releases/download/version26.2.1/ffdec_26.2.1.zip"
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

python3 - "$ROOT" <<'PY'
import json, pathlib, re, sys, zlib
root=pathlib.Path(sys.argv[1])
swf=root/"games/whtbb/brain_game_2_6_7_translated_v1.swf"
data=swf.read_bytes()
if data[:3] == b"CWS":
    try: data=b"FWS"+data[3:8]+zlib.decompress(data[8:])
    except Exception: pass
keywords=r"score|summary|result|upload|game.?over|finish|complete|brain|rank|total|post.?score|externalinterface|addcallback|javascript|fscommand|callback"
strings=[]
for m in re.finditer(rb"[ -~]{4,}", data):
    s=m.group().decode("latin1", "ignore")
    if re.search(keywords, s, re.I): strings.append(s[:400])
seen=set(); matches=[]
for s in strings:
    if s not in seen: seen.add(s); matches.append(s)
(root/"swf-score-diagnostics.json").write_text(json.dumps({"matches":matches[:700]},indent=2)+"\n")

paths=["/games/whtbb/brain_game_2_6_7_translated_v1.swf"]
if (root/"games/whtbb/preview.png").exists(): paths.append("/games/whtbb/preview.png")
for p in sorted((root/"vendor/ruffle").iterdir()):
    if p.is_file(): paths.append("/vendor/ruffle/"+p.name)
(root/"precache-assets.json").write_text(json.dumps(paths,indent=2)+"\n")
PY

# Temporary diagnostic: export only SummaryScreen ActionScript if Java is available.
rm -f "$ROOT/summaryscreen-diagnostics.txt"
if command -v java >/dev/null 2>&1; then
  FFDEC_ZIP="${TMPDIR:-/tmp}/ffdec.zip"
  FFDEC_DIR="${TMPDIR:-/tmp}/ffdec-whtbb"
  OUT_DIR="${TMPDIR:-/tmp}/whtbb-as"
  rm -rf "$FFDEC_DIR" "$OUT_DIR"
  if curl --fail --location --silent --show-error "$FFDEC_URL" -o "$FFDEC_ZIP"; then
    mkdir -p "$FFDEC_DIR" "$OUT_DIR"
    unzip -q "$FFDEC_ZIP" -d "$FFDEC_DIR"
    FFDEC_JAR=$(find "$FFDEC_DIR" -name ffdec.jar -print -quit)
    if [ -n "${FFDEC_JAR:-}" ]; then
      java -Djava.awt.headless=true -jar "$FFDEC_JAR" -selectclass com.playfish.games.whohasthebiggestbrain.SummaryScreen -export script "$OUT_DIR" "$SWF" >/tmp/ffdec.log 2>&1 || true
      SUMMARY=$(find "$OUT_DIR" -type f -iname 'SummaryScreen.as' -print -quit)
      if [ -n "${SUMMARY:-}" ]; then
        cp "$SUMMARY" "$ROOT/summaryscreen-diagnostics.txt"
      else
        printf 'SummaryScreen export unavailable\n%s\n' "$(tail -80 /tmp/ffdec.log 2>/dev/null || true)" > "$ROOT/summaryscreen-diagnostics.txt"
      fi
    fi
  fi
fi

echo "SWF bytes: $SWF_SIZE"
echo "Ruffle ZIP bytes: $ZIP_SIZE"
echo "SWF SHA-256: $SHA"
echo "Assets ready."
