import { build } from "esbuild";

// Bundle the Lambda handler. @aws-sdk/* is provided by the Node 20 runtime, so
// it stays external to keep the artifact small; zod and @barometer/types are
// bundled in. ESM output (.mjs) — Lambda handler = "handler.handler".
await build({
  entryPoints: ["src/handler.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "dist/handler.mjs",
  external: ["@aws-sdk/*"],
  banner: {
    js: "import { createRequire as __createRequire } from 'module'; const require = __createRequire(import.meta.url);",
  },
  logLevel: "info",
});
