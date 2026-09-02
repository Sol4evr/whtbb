#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INDEX="$ROOT/index.html"
HOOK='<script src="/score-hook.js"></script>'
CATEGORY='<script src="/category-leaderboard.js"></script>'

python3 - "$INDEX" "$HOOK" "$CATEGORY" <<'PY'
import pathlib, sys
path = pathlib.Path(sys.argv[1])
hook = sys.argv[2]
category = sys.argv[3]
text = path.read_text(encoding="utf-8")
needle = "</body>"
if needle not in text:
    raise SystemExit("index.html missing </body>")
for tag in (hook, category):
    if tag not in text:
        text = text.replace(needle, f"  {tag}\n{needle}", 1)
path.write_text(text, encoding="utf-8")
PY

grep -q 'src="/score-hook.js"' "$INDEX"
grep -q 'src="/category-leaderboard.js"' "$INDEX"
echo "Injected score and category leaderboard hooks"
