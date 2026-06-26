#!/usr/bin/env bash
# Invoke the engine Lambda once to populate the status/history JSON immediately,
# instead of waiting for the next scheduled tick.
set -euo pipefail

cd "$(dirname "$0")/.."

FUNCTION="$(terraform -chdir=infra output -raw lambda_function_name)"
OUT="$(mktemp)"

echo "==> Invoking ${FUNCTION}"
aws lambda invoke \
  --function-name "${FUNCTION}" \
  --cli-binary-format raw-in-base64-out \
  --payload '{}' \
  "${OUT}"

echo "==> Response:"
cat "${OUT}"
echo
rm -f "${OUT}"
echo "==> Done. The dashboard should populate within a minute (60s cache)."
