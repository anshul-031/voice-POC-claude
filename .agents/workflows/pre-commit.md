---
description: Enforce pre-commit checks — lint, typecheck, test, and format before every commit
---

# Pre-Commit Checks Workflow

Use this workflow to ensure all quality gates pass before any commit
reaches the repository.

## Rules

1. **Pre-commit hook** — use a tool like `husky` + `lint-staged` to
   run checks automatically before every `git commit`.

2. **Checks to run on staged files**:
   - **ESLint**: lint all staged `.js`, `.ts`, `.jsx`, `.tsx` files.
   - **Prettier/formatting**: auto-format staged files.
   - **TypeScript**: run `tsc --noEmit` on the full project.
   - **Unit tests**: run related tests for changed files.

3. **Block commit on failure** — if any check fails, the commit must
   be rejected until the issues are fixed.

4. **Configuration files**:
   - `.husky/pre-commit` — the hook script.
   - `lint-staged` config in `package.json` or `.lintstagedrc`.

5. **Example lint-staged config**:
   ```json
   {
     "*.{js,ts,jsx,tsx}": [
       "eslint --fix",
       "prettier --write"
     ]
   }
   ```

## Setup Steps

1. Install husky and lint-staged:
   ```bash
   npm install --save-dev husky lint-staged
   npx husky init
   ```

2. Add the pre-commit hook:
   ```bash
   echo "npx lint-staged" > .husky/pre-commit
   ```

3. Configure lint-staged in `package.json`.

## Verification

// turbo-all

1. Verify husky is configured:
```bash
test -f .husky/pre-commit && echo "OK: pre-commit hook exists" || echo "MISSING: .husky/pre-commit"
```

2. Run the full quality pipeline:
```bash
npm run pr
```
