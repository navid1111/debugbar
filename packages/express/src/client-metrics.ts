import type {
  ClientMetric,
  ClientMetricsPayload,
  JsonValue,
} from "@debugbar/core";

const CATEGORIES = new Set([
  "navigation",
  "network-error",
  "web-vital",
  "react-profiler",
]);
const UNITS = new Set(["ms", "count", "score"]);
const ROOT_KEYS = new Set(["schemaVersion", "metrics"]);
const METRIC_KEYS = new Set([
  "category",
  "name",
  "value",
  "unit",
  "timestamp",
  "detail",
]);

function exactKeys(value: Record<string, unknown>, allowed: Set<string>) {
  return Object.keys(value).every((key) => allowed.has(key));
}

function validJson(value: unknown, depth = 0): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (depth >= 6) return false;
  if (Array.isArray(value))
    return (
      value.length <= 100 && value.every((item) => validJson(item, depth + 1))
    );
  if (!value || typeof value !== "object") return false;
  return (
    Object.entries(value).length <= 100 &&
    Object.values(value).every((item) => validJson(item, depth + 1))
  );
}

function parseMetric(value: unknown): ClientMetric | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const candidate = value as Record<string, unknown>;
  if (!exactKeys(candidate, METRIC_KEYS)) return;
  if (
    !CATEGORIES.has(String(candidate.category)) ||
    !UNITS.has(String(candidate.unit))
  )
    return;
  if (
    typeof candidate.name !== "string" ||
    !/^[a-z][a-z0-9._-]{0,63}$/i.test(candidate.name)
  )
    return;
  if (typeof candidate.value !== "number" || !Number.isFinite(candidate.value))
    return;
  if (
    candidate.timestamp !== undefined &&
    (typeof candidate.timestamp !== "number" ||
      !Number.isFinite(candidate.timestamp))
  )
    return;
  if (candidate.detail !== undefined && !validJson(candidate.detail)) return;
  return candidate as unknown as ClientMetric;
}

export function parseClientMetrics(
  value: unknown,
): ClientMetricsPayload | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const candidate = value as Record<string, unknown>;
  if (
    !exactKeys(candidate, ROOT_KEYS) ||
    candidate.schemaVersion !== 1 ||
    !Array.isArray(candidate.metrics) ||
    candidate.metrics.length < 1 ||
    candidate.metrics.length > 100
  )
    return;
  const metrics = candidate.metrics.map(parseMetric);
  if (metrics.some((metric) => !metric)) return;
  return { schemaVersion: 1, metrics: metrics as ClientMetric[] };
}
