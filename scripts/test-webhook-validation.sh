#!/usr/bin/env bash
set -euo pipefail

# Test: WhatsApp webhook validation returns 400 for an invalid/empty payload.
#
# IMPORTANT:
# - The WhatsApp webhook endpoint is protected by Meta signature guard.
# - To reach controller validation (400), you MUST provide:
#   - META_APP_SECRET env var (same value the server uses)
#   - x-hub-signature-256 header that matches the raw request body
#
# Requirements:
# - bash, curl, openssl
# - Server running on BASE_URL (default http://localhost:3000)

PORT="${PORT:-3000}"
BASE_URL="${BASE_URL:-http://localhost:${PORT}}"
META_APP_SECRET="${META_APP_SECRET:-}"

if [[ -z "${META_APP_SECRET}" ]]; then
  echo "ERROR: META_APP_SECRET is required for this test."
  echo "Example:"
  echo "  META_APP_SECRET=... PORT=3000 bash scripts/test-webhook-validation.sh"
  exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "ERROR: openssl is required to compute x-hub-signature-256."
  exit 1
fi

# "Empty" payload for this API:
# - Using empty string may be rejected by JSON parser depending on configuration.
# - Using '{}' reliably triggers controller validation: entry[] is missing => 400.
RAW_BODY='{}'

SIG_HEX="$(printf '%s' "${RAW_BODY}" | openssl dgst -sha256 -hmac "${META_APP_SECRET}" | awk '{print $NF}')"
SIGNATURE="sha256=${SIG_HEX}"

echo "==> Sending invalid webhook payload (expected 400)"
code="$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "${BASE_URL}/whatsapp/webhook" \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: ${SIGNATURE}" \
  --data "${RAW_BODY}" \
  || true)"

if [[ "${code}" != "400" ]]; then
  echo "ERROR: expected HTTP 400, got ${code}"
  echo "Hint: if you got 403, signature/META_APP_SECRET mismatch."
  exit 1
fi

echo "PASS: webhook validation returned 400 as expected"

