/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../constants/config.js';

const flushTasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

const setBaseDom = (): void => {
  document.head.innerHTML = `
    <title>Login - AnshulTheGreat.com</title>
    <meta name="description" content="Welcome to AnshulTheGreat.com">
    <meta property="og:title" content="AnshulTheGreat.com | Preview">
    <meta property="og:description">
  `;
  document.body.innerHTML = `
    <main>
      <h1>AnshulTheGreat.com</h1>
      <p>Powered by AnshulTheGreat.com platform.</p>
      <script type="text/plain" id="script-text">AnshulTheGreat.com</script>
    </main>
  `;
  document.body.appendChild(document.createTextNode(''));
};

describe('runtimeBootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    setBaseDom();
    vi.stubGlobal('fetch', vi.fn());
    const windowWithConfig = window as unknown as Record<string, unknown>;
    delete windowWithConfig[CONFIG.SSR_RUNTIME_CONFIG_KEY];
  });

  it('should apply default branding and theme when runtime fetch fails', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));

    const uiStringsModule = await import('../constants/uiStrings.js');
    await import('../runtimeBootstrap.js');
    await flushTasks();

    expect(document.documentElement.getAttribute('data-theme')).toBe(CONFIG.DEFAULT_THEME);
    expect(document.title).toContain(CONFIG.DEFAULT_WEBSITE_NAME);

    const metaDescription = document.querySelector('meta[name="description"]');
    expect(metaDescription?.getAttribute('content')).toContain(CONFIG.DEFAULT_WEBSITE_NAME);

    expect(document.body.textContent).toContain(CONFIG.DEFAULT_WEBSITE_NAME);
    expect(uiStringsModule.UI_STRINGS.header.title).toBe(CONFIG.DEFAULT_WEBSITE_NAME);
  });

  it('should apply runtime branding and normalized light theme from API response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ websiteName: 'DynamicBrand.dev', theme: 'LIGHT' }),
    } as Response);

    const uiStringsModule = await import('../constants/uiStrings.js');
    await import('../runtimeBootstrap.js');
    await flushTasks();

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.title).toContain('DynamicBrand.dev');

    const ogTitle = document.querySelector('meta[property="og:title"]');
    expect(ogTitle?.getAttribute('content')).toContain('DynamicBrand.dev');

    expect(document.body.textContent).toContain('DynamicBrand.dev');
    expect(uiStringsModule.UI_STRINGS.header.title).toBe('DynamicBrand.dev');
    expect(uiStringsModule.UI_STRINGS.form.modelLabel).toContain('DynamicBrand.dev');
  });

  it('should use preloaded runtime config without fetching', async () => {
    const windowWithConfig = window as unknown as Record<string, unknown>;
    windowWithConfig[CONFIG.SSR_RUNTIME_CONFIG_KEY] = {
      websiteName: 'Preloaded.site',
      theme: 'light',
    };

    const uiStringsModule = await import('../constants/uiStrings.js');
    await import('../runtimeBootstrap.js');
    await flushTasks();

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.title).toContain('Preloaded.site');
    expect(uiStringsModule.UI_STRINGS.form.modelLabel).toContain('Preloaded.site');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('should expose helpers and return null for invalid runtime responses', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as Response);

    const runtimeModule = await import('../runtimeBootstrap.js');
    await flushTasks();

    expect(runtimeModule.normalizeWebsiteName('  DemoSite.org  ')).toBe('DemoSite.org');
    expect(runtimeModule.normalizeWebsiteName(undefined)).toBe(CONFIG.DEFAULT_WEBSITE_NAME);
    expect(runtimeModule.normalizeWebsiteName('')).toBe(CONFIG.DEFAULT_WEBSITE_NAME);
    expect(runtimeModule.normalizeTheme('light')).toBe('light');
    expect(runtimeModule.normalizeTheme(undefined)).toBe(CONFIG.DEFAULT_THEME);
    expect(runtimeModule.normalizeTheme('invalid')).toBe(CONFIG.DEFAULT_THEME);

    runtimeModule.applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    runtimeModule.applyWebsiteName('ManualBrand.net');
    expect(document.title).toContain('ManualBrand.net');

    const uiStringsModule = await import('../constants/uiStrings.js');
    const uiStringsRecord = uiStringsModule.UI_STRINGS as Record<string, unknown>;
    uiStringsRecord.testArray = ['AnshulTheGreat.com'];
    runtimeModule.applyRuntimeUiConfig({ websiteName: 'ManualBrand.net', theme: 'dark' });
    const updatedArray = uiStringsRecord.testArray as string[];
    expect(updatedArray[0]).toBe('ManualBrand.net');

    vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response);
    await expect(runtimeModule.fetchRuntimeUiConfig()).resolves.toBeNull();

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => 'invalid-payload',
    } as Response);
    await expect(runtimeModule.fetchRuntimeUiConfig()).resolves.toBeNull();
  });
});
