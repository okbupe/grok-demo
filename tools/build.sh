#!/usr/bin/env bash
# Builds the static site into $1 (default: _site).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=${1:-_site}
rm -rf "$OUT"; mkdir -p "$OUT/assets" "$OUT/vendor" "$OUT/fonts"
cp index.html style.css game.js "$OUT/"
python3 tools/build_assets.py "$OUT/assets"
for f in art/*.b64; do base64 -d "$f" > "$OUT/assets/$(basename "$f" .b64)"; done
if [ -n "${THREE_JS:-}" ]; then cp "$THREE_JS" "$OUT/vendor/three.module.min.js"; else
  tmp=$(mktemp -d)
  (cd "$tmp" && npm pack three@0.169.0 --silent >/dev/null && tar xzf three-0.169.0.tgz package/build/three.module.min.js)
  cp "$tmp/package/build/three.module.min.js" "$OUT/vendor/three.module.min.js"
fi
curl -fsSL -o "$OUT/fonts/lilita.woff2" https://fonts.gstatic.com/s/lilitaone/v17/i7dPIFZ9Zz-WBtRtedDbYEF8RQ.woff2 || echo "warn: font download failed"
curl -fsSL -o "$OUT/fonts/nunito.woff2" https://fonts.gstatic.com/s/nunito/v32/XRXV3I6Li01BKofINeaB.woff2 || echo "warn: font download failed"
touch "$OUT/.nojekyll"
du -sh "$OUT"
