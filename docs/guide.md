# Express + React Debugbar Guide

## Installation

Install the packages used by your application. The workspace currently targets Node 20+, Express 5, and React 18–19.

```bash
npm install @debugbar/core @debugbar/express @debugbar/react
```

Add one database adapter only when needed:

```bash
npm install @debugbar/better-sqlite3 better-sqlite3
npm install @debugbar/pg pg
npm install @debugbar/mysql2 mysql2
```

## Express setup

Mount the lifecycle middleware before application routes, the error collector before the application error handler, and the API router at its configured prefix.

```ts
import express from "express";
import { createDebugbar } from "@debugbar/express";

const app = express();
const debugbar = createDebugbar();

app.use(debugbar.middleware());
app.get("/api/users", async (request, response) => {
  request.debugbar?.info("Loading users", { source: "primary" });
  const users = await request.debugbar?.measure("load-users", loadUsers);
  response.json(users);
});
app.use(debugbar.errorHandler());
app.use(applicationErrorHandler);
app.use(debugbar.options.routePrefix, debugbar.router());
```

`X-Debugbar-ID` identifies the stored request, while `Server-Timing` exposes total application duration. Debug API routes do not create records.

## React setup

Render the provider outside application routing so navigation cannot unmount discovery. Fetch discovery is enabled by default.

```tsx
import { Debugbar, DebugbarProvider } from "@debugbar/react";

export function Application() {
  return (
    <DebugbarProvider endpoint="/__debugbar">
      <Router />
      <Debugbar />
    </DebugbarProvider>
  );
}
```

For Axios, install and clean up the separate response interceptor:

```ts
const remove = installAxiosDiscovery(axios, debugbar.discover);
remove();
```

Only toolbar preferences are persisted. Debug records remain in memory.

## Configuration

`createDebugbar()` accepts:

| Option        | Default             | Meaning                                                      |
| ------------- | ------------------- | ------------------------------------------------------------ |
| `enabled`     | non-production only | Enables collection and API routes.                           |
| `routePrefix` | `/__debugbar`       | Absolute API prefix without a trailing slash.                |
| `access`      | loopback-only       | Sync or async authorization policy for every debug endpoint. |
| `store`       | `MemoryStore`       | Custom `DebugbarStore`.                                      |
| `collectors`  | `[]`                | Additional uniquely named collectors.                        |
| `maxRequests` | `100`               | Maximum retained records.                                    |
| `retentionMs` | `1800000`           | Record retention period.                                     |
| `captureBody` | `false`             | Captures only configured textual request bodies.             |
| `maskedKeys`  | secure defaults     | Case-insensitive keys replaced by `[REDACTED]`.              |
| `limits`      | documented below    | Serialization depth, length, and byte limits.                |
| `cors`        | disabled            | Explicit origins and optional debug-header exposure.         |

Default limits are depth 8, array length 100, string length 10,000, collector size 256 KB, and record size 1 MB. Invalid values fail during startup.

## Security

The debugbar is disabled by default in production. Enabling it in production requires an explicit `access` policy.

```ts
const debugbar = createDebugbar({
  enabled: process.env.DEBUGBAR_ENABLED === "true",
  access: (candidate) => {
    const request = candidate as express.Request;
    return request.user?.role === "developer";
  },
});
```

Never enable remote access with `access: () => true`. Authenticate and authorize each request, keep the API behind HTTPS, configure Express proxy trust deliberately, and use an exact CORS origin list only when the React application has a different origin.

Default masked keys include authorization, cookies, passwords, secrets, tokens, API keys, and sessions. Add application-specific keys rather than removing defaults. Uploaded files, binary bodies, query results, and ordinary response bodies are not captured.

## Messages, errors, measurements, and custom data

Inside an instrumented request, use either `request.debugbar` or the context-aware methods on the created debugbar. Calls outside a request are safe no-ops.

```ts
request.debugbar?.warn("Cache miss", { cacheKey: "users" });
debugbar.captureException(error);
request.debugbar?.addData("featureFlags", { checkoutV2: true });
```

Unhandled errors are captured by `debugbar.errorHandler()`, then passed unchanged to the next Express error handler.

## Custom collectors

Collectors have unique names and request-local state. Failures become warnings and never replace the application response.

```ts
import type { Collector } from "@debugbar/core";

const cacheCollector: Collector<{ hits: number }, { hits: number }> = {
  name: "cache",
  createState: () => ({ hits: 0 }),
  onRequest: (_request, state) => {
    state.hits = 1;
  },
  collect: (state) => state,
};
```

Collector output passes through the same sanitization and size limits.

## Database adapters

Register an adapter once during startup. Events outside an active request are ignored. Cleanup restores patched `pg` and `mysql2` query methods.

```ts
const removePg = installDatabaseAdapter(new PgAdapter(pgPool, "primary"));
const removeMysql = installDatabaseAdapter(
  new Mysql2Adapter(mysqlPool, "analytics"),
);
```

The SQLite adapter exposes `exec`, `run`, `get`, and `all`; execute queries through the adapter to collect them. PostgreSQL and MySQL adapters transparently instrument existing callback or Promise `query()` calls. All adapters capture statements, sanitized bindings, duration, connection, and outcome—but never rows.

## Client metrics

Client metrics are opt-in and attach to a matching server record. The endpoint requires its ID in both the URL and `X-Debugbar-ID`, accepts only the versioned schema, and rejects unknown, cross-origin, or oversized payloads.

```tsx
const reporter = createClientMetricsReporter(recordId);
await reporter.reportNavigation();
const stopVitals = installWebVitals(reporter, { enabled: true });

<DebugbarProfiler id="SearchResults" reporter={reporter} enabled>
  <SearchResults />
</DebugbarProfiler>;
```

Web Vitals and Profiler data are deduplicated and bounded. Call `stopVitals()` during cleanup; the profiler component cleans up when unmounted.

## Troubleshooting

- **No toolbar record:** confirm the API response contains `X-Debugbar-ID`, the provider wraps the toolbar, and debugbar middleware precedes routes.
- **Debug API returns 404:** this intentionally represents missing records and denied access. Check the access policy, retention, source address, proxy trust, and CORS origin.
- **Error is not recorded:** mount `debugbar.errorHandler()` before the application's final error handler.
- **SQL is absent:** install the database adapter during startup; for SQLite, execute through the adapter instance.
- **Duplicate records or metrics:** retain and call cleanup functions during hot reload or unmount. Installers are idempotent for repeated listeners.
- **Production startup fails:** an explicitly enabled production debugbar must define an access policy.
- **Request bodies are absent:** body capture is off by default and accepts only JSON or URL-encoded text after the appropriate Express body parser.

## Operational verification

Run `npm run check`, `npm run test:e2e`, and `npm run benchmark`. The benchmark enforces disabled p95 below 0.1 ms and enabled p95 below 2 ms, with a configurable CI tolerance.
