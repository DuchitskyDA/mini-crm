#!/usr/bin/env bash
# Сборка фронтенда и выкладка статики на сервер.
# Сервер: каталог /opt/minicrm/dist, его отдаёт контейнер из deploy/compose.yaml за общим Caddy.
# Нужны: web/.env.local (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY — публичные значения)
# и SSH-доступ к хосту: DEPLOY_HOST (по умолчанию oby-core из ~/.ssh/config).
set -euo pipefail
cd "$(dirname "$0")/../web"
host="${DEPLOY_HOST:-oby-core}"

npm ci
npm test -- --run
npm run build

# В сборку не должен попасть секретный ключ: если локально есть service_role, ищем его в dist.
key="$(grep -s '^SUPABASE_SERVICE_ROLE_KEY=' ../.env.local | cut -d= -f2- || true)"
if [ -n "$key" ] && grep -rqF "$key" dist; then
  echo "В dist найден service_role-ключ — выкладка остановлена" >&2
  exit 1
fi

tar -C dist -czf - . | ssh "$host" 'set -e
  rm -rf /opt/minicrm/dist.new && mkdir -p /opt/minicrm/dist.new
  tar -C /opt/minicrm/dist.new -xzf -
  rm -rf /opt/minicrm/dist.old
  mv /opt/minicrm/dist /opt/minicrm/dist.old && mv /opt/minicrm/dist.new /opt/minicrm/dist
  docker restart core-minicrm >/dev/null'
echo "Готово: https://mini-crm.62-83-8-181.sslip.io/"
