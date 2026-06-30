# Web build-time constants (`__APP_VERSION__`, `__BUILD_TIME__`)

The dashboard is a static site served from CloudFront — there is no server to ask
"what version am I / when was I deployed?" at runtime. Vite's `define` solves this
with **compile-time text substitution**: each token is replaced by a literal in
the bundle when `vite build` runs. Zero runtime cost, no extra fetch.

## The two constants

| Constant | Source | Becomes in the bundle |
|---|---|---|
| `__APP_VERSION__` | the `version` field in `packages/web/package.json` | e.g. `"1.0.5"` |
| `__BUILD_TIME__` | `new Date()` evaluated when `vite build` runs | the build timestamp |

Both are configured via `define` in the web package's Vite config and declared as
ambient `const`s in the web package's `src/env.d.ts` so TypeScript knows their types.

## Where they show up

- The footer (`packages/web/src/render/footer.ts`) renders the version as `v{version}`.
- "Deploy date / deploy time" maps to `__BUILD_TIME__` — the moment `vite build`
  ran inside `scripts/deploy.sh`. This is **distinct** from the data's
  `generatedAt` (when the Lambda last wrote `summary.json`). Don't conflate them.

## Bumping the version

`packages/web/package.json` is the **single source of truth** for the displayed
version. To release a new version, edit only that file:

```jsonc
// packages/web/package.json
"version": "1.0.5",
```

Nothing else needs touching — the footer reads it through `__APP_VERSION__`. The
version does **not** come from `bun.lock`; if `bun` re-syncs the lockfile, that
churn is unrelated, so keep it out of the version-bump commit.

## Important: the value only changes on a real build

`__APP_VERSION__` / `__BUILD_TIME__` are stamped at `vite build`, which runs inside
`scripts/deploy.sh`. A `git push` updates the repo but does **not** rebuild or
redeploy — the live site keeps showing the old version/build time until a deploy
runs. After bumping the version, run the deploy to make it visible.
