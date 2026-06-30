import { fileURLToPath } from "node:url";
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
  build: {
    outDir: "dist",
    target: "es2022",
    // Multi-page: the dashboard (index.html), the marketing landing page, and
    // the standalone About page. The dashboard owns "/"; the landing is an
    // additive entry whose CTA funnels into it.
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        landing: fileURLToPath(new URL("./landing.html", import.meta.url)),
        about: fileURLToPath(new URL("./about.html", import.meta.url)),
      },
    },
  },
});
