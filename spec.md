# Express + React Debugbar Specification

## 1. Status

- Document type: Product and technical specification
- Version: 1.0
- Target runtime: Node.js 20 or newer
- Target server: Express 5
- Target client: React 18 or newer
- Primary language: TypeScript

Normative terms such as **MUST**, **MUST NOT**, **SHOULD**, and **MAY** indicate requirement strength.

## 2. Purpose

Express + React Debugbar is a development-only diagnostics system inspired by Laravel Debugbar. It collects request-scoped server diagnostics in Express and displays them in an independently mounted React toolbar.

It is not a source-compatible port of Laravel Debugbar. It reproduces the collector model and debugging workflow using Node.js and browser-native mechanisms.

## 3. Goals

The first stable release MUST:

- Capture Express request and response metadata.
- Capture request timing, custom measures, memory deltas, messages, and errors.
- Preserve request isolation under concurrent asynchronous work.
- Store a bounded history of debug records.
- Expose protected endpoints for listing, reading, and clearing records.
- Associate API responses with debug records through response headers.
- Render records in a React toolbar.
- Discover records from `fetch` requests and client-side navigation.
- Provide a documented collector extension API.
- Recursively redact configured secrets before data leaves a collector.
- have negligible behavior changes when disabled.

## 4. Non-goals for Version 1

- Production application monitoring or alerting.
- Distributed tracing storage.
- Editing database or cache data.
- Executing captured queries.
- Capturing full query result sets.
- Supporting non-Express server frameworks.
- Persisting records across restarts by default.
- Replacing browser developer tools or OpenTelemetry backends.

## 5. Users and Use Cases

### 5.1 Backend developer

A backend developer can inspect request inputs, status, duration, memory, messages, errors, and database operations for one request.

### 5.2 Frontend developer

A frontend developer can associate an API response with its server diagnostics without leaving the React application.

### 5.3 Integration author

An integration author can register a collector without modifying the core middleware or React toolbar.

## 6. System Components

```text
@debugbar/core
  Shared types, serialization, sanitization, IDs, and collector contracts

@debugbar/express
  Middleware, AsyncLocalStorage context, store, routes, and server collectors

@debugbar/react
  Provider, network discovery, toolbar shell, and collector panels
```

The repository SHOULD be a package workspace so each component can be built and tested independently.

## 7. Functional Requirements

### FR-1: Enablement

- The server MUST default to disabled when `NODE_ENV` is `production`.
- Explicit production enablement MUST require both `enabled: true` and an access-control function.
- When disabled, debug routes MUST return `404` or not be mounted.
- When disabled, public logging and measurement functions MUST act as safe no-ops.
- The React toolbar SHOULD be loaded through a development-only dynamic import.

### FR-2: Request identity

- Every recorded request MUST receive a unique, URL-safe ID.
- The ID MUST be exposed as `X-Debugbar-ID` on eligible responses.
- A supplied client request ID MUST NOT be trusted as the storage key.
- Debugbar's own routes MUST NOT recursively create debug records.

### FR-3: Request context isolation

- Every request MUST run in a distinct `AsyncLocalStorage` context.
- Context data MUST remain correct across promises, timers, and nested service calls.
- Concurrent requests MUST NOT see each other's messages or measurements.
- Context MUST become unavailable after request completion except through the stored immutable record.

### FR-4: Request lifecycle

- Collection MUST start before downstream middleware.
- Finalization MUST occur exactly once on response `finish` or `close`.
- The final record MUST include method, original URL, route when available, status, start time, duration, and aborted state.
- Collector failures MUST be isolated and MUST NOT fail the application request.

### FR-5: Core collectors

Version 1 MUST include:

| Collector | Required data                                                                        |
| --------- | ------------------------------------------------------------------------------------ |
| Request   | Method, URL, route, params, query, selected headers, optional sanitized body, status |
| Timing    | Total duration and named custom measures                                             |
| Memory    | Start/end RSS and heap usage plus deltas                                             |
| Messages  | Timestamp, level, message, and sanitized context                                     |
| Errors    | Name, message, sanitized stack, cause chain, timestamp                               |

The database collector is required before the first stable release but MAY be delivered after the core collectors. It MUST use an adapter contract and MUST NOT make one ORM a core dependency.

### FR-6: Custom measurements

The API MUST support both callback and manual-stop forms:

