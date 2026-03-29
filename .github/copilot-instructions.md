# VoiceForge — GitHub Copilot Custom Instructions

To maintain high code quality and consistency across the VoiceForge platform, please follow these rules:

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
