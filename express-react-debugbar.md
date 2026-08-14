# Express + React Debugbar

An implementation blueprint for a Laravel Debugbar-style development toolbar for applications with an Express backend and a React frontend.

> This is a compatible design, not a port of `barryvdh/laravel-debugbar`. Laravel Debugbar is tightly coupled to PHP and Laravel. The equivalent Node.js implementation should reproduce its collector-based architecture and developer experience using Express middleware and React components.

## Goals

- Collect request, response, database, log, error, cache, HTTP-client, and timing data.
- Attach a request ID and lightweight summary to every response.
- Display full diagnostics in a React toolbar during development.
- Support normal page loads, client-side navigation, and API requests.
- Make collectors pluggable and safe to disable in production.
- Mask secrets before debug data is stored or returned.

## Architecture

```text
Browser / React application
        |
        | HTTP request
        v
Express debug middleware
        |
        +-- AsyncLocalStorage request context
        +-- collectors (logs, queries, timing, errors, HTTP, cache)
        +-- response instrumentation
        |
        v
Application routes and services
        |
        | response headers: X-Debugbar-ID, Server-Timing
        v
React Debugbar
        |
        +-- reads response metadata
        +-- GET /__debugbar/requests/:id
        +-- renders collector tabs
```

The server is authoritative. React only displays sanitized diagnostic data and contributes browser-side measurements such as rendering time, Web Vitals, console messages, and failed network requests.

## Suggested Package Layout

```text
packages/
  express-debugbar/
    src/
      index.ts
      middleware.ts
      context.ts
      debugbar.ts
      store.ts
      routes.ts
      security.ts
      collectors/
        request.ts
        timing.ts
        memory.ts
        messages.ts
        errors.ts
        database.ts
        http-client.ts
        cache.ts
  react-debugbar/
    src/
      DebugbarProvider.tsx
      Debugbar.tsx
      useDebugbar.ts
      network.ts
      panels/
        OverviewPanel.tsx
        TimelinePanel.tsx
        QueriesPanel.tsx
        MessagesPanel.tsx
        RequestPanel.tsx
        ErrorsPanel.tsx
```

For a single application, these can initially be `server/debugbar` and `src/debugbar` directories instead of separate packages.

## Server Setup

Install the middleware before application routes and the error handler after routes.

```ts
import express from "express";
import { createDebugbar, debugbarErrorHandler } from "@app/express-debugbar";

const app = express();

const debugbar = createDebugbar({
  enabled: process.env.NODE_ENV === "development",
  routePrefix: "/__debugbar",
  maxRequests: 100,
  captureBody: true,
  maskedKeys: [
    "authorization",
    "cookie",
    "set-cookie",
    "password",
    "token",
    "secret",
    "apiKey",
  ],
});

app.use(debugbar.middleware());
app.use(express.json());

app.get("/api/users", async (req, res) => {
  debugbar.info("Loading users", { requestId: req.debugbar?.id });

  const stop = debugbar.measure("load-users");
  const users = await userService.findAll();
  stop();

  res.json(users);
});

app.use(debugbar.router());
app.use(debugbarErrorHandler(debugbar));
```

The middleware should add a request-scoped API:

```ts
declare global {
  namespace Express {
    interface Request {
      debugbar?: {
        id: string;
        addMessage(message: string, context?: unknown): void;
        startMeasure(name: string): () => void;
        addData(collector: string, value: unknown): void;
      };
    }
  }
}
```

## Request Context

Use Node.js `AsyncLocalStorage` so logs and measurements can be attributed to the current request without passing `req` through every service.

```ts
import { AsyncLocalStorage } from "node:async_hooks";

export interface DebugContext {
  id: string;
  startedAt: number;
  data: Map<string, unknown>;
}

export const debugContext = new AsyncLocalStorage<DebugContext>();
```

Do not keep mutable request state in module-level variables. That leaks data between concurrent requests and is particularly dangerous in long-running Node.js processes.

## Collector Contract

Collectors should have a small lifecycle API so integrations remain independent.

```ts
export interface Collector<T = unknown> {
  name: string;
  label: string;
  start?(context: DebugContext, req: express.Request): void | Promise<void>;
  finish?(
    context: DebugContext,
    req: express.Request,
    res: express.Response,
  ): void | Promise<void>;
  collect(context: DebugContext): T | Promise<T>;
  sanitize?(data: T): T;
}
```

Recommended collectors:

| Collector   | Express/Node.js implementation                                            |
| ----------- | ------------------------------------------------------------------------- |
| Request     | Method, URL, route params, query, sanitized headers/body, response status |
| Timing      | Middleware spans, route duration, custom measures, `Server-Timing`        |
| Memory      | `process.memoryUsage()` before and after a request                        |
| Messages    | Request-scoped debug messages and structured logs                         |
| Errors      | Error name, message, sanitized stack, cause chain                         |
| Database    | ORM hooks or driver instrumentation for SQL, bindings, duration, source   |
| HTTP client | Instrument global `fetch`, Axios interceptors, or OpenTelemetry spans     |
| Cache       | Wrap cache clients and record hits, misses, writes, and deletes           |
| React       | Navigation, render, Web Vitals, console, and browser request failures     |

## Database Integrations

Database collection should be adapter-based rather than tied to one ORM.

- Prisma: subscribe with Prisma query events or use a client extension.
- Sequelize: use logging callbacks and benchmark timing.
- Knex: listen for `query`, `query-response`, and `query-error` events.
- Mongoose: use middleware or MongoDB command monitoring.
- Native drivers: wrap query/execute methods or consume OpenTelemetry spans.

