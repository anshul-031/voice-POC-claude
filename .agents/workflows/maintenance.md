---
description: Enforce gitignore maintenance and UI verification after changes
---

# Maintenance & Verification Workflow

Use this workflow after significant code changes, visual refactors, or
when adding new toolchains/dependencies.

## Gitignore Maintenance

1. **Never commit** large binaries, sensitive `.env` files, or build
   artifacts (`dist/`, `build/`, `node_modules/`).
2. When adding a new toolchain or dependency, check if `.gitignore` needs
   updating:
   ```text
   - New build output directories
   - IDE/editor config files
   - OS-specific files (.DS_Store, Thumbs.db)
   - Credential/secret files
   ```
3. Proactively add ignore rules before committing.

## UI Verification

After implementing visual changes or significant refactors:

1. Start the dev server and open the application in a browser.
2. Verify that the interface renders correctly:
   - All layouts are responsive (check at 320px, 640px, 1024px, 1920px).
   - User-facing strings are populated from `UI_STRINGS` (no raw keys or
     missing text).
   - No console errors in the browser DevTools.
3. Perform a **final UI sweep** — even if everything appears to work, do
   one last visual pass to confirm integrity.

## Verification

// turbo-all

1. Check for files that should be gitignored:
```bash
git status --short
```

2. Run the full quality pipeline:
```bash
npm run pr
```
