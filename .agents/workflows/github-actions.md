---
description: Enforce GitHub Actions CI/CD workflow for quality checks on every push and PR
---

# GitHub Actions Workflow

Use this workflow when setting up or modifying CI/CD pipelines.

## Rules

1. **Trigger on every push and PR** — the workflow must run on:
   - Every push to `main`, `develop`, and feature branches.
   - Every pull request targeting `main` or `develop`.

2. **Quality gates** — the workflow must check:
   - **Linting**: `npm run lint` (ESLint with strictest config).
   - **Typechecking**: `npx tsc --noEmit`.
   - **Unit tests**: `npx vitest run --coverage` (90% threshold).
   - **Build**: `npm run build` (ensure production build succeeds).
   - **Dependency audit**: `npm audit --audit-level=high`.

3. **Fail fast** — if any quality gate fails, the entire workflow must
   fail and block the merge.

4. **Cache dependencies** — cache `node_modules` using
   `actions/cache` to speed up CI runs.

5. **Environment** — use a consistent Node.js version matrix
   (e.g., Node 18.x, 20.x).

## Workflow file location

```
.github/workflows/ci.yml
```

## Steps

1. Verify `.github/workflows/ci.yml` exists and is up to date.
2. Ensure all quality gates are included.
3. Confirm the workflow triggers on the correct events.
4. Test by pushing a branch and verifying the CI run.

## Verification

// turbo-all

1. Validate the workflow YAML syntax:
```bash
cat .github/workflows/ci.yml | head -5 && echo "ci.yml exists"
```

2. Run the full quality pipeline locally:
```bash
npm run pr
```
