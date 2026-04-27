#!/usr/bin/env bash
set -euo pipefail

# Test: server stays up when Redis becomes unavailable (degraded mode).
#
# What it does:
# - Starts the NestJS server
# - Stops Redis (best-effort: redis-cli or docker)
# - Calls GET /health
# - Expects HTTP 200
#
# Requirements:
# - bash, curl
# - Node/npm installed
# - A Redis instance reachable via $REDIS_URL (default: redis://localhost:6379)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-3000}"
BASE_URL="${BASE_URL:-http://localhost:${PORT}}"
REDIS_URL="${REDIS_URL:-redis://localhost:6379}"

LOG_FILE="${LOG_FILE:-${ROOT_DIR}/.tmp.test-redis-failover.server.log}"

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]] && kill -0 "${SERVER_PID}" 2>/dev/null; then
    kill "${SERVER_PID}" 2>/dev/null || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "==> Starting server (PORT=${PORT})"
rm -f "${LOG_FILE}" 2>/dev/null || true

(
  cd "${ROOT_DIR}"
  PORT="${PORT}" REDIS_URL="${REDIS_URL}" npm run -s dev
) >"${LOG_FILE}" 2>&1 &
SERVER_PID="$!"

echo "==> Waiting for /health to be ready"
for i in {1..40}; do
  code="$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/health" || true)"
  if [[ "${code}" == "200" ]]; then
    break
  fi
  sleep 0.25
done

code="$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/health" || true)"
if [[ "${code}" != "200" ]]; then
  echo "ERROR: server didn't become healthy (HTTP ${code})."
  echo "---- server log tail ----"
  tail -n 60 "${LOG_FILE}" || true
  exit 1
fi

echo "==> Stopping Redis (best-effort) at ${REDIS_URL}"
stopped="false"

if command -v redis-cli >/dev/null 2>&1; then
  # Use -u if supported (redis-cli 6+). If it fails, try host/port.
  if redis-cli -u "${REDIS_URL}" ping >/dev/null 2>&1; then
    redis-cli -u "${REDIS_URL}" shutdown nosave >/dev/null 2>&1 || true
    stopped="true"
  else
    hostport="${REDIS_URL#redis://}"
    host="${hostport%%:*}"
    port2="${hostport##*:}"
    if redis-cli -h "${host}" -p "${port2}" ping >/dev/null 2>&1; then
      redis-cli -h "${host}" -p "${port2}" shutdown nosave >/dev/null 2>&1 || true
      stopped="true"
    fi
  fi
fi

if [[ "${stopped}" != "true" ]] && command -v docker >/dev/null 2>&1; then
  # Try stopping a container exposing 6379 (common local setup).
  cid="$(docker ps --format "{{.ID}} {{.Ports}} {{.Names}}" | awk '/:6379->/ {print $1; exit 0}' || true)"
  if [[ -n "${cid}" ]]; then
    docker stop "${cid}" >/dev/null
    stopped="true"
  fi
fi

if [[ "${stopped}" != "true" ]]; then
  echo "WARN: could not auto-stop Redis (no redis-cli or docker match)."
  echo "      Please stop Redis manually, then re-run this script."
  exit 2
fi

echo "==> Calling health check after Redis stop"
code="$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/health" || true)"
if [[ "${code}" != "200" ]]; then
  echo "ERROR: expected HTTP 200 from /health, got ${code}"
  echo "---- server log tail ----"
  tail -n 120 "${LOG_FILE}" || true
  exit 1
fi

echo "PASS: server is still responding 200 on /health after Redis stopped"

