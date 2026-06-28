import { describe, it, expect } from 'vitest';
import { CONFIG, RUNTIME_UI_CONFIG, resolveR2Config, isSalesAnalyserConfigured, SALES_ANALYSER_URL } from '../constants/config.js';
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
    expect(AUDIO_CONFIG.DEFAULT_MODEL).toBe('gemini-3.1-flash-live-preview');
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

  it('isSalesAnalyserConfigured reflects whether SALES_ANALYSER_URL is set', () => {
    expect(isSalesAnalyserConfigured()).toBe(SALES_ANALYSER_URL !== null);
    expect(typeof isSalesAnalyserConfigured()).toBe('boolean');
  });
});

describe('resolveR2Config', () => {
  const R2_KEYS = [
    'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET', 'R2_ENDPOINT', 'R2_PUBLIC_URL',
  ];

  const clearR2Env = (): void => {
    for (const key of R2_KEYS) delete process.env[key];
  };

  it('returns null when R2 env vars are missing', () => {
    clearR2Env();
    expect(resolveR2Config()).toBeNull();
  });

  it('derives the endpoint from the account id when configured', () => {
    clearR2Env();
    process.env.R2_ACCOUNT_ID = 'acc123';
    process.env.R2_ACCESS_KEY_ID = 'ak';
    process.env.R2_SECRET_ACCESS_KEY = 'sk';
    process.env.R2_BUCKET = 'bucket';
    const config = resolveR2Config();
    expect(config).not.toBeNull();
    expect(config?.endpoint).toBe('https://acc123.r2.cloudflarestorage.com');
    expect(config?.publicUrl).toBeUndefined();
    clearR2Env();
  });

  it('honors an explicit endpoint and public url', () => {
    clearR2Env();
    process.env.R2_ACCOUNT_ID = 'acc123';
    process.env.R2_ACCESS_KEY_ID = 'ak';
    process.env.R2_SECRET_ACCESS_KEY = 'sk';
    process.env.R2_BUCKET = 'bucket';
    process.env.R2_ENDPOINT = 'https://custom.example.com';
    process.env.R2_PUBLIC_URL = 'https://cdn.example.com';
    const config = resolveR2Config();
    expect(config?.endpoint).toBe('https://custom.example.com');
    expect(config?.publicUrl).toBe('https://cdn.example.com');
    clearR2Env();
  });

  it('returns null when only some credentials are present', () => {
    clearR2Env();
    process.env.R2_ACCOUNT_ID = 'acc123';
    expect(resolveR2Config()).toBeNull();
    clearR2Env();
  });
});
