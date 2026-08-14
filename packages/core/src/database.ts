import { currentDebugContext } from "./context.js";
import { sanitize } from "./sanitize.js";
import type {
  DatabaseAdapter,
  DatabaseQueryEvent,
  SanitizationLimits,
} from "./types.js";

export const DATABASE_STATE = "@debugbar/database";

export function installDatabaseAdapter(
  adapter: DatabaseAdapter,
  options: {
    maskedKeys?: string[];
    limits?: Partial<SanitizationLimits>;
    maxEvents?: number;
  } = {},
): () => void {
  const maxEvents = Math.max(1, options.maxEvents ?? 200);
  return adapter.install((event) => {
    const context = currentDebugContext();
    if (!context) return;
    const events =
      (context.collectorState.get(DATABASE_STATE) as
        | DatabaseQueryEvent[]
        | undefined) ?? [];
    if (events.length >= maxEvents) return;
    events.push({
      ...event,
      operation: String(event.operation).slice(0, 64),
      statement: String(event.statement),
      durationMs: Math.max(0, event.durationMs),
      ...(event.parameters === undefined
        ? {}
        : {
            parameters: sanitize(event.parameters, {
              ...(options.maskedKeys ? { maskedKeys: options.maskedKeys } : {}),
              ...(options.limits ? { limits: options.limits } : {}),
            }),
          }),
      ...(event.error === undefined
        ? {}
        : { error: String(event.error).slice(0, 2_000) }),
    });
    context.collectorState.set(DATABASE_STATE, events);
  });
}