Each record should include the statement or operation, sanitized bindings, duration, connection name, success state, and an optional application stack frame. Query results should not be captured by default.

## React Setup

Mount the toolbar once near the application root and exclude it from production bundles where possible.

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

async function bootstrap() {
  let Debugbar: React.ComponentType | null = null;

  if (import.meta.env.DEV) {
    Debugbar = (await import("./debugbar/Debugbar")).Debugbar;
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
      {Debugbar ? <Debugbar endpoint="/__debugbar" /> : null}
    </StrictMode>,
  );
}

bootstrap();
```

The client should wrap `fetch` to discover debug request IDs without changing application response bodies:

```ts
export function instrumentFetch(onRequest: (id: string) => void) {
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    const id = response.headers.get("X-Debugbar-ID");

    if (id) onRequest(id);
    return response;
  };

  return () => {
    window.fetch = originalFetch;
  };
}
```

For Axios, use a response interceptor instead. Avoid monkey-patching both Axios and `fetch` when Axios already uses the Fetch adapter, or requests may be recorded twice.

## Debug Data API

```http
GET    /__debugbar/requests              List recent request summaries
GET    /__debugbar/requests/:id          Retrieve one sanitized debug payload
DELETE /__debugbar/requests              Clear stored development data
POST   /__debugbar/client-metrics/:id    Attach browser-side metrics
```

Example response:

```json
{
  "id": "01JXYZ...",
  "request": {
    "method": "GET",
    "url": "/api/users",
    "status": 200,
    "durationMs": 42.8
  },
  "collectors": {
    "timing": [{ "name": "load-users", "durationMs": 31.2 }],
    "queries": [{ "operation": "User.findMany", "durationMs": 18.4 }],
    "messages": [{ "level": "info", "message": "Loading users" }],
    "errors": []
  }
}
```

Send only the request ID and summary headers with normal API responses. Fetch the full payload from the debug endpoint on demand; embedding all diagnostics in response headers will hit proxy and browser header-size limits.

## Storage

Start with an in-memory ring buffer for local development:

- Cap stored requests by count and age.
- Delete the oldest entries first.
- Set a maximum payload size for every collector.
- Truncate large bodies, logs, stack traces, and query bindings.

Add Redis or filesystem adapters only if cross-process or historical inspection is required. In clustered Node.js deployments, an in-memory store is local to each worker.

## Error Handling

The debugbar error middleware must record an error and then preserve normal Express behavior:

```ts
export function debugbarErrorHandler(debugbar: Debugbar) {
  return (
    error: unknown,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    debugbar.captureException(error);
    next(error);
  };
}
```

It must not expose stack traces in ordinary API responses. Stack traces belong only in the protected debug data endpoint.

## Security Requirements

Debug tooling can expose credentials and personal data. Treat these rules as mandatory:

- Enable the debugbar only in local or explicitly approved development environments.
- Return `404` from debug routes when disabled.
- Bind local development servers to loopback by default.
- Require authentication and an IP allowlist if the toolbar is used remotely.
- Mask matching keys recursively and case-insensitively.
- Mask `Authorization`, cookies, session IDs, CSRF tokens, database URLs, and API keys.
- Never capture file uploads, raw binary bodies, access tokens, or full query results by default.
- Apply strict size and retention limits.
- Do not rely on hiding the React component; secure the Express routes themselves.
- Add `Cache-Control: no-store` to all debug responses.

## Production Behavior

When disabled, the package should:

- Avoid installing instrumentation hooks.
- Avoid creating request contexts or storing payloads.
- Expose no debug routes or assets.
- Make logging and measurement methods safe no-ops.
- Allow bundlers to remove the React toolbar through a development-only dynamic import.

## OpenTelemetry Compatibility

Use OpenTelemetry as an optional source of spans, not as the UI itself. It already instruments Express, databases, and outbound HTTP calls well. A collector can translate the current trace into Debugbar panels, while the same telemetry continues to work with observability backends.

Keep request IDs and trace IDs separate but cross-reference them:

```json
{
  "debugbarId": "01JXYZ...",
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736"
}
```

## Minimum Viable Version

Build the first version in this order:

1. Express request middleware with `AsyncLocalStorage`.
2. In-memory bounded store and protected retrieval routes.
3. Request, timing, messages, memory, and errors collectors.
4. `X-Debugbar-ID` and `Server-Timing` response headers.
5. React toolbar with overview, timeline, messages, and errors panels.
6. Fetch/Axios request discovery for single-page navigation.
7. One database adapter used by the target application.
8. Recursive secret masking, payload limits, and security tests.

Add cache, mail, queue, WebSocket, GraphQL, and additional ORM collectors after this core is stable.

## Differences from Laravel Debugbar

| Laravel concept             | Express + React equivalent                                 |
| --------------------------- | ---------------------------------------------------------- |
| Laravel service provider    | Express setup function and middleware registration         |
| PHP request-local execution | `AsyncLocalStorage` context                                |
| Data collector provider     | Collector plugin/adapter                                   |
| Facade and global helpers   | Request-scoped API plus context-aware logger               |
| Symfony response injection  | Response headers plus separately mounted React UI          |
| Laravel events              | Node event emitters, ORM hooks, wrappers, or OpenTelemetry |
| Laravel storage drivers     | In-memory, Redis, or filesystem store adapter              |
| Blade/Twig integration      | React Profiler and browser metrics collector               |
| Octane reset logic          | New isolated context for every Express request             |

This division keeps backend diagnostics independent of React and allows the Express middleware to support other frontends later.
