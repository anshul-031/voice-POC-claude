---
description: Enforce detailed structured logging across the entire application
---

# Detailed Logs Workflow

Use this workflow when adding or modifying any functionality to ensure
comprehensive logging coverage.

## Rules

1. **Log every significant action** — add detailed logs for:
   - API request entry and exit (method, path, status, duration).
   - Authentication events (login, logout, token refresh, failures).
   - Database operations (queries, mutations, migrations).
   - External service calls (API calls, WebSocket events).
   - Error handling (full stack traces with context).
   - Business logic milestones (agent creation, call start/end).

2. **Structured metadata** — always include relevant context:
   ```js
   logger.info('API request completed', {
     method: req.method,
     path: req.path,
     statusCode: res.statusCode,
     durationMs: Date.now() - startTime,
     userId: req.user?.id,
   });
   ```

3. **Log levels** — use appropriate levels:
   - `error` — failures, exceptions, unrecoverable errors.
   - `warn` — degraded behavior, fallbacks, deprecations.
   - `info` — lifecycle events, request/response summaries.
   - `debug` — verbose diagnostics, variable dumps (dev only).

4. **Correlation IDs** — include request IDs or correlation IDs in logs
   to trace requests across services.

5. **No sensitive data** — never log passwords, tokens, API keys, or PII.

## Steps

1. Review the changeset for any new endpoints, services, or logic.
2. Add entry/exit logging for each new function or route.
3. Include structured metadata with every log call.
4. Verify log levels are appropriate for each message.

## Verification

// turbo-all

1. Run the full quality pipeline:
```bash
npm run pr
```
