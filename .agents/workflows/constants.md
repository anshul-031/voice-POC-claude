---
description: Enforce centralized constants management — no hardcoded magic values
---

# Constants Management Workflow

Use this workflow when adding or modifying configuration values, API URLs,
timeouts, port numbers, or any magic strings/numbers.

## Rules

1. **Centralized constants** — all non-user-facing configuration values MUST
   live in `src/constants/index.js` or a specific module under `src/constants/`.

2. **No hardcoded values** — never embed API URLs, port numbers, timeouts,
   retry counts, or magic strings/numbers directly in business logic.

3. **Naming convention** — use `UPPER_SNAKE_CASE` for all constant names:
   ```js
   export const API_TIMEOUT_MS = 30000;
   export const MAX_RETRY_COUNT = 3;
   export const DEFAULT_PORT = 3000;
   ```

4. **Import from constants** — always import values from the constants module:
   ```js
   import { API_TIMEOUT_MS } from '../constants/index.js';
   ```

## Steps

1. Identify any new or changed configuration values in the changeset.
2. Add or move them to the appropriate file under `src/constants/`.
3. Replace inline magic values with imported constants.
4. Update any tests that reference the old hardcoded values.

## Verification

// turbo-all

1. Run the full quality pipeline:
```bash
npm run pr
```
