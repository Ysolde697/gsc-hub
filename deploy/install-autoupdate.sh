#!/bin/sh
# Ставит автообновление панели через systemd (каждые 10 минут) и сразу
# обновляет её. Запускать от root на сервере: sh deploy/install-autoupdate.sh
set -eu
cat > /etc/systemd/system/gsc-update.service <<'UNIT'
[Unit]
Description=gsc-hub: обновить панель из GitHub
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/bin/sh /opt/gsc/app/deploy/update.sh
UNIT
cat > /etc/systemd/system/gsc-update.timer <<'UNIT'
[Unit]
Description=gsc-hub: проверять обновления каждые 10 минут

[Timer]
OnBootSec=2min
OnUnitActiveSec=10min

[Install]
WantedBy=timers.target
UNIT
rm -f /etc/cron.d/gsc-update
systemctl daemon-reload
systemctl enable --now gsc-update.timer
echo "== обновляю панель, 5-10 минут =="
sh /opt/gsc/app/deploy/update.sh --force
docker ps --format '{{.Names}}: {{.Status}}'
echo "== ГОТОВО =="
