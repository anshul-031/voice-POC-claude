To maintain high code quality and consistency across the VoiceForge platform, please follow these rules:

## 0. Strictest Code Quality Standards
- **ESLint Strictness**: The project reflects the strictest ESLint settings. Always ensure:
    - No `any` types: Use interfaces/types.
    - Explicit Return Types: On all functions.
    - No Non-Null Assertions: use `?.` or checks.
    - Naming: PascalCase for types, camelCase for variables/functions.
    - Max Complexity: 10 per function.
    - Max Lines: 300 per file.
    - Max Length: 120 chars.
- **Strict Typing**: Backend code MUST be in TypeScript (`.ts`).
- **Internationalization (i18n)**: All UI strings must be in `UI_STRINGS` from `src/constants/uiStrings.js`.

## 1. Quality Check Rule
After every change to the codebase, the following command MUST be run to ensure no regressions:

```bash
npm run pr
```

This command performs:
- **Linting**: ESLint checks.
- **Typechecking**: TypeScript (`tsc`) validation.
- **Testing**: Vitest with coverage (90% threshold).
- **Database**: Prisma migration deployment.

## 2. Logging Standards
- **Centralized Logger Only**: NEVER use `console.log/error/warn`. Use the logger from `src/utils/logger.js`.
- **Structured Logging**: Provide metadata as the second argument: `logger.info('msg', { key: value });`.
- **Log Levels**: Use `error`, `warn`, `info`, or `debug` appropriately.

## 3. Internationalization (i18n)
- **No Hardcoded Strings**: DO NOT hardcode user-facing literal strings, prompts, labels, or error messages.
- **Centralized UI_STRINGS**: Use the `UI_STRINGS` object from `src/constants/uiStrings.js`.
- **Template Placeholders**: Use functions in `UI_STRINGS` for runtime substitution: `UI_STRINGS.toasts.callStarted(agentName)`.
- **Tests**: Assert against these constants instead of hardcoded strings.

## 4. Responsiveness Guidelines
Ensure full responsiveness across web and mobile platforms:
- **Mobile-First**: Base styles for small screens, media queries for larger displays.
- **Flexible Layouts**: Use Flexbox/Grid. Avoid fixed widths; use relative units (`rem`, `%`, `vw`, `vh`).
- **Touch Targets**: Interactive elements must be at least 44x44px on mobile.
- **Breakpoints**: 
    - Mobile: < 640px
    - Tablet: 640px - 1024px
    - Desktop: > 1024px
- **Testing**: Verify at various sizes (320px to 1920px) to ensure no overflow or layout breakage.

## 5. Constants Management
- **Centralized Constants**: All non-user-facing configuration constants, API URLs, timeouts, port numbers, and magic strings/numbers MUST be stored in `src/constants/index.js` (or specific modules within `src/constants/`).
- **No Hardcoded Values**: DO NOT hardcode configuration values directly in logic. Import them from the constants module.
- **Naming Convention**: Use `UPPER_SNAKE_CASE` for all constant names.
44: 
45: ## 6. Enums & Interfaces
46: - **Dedicated Directory**: All enums and interfaces (including JSDoc `@typedef`) MUST be stored in `src/types/`.
47: - **Logical Separation**: 
48:   - `src/types/enums.js`: For enum-like constant objects.
49:   - `src/types/interfaces.js`: For JSDoc type definitions.
50: - **Single Entry Point**: Re-export all types from `src/types/index.js`.
51: - **Prohibition**: DO NOT define types or enums inline in business logic files.

## 7. Maintenance & Verification
- **Gitignore Maintenance**: Avoid committing large binaries, sensitive environment files, or build artifacts; proactively update `.gitignore` when adding new toolchains or dependencies.
- **UI Verification**: Always perform a manual or automated UI check after implementing visual changes or significant refactors, ensuring the interface remains responsive and user-facing strings are correctly populated. If everything appears to be working, do a final UI sweep to confirm visual integrity.

## 8. Mandatory Zod Input Validation
- **Apply On Every Input Touchpoint**: Any change that touches user or system inputs MUST include Zod input validation at the boundary.
- **Required Coverage**: Frontend forms, API route params, route query, request headers, request bodies, WebSocket payloads, and controller/service entry payloads.
- **No Inline Schemas**: NEVER declare Zod schemas inline inside route handlers, controllers, services, or UI handlers.
- **Single Source of Truth**: Define all Zod schemas in dedicated constants modules under `src/constants/` (backend) and `public/js/constants/` (frontend).
- **safeParse First**: Use `safeParse` for runtime validation, return consistent user-facing errors from `UI_STRINGS`, and avoid throwing raw validation details to clients.
- **Schema Reuse**: Reuse shared schemas across create/update/list/detail operations when the same payload contract applies.
