---
description: Maintain env.example file with all required environment variables (no secrets)
---

# env.example Workflow

Use this workflow whenever environment variables are added, removed,
or modified in the application.

## Rules

1. **Always keep `env.example` in sync** — every environment variable
   used in the application must have a corresponding entry in
   `env.example` at the project root.

2. **No secrets** — `env.example` must contain only placeholder values,
   never actual secrets, API keys, or credentials:
   ```env
   DATABASE_URL=postgresql://user:password@localhost:5432/dbname
   GOOGLE_AI_API_KEY=your-api-key-here
   JWT_SECRET=your-jwt-secret-here
   PORT=3000
   ```

3. **Descriptive comments** — group variables by category with comments:
   ```env
   # Database
   DATABASE_URL=postgresql://user:password@localhost:5432/dbname

   # Authentication
   JWT_SECRET=your-jwt-secret-here
   JWT_EXPIRY=24h

   # External APIs
   GOOGLE_AI_API_KEY=your-api-key-here
   ```

4. **Version controlled** — `env.example` must be committed to the repo.
   Actual `.env` files must be gitignored.

## Steps

1. Identify any new or changed environment variables in the changeset.
2. Add or update the corresponding entry in `env.example`.
3. Use placeholder values — never real secrets.
4. Verify `.env` is in `.gitignore` but `env.example` is tracked.

## Verification

// turbo-all

1. Compare env.example against actual usage:
```bash
grep -roh 'process\.env\.\w\+' src/ | sort -u
```

2. Run the full quality pipeline:
```bash
npm run pr
```
