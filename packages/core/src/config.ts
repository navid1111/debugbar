import { DEFAULT_LIMITS, DEFAULT_MASKED_KEYS } from "./sanitize.js";
import type { DebugbarOptions, ResolvedDebugbarOptions } from "./types.js";

function positiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0)
    throw new TypeError(`${name} must be a positive integer`);
}

export function isLoopbackRequest(request: unknown): boolean {
  if (!request || typeof request !== "object") return false;
  const ip = "ip" in request ? String(request.ip) : "";
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

export function resolveOptions(
  options: DebugbarOptions = {},
  environment = process.env.NODE_ENV,
): ResolvedDebugbarOptions {
  const enabled = options.enabled ?? environment !== "production";
  const routePrefix = options.routePrefix ?? "/__debugbar";
  if (!/^\/[A-Za-z0-9/_-]*$/.test(routePrefix) || routePrefix.endsWith("/")) {
    throw new TypeError(
      "routePrefix must be an absolute path without a trailing slash",
    );
  }
  const maxRequests = options.maxRequests ?? 100;
  const retentionMs = options.retentionMs ?? 30 * 60 * 1000;
  positiveInteger("maxRequests", maxRequests);
  positiveInteger("retentionMs", retentionMs);
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  for (const [name, value] of Object.entries(limits))
    positiveInteger(`limits.${name}`, value);
  const collectors = options.collectors ?? [];
  const names = new Set<string>();
  for (const collector of collectors) {
    if (!collector.name || names.has(collector.name))
      throw new TypeError(
        `Duplicate or empty collector name: ${collector.name}`,
      );
    names.add(collector.name);
  }
  if (environment === "production" && enabled && !options.access) {
    throw new TypeError(
      "Production enablement requires an explicit access policy",
    );
  }
  return {
    enabled,
    routePrefix,
    access: options.access ?? isLoopbackRequest,
    ...(options.store ? { store: options.store } : {}),
    collectors,
    maxRequests,
    retentionMs,
    captureBody: options.captureBody ?? false,
    maskedKeys: options.maskedKeys ?? DEFAULT_MASKED_KEYS,
    limits,
    ...(options.cors
      ? {
          cors: {
            origins: options.cors.origins,
            exposeHeaders: options.cors.exposeHeaders ?? false,
          },
        }
      : {}),
  };
}
