// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import type { Metric } from "web-vitals";
import type { ClientMetricsReporter } from "./metrics.js";
import { installWebVitals } from "./web-vitals.js";

function reporter(): ClientMetricsReporter {
  return {
    report: vi.fn(),
    reportMany: vi.fn(async () => undefined),
    reportNavigation: vi.fn(),
  };
}

describe("installWebVitals", () => {
  it("collects only when enabled, batches duplicates, and stops after cleanup", async () => {
    vi.useFakeTimers();
    const callbacks: Array<(metric: Metric) => void> = [];
    const load = vi.fn(async () => ({
      onCLS: (callback: (metric: Metric) => void) => callbacks.push(callback),
      onFCP: (callback: (metric: Metric) => void) => callbacks.push(callback),
      onINP: (callback: (metric: Metric) => void) => callbacks.push(callback),
      onLCP: (callback: (metric: Metric) => void) => callbacks.push(callback),
      onTTFB: (callback: (metric: Metric) => void) => callbacks.push(callback),
    }));
    const target = reporter();
    installWebVitals(target, { load });
    expect(load).not.toHaveBeenCalled();
    const cleanup = installWebVitals(target, {
      enabled: true,
      batchMs: 10,
      load,
    });
    const secondCleanup = installWebVitals(target, {
      enabled: true,
      batchMs: 10,
      load,
    });
    await Promise.resolve();
    expect(load).toHaveBeenCalledOnce();
    const metric = {
      name: "LCP",
      id: "one",
      value: 120,
      rating: "good",
      navigationType: "navigate",
    } as Metric;
    callbacks[0]?.(metric);
    callbacks[0]?.(metric);
    await vi.advanceTimersByTimeAsync(10);
    expect(target.reportMany).toHaveBeenCalledOnce();
    cleanup();
    callbacks[0]?.({ ...metric, id: "two" });
    await vi.advanceTimersByTimeAsync(10);
    expect(target.reportMany).toHaveBeenCalledTimes(2);
    secondCleanup();
    callbacks[0]?.({ ...metric, id: "three" });
    await vi.runAllTimersAsync();
    expect(target.reportMany).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
