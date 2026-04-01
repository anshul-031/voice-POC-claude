import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      include: [
        'src/**/*.ts',
        'public/js/**/*.js',
      ],
      exclude: [
        'src/__tests__/**',
        'src/**/*.test.ts',
        'public/js/__tests__/**',
        'public/js/auth.js',
        'public/js/call.js',
        'public/js/landing.js',
        'public/js/main.js',
      ],
      reporter: ['text', 'json', 'html'],
      all: true,
      thresholds: {
        perFile: true,
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
});
