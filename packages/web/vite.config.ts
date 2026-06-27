import { defineConfig } from "vite";
import pkg from "./package.json" with { type: "json" };

// base "/" — the browser sees the app at the site root. The /app S3 prefix is
// transparent: CloudFront's default behavior uses origin_path=/app, while
// /status/* and /history/* are served from their own prefixes (SPEC §3, §10).
export default defineConfig({
  // Build-time constants baked into the bundle so the footer can show what's
  // running without a runtime fetch. __APP_VERSION__ tracks package.json (single
  // source of truth); __BUILD_TIME__ is stamped when `vite build` runs during
  // deploy. Declared for TypeScript in src/env.d.ts.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: { outDir: "dist", target: "es2022" },
});
