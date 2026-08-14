# Security Policy

## Supported versions

No stable version has been released. Security fixes currently target the latest source revision only.

## Reporting a vulnerability

Do not publish credentials, captured debug records, or exploit details in a public issue. Contact the project maintainers privately and include the affected package/version, configuration, reproduction steps, impact, and any suggested mitigation.

## Deployment requirements

The debugbar is development tooling and is disabled by default in production. If production use is unavoidable, configure explicit authentication and authorization, HTTPS, short retention, strict CORS origins, trusted-proxy behavior, and application-specific masked keys. Never use `access: () => true` for a remotely reachable deployment.

Debug records may contain sensitive operational metadata even after redaction. Treat access to the debug API as privileged access and avoid persisting or exporting records unless the destination has equivalent controls.
