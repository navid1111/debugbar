import { describe, expect, it } from "vitest";
import {
  addMessage,
  createContext,
  currentDebugContext,
  measure,
  runWithDebugContext,
  startMeasure,
} from "./context.js";

describe("debug context", () => {
  it("propagates through asynchronous work", async () => {
    const context = createContext("request");
    await runWithDebugContext(context, async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 1));
      expect(currentDebugContext()?.id).toBe("request");
    });
    expect(currentDebugContext()).toBeUndefined();
  });

  it("isolates 100 interleaved requests", async () => {
    const contexts = Array.from({ length: 100 }, (_, index) =>
      createContext(String(index)),
    );
    await Promise.all(
      contexts.map((context, index) =>
        runWithDebugContext(context, async () => {
          await new Promise((resolve) => setTimeout(resolve, index % 4));
          addMessage("info", `message-${index}`);
        }),
      ),
    );
    contexts.forEach((context, index) =>
      expect(context.messages.map(({ message }) => message)).toEqual([
        `message-${index}`,
      ]),
    );
  });

  it("makes helpers safe outside context", () => {
    addMessage("info", "ignored");
    startMeasure("ignored")();
    expect(measure("outside", () => 42)).toBe(42);
  });
});

describe("measures", () => {
  it("records manual stop only once using a fake clock", () => {
    let time = 10;
    const context = createContext("a", () => time);
    runWithDebugContext(context, () => {
      const stop = startMeasure("work", () => time);
      time = 20;
      stop();
      time = 30;
      stop();
    });
    expect(context.measures).toEqual([
      { name: "work", startedAtMs: 10, durationMs: 10 },
    ]);
  });

  it("preserves sync and async results and records failures", async () => {
    let time = 0;
    const context = createContext("a", () => time);
    await runWithDebugContext(context, async () => {
      expect(
        measure(
          "sync",
          () => {
            time = 2;
            return 7;
          },
          () => time,
        ),
      ).toBe(7);
      await expect(
        measure(
          "async",
          async () => {
            time = 5;
            return 8;
          },
          () => time,
        ),
      ).resolves.toBe(8);
      const error = new Error("original");
      await expect(
        measure(
          "failed",
          async () => {
            time = 9;
            throw error;
          },
          () => time,
        ),
      ).rejects.toBe(error);
    });
    expect(
      context.measures.map(({ name, failed }) => [name, failed ?? false]),
    ).toEqual([
      ["sync", false],
      ["async", false],
      ["failed", true],
    ]);
  });
});
