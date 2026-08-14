# Public API Reference

## `@debugbar/core`

- Data types: `JsonPrimitive`, `JsonValue`, `DebugMessage`, `DebugMeasure`, `DebugError`, `DebugRecord`, `DebugRecordSummary`, `ListOptions`, `CollectorRequestInput`, `CollectorResponseInput`, `SanitizationLimits`, `DatabaseQueryEvent`, `ClientMetricCategory`, `ClientMetric`, and `ClientMetricsPayload`.
- Extension contracts: `DebugbarStore`, `Collector`, and `DatabaseAdapter`.
- Configuration: `DebugbarOptions`, `ResolvedDebugbarOptions`, `resolveOptions()`, and `isLoopbackRequest()`.
- IDs: `createDebugId()` and `DEBUG_ID_PATTERN`.
- Sanitization: `sanitize()`, `SanitizeOptions`, `REDACTED`, `DEFAULT_MASKED_KEYS`, and `DEFAULT_LIMITS`.
- Storage: `MemoryStore`, with optional `maxRequests`, `retentionMs`, and test clock.
- Request context: `DebugContext`, `Clock`, `createContext()`, `runWithDebugContext()`, `currentDebugContext()`, `addMessage()`, `startMeasure()`, and `measure()`.
- Databases: `installDatabaseAdapter()` and `DATABASE_STATE`. The state constant is intended for collector integration; applications normally use only the installer.

## `@debugbar/express`

- `createDebugbar(options?)`: creates an isolated middleware, API router, error handler, store, and request-aware helpers.
- `debugbarErrorHandler(debugbar)`: standalone error middleware factory equivalent to the instance error handler.
- `captureException(error, limits?)`: captures an exception in the active request context.
- Types: `Debugbar`, `ExpressDebugbarOptions`, `RequestDebugbar`, and `ClientMetrics`.

The `Debugbar` instance exposes `middleware()`, `router()`, `errorHandler()`, `debug()`, `info()`, `warn()`, `error()`, `startMeasure()`, `measure()`, `addData()`, `captureException()`, resolved `options`, and its `store`.

## `@debugbar/react`

- API: `createDebugbarApi()`, `DebugRecordMissingError`, and `DebugbarApi` (`list`, `get`, and optional `report`).
- Discovery: `installFetchDiscovery()`, `installAxiosDiscovery()`, and `DebugIdListener`.
- State: `DebugbarProvider`, `useDebugbar()`, `DebugbarProviderProps`, `DebugbarContextValue`, and `RecordLoadState`.
- UI: `Debugbar`, `DebugbarProps`, `DebugPanel`, `JsonView`, `PANELS`, and `PanelId`.
- Metrics: `createClientMetricsReporter()` and `ClientMetricsReporter`.
- Profiling: `createReactProfilerAdapter()`, `ReactProfilerAdapter`, and `DebugbarProfiler`.
- Web Vitals: `installWebVitals()`.

Provider options are `endpoint`, custom `api`, `autoDiscover`, and `maxCache`. Context consumers receive `summaries`, `selected`, `select()`, `discover()`, and `refresh()`.

## Database packages

- `@debugbar/better-sqlite3`: `BetterSqlite3Adapter`; re-exports `DatabaseAdapter`, `DatabaseQueryEvent`, and `JsonValue` types.
- `@debugbar/pg`: `PgAdapter` and `PgQueryable`; re-exports database adapter/event types. Peer dependency: `pg >=8 <9`.
- `@debugbar/mysql2`: `Mysql2Adapter` and `MysqlQueryable`; re-exports database adapter/event types. Peer dependency: `mysql2 >=3 <4`.
