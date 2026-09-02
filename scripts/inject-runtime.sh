#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INDEX="$ROOT/index.html"
HOOK='<script src="/score-hook.js"></script>'

if ! grep -q 'src="/score-hook.js"' "$INDEX"; then
  python3 - "$INDEX" "$HOOK" <<'PY'
import pathlib, sys
path = pathlib.Path(sys.argv[1])
hook = sys.argv[2]
text = path.read_text(encoding="utf-8")
needle = "</body>"
if needle not in text:
    raise SystemExit("index.html missing </body>")
path.write_text(text.replace(needle, f"  {hook}\n{needle}", 1), encoding="utf-8")
PY
fi

grep -q 'src="/score-hook.js"' "$INDEX"
echo "Injected score-hook.js"
