import express from "express";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import {
  MemoryStore,
  DATABASE_STATE,
  addMessage,
  createContext,
  createDebugId,
  currentDebugContext,
  measure,
  resolveOptions,
  runWithDebugContext,
  sanitize,
  startMeasure,
} from "@debugbar/core";
import type { Collector, DebugRecord, JsonValue } from "@debugbar/core";
import { captureException, ERRORS_STATE } from "./errors.js";
import type {
  Debugbar,
  ExpressDebugbarOptions,
  RequestDebugbar,
} from "./types.js";
import { parseClientMetrics } from "./client-metrics.js";

const CUSTOM_STATE = "@debugbar/custom";
const MEMORY_STATE = "@debugbar/memory";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function appendHeader(response: Response, name: string, value: string): void {
  const existing = response.getHeader(name);
  const values = new Set(
    (Array.isArray(existing)
      ? existing
      : existing
        ? String(existing).split(",")
        : []
    )
      .map((item) => item.trim())
      .filter(Boolean),
  );
  values.add(value);
  response.setHeader(name, [...values].join(", "));
}

class ExpressDebugbar implements Debugbar {
  readonly options;
  readonly store;

  constructor(options: ExpressDebugbarOptions = {}) {
    this.options = resolveOptions(options);
    this.store =
      this.options.store ??
      new MemoryStore({
        maxRequests: this.options.maxRequests,
        retentionMs: this.options.retentionMs,
      });
  }

