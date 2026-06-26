import { defineConfig } from "vite";

// base "/" — the browser sees the app at the site root. The /app S3 prefix is
// transparent: CloudFront's default behavior uses origin_path=/app, while
// /status/* and /history/* are served from their own prefixes (SPEC §3, §10).
export default defineConfig({
  build: { outDir: "dist", target: "es2022" },
});
