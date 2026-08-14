import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { PgAdapter, type PgQueryable } from "./index.js";

describe("PgAdapter", () => {
  it("accepts the public pg Pool query surface", () => {
    const pool = undefined as unknown as Pool;
    expect(() => new PgAdapter(pool)).toThrow(TypeError);
  });
  it("captures promise success and failure without rows", async () => {
    const rows = [{ password: "not captured" }];
    const client: PgQueryable = {
      query: vi.fn((sql) =>
        String(sql).includes("fail")
          ? Promise.reject(new Error("pg failed"))
          : Promise.resolve({ rows }),
      ),
    };
    const adapter = new PgAdapter(client, "primary");
    const listener = vi.fn();
    adapter.install(listener);
    await expect(
      client.query("select * from users where id = $1", [1]),
    ).resolves.toEqual({ rows });
    await expect(client.query("fail query")).rejects.toThrow("pg failed");
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        operation: "select",
        parameters: [1],
        success: true,
      }),
    );
    expect(JSON.stringify(listener.mock.calls)).not.toContain("not captured");
  });

  it("supports callbacks, deduplicates listeners, and restores query", async () => {
    const original = vi.fn((_sql: unknown, callback: unknown) => {
      (callback as QueryFunction)(null, { rows: [] });
      return { active: true };
    });
    type QueryFunction = (...arguments_: unknown[]) => unknown;
    const client: PgQueryable = { query: original };
    const adapter = new PgAdapter(client);
    const listener = vi.fn();
    const remove = adapter.install(listener);
    adapter.install(listener);
    const callback = vi.fn();
    expect(client.query("select 1", callback)).toEqual({ active: true });
    expect(callback).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledOnce();
    remove();
    expect(client.query).toBe(original);
  });
});
