import { AsyncLocalStorage } from "node:async_hooks";
import type { DebugMeasure, DebugMessage, JsonValue } from "./types.js";

export interface DebugContext {
  id: string;
  startedAt: number;
  messages: DebugMessage[];
  measures: DebugMeasure[];
  collectorState: Map<string, unknown>;
}

export type Clock = () => number;
const storage = new AsyncLocalStorage<DebugContext>();

export function runWithDebugContext<T>(
  context: DebugContext,
  callback: () => T,
): T {
  return storage.run(context, callback);
}

export function currentDebugContext(): DebugContext | undefined {
  return storage.getStore();
}

export function createContext(
  id: string,
  now: Clock = performance.now.bind(performance),
): DebugContext {
  return {
    id,
    startedAt: now(),
    messages: [],
    measures: [],
    collectorState: new Map(),
  };
}

export function addMessage(
  level: DebugMessage["level"],
  message: string,
  context?: JsonValue,
): void {
  const current = currentDebugContext();
  if (!current) return;
  current.messages.push({
    level,
    message,
    ...(context === undefined ? {} : { context }),
    timestamp: new Date().toISOString(),
  });
}

export function startMeasure(
  name: string,
  now: Clock = performance.now.bind(performance),
): () => void {
  const current = currentDebugContext();
  if (!current) return () => undefined;
  const startedAtMs = now();
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    current.measures.push({
      name,
      startedAtMs,
      durationMs: Math.max(0, now() - startedAtMs),
    });
  };
}

export function measure<T>(
  name: string,
  callback: () => Promise<T>,
  now?: Clock,
): Promise<T>;
export function measure<T>(name: string, callback: () => T, now?: Clock): T;
export function measure<T>(
  name: string,
  callback: () => T | Promise<T>,
  now: Clock = performance.now.bind(performance),
): T | Promise<T> {
  const current = currentDebugContext();
  if (!current) return callback();
  const startedAtMs = now();
  const record = (failed: boolean) =>
    current.measures.push({
      name,
      startedAtMs,
      durationMs: Math.max(0, now() - startedAtMs),
      ...(failed ? { failed: true } : {}),
    });
  try {
    const result = callback();
    if (result instanceof Promise)
      return result.then(
        (value) => {
          record(false);
          return value;
        },
        (error: unknown) => {
          record(true);
          throw error;
        },
      );
    record(false);
    return result;
  } catch (error) {
    record(true);
    throw error;
  }
}
