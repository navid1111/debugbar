# Express + React Debugbar Delivery Plan

This plan implements [spec.md](./spec.md). Individual executable work items and acceptance tests are in [task.md](./task.md).

## Delivery Strategy

Develop the system as a TypeScript workspace with independently testable core, Express, and React packages plus one example application. Build the secure server data path first, then add the UI and optional integrations.

Each phase has an exit gate. Work from a later phase MUST NOT be considered complete until its dependencies' exit gates pass.

## Phase 0: Repository Foundation

Establish the workspace, package boundaries, shared TypeScript configuration, test framework, linting, formatting, and CI.

Deliverables:

- `@debugbar/core`, `@debugbar/express`, and `@debugbar/react` packages.
- Express + React example application.
- Repeatable build, lint, type-check, unit-test, and end-to-end commands.

Exit gate:

- A clean checkout installs, builds, and tests successfully using documented commands.
- CI executes the same commands.

## Phase 1: Secure Server Core

Implement identifiers, safe serialization, recursive redaction, bounded storage, configuration validation, and request-local context.

Rationale: all later collectors depend on correct isolation and sanitization. These primitives must be proven before real application data is captured.

Exit gate:

- Unit tests cover cyclic data, secrets at arbitrary depth, size boundaries, expiration, eviction, and immutable reads.
- A concurrency test proves that interleaved requests cannot exchange data.

## Phase 2: Express Request Pipeline

Implement middleware lifecycle, core collectors, response headers, error capture, debug routes, and access control.

Exit gate:

- Integration tests exercise the system through a real Express server.
- Responses remain correct when collectors throw.
- Debug endpoints are inaccessible when disabled or unauthorized.
- Finalization occurs once for success, errors, and aborted connections.

## Phase 3: React Toolbar

Implement request discovery, provider state, request history, toolbar shell, core panels, accessibility behavior, and responsive layout.

Exit gate:

- Component tests cover every UI state.
- Automated accessibility checks have no serious violations.
- End-to-end tests select and inspect multiple API requests.
- Fetch behavior remains unchanged after instrumentation and cleanup.

## Phase 4: Database Integration

Implement the generic adapter interface and one adapter matching the example application's chosen data layer. Display operations in a Queries panel.

Exit gate:

- Successful and failed operations are captured with duration.
- Bindings and credentials are redacted.
- Installing an adapter twice does not duplicate records.
- Uninstalling removes hooks.

## Phase 5: Browser Metrics and Polish

Add validated client metrics, React Profiler support, Web Vitals integration, persisted UI preferences, performance benchmarks, and operational documentation.

Exit gate:

- Oversized or invalid client payloads are rejected safely.
- Metrics attach only to the intended record.
- Performance budgets in the specification pass in the benchmark environment.
- Documentation examples are exercised by tests or the example app.

## Phase 6: Release Readiness

Run cross-version checks, package validation, security review, API review, and a clean-install rehearsal.

Exit gate:

- All v1 tasks pass.
- Package contents and exports are verified.
- The example works from packed packages, not workspace source aliases.
- Versioned changelog and migration policy exist.

## Test Layers

| Layer         | Purpose                                    | Expected tool class           |
| ------------- | ------------------------------------------ | ----------------------------- |
| Unit          | Pure utilities, stores, collector behavior | Vitest or equivalent          |
| Integration   | Express middleware and HTTP API            | Supertest or real HTTP client |
| Component     | React state, panels, keyboard behavior     | Testing Library               |
| Accessibility | Roles, focus, labels, contrast regressions | axe plus manual review        |
| End-to-end    | Browser-to-server workflow                 | Playwright                    |
| Type          | Public TypeScript contracts                | `tsc` and compile fixtures    |
| Benchmark     | Disabled and enabled overhead              | Node benchmark script         |

## Risk Management

### Sensitive-data exposure

Mitigation: sanitize before storage and before serialization; enforce safe defaults; test nested, cyclic, and case-varied secret keys.

### Request state leakage

Mitigation: use `AsyncLocalStorage`; prohibit module-global request state; run high-concurrency isolation tests.

### Middleware changing application behavior

Mitigation: isolate collector failures, preserve headers, finalize once, and compare instrumented and uninstrumented response contracts.

### Excessive memory use

Mitigation: bound record count, age, collector bytes, record bytes, strings, arrays, and nesting depth.

### Duplicate browser or database events

Mitigation: idempotent installers, explicit cleanup functions, request-ID deduplication, and Strict Mode tests.

### Framework version drift

Mitigation: test supported Node, Express, and React versions in CI and keep integrations behind adapters.

## Release Sequence

1. `0.1.0`: Server core, Express middleware, core collectors, and debug API.
2. `0.2.0`: React toolbar and Fetch/Axios discovery.
3. `0.3.0`: First database adapter and browser metrics.
4. `1.0.0`: Security review, performance budgets, stable extension APIs, and complete documentation.
