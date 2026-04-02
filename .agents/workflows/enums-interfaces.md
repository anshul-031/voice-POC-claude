---
description: Enforce dedicated enums and interfaces in src/types/ — no inline type definitions
---

# Enums & Interfaces Workflow

Use this workflow when adding or modifying type definitions, enums, or
JSDoc `@typedef` declarations.

## Rules

1. **Dedicated directory** — all enums, interfaces, and JSDoc `@typedef`
   definitions MUST be stored in `src/types/`.

2. **Logical separation**:
   - `src/types/enums.js` — enum-like constant objects (frozen objects with
     known keys).
   - `src/types/interfaces.js` — JSDoc type definitions and TypeScript
     interfaces.

3. **Single entry point** — re-export all types from `src/types/index.js`:
   ```js
   export * from './enums.js';
   export * from './interfaces.js';
   ```

4. **No inline definitions** — NEVER define types or enums inline in
   business logic, route handlers, controllers, or services. Import them
   from `src/types/`.

## Steps

1. Identify any new or changed type/enum definitions in the changeset.
2. Move them to the appropriate file in `src/types/`.
3. Re-export from `src/types/index.js` if not already.
4. Update all imports across the codebase to reference `src/types/`.

## Verification

// turbo-all

1. Search for inline type/enum definitions outside `src/types/`:
```bash
grep -rn "@typedef" src/ --include="*.js" --include="*.ts" | grep -v "src/types/" | grep -v node_modules | grep -v __tests__
```

2. Run the full quality pipeline:
```bash
npm run pr
```
