import { describe, expect, it } from "vitest";
import { REDACTED, sanitize } from "./sanitize.js";

describe("sanitize", () => {
  it("masks nested keys case-insensitively", () => {
    expect(
      sanitize({ Password: "one", nested: { TOKEN: "two", safe: true } }),
    ).toEqual({
      Password: REDACTED,
      nested: { TOKEN: REDACTED, safe: true },
    });
  });

  it("supports special and circular values", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const result = sanitize({
      cyclic,
      map: new Map([["a", 1]]),
      set: new Set([2]),
      date: new Date("2025-01-01T00:00:00Z"),
      bigint: 2n,
      error: new Error("bad"),
      binary: Buffer.from("secret"),
      missing: undefined,
      fn: function named() {},
      symbol: Symbol("x"),
      nan: Number.NaN,
    });
    expect(result).toMatchObject({
      cyclic: { self: "[Circular]" },
      date: "2025-01-01T00:00:00.000Z",
      bigint: "2n",
      binary: "[Binary 6 bytes]",
    });
  });

  it("enforces depth, array, string, and byte limits", () => {
    expect(sanitize({ a: { b: 1 } }, { limits: { maxDepth: 1 } })).toEqual({
      a: "[Max depth]",
    });
    expect(sanitize([1, 2, 3], { limits: { maxArrayLength: 2 } })).toEqual([
      1, 2,
    ]);
    expect(sanitize("abcdef", { limits: { maxStringLength: 3 } })).toBe(
      "abc…[truncated]",
    );
    expect(
      sanitize({ long: "abcdef" }, { limits: { maxCollectorBytes: 5 } }),
    ).toMatchObject({ truncated: true });
    expect(
      sanitize(
        { long: "abcdef" },
        { scope: "record", limits: { maxRecordBytes: 5 } },
      ),
    ).toMatchObject({ truncated: true, reason: "Record byte limit exceeded" });
  });

  it("handles varied cyclic and oversized structures", () => {
    for (let index = 0; index < 100; index++) {
      const value: Record<string, unknown> = {
        token: `secret-${index}`,
        values: Array.from({ length: index + 1 }, (_, item) =>
          `${item}`.repeat(index + 1),
        ),
      };
      value.cycle = value;
      expect(() =>
        sanitize(value, {
          limits: { maxArrayLength: 10, maxStringLength: 20 },
        }),
      ).not.toThrow();
      expect(sanitize(value)).toMatchObject({
        token: REDACTED,
        cycle: "[Circular]",
      });
    }
  });
});
