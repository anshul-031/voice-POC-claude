---
description: Enforce IP-based rate limiting on all public-facing and auth API endpoints
---

# Rate Limiting Workflow

Use this workflow when adding or modifying public-facing API endpoints,
especially authentication routes.

## Rules

1. **Rate limit all public endpoints** — use a dedicated middleware
   (e.g., `express-rate-limit`) on all public-facing routes.

2. **General API traffic**: limit to **50 requests per minute** per IP.

3. **Sensitive routes**: apply a highly restrictive limit of
   **5 requests per hour** per IP on:
   - `/api/auth/forgot-password`
   - `/api/auth/reset-password`
   - `/api/auth/login` (after 10 failed attempts)
   - `/api/user/account-deletion`

4. **Custom response** — return a `429 Too Many Requests` response
   with a user-friendly message from `UI_STRINGS`.

5. **Logging** — log every rate-limited request with:
   - IP address
   - Attempted endpoint
   - Timestamp
   ```js
   logger.warn('Rate limit exceeded', {
     ip: req.ip,
     endpoint: req.path,
     method: req.method,
   });
   ```

6. **Headers** — include standard rate-limit headers in responses:
   - `X-RateLimit-Limit`
   - `X-RateLimit-Remaining`
   - `X-RateLimit-Reset`

## Steps

1. Identify all public-facing and auth endpoints in the changeset.
2. Ensure rate-limiting middleware is applied.
3. Verify sensitive routes have stricter limits.
4. Confirm rate-limited requests are logged.

## Verification

// turbo-all

1. Run the full quality pipeline:
```bash
npm run pr
```
