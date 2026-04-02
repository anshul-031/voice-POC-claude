---
description: Enforce centralized structured logging standards (no console.log)
---

# Logging Standards Workflow

Use this workflow when adding, modifying, or reviewing any logging in the codebase.

## Rules

1. **NEVER use `console.log`, `console.error`, or `console.warn`.**
   Always import and use the centralized logger:
   ```js
   import { logger } from '../utils/logger.js';
   ```

2. **Structured logging** — always pass metadata as the second argument:
   ```js
   logger.info('Agent created', { agentId, name });
   logger.error('Failed to fetch models', { error: err.message });
   ```

3. **Use appropriate log levels**:
   - `logger.error(...)` — unrecoverable failures, exceptions.
   - `logger.warn(...)` — degraded behavior, fallbacks.
   - `logger.info(...)` — significant lifecycle events.
   - `logger.debug(...)` — verbose diagnostic data (dev only).

## Verification

// turbo-all

1. Search for any remaining `console.` calls:
```bash
grep -rn "console\.\(log\|error\|warn\|info\)" src/ public/js/ --include="*.js" --include="*.ts" | grep -v node_modules | grep -v __tests__
```

2. Run the full quality pipeline:
```bash
npm run pr
```
