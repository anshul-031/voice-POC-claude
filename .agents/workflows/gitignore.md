---
description: Enforce gitignore maintenance — auto-update when adding new toolchains or dependencies
---

# Gitignore Workflow

Use this workflow whenever adding new toolchains, dependencies, build outputs,
or sensitive configuration files to the project.

## Rules

1. **Always exclude** the following from version control:
   - `node_modules/`
   - Build output directories (`dist/`, `build/`, `.next/`, `out/`)
   - Environment files (`.env`, `.env.local`, `.env.*.local`)
   - IDE/editor configs (`.idea/`, `.vscode/settings.json`, `*.swp`)
   - OS files (`.DS_Store`, `Thumbs.db`)
   - Log files (`*.log`, `logs/`)
   - Coverage reports (`coverage/`)
   - Credential/secret files (`*.pem`, `*.key`)

2. **Auto-update `.gitignore`** whenever:
   - A new build tool or bundler is added (e.g., Vite, Webpack, esbuild).
   - A new dependency generates local artifacts (e.g., Prisma client).
   - A new CI/CD tool produces local output.
   - A new IDE or editor is used by the team.

3. **Never commit** large binaries, database dumps, or sensitive secrets.

## Steps

1. Review the changeset for any new toolchains, dependencies, or output directories.
2. Check if `.gitignore` already covers the new entries.
3. If not, add the appropriate patterns to `.gitignore`.
4. Verify with `git status` that ignored files are no longer tracked.

## Verification

// turbo-all

1. Check for unintentionally tracked files:
```bash
git status --short
```

2. Run the full quality pipeline:
```bash
npm run pr
```
