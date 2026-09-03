#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INDEX="$ROOT/index.html"
STABLE='<script src="/stable-v15.js"></script>'

python3 - "$INDEX" "$STABLE" <<'PY'
import pathlib,re,sys
path=pathlib.Path(sys.argv[1])
tag=sys.argv[2]
text=path.read_text(encoding="utf-8")
legacy=[
  "score-hook.js","category-leaderboard.js","leaderboard-v12.js",
  "score-runtime-v14.js","score-runtime-v15.js","stable-v15.js"
]
for src in legacy:
    text=re.sub(r'\s*<script\s+src=["\']/'+re.escape(src)+r'["\']></script>\s*','\n',text)
needle="</body>"
if needle not in text:
    raise SystemExit("index.html missing </body>")
text=text.replace(needle,f"  {tag}\n{needle}",1)
path.write_text(text,encoding="utf-8")
PY

grep -q 'src="/stable-v15.js"' "$INDEX"
! grep -q 'src="/score-runtime-v14.js"' "$INDEX"
! grep -q 'src="/category-leaderboard.js"' "$INDEX"
echo "Injected stable v15 runtime"
