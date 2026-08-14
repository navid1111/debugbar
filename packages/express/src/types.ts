import type { NextFunction, Request, RequestHandler } from "express";
import type {
  DebugbarOptions,
  DebugbarStore,
  JsonValue,
  ResolvedDebugbarOptions,
} from "@debugbar/core";

export interface RequestDebugbar {
  readonly id: string;
  debug(message: string, context?: unknown): void;
  info(message: string, context?: unknown): void;
  warn(message: string, context?: unknown): void;
  error(message: string, context?: unknown): void;
  startMeasure(name: string): () => void;
  measure<T>(name: string, callback: () => Promise<T>): Promise<T>;
  measure<T>(name: string, callback: () => T): T;
  addData(collector: string, value: unknown): void;
}

declare global {
  // Express exposes request augmentation through this namespace.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      debugbar?: RequestDebugbar;
    }
  }
}

export interface Debugbar {
  readonly options: ResolvedDebugbarOptions;
  readonly store: DebugbarStore;
  middleware(): RequestHandler;
  router(): RequestHandler;
  errorHandler(): (
    error: unknown,
    request: Request,
    response: unknown,
    next: NextFunction,
  ) => void;
  debug(message: string, context?: unknown): void;
  info(message: string, context?: unknown): void;
  warn(message: string, context?: unknown): void;
  error(message: string, context?: unknown): void;
  startMeasure(name: string): () => void;
  measure<T>(name: string, callback: () => Promise<T>): Promise<T>;
  measure<T>(name: string, callback: () => T): T;
  addData(collector: string, value: unknown): void;
  captureException(error: unknown): void;
}

export type ExpressDebugbarOptions = DebugbarOptions;

export type ClientMetrics = Record<string, JsonValue>;
