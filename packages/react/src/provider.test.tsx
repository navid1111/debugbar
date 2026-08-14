// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { DebugRecord } from "@debugbar/core";
import type { DebugbarApi } from "./api.js";
import { DebugRecordMissingError } from "./api.js";
import { DebugbarProvider, useDebugbar } from "./provider.js";

function record(id: string): DebugRecord {
  return {
    schemaVersion: 1,
    id,
    startedAt: new Date(0).toISOString(),
    durationMs: 2,
    request: { method: "GET", url: `/${id}`, status: 200, aborted: false },
    collectors: {},
    warnings: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function Harness() {
  const debugbar = useDebugbar();
  return (
    <>
      <button onClick={() => void debugbar.select("a")}>A</button>
      <button onClick={() => void debugbar.select("b")}>B</button>
      <button onClick={() => void debugbar.select("missing")}>Missing</button>
      <button onClick={() => void debugbar.select("error")}>Error</button>
      <output>
        {debugbar.selected.status}:
        {debugbar.selected.status === "ready"
          ? debugbar.selected.record.id
          : "id" in debugbar.selected
            ? debugbar.selected.id
            : ""}
      </output>
    </>
  );
}

describe("DebugbarProvider", () => {
  it("does not duplicate its initial request in React Strict Mode", async () => {
    const api: DebugbarApi = {
      list: vi.fn(async () => []),
      get: async () => record("a"),
    };
    render(
      <StrictMode>
        <DebugbarProvider api={api} autoDiscover={false}>
          <Harness />
        </DebugbarProvider>
      </StrictMode>,
    );
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(1));
  });

  it("prevents reordered responses from replacing the latest selection", async () => {
    const a = deferred<DebugRecord>();
    const b = deferred<DebugRecord>();
    const api: DebugbarApi = {
      list: async () => [],
      get: (id) => (id === "a" ? a.promise : b.promise),
    };
    render(
      <DebugbarProvider api={api} autoDiscover={false}>
        <Harness />
      </DebugbarProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByText("A"));
    await user.click(screen.getByText("B"));
    expect(screen.getByRole("status")).toHaveTextContent("loading:b");
    b.resolve(record("b"));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("ready:b"),
    );
    a.resolve(record("a"));
    await Promise.resolve();
    expect(screen.getByRole("status")).toHaveTextContent("ready:b");
  });

  it("represents missing and general error states", async () => {
    const api: DebugbarApi = {
      list: async () => [],
      get: async (id) => {
        if (id === "missing") throw new DebugRecordMissingError(id);
        throw new Error("unavailable");
      },
    };
    render(
      <DebugbarProvider api={api} autoDiscover={false}>
        <Harness />
      </DebugbarProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByText("Missing"));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("missing:missing"),
    );
    await user.click(screen.getByText("Error"));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("error:error"),
    );
  });

  it("keeps debug records out of persistent browser storage", async () => {
    const local = vi.spyOn(Storage.prototype, "setItem");
    const api: DebugbarApi = {
      list: async () => [],
      get: async () => record("a"),
    };
    render(
      <DebugbarProvider api={api} autoDiscover={false}>
        <Harness />
      </DebugbarProvider>,
    );
    await userEvent.click(screen.getByText("A"));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("ready:a"),
    );
    expect(local).not.toHaveBeenCalled();
    local.mockRestore();
  });
});
