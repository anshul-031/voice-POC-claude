---
description: Enforce structured centralized logging with file-system persistence and auto-purging
---

# Logs Storage Workflow

Use this workflow when configuring or modifying the application's logging
infrastructure.

## Rules

1. **Centralized logger** — all log output must flow through the
   centralized logger from `src/utils/logger.js`. Never use `console.*`.

2. **File-system persistence** — when running locally, all logs must be
   written to the file system under a `logs/` directory:
   - `logs/app.log` — general application logs.
   - `logs/error.log` — error-level logs only.
   - `logs/combined.log` — all log levels combined.

3. **Structured format** — logs must be JSON-structured for
   searchability:
   ```json
   { "timestamp": "...", "level": "info", "message": "...", "meta": {} }
   ```

4. **Auto-purging** — configure log rotation to:
   - Rotate files when they exceed **10 MB**.
   - Retain logs for a maximum of **14 days**.
   - Compress rotated logs (`.gz`).

5. **Gitignore** — ensure `logs/` is in `.gitignore`.

6. **No sensitive data** — never log passwords, tokens, API keys,
   or PII in plain text.

## Steps

1. Verify the logger writes to both console (development) and files.
2. Confirm log rotation and purging settings.
3. Ensure `logs/` is gitignored.
4. Verify no sensitive data is logged.

## Verification

// turbo-all

1. Check that logs directory is gitignored:
```bash
grep -q "logs/" .gitignore && echo "OK: logs/ is gitignored" || echo "MISSING: add logs/ to .gitignore"
```

2. Run the full quality pipeline:
```bash
npm run pr
```
