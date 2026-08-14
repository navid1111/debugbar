import { describe, expect, it } from "vitest";
import { createDebugId, DEBUG_ID_PATTERN } from "./id.js";

describe("createDebugId", () => {
  it("creates URL-safe cryptographically random IDs", () => {
    const ids = new Set(Array.from({ length: 100_000 }, createDebugId));
    expect(ids.size).toBe(100_000);
    for (const id of ids) expect(id).toMatch(DEBUG_ID_PATTERN);
  });
});
