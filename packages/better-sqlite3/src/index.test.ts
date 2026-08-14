import Database from "better-sqlite3";
import { describe, expect, it, vi } from "vitest";
import { BetterSqlite3Adapter } from "./index.js";

describe("BetterSqlite3Adapter", () => {
  it("reports successful and failed statements and supports cleanup", () => {
    const database = new Database(":memory:");
    const adapter = new BetterSqlite3Adapter(database, "test");
    const listener = vi.fn();
    const uninstall = adapter.install(listener);
    adapter.exec(
      "create table users (id integer primary key, name text unique)",
    );
    adapter.run("insert into users (name) values (?)", ["Ada"]);
    expect(adapter.all<{ name: string }>("select name from users")).toEqual([
      { name: "Ada" },
    ]);
    expect(() =>
      adapter.run("insert into users (name) values (?)", ["Ada"]),
    ).toThrow();
    expect(listener).toHaveBeenCalledTimes(4);
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({ success: false, connection: "test" }),
    );
    uninstall();
    adapter.get("select 1");
    expect(listener).toHaveBeenCalledTimes(4);
    database.close();
  });

  it("deduplicates repeated installation of the same listener", () => {
    const database = new Database(":memory:");
    const adapter = new BetterSqlite3Adapter(database);
    const listener = vi.fn();
    adapter.install(listener);
    adapter.install(listener);
    adapter.get("select 1");
    expect(listener).toHaveBeenCalledOnce();
    database.close();
  });
});