```ts
await debugbar.measure("load-users", () => userService.findAll());

const stop = debugbar.startMeasure("render-email");
await renderEmail();
stop();
```

- Calling a stop function more than once MUST NOT create duplicate measures.
- A rejected callback MUST still record its duration and rethrow the original error.

### FR-7: Collector extension contract

Collectors MUST have stable names and return JSON-serializable data.

```ts
export interface Collector<TState = unknown, TOutput = unknown> {
  name: string;
  createState(): TState;
  onRequest?(input: CollectorRequestInput, state: TState): void | Promise<void>;
  onResponse?(
    input: CollectorResponseInput,
    state: TState,
  ): void | Promise<void>;
  collect(state: TState): TOutput | Promise<TOutput>;
}
```

- Duplicate names MUST be rejected during setup.
- A collector's state MUST be request-scoped.
- Collector output MUST pass through global sanitization and size enforcement.
- Unknown collector data MUST remain accessible through a generic JSON panel.

### FR-8: Storage

The default store MUST be an in-memory ring buffer.

```ts
export interface DebugbarStore {
  put(record: DebugRecord): Promise<void>;
  get(id: string): Promise<DebugRecord | undefined>;
  list(options?: ListOptions): Promise<DebugRecordSummary[]>;
  clear(): Promise<void>;
}
```

- Default maximum: 100 records.
- Default retention: 30 minutes.
- Expired records MUST not be returned.
- Insertion beyond capacity MUST evict the oldest record.
- Records returned from the store MUST not expose mutable internal references.
- Store adapters MAY support Redis or files in later releases.

### FR-9: Debug API

Default prefix: `/__debugbar`.

| Method   | Route                 | Behavior                                  |
| -------- | --------------------- | ----------------------------------------- |
| `GET`    | `/requests`           | Return recent summaries, newest first     |
| `GET`    | `/requests/:id`       | Return one full sanitized record or `404` |
| `DELETE` | `/requests`           | Clear stored records and return `204`     |
| `POST`   | `/client-metrics/:id` | Attach bounded, validated browser metrics |

All responses MUST include `Cache-Control: no-store`.

The list route MUST support bounded `limit` and optional `before` parameters. The maximum limit MUST be configurable and MUST default to 100.

### FR-10: Access control

```ts
type AccessControl = (req: express.Request) => boolean | Promise<boolean>;
```

- Access control MUST run for every debug endpoint.
- Unauthorized access SHOULD return `404` to avoid advertising the endpoint.
- The default development policy MUST allow loopback requests only.
- Mutating routes MUST use the same or stronger policy than read routes.
- Cross-origin access MUST be denied unless explicitly configured.

### FR-11: Sanitization

Sanitization MUST occur before storage and again before API serialization as defense in depth.

- Key matching MUST be recursive and case-insensitive.
- Default masked keys MUST include `authorization`, `cookie`, `set-cookie`, `password`, `passwd`, `secret`, `token`, `access_token`, `refresh_token`, `apiKey`, and `session`.
- Masked values MUST be replaced with `[REDACTED]`.
- Circular references MUST not crash collection.
- Unsupported values such as functions, symbols, and large binary buffers MUST be replaced by descriptive placeholders.
- Maximum depth, collection length, string length, and total collector bytes MUST be configurable.
- File uploads and raw binary bodies MUST NOT be captured.

### FR-12: Response metadata

Eligible responses MUST contain:

```http
X-Debugbar-ID: 01J...
Server-Timing: app;dur=42.8
```

- Existing `Server-Timing` values MUST be preserved.
- Debug headers MUST be exposed through CORS only when configured.
- Full records MUST NOT be embedded in headers or ordinary response bodies.

### FR-13: React toolbar

The toolbar MUST:

- Mount independently of application routing.
- Be keyboard accessible.
- Open and close without losing the selected request.
- Show request method, URL, status, and duration in its collapsed state.
- List recent requests and allow selecting one.
- Provide Overview, Timeline, Request, Messages, Errors, and Raw Data panels.
- Show loading, empty, unavailable, and authorization failure states.
- Avoid rendering unsanitized HTML from collected values.
- Work at viewport widths from 320 px upward.

The toolbar SHOULD remember open state, panel, and height locally without storing debug payloads in persistent browser storage.

### FR-14: Network discovery

