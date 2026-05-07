import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { DEFAULT_WEBSITE_NAME } from '../constants/index.js';
import type { RuntimeUiConfig } from '../types/index.js';
import {
  applyHtmlTheme,
  buildRuntimeConfigScript,
  clearSsrTemplateCache,
  injectRuntimeConfigScript,
  renderSsrHtml,
  renderSsrPage,
  replaceWebsiteName,
} from '../utils/ssr.js';

const runtimeConfig: RuntimeUiConfig = {
  websiteName: 'Brand <X>',
  theme: 'light',
};

const baseHtml =
  '<html lang="en"><head><title>AnshulTheGreat.com</title></head>'
  + '<body>AnshulTheGreat.com</body></html>';

describe('SSR helpers', () => {
  it('should apply theme, branding, and runtime config script', () => {
    const rendered = renderSsrHtml(baseHtml, runtimeConfig);

    expect(rendered).toContain('data-theme="light"');
    expect(rendered).toContain('Brand &lt;X&gt;');
    expect(rendered).toContain('window.__RUNTIME_UI_CONFIG__');
  });

  it('should replace existing data-theme value', () => {
    const html = '<html data-theme="dark" lang="en"></html>';
    const rendered = applyHtmlTheme(html, 'light');
    expect(rendered).toContain('data-theme="light"');
  });

  it('should return html untouched when no html tag exists', () => {
    const html = '<div>No html root</div>';
    expect(applyHtmlTheme(html, 'dark')).toBe(html);
  });

  it('should keep default branding unchanged when matching default name', () => {
    const html = `Welcome ${DEFAULT_WEBSITE_NAME}`;
    expect(replaceWebsiteName(html, DEFAULT_WEBSITE_NAME)).toBe(html);
  });

  it('should append runtime config script when head tag is missing', () => {
    const html = '<html><body>Plain</body></html>';
    const rendered = injectRuntimeConfigScript(html, runtimeConfig);
    expect(rendered.startsWith(html)).toBe(true);
    expect(rendered).toContain('window.__RUNTIME_UI_CONFIG__');
  });

  it('should escape unsafe runtime config content in scripts', () => {
    const script = buildRuntimeConfigScript(runtimeConfig);
    expect(script).toContain('\\u003c');
  });

  it('should cache templates between renders', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ssr-test-'));
    const file = 'page.html';
    writeFileSync(join(dir, file), baseHtml, 'utf-8');

    clearSsrTemplateCache();
    const first = renderSsrPage(dir, file, runtimeConfig);
    const second = renderSsrPage(dir, file, runtimeConfig);

    expect(first).toBe(second);
  });
});
