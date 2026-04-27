#!/usr/bin/env bash
set -euo pipefail

# Test WhatsApp webhook end-to-end (signature + payload parsing).
#
# What it does:
# - Sends a signed webhook payload to POST /whatsapp/webhook
# - Expects HTTP 200 { ok: true }
#
# Notes:
# - This test only verifies webhook acceptance and server handling entry shape.
# - Outbound sending depends on queues + WhatsApp accounts + tokens; this script
#   does NOT require real Meta tokens.
#
# Required env:
# - API_BASE_URL (default http://localhost:3000)
# - META_APP_SECRET (for X-Hub-Signature-256)
#
# Optional env:
# - PHONE_NUMBER_ID (default "test_phone_123")
# - FROM (default "201000000000")

API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"
META_APP_SECRET="${META_APP_SECRET:-}"
PHONE_NUMBER_ID="${PHONE_NUMBER_ID:-test_phone_123}"
FROM="${FROM:-201000000000}"

if [[ -z "${META_APP_SECRET}" ]]; then
  echo "ERROR: META_APP_SECRET is required."
  exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "ERROR: openssl is required."
  exit 1
fi

RAW_BODY="$(cat <<EOF
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "waba_1",
      "changes": [
        {
          "field": "messages",
          "value": {
            "metadata": { "phone_number_id": "${PHONE_NUMBER_ID}", "display_phone_number": "+201000000000" },
            "contacts": [{ "wa_id": "${FROM}", "profile": { "name": "Test User" } }],
            "messages": [{ "from": "${FROM}", "type": "text", "text": { "body": "hello from webhook test" } }]
          }
        }
      ]
    }
  ]
}
EOF
)"

SIG_HEX="$(printf '%s' "${RAW_BODY}" | openssl dgst -sha256 -hmac "${META_APP_SECRET}" | awk '{print $NF}')"
SIGNATURE="sha256=${SIG_HEX}"

echo "==> POST ${API_BASE_URL}/whatsapp/webhook"
code="$(curl -s -o /tmp/webhook.out -w "%{http_code}" \
  -X POST "${API_BASE_URL}/whatsapp/webhook" \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: ${SIGNATURE}" \
  --data "${RAW_BODY}" \
  || true)"

cat /tmp/webhook.out || true
echo

if [[ "${code}" != "200" ]]; then
  echo "FAIL: expected 200, got ${code}"
  exit 1
fi

echo "PASS: webhook accepted (HTTP 200)"

