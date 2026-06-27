# Compliance Fix Plan

Date: 2026-06-26

Goal: bring the current Barometer changes into compliance with `coding-standards.md` before committing or deploying.

## Scope

Fix the compliance gaps from the review:

- Missing process artifacts for a non-trivial change.
- Repeated ETag / 304 adapter logic.
- `runOnce` carrying too many responsibilities.
- DNS preflight being useful but too implicit about region/endpoint scope.
- Dependency/audit compliance after bundling AWS SDK clients.

Out of scope:

- Changing the product behavior beyond the reviewed fixes.
- Deploying or applying Terraform.
- Reworking unrelated frontend or infra modules.

## Plan

### 1. Add Decision Documentation

- [x] Create `tasks/spec.md` for the current fix batch.
- [x] Include goal, inputs/outputs, constraints, edge cases, anti-goals, acceptance criteria, and test stubs.
- [x] Create an ADR for the Lambda artifact decision: bundle AWS SDK clients instead of relying on the runtime SDK.
- [x] Document alternatives considered: externalized runtime SDK, vendored SDK bundle, smoke-test-only runtime dependency.

Acceptance criteria:

- `tasks/spec.md` exists and matches the already requested scope.
- `docs/adr/0001-bundle-lambda-aws-sdk.md` exists with context, decision, consequences, and alternatives.

### 2. Refactor Adapter Conditional Fetch

- [x] Extract shared conditional-fetch helper in `packages/engine/src/adapters/types.ts` or a new `packages/engine/src/adapters/conditional.ts`.
- [x] Helper should:
  - call `deps.fetch(url, { etag })`,
  - record the returned ETag for 200 and 304,
  - return a reused previous snapshot for 304 when available,
  - return a clear result for adapters to parse 200 bodies,
  - let non-200 responses degrade to `unknown` as today.
- [x] Replace duplicated 304 blocks in Statuspage, AWS, Azure, and GCP adapters.
- [x] Keep provider-specific parsing and status mapping inside each adapter.

Acceptance criteria:

- No duplicated `res.status === 304` block across provider adapters.
- Existing adapter behavior is unchanged for 200, non-200, malformed body, and thrown fetch.
- `StatuspageAdapter` 304 reuse test still passes.

Test targets:

- `bunx vitest run packages/engine/test/statuspage.test.ts`
- Consider adding one helper-level test for 304 without previous snapshot.

### 3. Split `runOnce` Responsibilities

- [x] Extract `loadRunInputs(store, nowIso)` from `runOnce`.
- [x] Extract `updateHistoryForMode(...)` or equivalent for persist/current-only behavior.
- [x] Extract `mergeEtagsIntoState(state, etags)`.
- [x] Keep `runOnce` as orchestration only: load, poll, write current, update history, write summary, alert, write state.

Acceptance criteria:

- `runOnce` is under the coding-standard target of roughly 40 lines.
- Helper names describe domain behavior, not implementation trivia.
- Current-only dry-run behavior remains unchanged.
- ETag state persistence remains unchanged.

Test targets:

- `bunx vitest run packages/engine/test/run.test.ts`
- `bun run typecheck`

### 4. Clarify AWS DNS Preflight

- [x] Decide whether DNS preflight is best-effort or exact.
- [x] If best-effort, rename/comment it as such and make the endpoint list explicit constants.
- [x] Record that exact Terraform-region derivation is not implemented; preflight is best-effort.
- [x] Keep early failure before build/apply in `deploy.sh`, `plan-apply.sh`, and `seed.sh`.
- [x] Preserve the direct user remediation message for DNS/VPN resolver failures.

Recommended implementation:

- Keep it best-effort for now.
- Rename internal variables/constants to make that clear.
- Add named constants for global/us-east-1 endpoints and the region endpoint.
- Avoid pretending this validates every AWS endpoint Terraform may touch.

Acceptance criteria:

- The preflight message says it checks common AWS endpoints, not every Terraform dependency.
- `bash -n scripts/lib/terraform.sh scripts/deploy.sh scripts/plan-apply.sh scripts/seed.sh` passes.
- Native arm64 Terraform preflight still rejects `/usr/local/bin/terraform` on Apple Silicon when that is first on PATH.

### 5. Dependency and Audit Compliance

- [x] Review production dependency ranges in package files.
- [x] Decide whether to pin exact versions in `package.json` or document that `bun.lock` is the pinned source of truth.
- [x] Add an audit script to root `package.json`.
- [x] Run the selected audit command and record the result.
- [x] If Bun audit support is unavailable or not suitable, document the chosen substitute.

Decision: external package dependencies are pinned exactly in `package.json`; internal workspace links remain local workspace references. `bun run audit` uses `bun audit --audit-level high`.

Result: the first audit failed on vulnerable Vite 5.x. The web package was pinned to Vite `8.1.0`, the lockfile was refreshed, and `bun run audit` then passed.

Acceptance criteria:

- There is a repeatable dependency audit command in `package.json`.
- Bundled AWS SDK dependency choice is covered by the ADR.
- No new dependency is added for these fixes.

Suggested verification:

- `bun run audit` or documented equivalent.
- `bun install --frozen-lockfile`

### 6. Final Verification

- [x] `bun run test`
- [x] `bun run typecheck`
- [x] `bun run --filter '@barometer/engine' build`
- [x] `bun run --filter '@barometer/web' build`
- [x] `terraform -chdir=infra fmt -check -recursive`
- [x] `terraform -chdir=infra validate`
- [x] `bash -n scripts/lib/terraform.sh scripts/deploy.sh scripts/plan-apply.sh scripts/seed.sh`
- [x] `bun run audit`
- [x] `bun run dryrun`
- [x] `source scripts/lib/terraform.sh && require_native_terraform && require_aws_dns`
- [x] `PATH=/usr/local/bin:/opt/homebrew/bin:$PATH ... require_native_terraform` rejects x86_64 Terraform

## Review Notes

- Do not deploy from this plan.
- Do not stage unrelated untracked files unless explicitly requested.
- Keep the PR scoped to compliance fixes for the current review findings.
