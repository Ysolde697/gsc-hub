#!/bin/sh
# Раз в 10 минут: если на GitHub появились новые правки, пересобрать панель.
# Итог пишется в /opt/gsc/status/update.txt — Caddy отдаёт его по
# https://<домен>/deploy-status/update.txt, чтобы проверять сервер без входа.
set -u
STATUS_DIR=/opt/gsc/status
mkdir -p "$STATUS_DIR"
LOG=$(mktemp)
status() {
  {
    echo "time: $(date -u +%FT%TZ)"
    echo "result: $1"
    echo "commit: $(git -C /opt/gsc/app rev-parse --short HEAD 2>/dev/null)"
    echo "---"
    tail -n 40 "$LOG"
  } > "$STATUS_DIR/update.txt.tmp" && mv "$STATUS_DIR/update.txt.tmp" "$STATUS_DIR/update.txt"
  rm -f "$LOG"
}
run() {
  cd /opt/gsc/app || return 1
  git fetch -q origin main || return 1
  if [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] && [ "${1:-}" != "--force" ]; then
    return 3
  fi
  git reset -q --hard origin/main || return 1
  docker compose -f deploy/compose.server.yaml up -d --build --remove-orphans || return 1
  docker image prune -f >/dev/null 2>&1
  return 0
}
run "${1:-}" >"$LOG" 2>&1
rc=$?
case $rc in
  0) status updated ;;
  3) status up-to-date ;;
  *) status "FAILED ($rc)"; exit 1 ;;
esac
