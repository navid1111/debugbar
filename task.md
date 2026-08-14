# Express + React Debugbar Tasks

This backlog implements [spec.md](./spec.md) according to [plan.md](./plan.md). Tasks are ordered by dependency. Every task includes observable acceptance criteria and a verification procedure.

Status values: `todo`, `in progress`, `blocked`, `done`.

## Phase 0 — Foundation

### T001 — Initialize the TypeScript workspace

- Status: `done`
- Depends on: none
- Deliverable: workspace root plus `packages/core`, `packages/express`, `packages/react`, and `examples/basic`.
- Acceptance criteria:
  - Each package has an explicit name, exports, build script, and TypeScript configuration.
  - Packages do not import private source paths from sibling packages.
  - Node and package-manager versions are documented and pinned.
- Verification:
  - Run the clean install command documented in the README.
  - Run the workspace build command.
  - Assert that each package emits JavaScript and declaration files.

### T002 — Configure quality and test tooling

- Status: `done`
- Depends on: T001
- Deliverable: formatter, linter, unit test runner, React test environment, and coverage configuration.
- Acceptance criteria:
  - One command runs formatting checks, lint, type checking, and unit tests.
  - Deliberate lint and type errors cause non-zero exits.
  - Coverage reports exclude generated files and examples.
- Verification:
  - Run `format:check`, `lint`, `typecheck`, and `test` scripts independently.
  - Run the aggregate `check` command.

### T003 — Add continuous integration

- Status: `in progress`
- Depends on: T002
- Deliverable: CI workflow for install, checks, build, and end-to-end tests.
- Acceptance criteria:
  - CI runs on pull requests and the default branch.
  - Dependency caching does not bypass lockfile validation.
  - Test artifacts are retained when end-to-end tests fail.
- Verification:
  - Validate workflow syntax locally or with the hosting provider.
  - Open a test branch and confirm all jobs pass.

## Phase 1 — Secure Core

### T010 — Define public types and versioned record schema

- Status: `done`
- Depends on: T001
- Deliverable: exported types for configuration, records, summaries, collectors, stores, messages, measures, and errors.
- Acceptance criteria:
  - `DebugRecord.schemaVersion` is required and equals `1`.
  - A consumer fixture compiles using only package exports.
  - A breaking-shape fixture fails type checking with `@ts-expect-error` assertions.
- Verification:
  - Run package type checking.
  - Compile positive and negative API fixtures.

### T011 — Implement secure ID generation

- Status: `done`
- Depends on: T010
- Deliverable: cryptographically strong, URL-safe request IDs.
- Acceptance criteria:
  - IDs match the documented character and length constraints.
  - 100,000 generated IDs contain no duplicates in the test run.
  - IDs do not encode request data or sequential counters.
- Verification:
  - Run ID unit and uniqueness tests.

### T012 — Implement recursive sanitization

- Status: `done`
- Depends on: T010
- Deliverable: configurable serializer/redactor used by all collectors.
- Acceptance criteria:
  - Matching is recursive and case-insensitive.
  - Objects, arrays, maps, sets, errors, dates, bigints, buffers, and circular references do not crash serialization.
  - Depth, array length, string length, collector bytes, and record bytes are bounded.
  - Masked values are exactly `[REDACTED]`.
- Verification:
  - Run parameterized tests for every supported value type.
  - Run nested and case-varied secret fixtures.
  - Run fuzz/property tests over cyclic and oversized inputs.

### T013 — Implement and test configuration validation

- Status: `done`
- Depends on: T010
- Deliverable: defaults and fail-fast validation.
- Acceptance criteria:
  - Invalid prefixes, negative limits, duplicate collector names, and unsafe production settings fail at startup.
  - Default production configuration is disabled.
  - Default development access is loopback-only.
- Verification:
  - Run a table-driven valid/invalid configuration test suite.

### T014 — Implement the in-memory bounded store

- Status: `done`
- Depends on: T010, T012
- Deliverable: `DebugbarStore` ring-buffer implementation.
- Acceptance criteria:
  - Records are listed newest first.
  - Capacity overflow evicts the oldest record.
  - Expired records cannot be read or listed.
  - Returned values cannot mutate stored records.
  - `clear()` removes all records.
- Verification:
  - Run store tests with a fake clock.
  - Run mutation-isolation tests on input and returned objects.

### T015 — Implement request-local context

- Status: `done`
- Depends on: T010, T011
- Deliverable: `AsyncLocalStorage` context and context-aware public helpers.
- Acceptance criteria:
  - Context survives promises, timers, and nested functions.
  - Helpers outside a request are safe no-ops.
  - At least 100 interleaved requests retain only their own messages and measures.
