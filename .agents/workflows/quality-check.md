---
description: Run code quality checks after every change (lint, typecheck, test, build)
---

# Quality Check Workflow

After every code change, run the full quality pipeline to catch regressions.

Mandatory input-validation gate before quality checks:
1. Verify all touched input boundaries use Zod `safeParse` validation.
2. Confirm no inline Zod schemas were added in routes/services/UI handlers.
3. Ensure schemas live in dedicated constants modules under `src/constants/` or `public/js/constants/`.

// turbo-all

1. Run the quality check command:
```bash
npm run pr
```

2. If any step fails, fix the issues before proceeding.

3. If all checks pass, inform the user that the quality gate passed.
