# Express + React Debugbar

Development diagnostics for Express servers with a React toolbar. The project is being implemented from [spec.md](./spec.md) and tracked in [task.md](./task.md).

See the [complete setup and security guide](./docs/guide.md) and [public API reference](./docs/api.md).

## Requirements

- Node.js 20 or newer (`.nvmrc` pins the development version)
- npm 10.9.8 (`packageManager` pins the package manager)

## Development

```bash
npm ci
npm run check
```

Use `npm run build`, `npm run typecheck`, or `npm test` for individual checks.

Run the complete example at `http://127.0.0.1:4173`:

```bash
npm run dev --workspace @debugbar/example-basic
```

Install Playwright browsers once, then run the browser workflows:

```bash
npx playwright install chromium firefox
npm run test:e2e
```

Responsive screenshots are written to `test-results/screenshots`.

## SQLite example

The example uses an in-memory `better-sqlite3` database. Click **Load users SQL** or **Load SQL error**, open the debugbar, and select the **Database** panel to inspect the statement, sanitized parameters, duration, connection, and outcome.

The reusable integration is exported by `@debugbar/better-sqlite3`; request-local collection is enabled with `installDatabaseAdapter` from `@debugbar/core`.

PostgreSQL and MySQL clients can be instrumented without changing existing query calls:

```ts
import { installDatabaseAdapter } from "@debugbar/core";
import { PgAdapter } from "@debugbar/pg";
import { Mysql2Adapter } from "@debugbar/mysql2";

const removePostgres = installDatabaseAdapter(new PgAdapter(pgPool, "primary"));
const removeMysql = installDatabaseAdapter(
  new Mysql2Adapter(mysqlPool, "reporting"),
);

// Existing pool.query(...) calls are now captured for the active request.
// Call removePostgres() or removeMysql() to restore the original query method.
```

Both callback and Promise driver APIs are supported. Query results and rows are never included in debug records.

## Opt-in client metrics

Client reporting is disabled unless application code explicitly creates and calls a reporter:

```ts
import { createClientMetricsReporter } from "@debugbar/react";

const reporter = createClientMetricsReporter(debugRecordId);
await reporter.reportNavigation();
```

The ingestion endpoint accepts only the versioned metric schema, requires the matching debug-record ID header, rejects unknown or oversized payloads, and stores client metrics in an isolated collector namespace.

Web Vitals and React profiling are separately opt-in:

```tsx
const reporter = createClientMetricsReporter(debugRecordId);

const stopVitals = installWebVitals(reporter, { enabled: true });

<DebugbarProfiler id="Checkout" reporter={reporter} enabled>
  <Checkout />
</DebugbarProfiler>;

// Stop observers/reporting when the integration is no longer needed.
stopVitals();
```

Measurements are deduplicated and sent in bounded batches. Unmounting `DebugbarProfiler` cleans up its reporter automatically.

## Middleware benchmark

Build the packages and run the reproducible control/disabled/enabled benchmark:

```bash
npm run build
npm run benchmark
```

The report includes Node, operating system, CPU, sample count, and p50/p95/p99 latency and overhead. It enforces the specification budgets of 0.1 ms disabled p95 and 2 ms enabled p95 with a default `1.5` CI variance factor. Use `BENCHMARK_ITERATIONS`, `BENCHMARK_WARMUP`, or `BENCHMARK_TOLERANCE` to configure a designated benchmark environment.

## Release package validation

Build and inspect all package tarballs, then install and type-check them in a temporary clean consumer:

```bash
npm run release:validate
```

The validator rejects leaked source/build-cache files and requires each package to include compiled JavaScript, declarations, a README, a license, and its manifest.

## Compatibility

Declared support is Node.js 20+, Express 5.x, and React 18–19. CI exercises:

| Node | React  | Express |
| ---- | ------ | ------- |
| 20   | 18.3.1 | 5.1.0   |
| 22   | 19.1.1 | 5.1.0   |
| 24   | 19.2.8 | 5.2.1   |

`npm run compatibility` builds packed packages in a clean consumer using `COMPAT_REACT` and `COMPAT_EXPRESS`. `npm run compatibility:unsupported` verifies that React 17 is rejected; CI separately verifies that engine-strict installation rejects Node 18.
