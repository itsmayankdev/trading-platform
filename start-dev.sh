#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

log() { printf '\n[trading-dev] %s\n' "$*"; }
fail() { printf '\n[trading-dev] ERROR: %s\n' "$*" >&2; exit 1; }

command -v python3 >/dev/null 2>&1 || fail "python3 is required."

# WSL/non-login shells often do not source ~/.bashrc. If nvm is already
# installed, load it explicitly so the startup command works from WSL too.
if ! command -v node >/dev/null 2>&1; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck disable=SC1090
    . "$NVM_DIR/nvm.sh"
  fi
fi

command -v node >/dev/null 2>&1 || fail "Node.js is not installed or is not on PATH. Install Node.js 20.9+ (recommended: nvm), then rerun bash start-dev.sh."
command -v npm >/dev/null 2>&1 || fail "npm is not installed or is not on PATH."
command -v docker >/dev/null 2>&1 || fail "Docker is required for local Postgres/Redis. Start Docker Desktop and run this again."

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
NODE_VERSION="$(node -p 'process.versions.node')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  fail "Node.js $NODE_VERSION is too old for this project. Use Node.js 20.9+ and rerun bash start-dev.sh."
fi

log "Using Node.js $NODE_VERSION ($(command -v node)) and npm $(npm --version)."
if [ ! -f .env ]; then
  log ".env not found; creating a development .env from .env.example."
  cp .env.example .env
fi

if [ ! -d .venv ]; then
  log "Creating Python virtual environment."
  python3 -m venv .venv || fail "Could not create .venv. Install python3-venv first."
fi

PYTHON="$ROOT_DIR/.venv/bin/python"
[ -x "$PYTHON" ] || fail "Virtual environment is incomplete. Delete .venv and rerun this script."

REQ_HASH="$(sha256sum requirements.txt | awk '{print $1}')"
REQ_MARKER="$ROOT_DIR/.venv/.requirements.sha256"
if [ ! -f "$REQ_MARKER" ] || [ "$(cat "$REQ_MARKER")" != "$REQ_HASH" ]; then
  log "Installing/updating backend Python dependencies."
  "$PYTHON" -m pip install --upgrade pip
  "$PYTHON" -m pip install -r requirements.txt
  printf '%s' "$REQ_HASH" > "$REQ_MARKER"
else
  log "Backend dependencies already match requirements.txt."
fi

if [ ! -d frontend/node_modules ]; then
  log "Installing frontend dependencies."
  (cd frontend && npm ci)
fi

log "Starting Postgres and Redis."
docker compose -f infra/docker-compose.yml up -d postgres redis

log "Waiting for Postgres and Redis health."
for service in trading-postgres trading-redis; do
  ready=0
  for _ in $(seq 1 30); do
    status="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}running{{end}}' "$service" 2>/dev/null || true)"
    if [ "$status" = "healthy" ] || [ "$status" = "running" ]; then
      ready=1
      break
    fi
    sleep 1
  done
  [ "$ready" -eq 1 ] || fail "$service did not become ready. Check: docker logs $service"
done

cleanup() {
  trap - INT TERM EXIT
  [ -n "${BACKEND_PID:-}" ] && kill "$BACKEND_PID" 2>/dev/null || true
  [ -n "${FRONTEND_PID:-}" ] && kill "$FRONTEND_PID" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

log "Starting FastAPI on http://127.0.0.1:8000"
"$PYTHON" -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000 &
BACKEND_PID=$!

log "Waiting for FastAPI health."
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8000/health >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    fail "FastAPI exited during startup. Check the backend output above."
  fi
  sleep 1
done

curl -fsS http://127.0.0.1:8000/health >/dev/null 2>&1 || fail "FastAPI did not become healthy within 30 seconds."

log "Starting Next.js on http://localhost:3000"
(cd frontend && npm run dev) &
FRONTEND_PID=$!

log "Application is starting. Open http://localhost:3000/dashboard"
log "Press Ctrl+C once to stop both local dev servers. Postgres/Redis remain running."
wait
