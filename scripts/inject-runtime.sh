#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INDEX="$ROOT/index.html"
STABLE='<script src="/stable-v15.js?v=15.1.0"></script>'
POST_SAVE='<script src="/post-save-ux-v15.1.js?v=15.1.0"></script>'
SYNC_FIX='<script src="/sync-fix-v15.1.1.js?v=15.1.1"></script>'

python3 - "$INDEX" "$STABLE" "$POST_SAVE" "$SYNC_FIX" <<'PY'
import pathlib,re,sys
path=pathlib.Path(sys.argv[1])
stable=sys.argv[2]
post=sys.argv[3]
sync_fix=sys.argv[4]
text=path.read_text(encoding="utf-8")
legacy=[
  "score-hook.js","category-leaderboard.js","leaderboard-v12.js",
  "score-runtime-v14.js","score-runtime-v15.js","stable-v15.js","post-save-ux-v15.1.js","sync-fix-v15.1.1.js"
]
for src in legacy:
    text=re.sub(r'\s*<script\s+src=["\']/'+re.escape(src)+r'(?:\?[^"\']*)?["\']></script>\s*','\n',text)
text=re.sub(r'const SWF_PATH="/games/whtbb/brain_game_2_6_7_translated_v1\.swf(?:\?[^"\']*)?";',
            'const SWF_PATH="/games/whtbb/brain_game_2_6_7_translated_v1.swf?v=15.1.0";',text)
needle="</body>"
if needle not in text:
    raise SystemExit("index.html missing </body>")
text=text.replace(needle,f"  {stable}\n  {post}\n  {sync_fix}\n{needle}",1)
path.write_text(text,encoding="utf-8")
PY

grep -q 'stable-v15.js?v=15.1.0' "$INDEX"
grep -q 'post-save-ux-v15.1.js?v=15.1.0' "$INDEX"
grep -q 'sync-fix-v15.1.1.js?v=15.1.1' "$INDEX"
grep -q 'brain_game_2_6_7_translated_v1.swf?v=15.1.0' "$INDEX"
! grep -q 'src="/score-runtime-v14.js"' "$INDEX"
echo "Injected stable v15.1 runtime with post-save UX and v15.1.1 sync hotfix"