- Verification:
  - Run async propagation unit tests.
  - Run the concurrency isolation stress test repeatedly.

### T016 — Implement custom measures

- Status: `done`
- Depends on: T015
- Deliverable: callback and manual-stop measurement APIs.
- Acceptance criteria:
  - Sync and async callbacks record durations and preserve return values.
  - Rejected callbacks record durations and rethrow the same error.
  - Repeated `stop()` calls record only one measure.
- Verification:
  - Run measure tests with a fake high-resolution clock.

## Phase 2 — Express Pipeline

### T020 — Implement Express lifecycle middleware

- Status: `done`
- Depends on: T012–T016
- Deliverable: request initialization, collector execution, and once-only finalization.
- Acceptance criteria:
  - Successful, failed, streamed, and aborted responses finalize at most once.
  - Debugbar routes are excluded from recording.
  - A collector exception adds a warning without changing the application response.
- Verification:
  - Run Supertest integration tests for success and errors.
  - Run real HTTP tests for streaming and client aborts.
  - Assert one stored record per application request.

### T021 — Implement Request collector

- Status: `done`
- Depends on: T020
- Deliverable: sanitized request and response metadata.
- Acceptance criteria:
  - Method, original URL, matched route, params, query, status, and selected headers are correct.
  - Body capture follows configuration and content type.
  - Credentials and upload/binary data are never stored in clear text.
- Verification:
  - Run integration tests for JSON, form, multipart, binary, and missing-body requests.
  - Assert all configured secrets are redacted.

### T022 — Implement Timing and Memory collectors

- Status: `done`
- Depends on: T016, T020
- Deliverable: total duration, measures, memory snapshots, and deltas.
- Acceptance criteria:
  - Durations are non-negative and use monotonic timing.
  - Memory contains start, end, and delta values.
  - Custom measures appear only on their originating request.
- Verification:
  - Run deterministic clock tests and concurrent integration tests.

### T023 — Implement Messages collector and logger API

- Status: `done`
- Depends on: T015, T020
- Deliverable: `debug`, `info`, `warn`, and `error` methods with context.
- Acceptance criteria:
  - Levels, timestamps, messages, and structured contexts are retained.
  - Context values pass through sanitization and limits.
  - Calls outside a request do not throw.
- Verification:
  - Run level, ordering, sanitization, and no-context tests.

### T024 — Implement Errors collector and middleware

- Status: `done`
- Depends on: T020
- Deliverable: exception capture without replacing the application's error handler.
- Acceptance criteria:
  - Name, message, sanitized stack, timestamp, and bounded cause chain are recorded.
  - The original error is passed to the next error middleware unchanged.
  - Ordinary response bodies do not receive debug stacks.
- Verification:
  - Run integration tests with thrown primitives, `Error`, causes, and circular custom fields.
  - Assert application status and response body match an uninstrumented control app.

### T025 — Implement response headers

- Status: `done`
- Depends on: T020, T022
- Deliverable: `X-Debugbar-ID` and `Server-Timing` headers.
- Acceptance criteria:
  - Eligible responses include a valid stored record ID.
  - Existing `Server-Timing` entries are preserved.
  - Debugbar endpoints and disabled middleware emit no debug ID.
- Verification:
  - Run HTTP header integration tests, including pre-existing headers.

### T026 — Implement debug API access control

- Status: `done`
- Depends on: T013, T020
- Deliverable: async-capable access policy applied to every debug endpoint.
- Acceptance criteria:
  - Loopback is allowed by the development default.
  - Non-loopback, denied, and throwing policies return `404` without leaking records.
  - A forwarded address is trusted only when Express proxy trust is explicitly configured.
- Verification:
  - Run endpoint tests across allowed/denied IP and policy cases.

### T027 — Implement debug API routes

- Status: `done`
- Depends on: T014, T026
- Deliverable: list, get, clear, and client-metrics routes.
- Acceptance criteria:
  - List results are newest first and respect bounds.
  - Missing/expired IDs return `404`.
  - Clear returns `204` and removes all records.
  - All responses use `Cache-Control: no-store`.
  - API serialization performs a second sanitization pass.
- Verification:
  - Run route contract tests for status, headers, schemas, pagination, and authorization.

### T028 — Verify disabled mode and failure containment

- Status: `done`
- Depends on: T020–T027
- Deliverable: regression suite for transparent behavior.
- Acceptance criteria:
  - Disabled mode stores nothing, adds no headers, and mounts no accessible routes.
  - Collector, store, and sanitization failures do not prevent application responses.
  - Application response status, body, and non-debug headers match a control server.
- Verification:
  - Run paired control/instrumented contract tests with injected failures.

## Phase 3 — React Toolbar

### T030 — Implement the React provider and request cache

