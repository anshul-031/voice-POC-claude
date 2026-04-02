---
description: Enforce strict client-side performance budgets for JS bundle and CSS size
---

# Performance Budget Workflow

Use this workflow when adding new dependencies, components, or assets
that may affect bundle size.

## Rules

1. **JavaScript bundle budget**: total client-side JS must not exceed
   **250 KB** (minified + gzipped).

2. **Critical CSS budget**: above-the-fold CSS must not exceed
   **50 KB** (minified).

3. **Fail the build** — integrate the budget check into `npm run pr`
   so the pipeline fails if budgets are exceeded.

4. **Tree shaking** — always use ES module imports to enable tree
   shaking. Avoid importing entire libraries:
   ```js
   // Good
   import { debounce } from 'lodash-es';
   // Bad
   import _ from 'lodash';
   ```

5. **Lazy loading** — defer non-critical scripts and components using
   dynamic imports or `loading="lazy"` for images.

6. **Monitor growth** — review bundle size after adding any new
   dependency. Use tools like `bundlephobia` to check package sizes
   before installing.

## Steps

1. Before adding a new dependency, check its bundle size impact.
2. After making changes, run the bundle size check.
3. If budgets are exceeded, optimize imports, remove unused code,
   or split chunks before committing.

## Verification

// turbo-all

1. Check bundle sizes (if a build step exists):
```bash
npm run build 2>&1 | tail -20
```

2. Run the full quality pipeline:
```bash
npm run pr
```
