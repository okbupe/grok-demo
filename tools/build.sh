#!/usr/bin/env bash
# Builds the static site into $1 (default: _site).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=${1:-_site}
rm -rf "$OUT"; mkdir -p "$OUT/assets" "$OUT/vendor" "$OUT/fonts"
cp index.html style.css game.js "$OUT/"
V=$(git rev-parse --short HEAD 2>/dev/null || date +%s); sed -i "s/__BUILD__/$V/g" "$OUT/index.html"
python3 tools/build_assets.py "$OUT/assets"
for f in art/*.b64; do base64 -d "$f" > "$OUT/assets/$(basename "$f" .b64)"; done
if [ -n "${THREE_JS:-}" ]; then cp "$THREE_JS" "$OUT/vendor/three.module.min.js"; else
  tmp=$(mktemp -d)
  (cd "$tmp" && npm pack three@0.169.0 --silent >/dev/null && tar xzf three-0.169.0.tgz package/build/three.module.min.js)
  cp "$tmp/package/build/three.module.min.js" "$OUT/vendor/three.module.min.js"
fi
# vendored fonts (round 5: Luckiest Guy, Apache-2.0, for the comic pops)
cp fonts/*.woff2 fonts/LICENSE-* "$OUT/fonts/"
curl -fsSL -o "$OUT/fonts/lilita.woff2" https://fonts.gstatic.com/s/lilitaone/v17/i7dPIFZ9Zz-WBtRtedDbYEF8RQ.woff2 || echo "warn: font download failed"
curl -fsSL -o "$OUT/fonts/nunito.woff2" https://fonts.gstatic.com/s/nunito/v32/XRXV3I6Li01BKofINeaB.woff2 || echo "warn: font download failed"
# Frozen round-2 build (commit 0235f06), served at /v2/
if [ -d v2 ]; then cp -r v2 "$OUT/v2"; fi
# Frozen round-3 build (commit 75868aa + 6a0f20c title link), served at /v3/
if [ -d v3 ]; then cp -r v3 "$OUT/v3"; fi
# Frozen round-4 build (commit 2a2688c), served at /v4/
if [ -d v4 ]; then cp -r v4 "$OUT/v4"; fi
touch "$OUT/.nojekyll"
du -sh "$OUT"
