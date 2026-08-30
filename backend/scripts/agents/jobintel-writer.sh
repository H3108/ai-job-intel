#!/usr/bin/env bash
set -euo pipefail
PROJECT=/opt/hush-ai/workspace/projects/jobintel
WRITE_TOKEN="${JOBINTEL_WRITE_TOKEN:-}"
CONTRACT_ID="${1:-}"
TASK_TYPE="${2:-}"
PAYLOAD_FILE="${3:-}"

if [[ -z "$CONTRACT_ID" || -z "$TASK_TYPE" || -z "$PAYLOAD_FILE" ]]; then
  echo "usage: $0 <contract_id> <task_type> <payload_json_file>" >&2
  exit 1
fi

BASE="http://127.0.0.1:3001"
AUTH=()
if [[ -n "$WRITE_TOKEN" ]]; then
  AUTH=(-H "Authorization: Bearer $WRITE_TOKEN")
fi

if [[ ! -f "$PAYLOAD_FILE" ]]; then
  echo "payload file not found: $PAYLOAD_FILE" >&2
  exit 1
fi

BODY="$(cat "$PAYLOAD_FILE")"
curl -fsS "${AUTH[@]}" -X POST "$BASE/api/intelligence/write" \
  -H "Content-Type: application/json" \
  -d "$BODY"
