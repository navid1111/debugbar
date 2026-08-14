# Changelog

All notable changes are documented here. The project follows Semantic Versioning after its first stable release.

## Unreleased

### Added

- Secure request-local core with bounded storage, recursive redaction, messages, errors, and custom measures.
- Express middleware, response headers, authorized debug API, client-metrics ingestion, and transparent failure handling.
- Accessible React toolbar with Fetch/Axios discovery, core panels, request cache, Web Vitals, and React Profiler support.
- SQLite, PostgreSQL, and MySQL query adapters with sanitized bindings and no result-row capture.
- Chromium and Firefox workflows, responsive screenshots, middleware benchmarks, compatibility matrix, documentation fixtures, and clean-consumer tarball validation.

### Security

- Production is disabled by default and requires an explicit access policy when enabled.
- Debug API access, CORS, retention, serialization limits, metric ownership, and default secret masking are enforced and tested.

### Known release gates

- Hosted CI and compatibility evidence is pending.
- Manual assistive-technology and contrast review is pending.
