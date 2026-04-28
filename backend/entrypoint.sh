#!/usr/bin/env sh
set -e

python -m alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8010 --reload
