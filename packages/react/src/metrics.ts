import type { ClientMetric, ClientMetricsPayload } from "@debugbar/core";
import { createDebugbarApi } from "./api.js";
import type { DebugbarApi } from "./api.js";

export interface ClientMetricsReporter {
  report(metric: ClientMetric): Promise<void>;
  reportMany(metrics: ClientMetric[]): Promise<void>;
  reportNavigation(): Promise<void>;
}

export function createClientMetricsReporter(
  recordId: string,
  options: { endpoint?: string; api?: DebugbarApi } = {},
): ClientMetricsReporter {
  const api = options.api ?? createDebugbarApi(options.endpoint);
  const send = (metrics: ClientMetric[]) => {
    const payload: ClientMetricsPayload = { schemaVersion: 1, metrics };
    if (!api.report)
      return Promise.reject(
        new Error("The debugbar API cannot report metrics"),
      );
    return api.report(recordId, payload);
  };
  return {
    report: (metric) => send([metric]),
    reportMany: send,
    async reportNavigation() {
      if (typeof performance === "undefined") return;
      const entry = performance.getEntriesByType("navigation")[0] as
        | PerformanceNavigationTiming
        | undefined;
      if (!entry) return;
      await send([
        {
          category: "navigation",
          name: "dom-content-loaded",
          value: Math.max(0, entry.domContentLoadedEventEnd - entry.startTime),
          unit: "ms",
        },
        {
          category: "navigation",
          name: "load-complete",
          value: Math.max(0, entry.loadEventEnd - entry.startTime),
          unit: "ms",
        },
      ]);
    },
  };
}
