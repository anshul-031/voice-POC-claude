---
description: Perform a UI verification check after every visual or functional change
---

# UI Check Workflow

Use this workflow after any change that affects the user interface —
layout, styling, components, text, or functionality.

## Rules

1. **Always verify visually** — after any UI-related change, open
   the application in a browser and verify the affected pages.

2. **Check responsiveness** — verify the change at multiple viewports:
   - 320px (small mobile)
   - 375px (standard mobile)
   - 640px (tablet)
   - 1024px (desktop)
   - 1920px (full HD)

3. **Check functionality** — interact with all affected elements:
   - Buttons, links, and navigation work correctly.
   - Forms submit and validate properly.
   - Modals, dropdowns, and toasts appear correctly.
   - Animations and transitions are smooth.

4. **Check console** — open browser DevTools and verify no JavaScript
   errors or warnings appear in the console.

5. **Check i18n** — verify all user-facing strings are populated
   correctly from `UI_STRINGS` (no raw keys or missing text).

6. **Final sweep** — even if everything appears to work, perform one
   last visual pass across all affected pages to confirm integrity.

## Steps

1. Start the dev server (`npm run start`).
2. Navigate to all pages affected by the change.
3. Verify layout, functionality, and responsiveness.
4. Check for console errors.
5. Confirm user-facing strings are correct.
6. Perform a final visual sweep.

## Verification

// turbo-all

1. Run the full quality pipeline:
```bash
npm run pr
```
