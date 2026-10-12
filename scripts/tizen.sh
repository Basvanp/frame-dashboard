#!/bin/sh
# Build, sign and install the Tizen shell. Needs the Tizen Studio CLI with the
# "Samsung Certificate Extension" and a Samsung certificate profile — see README.
#   sh scripts/tizen.sh build              → tizen/FrameDashboard.wgt
#   TV_IP=192.168.1.50 sh scripts/tizen.sh install
set -eu

TIZEN="${TIZEN_HOME:-$HOME/tizen-studio}/tools/ide/bin/tizen"
SDB="${TIZEN_HOME:-$HOME/tizen-studio}/tools/sdb"
PROFILE="${TIZEN_PROFILE:-frame}"
OUT=tizen/.buildResult

[ -x "$TIZEN" ] || { echo "Tizen CLI not found at $TIZEN (set TIZEN_HOME)"; exit 1; }

case "${1:-}" in
  build)
    [ -f tizen/dashboard-url.js ] || { echo "Run npm run shell:config first"; exit 1; }
    rm -rf "$OUT"
    "$TIZEN" build-web -out .buildResult -- tizen
    "$TIZEN" package -t wgt -s "$PROFILE" -- "$OUT"
    mv "$OUT"/*.wgt tizen/FrameDashboard.wgt
    echo "Built tizen/FrameDashboard.wgt"
    ;;
  install)
    : "${TV_IP:?set TV_IP to the TV's address}"
    "$SDB" connect "$TV_IP:26101"
    TARGET=$("$SDB" devices | awk 'NR>1 && $1 ~ /:26101$/ {print $3; exit}')
    "$TIZEN" install -n FrameDashboard.wgt -t "$TARGET" -- tizen
    "$TIZEN" run -p FrmDashbd1.FrameDashboard -t "$TARGET"
    ;;
  *)
    echo "usage: sh scripts/tizen.sh build|install"; exit 1 ;;
esac
