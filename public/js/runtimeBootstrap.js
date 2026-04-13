/**
 * Runtime UI bootstrap for env-driven branding and theme.
 */
import { CONFIG } from './constants/config.js';
import { UI_STRINGS } from './constants/uiStrings.js';

const KNOWN_WEBSITE_NAMES = [
  CONFIG.DEFAULT_WEBSITE_NAME,
];

/**
 * @param {string} value
 * @returns {string}
 */
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const websiteNamePattern = new RegExp(KNOWN_WEBSITE_NAMES.map(escapeRegex).join('|'), 'g');
const supportedThemes = new Set(Object.values(CONFIG.THEMES));

/**
 * @param {unknown} rawWebsiteName
 * @returns {string}
 */
export function normalizeWebsiteName(rawWebsiteName) {
  if (typeof rawWebsiteName !== 'string') {
    return CONFIG.DEFAULT_WEBSITE_NAME;
  }

  const trimmed = rawWebsiteName.trim();
  return trimmed.length > 0 ? trimmed : CONFIG.DEFAULT_WEBSITE_NAME;
}

/**
 * @param {unknown} rawTheme
 * @returns {string}
 */
export function normalizeTheme(rawTheme) {
  if (typeof rawTheme !== 'string') {
    return CONFIG.DEFAULT_THEME;
  }

  const normalized = rawTheme.trim().toLowerCase();
  return supportedThemes.has(normalized) ? normalized : CONFIG.DEFAULT_THEME;
}

/**
 * @param {string} text
 * @param {string} websiteName
 * @returns {string}
 */
function replaceKnownWebsiteNames(text, websiteName) {
  return text.replace(websiteNamePattern, websiteName);
}

/**
 * @param {string} websiteName
 * @returns {void}
 */
export function applyWebsiteName(websiteName) {
  UI_STRINGS.header.title = websiteName;
  document.title = replaceKnownWebsiteNames(document.title, websiteName);

  const metaElements = document.querySelectorAll(
    'meta[name="description"], meta[property="og:title"], meta[property="og:description"]',
  );
  metaElements.forEach((metaElement) => {
    const content = metaElement.getAttribute('content');
    if (!content) {
      return;
    }
    metaElement.setAttribute('content', replaceKnownWebsiteNames(content, websiteName));
  });

  const root = document.body ?? document.documentElement;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  /** @type {Text[]} */
  const textNodes = [];
  while (walker.nextNode()) {
    const textNode = /** @type {Text} */ (walker.currentNode);
    const parentTagName = textNode.parentElement?.tagName;
    if (parentTagName === 'SCRIPT' || parentTagName === 'STYLE' || parentTagName === 'NOSCRIPT') {
      continue;
    }
    textNodes.push(textNode);
  }

  textNodes.forEach((textNode) => {
    if (!textNode.textContent) {
      return;
    }
    textNode.textContent = replaceKnownWebsiteNames(textNode.textContent, websiteName);
  });
}

/**
 * @param {string} theme
 * @returns {void}
 */
export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

/**
 * @param {{ websiteName?: unknown, theme?: unknown }} payload
 * @returns {void}
 */
export function applyRuntimeUiConfig(payload) {
  const websiteName = normalizeWebsiteName(payload.websiteName);
  const theme = normalizeTheme(payload.theme);
  applyTheme(theme);
  applyWebsiteName(websiteName);
}

/**
 * @returns {Promise<{ websiteName?: unknown, theme?: unknown } | null>}
 */
export async function fetchRuntimeUiConfig() {
  try {
    const response = await fetch(`${CONFIG.API_PREFIX}${CONFIG.RUNTIME_CONFIG_PATH}`, {
      credentials: 'same-origin',
    });
    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    return payload;
  } catch (_error) {
    return null;
  }
}

/**
 * @returns {Promise<void>}
 */
export async function initRuntimeBootstrap() {
  applyRuntimeUiConfig({
    websiteName: CONFIG.DEFAULT_WEBSITE_NAME,
    theme: CONFIG.DEFAULT_THEME,
  });

  const runtimeConfig = await fetchRuntimeUiConfig();
  if (!runtimeConfig) {
    return;
  }

  applyRuntimeUiConfig(runtimeConfig);
}

if (typeof document !== 'undefined') {
  void initRuntimeBootstrap();
}
