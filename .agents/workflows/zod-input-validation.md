---
description: Enforce strict Zod input validation at every input boundary
---

# Zod Input Validation Workflow

Use this workflow whenever a change touches user or system input.

// turbo-all

1. Identify all impacted input boundaries:
```text
- frontend forms
- API route params/query/headers/body
- WebSocket inbound payloads
- controller/service entry payloads
```

2. Ensure every boundary validates payloads with Zod `safeParse`.

3. Ensure schemas are not inline and are defined only in constants modules:
```text
- backend: src/constants/
- frontend: public/js/constants/
```

4. Reuse existing schema constants where possible and avoid duplicate contract definitions.

5. Map validation failures to `UI_STRINGS` messages and return consistent user-facing errors.

6. Run quality checks:
```bash
npm run pr
```
