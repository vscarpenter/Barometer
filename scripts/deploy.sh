#!/usr/bin/env bash
# Build the frontend + Lambda bundle, apply Terraform, and upload the dashboard.
# Extra args are passed through to `terraform apply` (e.g. -var-file=terraform.tfvars).
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Installing dependencies"
bun install --frozen-lockfile

echo "==> Building web bundle and Lambda artifact"
bun run --filter '@barometer/web' build
bun run --filter '@barometer/engine' build

echo "==> terraform apply"
terraform -chdir=infra apply "$@"

BUCKET="$(terraform -chdir=infra output -raw bucket_id)"

echo "==> Uploading frontend to s3://${BUCKET}/app"
# Hashed assets are immutable and cached for a year. The demo data under
# public/{status,history} is excluded — the Lambda owns those prefixes.
aws s3 sync packages/web/dist "s3://${BUCKET}/app" --delete \
  --exclude "status/*" --exclude "history/*" \
  --cache-control "public,max-age=31536000,immutable"

# index.html must revalidate so new deploys are picked up immediately.
aws s3 cp packages/web/dist/index.html "s3://${BUCKET}/app/index.html" \
  --content-type "text/html" --cache-control "no-cache"

# Force the edge to drop the cached entry point right away. Hashed assets are
# immutable (a new build emits new filenames), so only the mutable HTML needs
# purging: the bare root (default_root_object) and /index.html itself.
echo "==> Invalidating CloudFront cache for the entry point"
DISTRIBUTION_ID="$(terraform -chdir=infra output -raw distribution_id)"
INVALIDATION_ID="$(aws cloudfront create-invalidation \
  --distribution-id "${DISTRIBUTION_ID}" \
  --paths "/" "/index.html" \
  --query "Invalidation.Id" --output text)"
echo "    Created invalidation ${INVALIDATION_ID} (paths: / /index.html)"

echo "==> Done."
echo "    1. Confirm the SNS subscription email sent to your alert_email."
echo "    2. Run scripts/seed.sh to populate the status data on first deploy."
echo "    3. Visit: $(terraform -chdir=infra output -raw url)"
