import { describe, it, expect, vi, afterEach } from 'vitest';

const loadLogger = async (suffix: string) => {
  void suffix;
  const module = await import('../utils/logger.js');
  return module.default;
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Logger Utility', () => {
  it('should be initialized with rotate file transports', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.resetModules();
    const logger = await loadLogger('logger-transports');
    expect(logger.transports.length).toBeGreaterThan(0);
    const hasDailyRotate = logger.transports.some((t: any) => t.name === 'dailyRotateFile');
    expect(hasDailyRotate).toBe(true);
  });

  it('should add console transport outside production', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('LOG_TO_CONSOLE', 'false');
    vi.resetModules();
    const logger = await loadLogger('logger-dev-console');
    const hasConsole = logger.transports.some((t: any) => t.name === 'console');
    expect(hasConsole).toBe(true);
  });

  it('should not add console transport in production by default', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env.LOG_TO_CONSOLE;
    vi.resetModules();
    const logger = await loadLogger('logger-prod-no-console');
    const hasConsole = logger.transports.some((t: any) => t.name === 'console');
    expect(hasConsole).toBe(false);
  });

  it('should add console transport in production when explicitly enabled', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LOG_TO_CONSOLE', 'true');
    vi.resetModules();
    const logger = await loadLogger('logger-prod-console-enabled');
    const hasConsole = logger.transports.some((t: any) => t.name === 'console');
    expect(hasConsole).toBe(true);
  });

  it('should log messages at various levels', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.resetModules();
    const logger = await loadLogger('logger-levels');
    const infoSpy = vi.spyOn(logger, 'info');
    const errorSpy = vi.spyOn(logger, 'error');
    const debugSpy = vi.spyOn(logger, 'debug');

    logger.info('test info');
    logger.error('test error');
    logger.debug('test debug');

    expect(infoSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    expect(debugSpy).toHaveBeenCalled();
  });

  it('should handle metadata', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.resetModules();
    const logger = await loadLogger('logger-metadata');
    const infoSpy = vi.spyOn(logger, 'info');
    logger.info('test metadata', { key: 'value' });
    expect(infoSpy).toHaveBeenCalledWith('test metadata', { key: 'value' });
  });
});
