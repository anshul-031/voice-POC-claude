import { describe, it, expect, vi, afterEach } from 'vitest';

// logger.ts calls dotenv.config() at import time, which repopulates LOG_LEVEL /
// LOG_DIR from the developer's .env on every fresh import. Stubbing the env
// alone therefore cannot reach the default-value branches. Neutralising dotenv
// keeps this coverage deterministic on machines that do have a populated .env.
vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
  config: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('Logger default configuration', () => {
  it('falls back to the info level and the logs directory when unset', async () => {
    vi.stubEnv('LOG_LEVEL', undefined);
    vi.stubEnv('LOG_DIR', undefined);

    // @ts-expect-error dynamic import with a cache-busting query
    const { default: logger } = await import('../utils/logger.ts?test=defaults');

    expect(logger.level).toBe('info');
    expect(logger.transports.length).toBeGreaterThan(0);
  });
});
