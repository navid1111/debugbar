# Security and Release Review

Review date: 2026-08-14

Release decision: **NO-GO for a stable release**. The implementation and local security checks pass, but hosted CI/matrix evidence and the manual accessibility review remain open. A prerelease may be produced only for controlled development evaluation.

## Scope and assets

Protected assets include request headers and bodies, application errors and stacks, messages, SQL statements and bindings, client metrics, route metadata, and access to record deletion. Trust boundaries exist between the application and middleware, browser and debug API, proxy and Express address resolution, database drivers and adapters, custom collectors and sanitization, and in-memory storage and API serialization.

## Threat model and controls

| Threat                                      | Control                                                                                                             | Verification                                                                  | Residual risk                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Debug tooling exposed in production         | Production defaults to disabled; explicit enablement requires an access policy; denied access returns 404           | Configuration and debug API tests                                             | A permissive application policy can still expose data                                       |
| Authentication bypass through proxy headers | Default policy permits only loopback; forwarded addresses follow explicit Express proxy trust                       | Proxy-trust integration tests                                                 | Incorrect application proxy configuration remains dangerous                                 |
| Cross-origin record theft                   | Origins are denied unless exactly configured; debug headers are exposed only when requested                         | CORS integration tests                                                        | Same-origin XSS inherits the user's debug access                                            |
| Credentials captured in nested data         | Recursive, case-insensitive redaction with secure defaults; records are sanitized again at API output               | Sanitizer, request, SQL, and API serialization tests                          | Secrets embedded in arbitrary free-form strings cannot be reliably identified               |
| Memory exhaustion                           | Record count, retention, depth, array, string, collector, record, SQL-event, metric, and client-cache bounds        | Store, sanitizer, SQL, metrics, and oversized-payload tests                   | Custom stores must enforce equivalent operational limits                                    |
| Debugbar changes application behavior       | Failures are contained; error identity and response contracts are preserved; disabled mode is inert                 | Paired control, collector/store failure, error, streaming, and abort tests    | Driver monkey-patching can conflict with other instrumentation                              |
| Record guessing or enumeration              | Cryptographically random URL-safe IDs; access policy applies to list/get/delete/metrics                             | 100,000-ID uniqueness and API authorization tests                             | Authorized users can intentionally enumerate recent summaries                               |
| Client metrics overwrite server data        | Strict versioned schema and isolated `client` namespace; matching ID header and existing record required            | Schema, namespace, ownership, missing-record, origin, and size tests          | The matching header proves correlation, not user identity; access policy remains mandatory  |
| Stored or reflected script injection        | React renders values as text and bounds displayed structures; no raw HTML injection                                 | Malicious-string component test and axe scan                                  | Browser extensions or application XSS are outside this boundary                             |
| SQL result or credential leakage            | Adapters capture statement metadata and sanitized bindings, never result rows                                       | SQLite/PostgreSQL/MySQL success, failure, masking, and result-exclusion tests | SQL literals may themselves contain sensitive values; parameterized queries are recommended |
| Instrumentation remains after teardown      | Fetch, Axios, database, Web Vitals, and Profiler integrations expose cleanup; repeated installation is deduplicated | Cleanup, idempotency, batching, and Strict Mode tests                         | Applications must invoke cleanup during hot reload or shutdown                              |
| Dependency vulnerabilities                  | Lockfile install and `npm audit --audit-level=high`                                                                 | Audit on 2026-08-14: zero known vulnerabilities at all severities             | New advisories can appear after review                                                      |

## Data lifecycle

- Default storage is process-local memory with 100 records and 30-minute retention.
- List responses contain summaries rather than full records.
- Full records are returned only through authorized debug API requests.
- `DELETE /__debugbar/requests` clears the store under the same access policy.
- Debug payloads are not stored in browser local or session storage; only toolbar preferences are persisted.
- Client metrics are limited to 32 KB per request and 100 retained metric events per record.

## Release evidence

- Formatting, lint, strict TypeScript, 65 unit/integration tests, and production builds pass locally.
- Chromium and Firefox end-to-end workflows pass: 19 browser checks passed and 5 engine-specific screenshot/media checks were intentionally skipped, including denied access, SQL failures, keyboard operation, semantics, reflow, media preferences, and computed contrast.
- Dependency audit reports zero vulnerabilities.
- Disabled p95 middleware overhead is below 0.1 ms and enabled p95 is below 2 ms locally.
- Six package tarballs pass content inspection and clean-consumer type/runtime smoke tests.
- React 18/19 and Express 5 clean-consumer checks pass locally; React 17 is rejected.

## Remaining gates

1. Configure a Git remote and commit the currently untracked project so hosted CI can run checks, browser engines, benchmark, tarball validation, Node 20/22/24 compatibility, and unsupported-version jobs.
2. Complete and record the manual screen-reader, forced-colors, contrast, zoom, and reduced-motion checklist in `ACCESSIBILITY.md`.
3. Confirm the public API and schema version as stable after review.

The release decision changes to GO only after these gates pass and T003, T035, T052, T060, T061, and T062 can all be marked done.
