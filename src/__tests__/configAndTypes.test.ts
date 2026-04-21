import { describe, it, expect } from 'vitest';
import { CONFIG, RUNTIME_UI_CONFIG } from '../constants/config.js';
import { DEFAULT_PORT } from '../constants/index.js';
import { ROUTES, PRISMA_ERRORS, AUDIO_CONFIG, TIME, LOGGING, MESSAGE_TYPE, VOICE_NAME } from '../types/index.js';
import { AVAILABLE_MODELS, getWhitelabeledModelName, getWhitelabeledModels } from '../constants/agents.js';

describe('Config and Types Constants', () => {
  it('should expose frontend config constants', () => {
    expect(CONFIG.API_PREFIX).toBe('/api');
    expect(CONFIG.WS_PATH).toBe('/ws');
    expect(CONFIG.SAMPLE_RATE_INPUT).toBe(16000);
    expect(CONFIG.SAMPLE_RATE_OUTPUT).toBe(24000);
    expect(CONFIG.DEFAULT_VOICE).toBe('Puck');
    expect(RUNTIME_UI_CONFIG.websiteName.length).toBeGreaterThan(0);
    expect(['dark', 'light']).toContain(RUNTIME_UI_CONFIG.theme);
  });

  it('should expose global constants and enum-like objects', () => {
    expect(DEFAULT_PORT).toBe(3000);
    expect(ROUTES.HEALTH_CHECK).toBe('/api/health');
    expect(ROUTES.RUNTIME_CONFIG).toBe('/api/runtime-config');
    expect(PRISMA_ERRORS.NOT_FOUND).toBe('P2025');
    expect(AUDIO_CONFIG.DEFAULT_MODEL).toBe('gemini-2.5-flash-native-audio-latest');
    expect(TIME.MS_TO_SEC).toBe(1000);
    expect(LOGGING.THROTTLE_CHUNKS).toBe(50);
    expect(MESSAGE_TYPE.START_CALL).toBe('start-call');
    expect(VOICE_NAME.PUCK).toBe('Puck');
  });

  it('should whitelabel model names and preserve model ids', () => {
    expect(getWhitelabeledModelName('Gemini 3.1 Flash Live (Preview)', 'AnshulTheGreat.com'))
      .toBe('AnshulTheGreat.com 3.1 Flash Live (Preview)');
    expect(getWhitelabeledModelName('gemini-3.1-flash-lite-preview', 'AnshulTheGreat.com'))
      .toBe('AnshulTheGreat.com-3.1-flash-lite-preview');
    expect(getWhitelabeledModelName('Custom Live Model', '   ')).toBe('Custom Live Model');

    const brandedModels = getWhitelabeledModels('Branding.site');
    expect(brandedModels).toHaveLength(AVAILABLE_MODELS.length);
    expect(brandedModels[0].id).toBe(AVAILABLE_MODELS[0].id);
    expect(brandedModels[0].description).toBe(AVAILABLE_MODELS[0].description);
    expect(brandedModels[0].name.startsWith('Branding.site')).toBe(true);
  });
});
