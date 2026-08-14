// @vitest-environment jsdom

import { act, render } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ClientMetricsReporter } from "./metrics.js";
import { createReactProfilerAdapter, DebugbarProfiler } from "./profiler.js";

function reporter(): ClientMetricsReporter {
  return {
    report: vi.fn(),
    reportMany: vi.fn(async () => undefined),
    reportNavigation: vi.fn(),
  };
}

describe("React profiler adapter", () => {
  it("is opt-in and batches duplicate Strict Mode observations", async () => {
    vi.useFakeTimers();
    const target = reporter();
    const disabled = createReactProfilerAdapter(target);
    disabled.onRender("App", "mount", 4, 5, 1, 10);
    const adapter = createReactProfilerAdapter(target, {
      enabled: true,
      batchMs: 10,
    });
    adapter.onRender("App", "mount", 4, 5, 1, 10);
    adapter.onRender("App", "mount", 4, 5, 1, 10);
    await vi.advanceTimersByTimeAsync(10);
    expect(target.reportMany).toHaveBeenCalledOnce();
    expect(target.reportMany).toHaveBeenCalledWith([
      expect.objectContaining({
        category: "react-profiler",
        name: "App",
        value: 4,
      }),
    ]);
    adapter.cleanup();
    adapter.onRender("App", "update", 2, 3, 11, 14);
    await vi.runAllTimersAsync();
    expect(target.reportMany).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("renders transparently when disabled and supports Strict Mode", () => {
    const target = reporter();
    const { getByText } = render(
      <StrictMode>
        <DebugbarProfiler id="App" reporter={target}>
          <span>content</span>
        </DebugbarProfiler>
      </StrictMode>,
    );
    act(() => expect(getByText("content")).toBeInTheDocument());
    expect(target.reportMany).not.toHaveBeenCalled();
  });
});
