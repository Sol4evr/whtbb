#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ORIG="$ROOT/games/whtbb/brain_game_2_6_7_translated_v1.swf"
OUT="$ROOT/games/whtbb/brain_game_2_6_7_translated_v1_stable.swf"
TOOLS="${TMPDIR:-/tmp}/whtbb-stable-tools"
FFDEC="$TOOLS/ffdec"
AS3="$TOOLS/as3"
PATCHED_AS="$TOOLS/SummaryScreen-stable.as"
FFDEC_URL="https://github.com/jindrapetrik/jpexs-decompiler/releases/download/version26.2.1/ffdec_26.2.1.zip"

[ -s "$ORIG" ] || { echo "Original SWF missing: $ORIG" >&2; exit 31; }
mkdir -p "$TOOLS"

JAVA_BIN="$(command -v java || true)"
if [ -z "$JAVA_BIN" ]; then
  JRE="$TOOLS/jre"
  if [ ! -x "$JRE/bin/java" ]; then
    echo "Fetching portable Temurin JRE 21 for stable SWF build"
    rm -rf "$JRE" "$TOOLS/jre.tar.gz"
    mkdir -p "$JRE"
    curl --fail --location --silent --show-error \
      "https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jre/hotspot/normal/eclipse" \
      -o "$TOOLS/jre.tar.gz"
    tar -xzf "$TOOLS/jre.tar.gz" -C "$JRE" --strip-components=1
    rm -f "$TOOLS/jre.tar.gz"
  fi
  JAVA_BIN="$JRE/bin/java"
fi
"$JAVA_BIN" -version >/dev/null 2>&1 || { echo "Java runtime unavailable" >&2; exit 32; }

if [ ! -f "$FFDEC/ffdec.jar" ]; then
  echo "Fetching pinned FFDec 26.2.1"
  rm -rf "$FFDEC" "$TOOLS/ffdec.zip"
  mkdir -p "$FFDEC"
  curl --fail --location --silent --show-error "$FFDEC_URL" -o "$TOOLS/ffdec.zip"
  unzip -q "$TOOLS/ffdec.zip" -d "$FFDEC"
  rm -f "$TOOLS/ffdec.zip"
fi
FFDEC_JAR="$(find "$FFDEC" -name ffdec.jar -print -quit)"
[ -n "$FFDEC_JAR" ] || { echo "FFDec jar missing" >&2; exit 33; }

rm -rf "$AS3"
mkdir -p "$AS3"
"$JAVA_BIN" -jar "$FFDEC_JAR" -config showMethodBodyId=true -export script "$AS3" "$ORIG" >/dev/null
SUMMARY="$(find "$AS3" -type f -iname 'SummaryScreen.as' -print -quit)"
[ -n "$SUMMARY" ] || { echo "SummaryScreen source not found" >&2; exit 34; }

python3 - "$SUMMARY" "$PATCHED_AS" <<'PY'
import sys
src,dst=sys.argv[1],sys.argv[2]
text=open(src,encoding="utf-8",errors="replace").read()
anchor="GameWorld.totalScores = combinedScore;"
bridge='''\n         // WHTBB preservation bridge: expose existing protected score values atomically.\n         // No game mechanics or score calculations are changed.\n         trace("WHTBB_SCORES=" + combinedScore + "," + GameWorld.protectedValues.getValue(GameWorld.PROTECTED_VALUE_CATEGORY_SCORE_1) + "," + GameWorld.protectedValues.getValue(GameWorld.PROTECTED_VALUE_CATEGORY_SCORE_2) + "," + GameWorld.protectedValues.getValue(GameWorld.PROTECTED_VALUE_CATEGORY_SCORE_3) + "," + GameWorld.protectedValues.getValue(GameWorld.PROTECTED_VALUE_CATEGORY_SCORE_4));\n'''
if anchor not in text:
    raise SystemExit("combinedScore anchor missing")
open(dst,"w",encoding="utf-8").write(text.replace(anchor,anchor+bridge,1))
PY

rm -f "$OUT"
"$JAVA_BIN" -jar "$FFDEC_JAR" -replace "$ORIG" "$OUT" \
  com.playfish.games.whohasthebiggestbrain.SummaryScreen "$PATCHED_AS" >/dev/null
[ -s "$OUT" ] || { echo "Stable SWF was not created" >&2; exit 35; }

VERIFY="$TOOLS/verify"
rm -rf "$VERIFY"; mkdir -p "$VERIFY"
"$JAVA_BIN" -jar "$FFDEC_JAR" -export script "$VERIFY" "$OUT" >/dev/null
grep -Rqs 'WHTBB_SCORES=' "$VERIFY" || { echo "Stable SWF verification failed: atomic trace missing" >&2; exit 36; }

if command -v sha256sum >/dev/null 2>&1; then
  STABLE_SHA=$(sha256sum "$OUT" | awk '{print $1}')
else
  STABLE_SHA=$(shasum -a 256 "$OUT" | awk '{print $1}')
fi
printf '%s  %s\n' "$STABLE_SHA" "games/whtbb/brain_game_2_6_7_translated_v1_stable.swf" > "$ROOT/STABLE_SHA256.txt"
echo "Stable SWF ready: $STABLE_SHA"
