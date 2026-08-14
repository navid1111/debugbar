import { currentDebugContext, sanitize } from "@debugbar/core";
import type { DebugError, SanitizationLimits } from "@debugbar/core";

export const ERRORS_STATE = "@debugbar/errors";

function toError(
  error: unknown,
  limits: Partial<SanitizationLimits>,
  depth = 0,
): DebugError {
  if (depth >= 5) {
    return {
      name: "Error",
      message: "[Cause chain truncated]",
      timestamp: new Date().toISOString(),
    };
  }
  if (!(error instanceof Error)) {
    return {
      name: typeof error,
      message: String(error),
      timestamp: new Date().toISOString(),
    };
  }
  const safe = sanitize(error, { limits });
  const object =
    typeof safe === "object" && safe !== null && !Array.isArray(safe)
      ? safe
      : {};
  return {
    name: typeof object.name === "string" ? object.name : error.name,
    message:
      typeof object.message === "string" ? object.message : error.message,
    ...(typeof object.stack === "string" ? { stack: object.stack } : {}),
    timestamp: new Date().toISOString(),
    ...(error.cause !== undefined
      ? { cause: toError(error.cause, limits, depth + 1) }
      : {}),
  };
}

export function captureException(
  error: unknown,
  limits: Partial<SanitizationLimits> = {},
): void {
  const context = currentDebugContext();
  if (!context) return;
  const errors =
    (context.collectorState.get(ERRORS_STATE) as DebugError[] | undefined) ??
    [];
  errors.push(toError(error, limits));
  context.collectorState.set(ERRORS_STATE, errors);
}
