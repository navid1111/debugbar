import type { JsonValue, SanitizationLimits } from "./types.js";

export const REDACTED = "[REDACTED]";

export const DEFAULT_MASKED_KEYS = [
  "authorization",
  "cookie",
  "set-cookie",
  "password",
  "passwd",
  "secret",
  "token",
  "access_token",
  "refresh_token",
  "apikey",
  "session",
];

export const DEFAULT_LIMITS: SanitizationLimits = {
  maxDepth: 8,
  maxArrayLength: 100,
  maxStringLength: 10_000,
  maxCollectorBytes: 256_000,
  maxRecordBytes: 1_000_000,
};

export interface SanitizeOptions {
  maskedKeys?: string[];
  limits?: Partial<SanitizationLimits>;
  scope?: "collector" | "record";
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}…[truncated]`;
}

export function sanitize(
  value: unknown,
  options: SanitizeOptions = {},
): JsonValue {
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  const masked = new Set(
    [...(options.maskedKeys ?? DEFAULT_MASKED_KEYS)].map((key) =>
      key.toLowerCase(),
    ),
  );
  const seen = new WeakSet<object>();

  function visit(input: unknown, depth: number, key?: string): JsonValue {
    if (key && masked.has(key.toLowerCase())) return REDACTED;
    if (input === null || typeof input === "boolean") return input;
    if (typeof input === "string")
      return truncate(input, limits.maxStringLength);
    if (typeof input === "number")
      return Number.isFinite(input) ? input : `[${String(input)}]`;
    if (typeof input === "bigint") return `${input.toString()}n`;
    if (typeof input === "undefined") return "[undefined]";
    if (typeof input === "function")
      return `[Function${input.name ? `: ${input.name}` : ""}]`;
    if (typeof input === "symbol") return `[${String(input)}]`;
    if (depth >= limits.maxDepth) return "[Max depth]";
    if (typeof input !== "object") return String(input);
    if (seen.has(input)) return "[Circular]";
    seen.add(input);

    if (input instanceof Date)
      return Number.isNaN(input.valueOf())
        ? "[Invalid Date]"
        : input.toISOString();
    if (input instanceof Error) {
      return {
        name: truncate(input.name, limits.maxStringLength),
        message: truncate(input.message, limits.maxStringLength),
        ...(input.stack
          ? { stack: truncate(input.stack, limits.maxStringLength) }
          : {}),
        ...(input.cause !== undefined
          ? { cause: visit(input.cause, depth + 1, "cause") }
          : {}),
      };
    }
    if (ArrayBuffer.isView(input)) return `[Binary ${input.byteLength} bytes]`;
    if (input instanceof ArrayBuffer)
      return `[Binary ${input.byteLength} bytes]`;
    if (input instanceof Map) {
      const entries = [...input.entries()].slice(0, limits.maxArrayLength);
      return entries.map(([mapKey, mapValue]) => [
        visit(mapKey, depth + 1),
        visit(mapValue, depth + 1),
      ]);
    }
    if (input instanceof Set)
      return [...input]
        .slice(0, limits.maxArrayLength)
        .map((item) => visit(item, depth + 1));
    if (Array.isArray(input))
      return input
        .slice(0, limits.maxArrayLength)
        .map((item) => visit(item, depth + 1));

    const output: Record<string, JsonValue> = {};
    for (const [property, propertyValue] of Object.entries(input).slice(
      0,
      limits.maxArrayLength,
    )) {
      output[property] = visit(propertyValue, depth + 1, property);
    }
    return output;
  }

  const result = visit(value, 0);
  const bytes = Buffer.byteLength(JSON.stringify(result));
  const byteLimit =
    options.scope === "record"
      ? limits.maxRecordBytes
      : limits.maxCollectorBytes;
  if (bytes > byteLimit) {
    return {
      truncated: true,
      originalBytes: bytes,
      reason: `${options.scope === "record" ? "Record" : "Collector"} byte limit exceeded`,
    };
  }
  return result;
}
