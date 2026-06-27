import { build } from "esbuild";

// Bundle the Lambda handler and its runtime dependencies. AWS Lambda's Node
// runtime includes an AWS SDK, but bundling the @aws-sdk/* clients keeps the
// deployed artifact on the same versions package.json tests and builds against.
// ESM output (.mjs) — Lambda handler = "handler.handler".
// Target is node22 (the local dev/CI floor); a node22 bundle runs unchanged on
// the node24 runtime, so we compile for the oldest Node we support.
await build({
  entryPoints: ["src/handler.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outfile: "dist/handler.mjs",
  banner: {
    js: "import { createRequire as __createRequire } from 'module'; const require = __createRequire(import.meta.url);",
  },
  logLevel: "info",
});
