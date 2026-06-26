import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { MemoryStore } from "../src/store/memory.js";
import { ConsoleNotifier } from "../src/alerting/notifier.js";
import type { Notification } from "../src/alerting/machine.js";

const Schema = z.object({ n: z.number() });

describe("MemoryStore", () => {
  it("round-trips a written value through its schema", async () => {
    const store = new MemoryStore();
    await store.writeJson("status/x.json", { n: 7 }, "max-age=60");
    expect(await store.readJson("status/x.json", Schema, { n: 0 })).toEqual({ n: 7 });
  });

  it("returns the fallback for a missing key (first run)", async () => {
    const store = new MemoryStore();
    expect(await store.readJson("missing.json", Schema, { n: -1 })).toEqual({ n: -1 });
  });

  it("returns the fallback when stored data fails the schema", async () => {
    const store = new MemoryStore();
    await store.writeJson("bad.json", { n: "not a number" }, "max-age=60");
    expect(await store.readJson("bad.json", Schema, { n: 0 })).toEqual({ n: 0 });
  });
});

describe("ConsoleNotifier", () => {
  it("collects notifications and logs them", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const notifier = new ConsoleNotifier();
    const note: Notification = {
      kind: "outage",
      providerId: "a",
      displayName: "A",
      status: "major_outage",
    };
    await notifier.send(note);
    expect(notifier.sent).toEqual([note]);
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});
