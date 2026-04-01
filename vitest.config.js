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
        'public/js/api.js',
        'public/js/render.js',
        'public/js/transcript.js',
        'public/js/ui.js',
        'public/js/utils.js',
        'public/js/waveform.js',
        'public/js/constants/config.js',
        'public/js/constants/inputSchemas.js',
        'public/js/constants/uiStrings.js',
      ],
      exclude: [
        'src/__tests__/**',
        'src/**/*.test.ts',
        'public/js/__tests__/**',
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
