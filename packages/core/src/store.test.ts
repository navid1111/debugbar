import { describe, expect, it } from "vitest";
import { MemoryStore } from "./store.js";
import type { DebugRecord } from "./types.js";

function record(id: string, time: number): DebugRecord {
  return {
    schemaVersion: 1,
    id,
    startedAt: new Date(time).toISOString(),
    durationMs: 1,
    request: { method: "GET", url: `/${id}`, status: 200, aborted: false },
    collectors: {},
    warnings: [],
  };
}

describe("MemoryStore", () => {
  it("lists newest first, paginates, evicts, and clears", async () => {
    const now = 3_000;
    const store = new MemoryStore({
      maxRequests: 2,
      retentionMs: 10_000,
      now: () => now,
    });
    await store.put(record("a", 1_000));
    await store.put(record("b", 2_000));
    await store.put(record("c", 3_000));
    expect((await store.list()).map(({ id }) => id)).toEqual(["c", "b"]);
    expect(
      (await store.list({ before: "c", limit: 1 })).map(({ id }) => id),
    ).toEqual(["b"]);
    expect(await store.get("a")).toBeUndefined();
    await store.clear();
    expect(await store.list()).toEqual([]);
  });

  it("expires records with a fake clock", async () => {
    let now = 1_000;
    const store = new MemoryStore({ retentionMs: 100, now: () => now });
    await store.put(record("a", now));
    now = 1_101;
    expect(await store.get("a")).toBeUndefined();
  });

  it("isolates stored and returned values from mutation", async () => {
    const store = new MemoryStore();
    const input = record("a", Date.now());
    await store.put(input);
    input.request.url = "/changed";
    const first = await store.get("a");
    first!.request.url = "/also-changed";
    expect((await store.get("a"))!.request.url).toBe("/a");
  });
});
