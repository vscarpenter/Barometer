import { describe, it, expect } from "vitest";
import { incidentTitle, regionTag } from "../src/render/incident.js";

describe("incidentTitle", () => {
  it("links an http(s) url in a new tab", () => {
    const node = incidentTitle("Edge errors", "https://x/i1");
    expect(node.tagName.toLowerCase()).toBe("a");
    const link = node as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("https://x/i1");
    expect(link.target).toBe("_blank");
    expect(link.rel).toBe("noreferrer");
    expect(link.textContent).toBe("Edge errors");
  });
  it("renders unsafe urls as plain text (no clickable link)", () => {
    const node = incidentTitle("Edge errors", "javascript:alert(1)");
    expect(node.tagName.toLowerCase()).toBe("span");
    expect(node.textContent).toBe("Edge errors");
  });
});

describe("regionTag", () => {
  it("returns null when there are no regions", () => {
    expect(regionTag(undefined, true)).toBeNull();
    expect(regionTag([], true)).toBeNull();
  });
  it("lists the regions plainly when the incident is counted", () => {
    expect(regionTag(["us-east-1"], true)?.textContent).toBe("us-east-1");
  });
  it("annotates an uncounted (non-US) incident", () => {
    expect(regionTag(["asia-south2"], false)?.textContent?.toLowerCase()).toContain("not counted");
  });
});
