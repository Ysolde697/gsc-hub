#!/bin/sh
# Раз в 10 минут: если на GitHub появились новые правки, пересобрать панель.
set -eu
cd /opt/gsc/app
git fetch -q origin main
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ] || [ "${1:-}" = "--force" ]; then
  git reset -q --hard origin/main
  docker compose -f deploy/compose.server.yaml up -d --build
  docker image prune -f >/dev/null
fi
