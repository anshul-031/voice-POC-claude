---
description: Enforce mobile-first responsive design guidelines
---

# Responsiveness Workflow

Use this workflow when adding or modifying any UI layout or styling.

## Rules

1. **Mobile-first** — write base styles for small screens, then add
   `min-width` media queries for larger breakpoints.

2. **Flexible layouts** — use Flexbox or Grid. Avoid fixed widths.
   Prefer relative units (`rem`, `%`, `vw`, `vh`).

3. **Touch targets** — all interactive elements must be at least
   **44×44px** on mobile.

4. **Breakpoints**:
   - Mobile: `< 640px`
   - Tablet: `640px – 1024px`
   - Desktop: `> 1024px`

5. **No overflow** — ensure no horizontal scrollbars or content
   clipping at any viewport width from 320px to 1920px.

## Verification Steps

1. After making CSS/HTML changes, visually verify the layout at:
   - **320px** (small mobile)
   - **375px** (standard mobile)
   - **640px** (tablet breakpoint)
   - **1024px** (desktop breakpoint)
   - **1920px** (full HD desktop)

2. Confirm no horizontal overflow, text truncation, or overlapping
   elements at any of the above sizes.

3. Confirm all buttons, links, and interactive elements meet the
   44×44px minimum touch target on mobile viewports.

// turbo-all

4. Run the full quality pipeline:
```bash
npm run pr
```
