---
description: Prohibit direct DOM manipulation — use declarative state-driven UI patterns only
---

# DOM Manipulation Workflow

Use this workflow when writing or reviewing any UI code to ensure
the virtual DOM / declarative rendering remains the single source of truth.

## Rules

1. **No direct DOM manipulation** — never use vanilla JS DOM APIs
   in application code:
   ```js
   // PROHIBITED
   document.getElementById('foo').innerHTML = '...';
   document.querySelector('.bar').style.display = 'none';
   element.classList.add('active');
   element.setAttribute('disabled', 'true');
   ```

2. **State-driven UI** — all UI updates must flow through state
   management or declarative rendering:
   ```js
   // For vanilla JS modules: use a render function driven by state
   function render(state) {
     container.innerHTML = buildTemplate(state);
   }
   ```

3. **Refs for third-party integration** — if direct DOM access is
   absolutely necessary (e.g., for a third-party library like a
   canvas or audio element), use refs and document the reason:
   ```js
   // ALLOWED: third-party integration with documented reason
   const canvas = canvasRef; // Required for WebGL context
   ```

4. **No jQuery** — jQuery is prohibited across the entire codebase.

5. **Event delegation** — prefer delegated event listeners on parent
   containers over individual element listeners added via DOM APIs.

## Steps

1. Review the changeset for any direct DOM manipulation calls.
2. Refactor to use state-driven rendering or ref-based access.
3. Document any necessary exceptions with a clear justification.

## Verification

// turbo-all

1. Search for direct DOM manipulation patterns:
```bash
grep -rn "document\.getElementById\|document\.querySelector\|\.innerHTML\s*=" public/js/ src/ --include="*.js" --include="*.ts" | grep -v __tests__ | grep -v node_modules | head -20
```

2. Run the full quality pipeline:
```bash
npm run pr
```
