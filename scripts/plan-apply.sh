#!/usr/bin/env bash
# Plan and apply the Terraform infrastructure, with a review gate in between.
#
# Unlike deploy.sh (which builds everything, applies, and uploads the frontend),
# this is infra-only: it shows you a Terraform plan, waits for your confirmation,
# then applies *exactly* that saved plan. Use it to review changes like a
# provider upgrade or the Lambda runtime bump before they touch AWS.
#
# Pass any extra terraform args through, e.g.:
#   scripts/plan-apply.sh -var-file=terraform.tfvars
set -euo pipefail

cd "$(dirname "$0")/.."

# Terraform zips packages/engine/dist into the Lambda artifact and reads that
# directory while planning, so the bundle must exist and be current first.
echo "==> Installing deps and building the Lambda bundle"
bun install --frozen-lockfile
bun run --filter '@barometer/engine' build

# Ensure providers are installed. deploy.sh does NOT init, so after a provider
# version change this step is what pulls it. Idempotent — safe to run every time.
echo "==> terraform init"
terraform -chdir=infra init -input=false

# Always clean up the saved plan, however the script exits.
trap 'rm -f infra/tfplan' EXIT

echo "==> terraform plan"
# -detailed-exitcode: 0 = no changes, 2 = changes present, 1 = error.
set +e
terraform -chdir=infra plan -out=tfplan -detailed-exitcode "$@"
plan_status=$?
set -e

case "${plan_status}" in
  0) echo "==> No changes. Infrastructure already matches the config."; exit 0 ;;
  2) ;; # changes to apply — fall through to the confirmation gate
  *) echo "!! terraform plan failed (exit ${plan_status})"; exit "${plan_status}" ;;
esac

echo
read -r -p "==> Apply the plan shown above? [y/N] " reply
if [[ ! "${reply}" =~ ^[Yy]$ ]]; then
  echo "Aborted. Nothing was applied."
  exit 0
fi

echo "==> terraform apply"
terraform -chdir=infra apply tfplan

echo "==> Done."
echo "    Optional: run scripts/seed.sh to refresh the dashboard data immediately"
echo "    (e.g. to smoke-test the new runtime) instead of waiting for the next tick."