- The React package MUST provide an opt-in `fetch` instrumenter.
- The instrumenter MUST preserve input arguments, response identity, rejection behavior, and caller-visible stack behavior as closely as practical.
- Installation MUST be idempotent and return a cleanup function.
- It MUST ignore debug API requests.
- Axios support SHOULD be supplied as a separate interceptor helper.
- A request MUST not be added twice when multiple discovery mechanisms observe it.

### FR-15: Browser metrics

The React integration MAY collect navigation timing, Web Vitals, React Profiler measurements, console entries, and failed browser requests.

- Collection MUST be opt-in per category.
- Payloads MUST be schema-validated and size-limited on the server.
- Client metrics MUST never overwrite server collector data.

### FR-16: Database adapter

```ts
export interface DatabaseAdapter {
  install(onQuery: (event: DatabaseQueryEvent) => void): () => void;
}
```

A query event MUST support operation, statement, sanitized parameters, duration, connection name, success, and error summary. Adapters MUST return an uninstall function and MUST avoid duplicate instrumentation.

The first release MUST provide at least one adapter chosen by the consuming application's ORM. Prisma, Sequelize, Knex, and Mongoose are acceptable initial targets.

## 8. Data Model

```ts
export interface DebugRecord {
  schemaVersion: 1;
  id: string;
  startedAt: string;
  durationMs: number;
  request: {
    method: string;
    url: string;
    route?: string;
    status: number;
    aborted: boolean;
  };
  collectors: Record<string, unknown>;
  warnings: Array<{
    source: string;
    message: string;
  }>;
}

export interface DebugRecordSummary {
  id: string;
  startedAt: string;
  method: string;
  url: string;
  status: number;
  durationMs: number;
  errorCount: number;
}
```

All public records MUST include a numeric `schemaVersion`. Breaking data-shape changes require a new schema version.

## 9. Configuration

```ts
export interface DebugbarOptions {
  enabled?: boolean;
  routePrefix?: string;
  access?: AccessControl;
  store?: DebugbarStore;
  collectors?: Collector[];
  maxRequests?: number;
  retentionMs?: number;
  captureBody?: boolean;
  maskedKeys?: string[];
  limits?: {
    maxDepth?: number;
    maxArrayLength?: number;
    maxStringLength?: number;
    maxCollectorBytes?: number;
    maxRecordBytes?: number;
  };
  cors?: {
    origins: string[];
    exposeHeaders?: boolean;
  };
}
```

Invalid configuration MUST fail fast during initialization with actionable error messages.

## 10. Non-functional Requirements

### Performance

- Disabled middleware overhead SHOULD be below 0.1 ms at p95 in the project benchmark.
- Enabled core collection overhead SHOULD be below 2 ms at p95, excluding application and adapter work.
- The toolbar SHOULD load through a separate development chunk.
- List endpoints MUST return summaries rather than full records.

### Reliability

- Debugbar failures MUST not change application status codes or prevent responses.
- Finalization MUST tolerate aborted connections.
- A collector timeout SHOULD produce a warning and allow the record to be stored.

### Compatibility

- Server packages MUST support active Node.js LTS releases beginning with Node 20.
- Express types MUST support Express 5.
- React components MUST work in React Strict Mode.
- Packages SHOULD publish ESM with TypeScript declarations.

### Accessibility

- Interactive controls MUST be keyboard operable.
- Focus MUST move into the expanded panel and return to the toggle on close.
- Tabs MUST use appropriate ARIA roles and selection state.
- Text and controls MUST meet WCAG 2.1 AA contrast targets.
- Reduced-motion preferences MUST be honored.

## 11. Testing Requirements

The repository MUST include:

- Unit tests for IDs, sanitization, limits, context, store, measures, and collectors.
- Express integration tests using real HTTP requests.
- Concurrency tests proving request isolation.
- React component tests for state and accessibility behavior.
- Browser end-to-end tests covering toolbar discovery and record inspection.
- Type tests for exported APIs.
- A disabled/enabled overhead benchmark.
- Security tests for redaction, access control, CORS, and payload limits.

CI MUST run formatting, linting, type checking, unit/integration tests, production builds, and end-to-end tests.

## 12. Definition of Done

Version 1 is complete when:

- All MUST requirements are implemented.
- Every task in `TASKS.md` marked for v1 passes its stated verification.
- There are no known critical or high-severity security issues.
- Server and React packages build from a clean checkout.
- The example Express + React application demonstrates success, error, custom timing, message, and database records.
- Installation, configuration, security, collector authoring, and troubleshooting are documented.
