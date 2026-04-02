---
description: Enforce automated Swagger/OpenAPI documentation for all API endpoints
---

# Swagger Documentation Workflow

Use this workflow when adding or modifying any API endpoint.

## Rules

1. **Every API endpoint documented** — all REST API routes must have
   corresponding Swagger/OpenAPI annotations or JSDoc comments.

2. **Required fields** for each endpoint:
   - HTTP method and path.
   - Summary and description.
   - Request parameters (path, query, header, body) with types.
   - Request body schema (referencing Zod schemas where possible).
   - Response schemas for all status codes (200, 400, 401, 404, 500).
   - Authentication requirements.

3. **Auto-generate from code** — use a tool like `swagger-jsdoc` or
   `swagger-autogen` to generate the OpenAPI spec from inline comments.

4. **Serve the docs** — expose the Swagger UI at `/api-docs` in
   development mode.

5. **Keep in sync** — whenever an endpoint changes, update its
   documentation in the same commit.

## Steps

1. Identify any new or changed API endpoints in the changeset.
2. Add or update Swagger annotations/JSDoc comments for each endpoint.
3. Regenerate the OpenAPI spec if using auto-generation.
4. Verify the Swagger UI reflects the changes at `/api-docs`.

## Verification

// turbo-all

1. Run the full quality pipeline:
```bash
npm run pr
```
