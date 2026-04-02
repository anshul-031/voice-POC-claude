---
description: Enforce strictest code quality standards (ESLint, typing, naming, complexity)
---

# Code Quality Standards Workflow

Use this workflow when writing or reviewing any code to ensure it meets
the project's strictest quality bar.

## Checklist

1. **No `any` types** — use explicit interfaces or types from `src/types/`.
2. **Explicit return types** — every function must declare its return type.
3. **No non-null assertions (`!`)** — use optional chaining (`?.`) or explicit checks.
4. **Naming conventions**:
   - `PascalCase` for types/interfaces/classes.
   - `camelCase` for variables, functions, and method names.
   - `UPPER_SNAKE_CASE` for constants.
5. **Max cyclomatic complexity**: 10 per function — refactor if exceeded.
6. **Max file length**: 300 lines — split into modules if exceeded.
7. **Max line length**: 120 characters.
8. **Strict typing** — all backend code must be TypeScript (`.ts`).
9. **Internationalization** — all UI strings must use `UI_STRINGS` from `src/constants/uiStrings.js`.

## Verification

// turbo-all

1. Run the full quality pipeline:
```bash
npm run pr
```

2. If any step fails, fix the issues before proceeding.
