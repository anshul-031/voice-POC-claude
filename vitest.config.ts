import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/__tests__/**/*.test.ts',
      'public/js/__tests__/**/*.test.ts',
    ],
    // Pin the process timezone to UTC so tests match a production container and
    // cannot accidentally pass just because a developer's machine sits in the
    // same zone as the fixtures. Scheduling code must name its zone explicitly.
    env: {
      TZ: 'UTC',
    },
    // Set a global timeout of 30 seconds for all unit tests
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      // Enforce 90% coverage across any parameters per file
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
        perFile: true,
      },
      include: [
        'src/**/*.ts',
        'public/js/**/*.js',
      ],
      exclude: [
        'src/__tests__/**',
        'src/types/**', // Types and interfaces don't have runtime code to cover
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
        'public/js/__tests__/**',
      ],
    },
  },
});
