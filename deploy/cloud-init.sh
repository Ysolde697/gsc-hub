#!/bin/bash
# Первая настройка сервера DigitalOcean (Ubuntu 24.04), без ручного входа.
# Вставляется в поле User data при создании сервера; значения __ВОТ_ТАКИЕ__
# подставляются перед этим. Сам файл в репозитории секретов не содержит.
set -eux
export DEBIAN_FRONTEND=noninteractive

# 2 ГБ подкачки: сборке панели не хватает 1 ГБ памяти.
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

apt-get update
apt-get install -y docker.io docker-compose-v2 git openssl
systemctl enable --now docker

mkdir -p /opt/gsc/data /opt/gsc/caddy
umask 077
cat > /opt/gsc/.env <<ENV
DOMAIN=__DOMAIN__
ORIGIN=https://__DOMAIN__
AUTH_URL=https://__DOMAIN__
GOOGLE_CLIENT_ID=__GOOGLE_CLIENT_ID__
GOOGLE_CLIENT_SECRET=__GOOGLE_CLIENT_SECRET__
ADMIN_EMAIL=__ADMIN_EMAIL__
ADMIN_PASSWORD=__ADMIN_PASSWORD__
AUTH_SECRET=$(openssl rand -base64 32)
ENV
umask 022

git clone https://github.com/__REPO__ /opt/gsc/app
# Автообновление (systemd-таймер раз в 10 минут) и первая сборка.
sh /opt/gsc/app/deploy/install-autoupdate.sh
