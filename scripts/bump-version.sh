#!/usr/bin/env bash
# Tek sürüm numarası: index.html'deki tüm ?vNNN, service worker önbellek adı ve app/version.json birlikte artırılır.
# Kullanım: scripts/bump-version.sh   (her yayından önce)
set -euo pipefail
cd "$(dirname "$0")/.."
cur=$(grep -o '?v[0-9]\+' app/index.html | head -1 | tr -dc 0-9)
next=$((cur + 1))
sed -i "s/?v[0-9]\+/?v${next}/g" app/index.html
sed -i "s/peyktan-shell-v[0-9]\+/peyktan-shell-v${next}/" app/sw.js
printf '{"v":%s}\n' "$next" > app/version.json
echo "v${next}"
