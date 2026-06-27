import { defineConfig } from "vitest/config";

// Vitest 4 removed the standalone `vitest.workspace.ts`; the per-package project
// list now lives under `test.projects`. The entries are unchanged from the old
// workspace: types/engine use the default node environment; web needs jsdom for
// its DOM-render tests.
export default defineConfig({
  test: {
    projects: [
      "packages/types",
      "packages/engine",
      {
        // Mirror vite.config.ts's build-time constants so main.ts (which reads
        // them in the footer) is importable under test, not just under `vite build`.
        define: {
          __APP_VERSION__: JSON.stringify("0.0.0-test"),
          __BUILD_TIME__: JSON.stringify("1970-01-01T00:00:00.000Z"),
        },
        test: {
          name: "web",
          root: "./packages/web",
          environment: "jsdom",
          include: ["test/**/*.test.ts"],
          setupFiles: ["./test/setup.ts"],
        },
      },
    ],
  },
});
