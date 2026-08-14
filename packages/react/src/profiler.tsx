import { Profiler, useEffect, useMemo } from "react";
import type { ProfilerOnRenderCallback, ReactNode } from "react";
import { createMetricBatch } from "./batch.js";
import type { ClientMetricsReporter } from "./metrics.js";

export interface ReactProfilerAdapter {
  onRender: ProfilerOnRenderCallback;
  cleanup(): void;
}

export function createReactProfilerAdapter(
  reporter: ClientMetricsReporter,
  options: { enabled?: boolean; batchMs?: number } = {},
): ReactProfilerAdapter {
  if (!options.enabled) return { onRender: () => undefined, cleanup() {} };
  const batch = createMetricBatch(reporter, options.batchMs);
  const onRender: ProfilerOnRenderCallback = (
    id,
    phase,
    actualDuration,
    baseDuration,
    startTime,
    commitTime,
  ) => {
    batch.add(
      {
        category: "react-profiler",
        name: id.slice(0, 64) || "component",
        value: Math.max(0, actualDuration),
        unit: "ms",
        timestamp: commitTime,
        detail: { phase, baseDuration, startTime },
      },
      `${id}:${phase}:${actualDuration}:${startTime}:${commitTime}`,
    );
  };
  return { onRender, cleanup: batch.cleanup };
}

export function DebugbarProfiler({
  id,
  reporter,
  enabled = false,
  children,
}: {
  id: string;
  reporter: ClientMetricsReporter;
  enabled?: boolean;
  children: ReactNode;
}) {
  const adapter = useMemo(
    () => createReactProfilerAdapter(reporter, { enabled }),
    [enabled, reporter],
  );
  useEffect(() => () => adapter.cleanup(), [adapter]);
  if (!enabled) return children;
  return (
    <Profiler id={id} onRender={adapter.onRender}>
      {children}
    </Profiler>
  );
}
