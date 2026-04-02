---
description: Enforce 90% per-file unit test coverage across all parameters (lines, statements, branches, functions)
---

# Unit Test Coverage Workflow

Use this workflow after every code change to ensure all files maintain
at least 90% unit test coverage.

## Rules

1. **90% threshold per file** — every source file must individually meet
   90% coverage across **all four parameters**:
   - Lines
   - Statements
   - Branches
   - Functions

2. **No file skipped** — do not exclude any source file from coverage.
   If a file is untestable, refactor it for testability.

3. **Global timeout** — all unit tests must have a global timeout
   configured (e.g., `testTimeout: 10000` in Vitest config) to prevent
   hanging tests.

4. **Test co-location** — place test files in `__tests__/` directories
   adjacent to the source:
   - Backend: `src/__tests__/`
   - Frontend: `public/js/__tests__/`

5. **Assert against constants** — use `UI_STRINGS` and other constants
   in assertions, not hardcoded strings.

6. **Coverage on every change** — after any code modification, verify
   that coverage has not dropped below the threshold.

## Steps

1. Identify all files modified in the changeset.
2. Ensure each modified file has a corresponding test file.
3. Add or update tests to cover new/changed code paths.
4. Verify all branches, edge cases, and error paths are exercised.

## Verification

// turbo-all

1. Run tests with coverage:
```bash
npx vitest run --coverage
```

2. Verify per-file coverage meets 90% — if any file is below threshold,
   the command will fail with an error.

3. Run the full quality pipeline:
```bash
npm run pr
```
