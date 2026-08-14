import { describe, expect, it } from "vitest";
import { createContext, runWithDebugContext } from "./context.js";
import { DATABASE_STATE, installDatabaseAdapter } from "./database.js";
import type { DatabaseAdapter, DatabaseQueryEvent } from "./types.js";

class FakeAdapter implements DatabaseAdapter {
  listener: ((event: DatabaseQueryEvent) => void) | undefined;
  install(listener: (event: DatabaseQueryEvent) => void) {
    this.listener = listener;
    return () => {
      this.listener = undefined;
    };
  }
}

describe("installDatabaseAdapter", () => {
  it("captures bounded sanitized events only inside the active request", () => {
    const adapter = new FakeAdapter();
    const uninstall = installDatabaseAdapter(adapter, { maxEvents: 1 });
    adapter.listener?.({
      operation: "select",
      statement: "outside",
      durationMs: 1,
      success: true,
    });
    const context = createContext("request");
    runWithDebugContext(context, () => {
      adapter.listener?.({
        operation: "select",
        statement: "select * from users where token = ?",
        parameters: { token: "secret" },
        durationMs: -1,
        success: true,
      });
      adapter.listener?.({
        operation: "select",
        statement: "ignored",
        durationMs: 2,
        success: true,
      });
    });
    expect(context.collectorState.get(DATABASE_STATE)).toEqual([
      expect.objectContaining({
        statement: "select * from users where token = ?",
        parameters: { token: "[REDACTED]" },
        durationMs: 0,
      }),
    ]);
    uninstall();
    expect(adapter.listener).toBeUndefined();
  });
});
