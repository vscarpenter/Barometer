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
        test: {
          name: "web",
          root: "./packages/web",
          environment: "jsdom",
          include: ["test/**/*.test.ts"],
        },
      },
    ],
  },
});
