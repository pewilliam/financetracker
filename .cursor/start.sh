#!/usr/bin/env bash
# Per-boot runtime initialization for the Finance Tracker Cloud Agent environment.
# Starts MySQL, ensures the Vite dev proxy hostname resolves, and applies any
# pending migrations. Long-running dev servers are launched via `terminals`.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# The committed Vite dev proxy targets http://api:8010 (a docker-compose service
# name). Map it to localhost so the frontend proxy works when running natively.
if ! grep -q "127.0.0.1 api" /etc/hosts; then
  echo "127.0.0.1 api" | sudo tee -a /etc/hosts >/dev/null
fi

echo "==> Ensuring MySQL is running"
sudo mkdir -p /var/run/mysqld
sudo chown mysql:mysql /var/run/mysqld
if ! sudo mysqladmin ping >/dev/null 2>&1; then
  sudo mysqld_safe >/tmp/mysql-start.log 2>&1 &
fi
for _ in $(seq 1 60); do
  sudo mysqladmin ping >/dev/null 2>&1 && break
  sleep 1
done
sudo mysqladmin ping >/dev/null 2>&1 || { echo "MySQL failed to start" >&2; exit 1; }

echo "==> Applying database migrations (idempotent)"
cd "$REPO_ROOT/backend"
. .venv/bin/activate
set -a; . "$REPO_ROOT/.env"; set +a
python -m alembic upgrade head
deactivate

echo "==> Start complete"