  #safeContext(context: unknown): JsonValue | undefined {
    return context === undefined
      ? undefined
      : sanitize(context, {
          maskedKeys: this.options.maskedKeys,
          limits: this.options.limits,
        });
  }

  #log(
    level: "debug" | "info" | "warn" | "error",
    message: string,
    context?: unknown,
  ): void {
    addMessage(level, message, this.#safeContext(context));
  }

  debug(message: string, context?: unknown): void {
    this.#log("debug", message, context);
  }
  info(message: string, context?: unknown): void {
    this.#log("info", message, context);
  }
  warn(message: string, context?: unknown): void {
    this.#log("warn", message, context);
  }
  error(message: string, context?: unknown): void {
    this.#log("error", message, context);
  }
  startMeasure(name: string): () => void {
    return startMeasure(name);
  }
  measure<T>(name: string, callback: () => Promise<T>): Promise<T>;
  measure<T>(name: string, callback: () => T): T;
  measure<T>(name: string, callback: () => T | Promise<T>): T | Promise<T> {
    return measure(name, callback as () => T) as T | Promise<T>;
  }

  addData(collector: string, value: unknown): void {
    const context = currentDebugContext();
    if (!context) return;
    const custom =
      (context.collectorState.get(CUSTOM_STATE) as
        | Record<string, JsonValue>
        | undefined) ?? {};
    custom[collector] = sanitize(value, {
      maskedKeys: this.options.maskedKeys,
      limits: this.options.limits,
    });
    context.collectorState.set(CUSTOM_STATE, custom);
  }

  captureException(error: unknown): void {
    captureException(error, this.options.limits);
  }

  #requestApi(id: string): RequestDebugbar {
    return {
      id,
      debug: this.debug.bind(this),
      info: this.info.bind(this),
      warn: this.warn.bind(this),
      error: this.error.bind(this),
      startMeasure: this.startMeasure.bind(this),
      measure: this.measure.bind(this) as RequestDebugbar["measure"],
      addData: this.addData.bind(this),
    };
  }

  middleware(): RequestHandler {
    if (!this.options.enabled) return (_request, _response, next) => next();
    return (request, response, next) => {
      if (
        request.path === this.options.routePrefix ||
        request.path.startsWith(`${this.options.routePrefix}/`)
      ) {
        next();
        return;
      }
      const id = createDebugId();
      const wallStartedAt = Date.now();
      const context = createContext(id);
      const startMemory = process.memoryUsage();
      context.collectorState.set(MEMORY_STATE, startMemory);
      request.debugbar = this.#requestApi(id);
      response.setHeader("X-Debugbar-ID", id);
      const origin = request.get("origin");
      if (
        origin &&
        this.options.cors?.origins.includes(origin) &&
        this.options.cors.exposeHeaders
      ) {
        appendHeader(
          response,
          "Access-Control-Expose-Headers",
          "X-Debugbar-ID",
        );
        appendHeader(
          response,
          "Access-Control-Expose-Headers",
          "Server-Timing",
        );
      }

      const originalWriteHead = response.writeHead.bind(response);
      response.writeHead = ((
        ...arguments_: Parameters<Response["writeHead"]>
      ) => {
        const duration = Math.max(
          0,
          performance.now() - context.startedAt,
        ).toFixed(1);
        const existing = response.getHeader("Server-Timing");
        response.setHeader(
          "Server-Timing",
          `${existing ? `${String(existing)}, ` : ""}app;dur=${duration}`,
        );
        return originalWriteHead(...arguments_);
      }) as Response["writeHead"];

      let finalized = false;
      const finalize = (aborted: boolean) => {
        if (finalized) return;
        finalized = true;
        void this.#finalize(request, response, context, wallStartedAt, aborted);
      };
      response.once("finish", () => finalize(false));
      response.once("close", () => finalize(!response.writableFinished));

      runWithDebugContext(context, () => {
        void this.#startCollectors(request)
          .then(() => next())
          .catch(() => next());
      });
    };
  }

  async #startCollectors(request: Request): Promise<void> {
    const context = currentDebugContext();
    if (!context) return;
    for (const collector of this.options.collectors) {
      try {
        const state = collector.createState();
        context.collectorState.set(collector.name, state);
        await collector.onRequest?.(
          { method: request.method, url: request.originalUrl },
          state,
        );
      } catch (error) {
        this.#warning(context, collector.name, error);
      }
    }
  }

  #warning(
    context: ReturnType<typeof createContext>,
    source: string,
    error: unknown,
  ): void {
    const warnings =
      (context.collectorState.get("@debugbar/warnings") as
        | DebugRecord["warnings"]
        | undefined) ?? [];
    warnings.push({ source, message: errorMessage(error) });
    context.collectorState.set("@debugbar/warnings", warnings);
  }

  async #finalize(
    request: Request,
    response: Response,
    context: ReturnType<typeof createContext>,
    wallStartedAt: number,
    aborted: boolean,
  ): Promise<void> {
    const collectors: Record<string, JsonValue> = {};
    for (const collector of this.options.collectors as Collector[]) {
      try {
        const state = context.collectorState.get(collector.name);
        await collector.onResponse?.(
          { status: response.statusCode, aborted },
          state,
        );
        collectors[collector.name] = sanitize(await collector.collect(state), {
          maskedKeys: this.options.maskedKeys,
          limits: this.options.limits,
        });
      } catch (error) {
        this.#warning(context, collector.name, error);
      }
    }
    const contentType = request.get("content-type") ?? "";
    const captureBody =
      this.options.captureBody &&
      (/^application\/json\b/i.test(contentType) ||
        /^application\/x-www-form-urlencoded\b/i.test(contentType));
    collectors.request = sanitize(
      {
        method: request.method,
        url: request.originalUrl,
        route:
          typeof request.route?.path === "string"
            ? request.route.path
            : undefined,
        params: request.params,
        query: request.query,
        headers: request.headers,
        ...(captureBody ? { body: request.body } : {}),
        status: response.statusCode,
      },
      { maskedKeys: this.options.maskedKeys, limits: this.options.limits },
    );
    collectors.timing = sanitize(
      {
        totalMs: Math.max(0, performance.now() - context.startedAt),
        measures: context.measures,
      },
      { limits: this.options.limits },
    );
    const startMemory = context.collectorState.get(
      MEMORY_STATE,
    ) as NodeJS.MemoryUsage;
    const endMemory = process.memoryUsage();
    collectors.memory = sanitize(
      {
        start: startMemory,
        end: endMemory,
        delta: {
          rss: endMemory.rss - startMemory.rss,
          heapUsed: endMemory.heapUsed - startMemory.heapUsed,
          heapTotal: endMemory.heapTotal - startMemory.heapTotal,
          external: endMemory.external - startMemory.external,
          arrayBuffers: endMemory.arrayBuffers - startMemory.arrayBuffers,
        },
      },
      { limits: this.options.limits },
    );
    collectors.messages = sanitize(context.messages, {
      limits: this.options.limits,
    });
    collectors.errors = sanitize(
      context.collectorState.get(ERRORS_STATE) ?? [],
      { limits: this.options.limits },
    );
    collectors.database = sanitize(
      context.collectorState.get(DATABASE_STATE) ?? [],
      { maskedKeys: this.options.maskedKeys, limits: this.options.limits },
    );
    Object.assign(collectors, context.collectorState.get(CUSTOM_STATE) ?? {});

    const route =
      typeof request.route?.path === "string" ? request.route.path : undefined;
    const record: DebugRecord = {
      schemaVersion: 1,
      id: context.id,
      startedAt: new Date(wallStartedAt).toISOString(),
      durationMs: Math.max(0, performance.now() - context.startedAt),
      request: {
        method: request.method,
        url: request.originalUrl,
        ...(route ? { route } : {}),
        status: response.statusCode,
        aborted,
      },
      collectors,
      warnings:
        (context.collectorState.get("@debugbar/warnings") as
          | DebugRecord["warnings"]
          | undefined) ?? [],
    };
    try {
      await this.store.put(record);
    } catch {
      /* Debug tooling must never fail the app. */
    }
  }

  router(): RequestHandler {
    const router = express.Router();
    if (!this.options.enabled) return router;
    router.use((_request, response, next) => {
      response.setHeader("Cache-Control", "no-store");
      next();
    });
    router.use((request, response, next) => {
      const origin = request.get("origin");
      if (origin && !this.options.cors?.origins.includes(origin)) {
        response.sendStatus(404);
        return;
      }
      if (origin) {
        response.setHeader("Access-Control-Allow-Origin", origin);
        appendHeader(response, "Vary", "Origin");
      }
      Promise.resolve(this.options.access(request))
        .then((allowed) => (allowed ? next() : response.sendStatus(404)))
        .catch(() => response.sendStatus(404));
    });
    router.get("/requests", async (request, response) => {
      const parsed = Number.parseInt(String(request.query.limit ?? "100"), 10);
      const limit = Number.isFinite(parsed)
        ? Math.min(100, Math.max(1, parsed))
        : 100;
      const before =
        typeof request.query.before === "string"
          ? request.query.before
          : undefined;
      response.json(
        await this.store.list({ limit, ...(before ? { before } : {}) }),
      );
    });
    router.get("/requests/:id", async (request, response) => {
      const record = await this.store.get(request.params.id);
      if (!record) {
        response.sendStatus(404);
        return;
      }
      response.json(
        sanitize(record, {
          scope: "record",
          maskedKeys: this.options.maskedKeys,
          limits: this.options.limits,
        }),
      );
    });
    router.delete("/requests", async (_request, response) => {
      await this.store.clear();
      response.sendStatus(204);
    });
    router.post(
      "/client-metrics/:id",
      (request, response, next) => {
        const contentLength = Number(request.get("content-length") ?? 0);
        if (Number.isFinite(contentLength) && contentLength > 32_768) {
          response.sendStatus(413);
          return;
        }
        next();
      },
      express.json({ limit: "32kb" }),
      async (request, response) => {
        const record = await this.store.get(request.params.id);
        if (!record) {
          response.sendStatus(404);
          return;
        }
        if (request.get("x-debugbar-id") !== record.id) {
          response.sendStatus(404);
          return;
        }
        const payload = parseClientMetrics(request.body);
        if (!payload) {
          response.sendStatus(400);
          return;
        }
        const existing = record.collectors.client;
        const previous =
          isPlainObject(existing) && Array.isArray(existing.metrics)
            ? existing.metrics
            : [];
        record.collectors.client = sanitize(
          {
            schemaVersion: 1,
            metrics: [...previous, ...payload.metrics].slice(-100),
          },
          {
            maskedKeys: this.options.maskedKeys,
            limits: {
              ...this.options.limits,
              maxCollectorBytes: Math.min(
                this.options.limits.maxCollectorBytes,
                32_768,
              ),
            },
          },
        );
        await this.store.put(record);
        response.sendStatus(204);
      },
    );
    return router;
  }

  errorHandler() {
    return (
      error: unknown,
      _request: Request,
      _response: unknown,
      next: NextFunction,
    ): void => {
      this.captureException(error);
      next(error);
    };
  }
}

export function createDebugbar(options: ExpressDebugbarOptions = {}): Debugbar {
  return new ExpressDebugbar(options);
}

export function debugbarErrorHandler(debugbar: Debugbar) {
  return debugbar.errorHandler();
}
