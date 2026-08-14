// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import type { DebugbarApi } from "./api.js";
import { createClientMetricsReporter } from "./metrics.js";

function api(): DebugbarApi {
  return {
    list: async () => [],
    get: async () => {
      throw new Error("unused");
    },
    report: vi.fn(async () => undefined),
  };
}

describe("createClientMetricsReporter", () => {
  it("reports only when explicitly called", async () => {
    const client = api();
    const reporter = createClientMetricsReporter("record", { api: client });
    expect(client.report).not.toHaveBeenCalled();
    await reporter.report({
      category: "network-error",
      name: "fetch-failure",
      value: 1,
      unit: "count",
    });
    expect(client.report).toHaveBeenCalledWith("record", {
      schemaVersion: 1,
      metrics: [expect.objectContaining({ name: "fetch-failure" })],
    });
  });

  it("reports navigation timings when explicitly requested", async () => {
    const client = api();
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([
      { startTime: 0, domContentLoadedEventEnd: 12, loadEventEnd: 20 },
    ] as unknown as PerformanceEntry[]);
    await createClientMetricsReporter("record", {
      api: client,
    }).reportNavigation();
    expect(client.report).toHaveBeenCalledWith(
      "record",
      expect.objectContaining({
        metrics: expect.arrayContaining([
          expect.objectContaining({ name: "load-complete", value: 20 }),
        ]),
      }),
    );
  });
});
