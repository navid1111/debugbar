// @vitest-environment jsdom

import axios from "axios";
import { describe, expect, it, vi } from "vitest";
import { installAxiosDiscovery, installFetchDiscovery } from "./network.js";

describe("Fetch discovery", () => {
  it("preserves arguments, response identity, and body usability", async () => {
    const response = new Response("streamed body", {
      headers: { "X-Debugbar-ID": "one" },
    });
    const original = vi.fn(async () => response);
    const target = { fetch: original as typeof fetch };
    const observed: string[] = [];
    const cleanup = installFetchDiscovery((id) => observed.push(id), {
      target,
    });
    const request = new Request("https://app.test/api", {
      method: "POST",
      body: "payload",
    });
    const result = await target.fetch(request);
    expect(result).toBe(response);
    expect(await result.text()).toBe("streamed body");
    expect(original).toHaveBeenCalledWith(request);
    expect(observed).toEqual(["one"]);
    cleanup();
    expect(target.fetch).toBe(original);
    await expect(target.fetch("https://app.test/after")).resolves.toBe(
      response,
    );
  });

  it("is idempotent, reference-counted, and ignores debug API calls", async () => {
    const original = vi.fn(
      async () => new Response(null, { headers: { "X-Debugbar-ID": "same" } }),
    );
    const target = { fetch: original as typeof fetch };
    const listener = vi.fn();
    const first = installFetchDiscovery(listener, { target });
    const wrapped = target.fetch;
    const second = installFetchDiscovery(listener, { target });
    expect(target.fetch).toBe(wrapped);
    await target.fetch("/__debugbar/requests/id");
    expect(listener).not.toHaveBeenCalled();
    await target.fetch("/api");
    expect(listener).toHaveBeenCalledTimes(1);
    first();
    await target.fetch("/api/two");
    expect(listener).toHaveBeenCalledTimes(2);
    second();
    expect(target.fetch).not.toBe(wrapped);
  });

  it("preserves the original rejection", async () => {
    const error = new Error("network failure");
    const target = {
      fetch: vi.fn(async () => Promise.reject(error)) as typeof fetch,
    };
    const cleanup = installFetchDiscovery(vi.fn(), { target });
    await expect(target.fetch("/api")).rejects.toBe(error);
    cleanup();
  });
});

describe("Axios discovery", () => {
  it("reports success and error response IDs and ejects cleanly", async () => {
    let fail = false;
    const client = axios.create({
      adapter: async (config) => {
        if (fail) {
          const error = new Error("failed") as Error & { response: unknown };
          error.response = {
            status: 500,
            headers: { "x-debugbar-id": "error-id" },
            config,
            data: null,
            statusText: "Error",
          };
          throw error;
        }
        return {
          status: 200,
          statusText: "OK",
          headers: { "x-debugbar-id": "success-id" },
          config,
          data: {},
        };
      },
    });
    const listener = vi.fn();
    const cleanup = installAxiosDiscovery(client, listener);
    await client.get("/success");
    fail = true;
    await expect(client.get("/failure")).rejects.toThrow("failed");
    expect(listener.mock.calls.flat()).toEqual(["success-id", "error-id"]);
    cleanup();
    fail = false;
    await client.get("/after-cleanup");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("deduplicates IDs already observed by another adapter", async () => {
    const client = axios.create({
      adapter: async (config) => ({
        status: 200,
        statusText: "OK",
        headers: { "X-Debugbar-ID": "shared" },
        config,
        data: {},
      }),
    });
    const listener = vi.fn();
    const cleanup = installAxiosDiscovery(
      client,
      listener,
      new Set(["shared"]),
    );
    await client.get("/api");
    expect(listener).not.toHaveBeenCalled();
    cleanup();
  });
});
