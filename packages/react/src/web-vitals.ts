import type { Metric } from "web-vitals";
import { createMetricBatch } from "./batch.js";
import type { ClientMetricsReporter } from "./metrics.js";

interface WebVitalsModule {
  onCLS(callback: (metric: Metric) => void): void;
  onFCP(callback: (metric: Metric) => void): void;
  onINP(callback: (metric: Metric) => void): void;
  onLCP(callback: (metric: Metric) => void): void;
  onTTFB(callback: (metric: Metric) => void): void;
}

interface WebVitalsState {
  active: boolean;
  references: number;
  batch: ReturnType<typeof createMetricBatch>;
}

const installations = new WeakMap<ClientMetricsReporter, WebVitalsState>();

export function installWebVitals(
  reporter: ClientMetricsReporter,
  options: {
    enabled?: boolean;
    batchMs?: number;
    load?: () => Promise<WebVitalsModule>;
  } = {},
): () => void {
  if (!options.enabled) return () => undefined;
  const installed = installations.get(reporter);
  if (installed) {
    installed.references += 1;
    return cleanupFor(reporter, installed);
  }
  const state: WebVitalsState = {
    active: true,
    references: 1,
    batch: createMetricBatch(reporter, options.batchMs),
  };
  installations.set(reporter, state);
  const load = options.load ?? (() => import("web-vitals"));
  void load()
    .then((module) => {
      const observe = (metric: Metric) => {
        if (!state.active) return;
        state.batch.add(
          {
            category: "web-vital",
            name: metric.name.toLowerCase(),
            value: metric.value,
            unit: metric.name === "CLS" ? "score" : "ms",
            detail: {
              rating: metric.rating,
              navigationType: metric.navigationType,
            },
          },
          `${metric.name}:${metric.id}:${metric.value}`,
        );
      };
      module.onCLS(observe);
      module.onFCP(observe);
      module.onINP(observe);
      module.onLCP(observe);
      module.onTTFB(observe);
    })
    .catch(() => undefined);
  return cleanupFor(reporter, state);
}

function cleanupFor(
  reporter: ClientMetricsReporter,
  state: WebVitalsState,
): () => void {
  let cleaned = false;
  return () => {
    if (cleaned) return;
    cleaned = true;
    state.references -= 1;
    if (state.references > 0) return;
    state.active = false;
    state.batch.cleanup();
    installations.delete(reporter);
  };
}
