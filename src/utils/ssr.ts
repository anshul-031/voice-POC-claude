/**
 * HTML SSR helpers.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { DEFAULT_WEBSITE_NAME } from '../constants/index.js';
import { SSR_MARKERS } from '../constants/ssr.js';
import type { RuntimeUiConfig } from '../types/index.js';

const templateCache = new Map<string, string>();

export function clearSsrTemplateCache(): void {
  templateCache.clear();
}

export function loadSsrTemplate(publicDir: string, pageFile: string): string {
  const filePath = join(publicDir, pageFile);
  const cached = templateCache.get(filePath);
  if (cached) {
    return cached;
  }

  const template = readFileSync(filePath, 'utf-8');
  templateCache.set(filePath, template);
  return template;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function replaceWebsiteName(html: string, websiteName: string): string {
  if (websiteName === DEFAULT_WEBSITE_NAME) {
    return html;
  }

  const escapedName = escapeHtml(websiteName);
  return html.split(DEFAULT_WEBSITE_NAME).join(escapedName);
}

export function applyHtmlTheme(html: string, theme: string): string {
  const match = html.match(SSR_MARKERS.HTML_TAG_REGEX);
  if (!match) {
    return html;
  }

  const htmlTag = match[0];
  if (SSR_MARKERS.DATA_THEME_REGEX.test(htmlTag)) {
    const updatedTag = htmlTag.replace(
      SSR_MARKERS.DATA_THEME_REGEX,
      `${SSR_MARKERS.DATA_THEME_ATTR}="${theme}"`,
    );
    return html.replace(htmlTag, updatedTag);
  }

  const updatedTag = htmlTag.replace(
    '<html',
    `<html ${SSR_MARKERS.DATA_THEME_ATTR}="${theme}"`,
  );
  return html.replace(htmlTag, updatedTag);
}

export function buildRuntimeConfigScript(runtimeConfig: RuntimeUiConfig): string {
  const json = JSON.stringify(runtimeConfig);
  const safeJson = json.replace(/</g, '\\u003c');
  const scriptBody = `window.${SSR_MARKERS.RUNTIME_CONFIG_GLOBAL}=${safeJson};`;
  return `<script>${scriptBody}</script>`;
}

export function injectRuntimeConfigScript(html: string, runtimeConfig: RuntimeUiConfig): string {
  const script = buildRuntimeConfigScript(runtimeConfig);
  if (html.includes(SSR_MARKERS.HEAD_CLOSE_TAG)) {
    return html.replace(
      SSR_MARKERS.HEAD_CLOSE_TAG,
      `${script}${SSR_MARKERS.HEAD_CLOSE_TAG}`,
    );
  }

  return `${html}${script}`;
}

export function renderSsrHtml(html: string, runtimeConfig: RuntimeUiConfig): string {
  const withTheme = applyHtmlTheme(html, runtimeConfig.theme);
  const withBrand = replaceWebsiteName(withTheme, runtimeConfig.websiteName);
  return injectRuntimeConfigScript(withBrand, runtimeConfig);
}

export function renderSsrPage(
  publicDir: string,
  pageFile: string,
  runtimeConfig: RuntimeUiConfig,
): string {
  const template = loadSsrTemplate(publicDir, pageFile);
  return renderSsrHtml(template, runtimeConfig);
}
