import { defineWorkspace } from "vitest/config";

// types/engine use the default node environment; web needs jsdom for DOM-render tests.
export default defineWorkspace([
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
]);