- Status: `done`
- Depends on: T010, T027
- Deliverable: provider, hooks, bounded client cache, and API client.
- Acceptance criteria:
  - Records have loading, ready, missing, and error states.
  - Concurrent selection cannot display a stale response.
  - Debug payloads are not stored in `localStorage` or `sessionStorage`.
- Verification:
  - Run component/hook tests using delayed and reordered mocked responses.

### T031 — Implement Fetch discovery

- Status: `done`
- Depends on: T030
- Deliverable: opt-in, idempotent Fetch instrumenter with cleanup.
- Acceptance criteria:
  - Arguments, returned response object, body usability, and thrown errors are preserved.
  - Debug API calls are ignored.
  - Duplicate installation creates only one observation.
  - Cleanup restores the original function.
- Verification:
  - Run browser-like unit tests for success, rejection, streaming body, repeated install, and cleanup.

### T032 — Implement Axios discovery helper

- Status: `done`
- Depends on: T030
- Deliverable: optional interceptor installer and eject function.
- Acceptance criteria:
  - Both success and error responses can yield IDs.
  - Ejection removes interceptors.
  - Deduplication prevents a Fetch-observed request from appearing twice.
- Verification:
  - Run tests with an Axios-compatible mock adapter and combined Fetch discovery.

### T033 — Build the toolbar shell

- Status: `done`
- Depends on: T030
- Deliverable: collapsed summary, expandable panel, resize behavior, and request selector.
- Acceptance criteria:
  - Collapsed state shows method, URL, status, and duration.
  - Open state and height persist as preferences only.
  - Layout works at 320, 768, and 1440 pixel widths.
  - React Strict Mode does not duplicate listeners or requests.
- Verification:
  - Run responsive component tests and Strict Mode lifecycle tests.
  - Capture end-to-end screenshots at the three target widths.

### T034 — Build core panels

- Status: `done`
- Depends on: T033
- Deliverable: Overview, Timeline, Request, Messages, Errors, and Raw Data panels.
- Acceptance criteria:
  - Each panel handles absent and partial collector data.
  - Unknown collectors remain visible in Raw Data.
  - Values are rendered as text, never injected as HTML.
  - Large collections are truncated or virtualized without freezing the UI.
- Verification:
  - Run component tests with complete, partial, unknown, malicious-string, and oversized fixtures.

### T035 — Complete toolbar accessibility

- Status: `in progress`
- Depends on: T033, T034
- Deliverable: keyboard navigation, focus management, ARIA semantics, reduced motion, and contrast-compliant theme.
- Acceptance criteria:
  - Toggle, resize controls, request selector, tabs, and close action are keyboard operable.
  - Focus enters the toolbar when opened and returns to the toggle when closed.
  - Tabs expose correct roles and selection state.
  - Automated scans report no serious or critical violations.
- Verification:
  - Run Testing Library keyboard/focus tests and axe scans.
  - Complete the documented manual contrast and screen-reader checklist.

### T036 — Add browser end-to-end workflow

- Status: `done`
- Depends on: T031, T033–T035
- Deliverable: Playwright tests against the example application.
- Acceptance criteria:
  - A user triggers two API calls, selects each record, and sees the matching URL and messages.
  - A failed API request displays its server error record.
  - Reloading or navigating the React app does not break discovery.
  - Unauthorized debug access shows a safe unavailable state.
- Verification:
  - Run the end-to-end suite in Chromium.
  - Run at least one additional browser engine in CI.

## Phase 4 — Database

### T040 — Define the database adapter contract

- Status: `done`
- Depends on: T010, T015
- Deliverable: adapter API and normalized query-event schema.
- Acceptance criteria:
  - Install returns a cleanup function.
  - Events outside a request are ignored or handled by documented policy.
  - Statement, parameters, duration, connection, success, and error are representable.
- Verification:
  - Compile a fake third-party adapter against public exports.
  - Run normalization and cleanup contract tests.

### T041 — Implement the first database adapter

- Status: `done`
- Depends on: T040
- Deliverable: adapter for the ORM selected by the example app.
- Acceptance criteria:
  - Successful and failed operations are recorded once.
  - Parameter secrets are redacted and result rows are not captured.
  - Repeated installation does not duplicate events.
  - Cleanup removes instrumentation.
- Verification:
  - Run integration tests against a disposable test database.
  - Assert event count, duration, failure data, masking, and cleanup.

### T042 — Build the database panel

- Status: `done`
- Depends on: T034, T041
- Deliverable: query/operation list with duration, status, connection, and formatted details.
- Acceptance criteria:
  - Failed and slow operations are visually identifiable without color alone.
  - Long statements are expandable and safely rendered.
  - Empty and unsupported-adapter states are clear.
