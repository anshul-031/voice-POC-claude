import { describe, it, expect, vi } from 'vitest';
import logger from '../utils/logger.js';

describe('Logger Utility', () => {
  it('should be initialized with correct transports', () => {
    expect(logger.transports.length).toBeGreaterThan(0);
    const hasDailyRotate = logger.transports.some(t => t.name === 'dailyRotateFile');
    
    // In test environment, console might be added or not depending on LOG_TO_CONSOLE
    expect(hasDailyRotate).toBe(true);
  });

  it('should log messages at various levels', () => {
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

  it('should handle metadata', () => {
    const infoSpy = vi.spyOn(logger, 'info');
    logger.info('test metadata', { key: 'value' });
    expect(infoSpy).toHaveBeenCalledWith('test metadata', { key: 'value' });
  });
});
