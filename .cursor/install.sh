#!/usr/bin/env bash
# Idempotent repository bootstrap for the Finance Tracker Cloud Agent environment.
# Runs after the repo is checked out. Installs system packages, Python/Node
# dependencies, initializes MySQL, and applies database migrations so the
# resulting snapshot boots with a ready-to-use stack.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "==> Installing system packages (mysql-server, python venv)"
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  mysql-server python3.12-venv

echo "==> Preparing .env"
if [ ! -f .env ]; then
  cp .env.example .env
fi
# The stack runs natively (not via docker compose), so the DB is reachable on localhost.
sed -i 's/^DB_HOST=.*/DB_HOST=127.0.0.1/' .env

echo "==> Starting MySQL to initialize database and user"
sudo mkdir -p /var/run/mysqld
sudo chown mysql:mysql /var/run/mysqld
if ! sudo mysqladmin ping >/dev/null 2>&1; then
  sudo mysqld_safe >/tmp/mysql-install.log 2>&1 &
fi
for _ in $(seq 1 60); do
  sudo mysqladmin ping >/dev/null 2>&1 && break
  sleep 1
done
sudo mysqladmin ping >/dev/null 2>&1 || { echo "MySQL failed to start" >&2; exit 1; }

# Load DB credentials from .env for the SQL bootstrap below.
set -a; . ./.env; set +a

# A fresh MySQL install authenticates root via the unix auth_socket plugin, so
# `sudo mysql` works without a password. If root has already been given a
# password (e.g. on a reused machine), fall back to MYSQL_ROOT_PASSWORD.
mysql_root() {
  if sudo mysql -e "SELECT 1" >/dev/null 2>&1; then
    sudo mysql "$@"
  else
    sudo mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" "$@"
  fi
}

echo "==> Creating database and application user (idempotent)"
mysql_root <<SQL
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';
CREATE USER IF NOT EXISTS '${DB_USER}'@'127.0.0.1' IDENTIFIED BY '${DB_PASSWORD}';
CREATE USER IF NOT EXISTS '${DB_USER}'@'%' IDENTIFIED BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'127.0.0.1';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'%';
FLUSH PRIVILEGES;
SQL

echo "==> Installing backend Python dependencies"
cd "$REPO_ROOT/backend"
if [ ! -d .venv ]; then
  python3 -m venv .venv
fi
. .venv/bin/activate
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt

echo "==> Applying database migrations"
set -a; . "$REPO_ROOT/.env"; set +a
python -m alembic upgrade head
deactivate

echo "==> Installing frontend dependencies"
cd "$REPO_ROOT/frontend"
npm install

echo "==> Install complete"
