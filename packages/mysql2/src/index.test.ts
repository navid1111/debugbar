import { describe, expect, it, vi } from "vitest";
import type { Pool } from "mysql2";
import { Mysql2Adapter, type MysqlQueryable } from "./index.js";

type QueryFunction = (...arguments_: unknown[]) => unknown;

describe("Mysql2Adapter", () => {
  it("accepts the public mysql2 Pool query surface", () => {
    const pool = undefined as unknown as Pool;
    expect(() => new Mysql2Adapter(pool)).toThrow(TypeError);
  });
  it("captures promise and callback queries without result rows", async () => {
    const rows = [{ secret: "not captured" }];
    const promiseClient: MysqlQueryable = {
      query: vi.fn((sql) =>
        String(sql).includes("fail")
          ? Promise.reject(new Error("mysql failed"))
          : Promise.resolve([rows, []]),
      ),
    };
    const promiseListener = vi.fn();
    new Mysql2Adapter(promiseClient, "replica").install(promiseListener);
    await expect(
      promiseClient.query("select * from users where id = ?", [1]),
    ).resolves.toEqual([rows, []]);
    await expect(promiseClient.query("fail query")).rejects.toThrow(
      "mysql failed",
    );
    expect(promiseListener).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(promiseListener.mock.calls)).not.toContain(
      "not captured",
    );

    const callbackClient: MysqlQueryable = {
      query: (_sql, callback) => {
        (callback as QueryFunction)(null, rows);
        return { stream: true };
      },
    };
    const callbackListener = vi.fn();
    const adapter = new Mysql2Adapter(callbackClient);
    const original = callbackClient.query;
    const remove = adapter.install(callbackListener);
    const callback = vi.fn();
    expect(callbackClient.query("select 1", callback)).toEqual({
      stream: true,
    });
    expect(callback).toHaveBeenCalledOnce();
    expect(callbackListener).toHaveBeenCalledOnce();
    remove();
    expect(callbackClient.query).toBe(original);
  });

  it("deduplicates the same listener", () => {
    const client: MysqlQueryable = { query: () => Promise.resolve([]) };
    const adapter = new Mysql2Adapter(client);
    const listener = vi.fn();
    adapter.install(listener);
    adapter.install(listener);
    void client.query("select 1");
    return Promise.resolve().then(() =>
      expect(listener).toHaveBeenCalledOnce(),
    );
  });
});
