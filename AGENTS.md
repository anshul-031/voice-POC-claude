# Agent Instructions

## Mandatory Quality Gate

**After every code change, you MUST run `npm run pr` and ensure it passes before considering work complete.**

This runs the full pipeline: `lint → typecheck → test:coverage → build`.

```bash
npm run pr
```

If any step fails, fix the issues immediately before reporting completion.

## Project Overview

This is a Voice Agent Platform built with:
- **Backend**: Node.js + TypeScript + Express + Prisma (PostgreSQL)
- **Frontend**: Vanilla JS (ES Modules) with Zod validation
- **Real-time**: WebSocket signaling server + Gemini Live API

## Key Conventions

1. **Input validation**: All input boundaries use Zod `safeParse`. Schemas live in `src/constants/inputSchemas.ts` (server) and `public/js/constants/inputSchemas.js` (client).
2. **No inline types**: Interfaces in `src/types/interfaces.ts`, enums/constants in `src/types/enums.ts`.
3. **Structured logging**: Use the logger from `src/lib/logger.ts`, never `console.log`.
4. **UI strings**: All user-facing text in `src/constants/uiStrings.ts` (server) and `public/js/constants/uiStrings.js` (client).
5. **Test fixtures**: When modifying interfaces, update all test fixtures in `src/__tests__/` accordingly.
