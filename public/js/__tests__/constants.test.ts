import { describe, it, expect } from 'vitest';
import { CONFIG } from '../constants/config.js';
import { UI_STRINGS } from '../constants/uiStrings.js';
import { API_REQUEST_SCHEMA, AGENT_FORM_SCHEMA } from '../constants/inputSchemas.js';

describe('Frontend Constants', () => {
  it('should have valid CONFIG', () => {
    expect(CONFIG.API_PREFIX).toBeDefined();
    expect(CONFIG.RUNTIME_CONFIG_PATH).toBe('/runtime-config');
    expect(CONFIG.WS_PATH).toBeDefined();
    expect(CONFIG.DEFAULT_VOICE).toBeDefined();
    expect(CONFIG.DEFAULT_WEBSITE_NAME).toBe('AnshulTheGreat.com');
    expect(CONFIG.DEFAULT_THEME).toBe('dark');
    expect(CONFIG.THEMES.DARK).toBe('dark');
    expect(CONFIG.THEMES.LIGHT).toBe('light');
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
          // Pass numbers to cover functions that call .toFixed()
          expect(val(1, 2, 3)).toBeDefined();
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

  describe('AGENT_FORM_SCHEMA call-analysis rule', () => {
    const base = {
      id: '',
      name: 'Agent',
      systemPrompt: 'Prompt',
      voiceName: 'Puck',
      modelName: 'gemini-2.5-flash-native-audio-latest',
      publicPreviewEnabled: false,
    };

    it('passes when analysis is disabled regardless of template', () => {
      expect(AGENT_FORM_SCHEMA.safeParse({ ...base, callAnalysisEnabled: false }).success).toBe(true);
    });

    it('passes when analysis is enabled with a template name', () => {
      const result = AGENT_FORM_SCHEMA.safeParse({
        ...base, callAnalysisEnabled: true, analysisTemplateName: 'QA Template',
      });
      expect(result.success).toBe(true);
    });

    it('fails when analysis is enabled but the template name is blank', () => {
      const result = AGENT_FORM_SCHEMA.safeParse({
        ...base, callAnalysisEnabled: true, analysisTemplateName: '   ',
      });
      expect(result.success).toBe(false);
    });

    it('fails when analysis is enabled but the template name is missing', () => {
      const result = AGENT_FORM_SCHEMA.safeParse({ ...base, callAnalysisEnabled: true });
      expect(result.success).toBe(false);
    });
  });
});
