#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INDEX="$ROOT/index.html"
STABLE='<script src="/stable-v15.js"></script>'

python3 - "$INDEX" "$STABLE" <<'PY'
import pathlib,sys,re
path=pathlib.Path(sys.argv[1])
tag=sys.argv[2]
text=path.read_text(encoding="utf-8")n
PY
