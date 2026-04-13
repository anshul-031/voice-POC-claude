import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_THEME, DEFAULT_WEBSITE_NAME } from '../constants/index.js';

describe('RUNTIME_UI_CONFIG', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    delete process.env.WEBSITE_NAME;
    delete process.env.WEBSITE_THEME;
    delete process.env.THEME;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should use defaults when env vars are missing or invalid', async () => {
    vi.stubEnv('WEBSITE_NAME', '');
    vi.stubEnv('WEBSITE_THEME', 'invalid');

    const configModule = await import('../constants/config.js');
    expect(configModule.RUNTIME_UI_CONFIG.websiteName).toBe(DEFAULT_WEBSITE_NAME);
    expect(configModule.RUNTIME_UI_CONFIG.theme).toBe(DEFAULT_THEME);
  });

  it('should use WEBSITE_NAME and WEBSITE_THEME when values are valid', async () => {
    vi.stubEnv('WEBSITE_NAME', 'DynamicBrand.dev');
    vi.stubEnv('WEBSITE_THEME', 'light');

    const configModule = await import('../constants/config.js');
    expect(configModule.RUNTIME_UI_CONFIG.websiteName).toBe('DynamicBrand.dev');
    expect(configModule.RUNTIME_UI_CONFIG.theme).toBe('light');
  });

  it('should fallback to THEME alias when WEBSITE_THEME is unset', async () => {
    vi.stubEnv('WEBSITE_NAME', 'AliasThemeSite.io');
    vi.stubEnv('THEME', 'light');

    const configModule = await import('../constants/config.js');
    expect(configModule.RUNTIME_UI_CONFIG.websiteName).toBe('AliasThemeSite.io');
    expect(configModule.RUNTIME_UI_CONFIG.theme).toBe('light');
  });
});
