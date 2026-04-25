#!/usr/bin/env bash
set -euo pipefail

BASE="${1:-http://localhost:3000}"

echo "=== Health Check ==="
curl -sf "$BASE/" | python3 -m json.tool

echo -e "\n=== Model List ==="
curl -sf "$BASE/v1/models" | python3 -m json.tool

echo -e "\n=== Non-Streaming Chat ==="
curl -sf "$BASE/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -d '{"model":"glm-5.1","messages":[{"role":"user","content":"Say hello in one word"}]}' | python3 -m json.tool

echo -e "\n=== Streaming Chat ==="
timeout 15 curl -sN "$BASE/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -d '{"model":"glm-5.1","messages":[{"role":"user","content":"Say hi"}],"stream":true}' 2>&1 || true
echo ""

echo -e "\n=== Error: Missing Model ==="
curl -s "$BASE/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hi"}]}' | python3 -m json.tool

echo -e "\n=== Error: Invalid JSON ==="
curl -s -X POST "$BASE/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -d 'not-json' | python3 -m json.tool

echo -e "\nAll tests done."
