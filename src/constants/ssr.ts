/**
 * SSR-related constants.
 */

export const SSR_MARKERS = {
  HEAD_CLOSE_TAG: '</head>',
  HTML_TAG_REGEX: /<html\b[^>]*>/i,
  DATA_THEME_ATTR: 'data-theme',
  DATA_THEME_REGEX: /data-theme\s*=\s*['"][^'"]*['"]/i,
  RUNTIME_CONFIG_GLOBAL: '__RUNTIME_UI_CONFIG__',
} as const;
