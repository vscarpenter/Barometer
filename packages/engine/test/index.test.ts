import { describe, it, expect } from "vitest";
// Import via the bare package specifier — exercises the package.json "." export
// (./src/index.ts). Before the barrel existed this threw ERR_MODULE_NOT_FOUND.
import { runOnce, stepAlerts, buildSummary, MemoryStore, PROVIDERS } from "@barometer/engine";

describe("@barometer/engine package export", () => {
  it("resolves the barrel and exposes the public surface", () => {
    expect(typeof runOnce).toBe("function");
    expect(typeof stepAlerts).toBe("function");
    expect(typeof buildSummary).toBe("function");
    expect(typeof MemoryStore).toBe("function"); // class
    expect(Array.isArray(PROVIDERS)).toBe(true);
  });
});
