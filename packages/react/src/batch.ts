import type { ClientMetric } from "@debugbar/core";
import type { ClientMetricsReporter } from "./metrics.js";

export interface MetricBatch {
  add(metric: ClientMetric, key: string): void;
  cleanup(): void;
}

export function createMetricBatch(
  reporter: ClientMetricsReporter,
  delayMs = 100,
): MetricBatch {
  let active = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const queued: ClientMetric[] = [];
  const seen = new Set<string>();
  const flush = () => {
    timer = undefined;
    if (!active || queued.length === 0) return;
    const metrics = queued.splice(0, queued.length);
    void reporter.reportMany(metrics).catch(() => undefined);
  };
  return {
    add(metric, key) {
      if (!active || seen.has(key)) return;
      seen.add(key);
      if (seen.size > 1_000) seen.delete(seen.values().next().value!);
      if (queued.length < 100) queued.push(metric);
      timer ??= setTimeout(flush, Math.max(0, delayMs));
    },
    cleanup() {
      active = false;
      queued.length = 0;
      if (timer !== undefined) clearTimeout(timer);
    },
  };
}
