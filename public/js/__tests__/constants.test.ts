import { describe, it, expect } from 'vitest';
import { CONFIG } from '../constants/config.js';
import { UI_STRINGS } from '../constants/uiStrings.js';
import { API_REQUEST_SCHEMA } from '../constants/inputSchemas.js';

describe('Frontend Constants', () => {
  it('should have valid CONFIG', () => {
    expect(CONFIG.API_PREFIX).toBeDefined();
    expect(CONFIG.WS_PATH).toBeDefined();
    expect(CONFIG.DEFAULT_VOICE).toBeDefined();
    expect(CONFIG.SAMPLE_RATE_INPUT).toBe(16000);
  });

  it('should have valid UI_STRINGS (90%+ coverage)', () => {
    /** Recursive helper to touch all keys for coverage */
    function touchAll(obj: Record<string, unknown>): void {
      if (!obj || typeof obj !== 'object') return;
      Object.keys(obj).forEach(key => {
        const val = obj[key];
        if (typeof val === 'string') {
          expect(val.length).toBeGreaterThan(0);
        } else if (typeof val === 'function') {
          // If it's a generator function like startCallFailed(err)
          expect(val('test')).toBeDefined();
        } else {
          touchAll(val as Record<string, unknown>);
        }
      });
    }
    touchAll(UI_STRINGS as Record<string, unknown>);
    
    // Explicit checks for key structures
    expect(UI_STRINGS.header.title).toBeDefined();
    expect(UI_STRINGS.api.errors.invalidInput).toBeDefined();
    expect(UI_STRINGS.signaling.logs.audioRelay(1)).toContain('1');
  });

  it('should have valid API_REQUEST_SCHEMA', () => {
    const valid = { path: '/test', options: { method: 'POST' } };
    expect(API_REQUEST_SCHEMA.safeParse(valid).success).toBe(true);

    const invalid = { path: 123, options: 'invalid' };
    expect(API_REQUEST_SCHEMA.safeParse(invalid).success).toBe(false);
  });
});
