---
description: Enforce dependency vulnerability scanning and block merges on high/critical issues
---

# Dependency Vulnerability Scanning Workflow

Use this workflow when adding, updating, or auditing project dependencies.

## Rules

1. **Scan on every change** — run `npm audit` or use Snyk/Dependabot
   to scan all dependencies for known vulnerabilities.

2. **Fail on high/critical** — the build must fail if any **high** or
   **critical** vulnerabilities are detected.

3. **CI integration** — integrate vulnerability scanning into:
   - The `npm run pr` command.
   - The GitHub Actions CI workflow.

4. **Patch policy**:
   - All high and critical vulnerabilities must be patched immediately.
   - Medium vulnerabilities must be patched within 30 days.
   - If a patch is not available, document an approved mitigation
     strategy in a `SECURITY.md` file before the PR can merge.

5. **Lock file integrity** — always commit `package-lock.json` and
   verify its integrity during CI.

## Steps

1. After adding or updating a dependency, run a vulnerability scan.
2. Review the audit report for high/critical issues.
3. Patch or mitigate any findings before committing.
4. Document mitigations in `SECURITY.md` if a patch is unavailable.

## Verification

// turbo-all

1. Run dependency audit:
```bash
npm audit --audit-level=high
```

2. Run the full quality pipeline:
```bash
npm run pr
```