- Verification:
  - Run component tests and accessibility scans with success, slow, failed, and long-query fixtures.

### T043 — Implement the PostgreSQL adapter

- Status: `done`
- Depends on: T040
- Deliverable: transparent `pg` client/pool instrumentation.
- Acceptance criteria:
  - Promise and callback queries preserve their values and errors.
  - Statements, sanitized parameters, duration, connection, and outcome are captured without result rows.
  - Duplicate installation does not duplicate events and cleanup restores the original query method.
- Verification:
  - Compile against the public `pg` Pool type.
  - Run promise, callback, failure, deduplication, cleanup, and result-exclusion tests.

### T044 — Implement the MySQL adapter

- Status: `done`
- Depends on: T040
- Deliverable: transparent `mysql2` connection/pool instrumentation.
- Acceptance criteria:
  - Promise and callback queries preserve their values and errors.
  - Statements, sanitized parameters, duration, connection, and outcome are captured without result rows.
  - Duplicate installation does not duplicate events and cleanup restores the original query method.
- Verification:
  - Compile against the public `mysql2` Pool type.
  - Run promise, callback, failure, deduplication, cleanup, and result-exclusion tests.

## Phase 5 — Metrics, Performance, and Documentation

### T050 — Implement client metrics ingestion

- Status: `done`
- Depends on: T027, T030
- Deliverable: validated endpoint and opt-in browser metric reporters.
- Acceptance criteria:
  - Metrics attach only to an existing matching record.
  - Invalid, unknown, cross-origin, and oversized payloads are rejected.
  - Client data cannot overwrite server collector namespaces.
- Verification:
  - Run schema, authorization, size, ownership, and namespace-conflict tests.

### T051 — Add React Profiler and Web Vitals adapters

- Status: `done`
- Depends on: T050
- Deliverable: opt-in adapters with cleanup.
- Acceptance criteria:
  - Adapters collect only when enabled.
  - Strict Mode behavior is documented and does not cause unbounded duplicates.
  - Cleanup stops all reporting.
- Verification:
  - Run component tests for opt-in, deduplication, batching, and cleanup.

### T052 — Add performance benchmarks

- Status: `in progress`
- Depends on: T028
- Deliverable: reproducible disabled/enabled middleware benchmark.
- Acceptance criteria:
  - Reports p50, p95, and p99 overhead with environment metadata.
  - Compares control, disabled, and enabled servers.
  - Fails only against an agreed tolerance suitable for CI variance.
- Verification:
  - Run the benchmark locally and in the designated CI environment.
  - Confirm the budgets in SPEC section 10 or document an approved revision.

### T053 — Write user and extension documentation

- Status: `done`
- Depends on: T028, T036, T042
- Deliverable: installation, configuration, security, collector authoring, ORM setup, troubleshooting, and API reference.
- Acceptance criteria:
  - Every public option and export is documented.
  - Copyable setup examples compile.
  - Security warnings appear before any remote-enable instructions.
- Verification:
  - Type-check extracted code examples.
  - Follow the guide in a clean example project and run its smoke test.

## Phase 6 — Release

### T060 — Validate packages from tarballs

- Status: `in progress`
- Depends on: T003, T053
- Deliverable: package-content checks and packed-package example installation.
- Acceptance criteria:
  - Tarballs contain only intended build output, declarations, README, and license files.
  - No package depends on workspace-only source aliases.
  - A clean consumer builds and runs using packed tarballs.
- Verification:
  - Run package dry-run/pack inspection.
  - Install tarballs into a temporary consumer and run build plus smoke tests.

### T061 — Run compatibility matrix

- Status: `in progress`
- Depends on: T060
- Deliverable: supported Node, React, and Express matrix in CI.
- Acceptance criteria:
  - All declared version combinations build and pass relevant tests.
  - Unsupported versions fail with documented engine or peer-dependency messages.
- Verification:
  - Run the matrix workflow and retain its report.

### T062 — Complete security and release review

- Status: `in progress`
- Depends on: T012, T026–T028, T050, T061
- Deliverable: threat-model checklist, dependency audit, changelog, and release decision.
- Acceptance criteria:
  - No known critical or high-severity vulnerabilities remain without an explicit exception.
  - Redaction, access, CORS, retention, and disabled-mode tests pass.
  - Public APIs and schema version are approved as stable.
  - All v1 tasks are `done` with linked evidence.
- Verification:
  - Run the complete clean-checkout CI suite and dependency audit.
  - Perform the manual threat-model review and record findings.

## Task Completion Rule

A task can move to `done` only when its deliverable exists, every acceptance criterion is met, and its verification steps pass in the intended environment. Partial implementation or passing unit tests alone is insufficient when integration, browser, accessibility, benchmark, or manual checks are specified.
