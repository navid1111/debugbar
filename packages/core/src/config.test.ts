import { describe, expect, it } from "vitest";
import { isLoopbackRequest, resolveOptions } from "./config.js";

describe("resolveOptions", () => {
  it("uses safe environment defaults", () => {
    expect(resolveOptions({}, "production").enabled).toBe(false);
    expect(resolveOptions({}, "development").enabled).toBe(true);
    expect(isLoopbackRequest({ ip: "127.0.0.1" })).toBe(true);
    expect(isLoopbackRequest({ ip: "10.0.0.2" })).toBe(false);
  });

  it.each([
    [{ routePrefix: "relative" }, "routePrefix"],
    [{ routePrefix: "/bad/" }, "routePrefix"],
    [{ maxRequests: 0 }, "maxRequests"],
    [{ retentionMs: -1 }, "retentionMs"],
    [{ limits: { maxDepth: 0 } }, "maxDepth"],
  ])("rejects invalid configuration %#", (options, message) => {
    expect(() => resolveOptions(options, "development")).toThrow(message);
  });

  it("rejects duplicate collectors and unsafe production enablement", () => {
    const collector = {
      name: "same",
      createState: () => null,
      collect: () => null,
    };
    expect(() =>
      resolveOptions({ collectors: [collector, collector] }, "development"),
    ).toThrow("Duplicate");
    expect(() => resolveOptions({ enabled: true }, "production")).toThrow(
      "access policy",
    );
    expect(
      resolveOptions({ enabled: true, access: () => false }, "production")
        .enabled,
    ).toBe(true);
  });
});
