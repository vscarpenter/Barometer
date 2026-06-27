# Compliance Fix Spec

Date: 2026-06-26

## Goal

Bring the current Barometer engine/deploy changes into compliance with `coding-standards.md` without changing product behavior.

## Inputs / Outputs

Inputs:

- Existing implementation changes for conditional GET, dry-run history mode, Lambda SDK bundling, deploy preflights, and provider docs.
- `coding-standards.md` compliance findings.

Outputs:

- Process artifacts in `tasks/` and `docs/adr/`.
- Refactored adapter conditional-fetch flow with no repeated 304/ETag block.
- Smaller `runOnce` orchestration with helper functions for run inputs, history mode, and ETag state merge.
- Clarified AWS DNS preflight wording and constants.
- Repeatable dependency audit script.

## Constraints

- Do not deploy or apply Terraform.
- Do not alter the public dashboard behavior.
- Preserve adapter contract: provider fetch failures degrade only that provider to `unknown`.
- Preserve dry-run contract: live provider smoke, no S3 writes, no alerts, no synthetic uptime windows.
- Preserve Terraform arm64 preflight and stale-lock recovery message.
- Add no new dependencies.

## Edge Cases

- 304 response with a previous snapshot reuses that snapshot and updates `checkedAt`.
- 304 response without a previous snapshot degrades to `unknown`.
- 200 response with an ETag records the new ETag.
- non-200 response still degrades to `unknown`.
- `historyMode: "current-only"` writes neither `recent.json` nor `rollups.json`.
- DNS preflight failure points to local DNS/VPN remediation before Terraform work starts.

## Out of Scope

- Remote deployment.
- Provider list changes.
- New notification channels.
- CI setup beyond adding a runnable local audit command.

## Acceptance Criteria

- `tasks/todo.md`, this spec, and an ADR for bundled AWS SDK clients exist.
- No provider adapter contains its own `res.status === 304` block.
- `runOnce` is a compact orchestration function under roughly 40 lines.
- DNS preflight is explicitly described as a best-effort check of common AWS endpoints.
- Root `package.json` includes a repeatable high-severity dependency audit command.
- Full verification passes:
  - `bun run test`
  - `bun run typecheck`
  - `bun run --filter '@barometer/engine' build`
  - `bun run --filter '@barometer/web' build`
  - `terraform -chdir=infra fmt -check -recursive`
  - `terraform -chdir=infra validate`
  - `bash -n scripts/lib/terraform.sh scripts/deploy.sh scripts/plan-apply.sh scripts/seed.sh`
  - `bun run audit`
  - `bun run dryrun`

## Test Stubs

- `StatuspageAdapter reuses previous snapshot on 304 and records ETag`.
- `conditional fetch degrades 304 without previous snapshot to unknown`.
- `runOnce passes previous ETag/current snapshot and persists refreshed ETag`.
- `runOnce current-only mode does not write synthetic history`.
- `terraform preflight resolves common AWS endpoints or fails with a clear message`.
