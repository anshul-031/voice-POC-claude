/**
 * Shared configuration for frontend
 * This file is exposed via an API endpoint
 */

import { DEFAULT_THEME, DEFAULT_WEBSITE_NAME } from './index.js';
import { RUNTIME_THEME_SCHEMA, RUNTIME_UI_CONFIG_SCHEMA, WEBSITE_NAME_SCHEMA } from './inputSchemas.js';

export const CONFIG = {
  API_PREFIX: '/api',
  WS_PATH: '/ws',
  SAMPLE_RATE_INPUT: 16000,
  SAMPLE_RATE_OUTPUT: 24000,
  DEFAULT_VOICE: 'Puck',
} as const;

const resolveWebsiteName = (): string => {
  const parseResult = WEBSITE_NAME_SCHEMA.safeParse(process.env.WEBSITE_NAME);
  return parseResult.success ? parseResult.data : DEFAULT_WEBSITE_NAME;
};

const resolveTheme = (): string => {
  const rawTheme = process.env.WEBSITE_THEME ?? process.env.THEME;
  const normalizedTheme = typeof rawTheme === 'string' ? rawTheme.trim().toLowerCase() : rawTheme;
  const parseResult = RUNTIME_THEME_SCHEMA.safeParse(normalizedTheme);
  return parseResult.success ? parseResult.data : DEFAULT_THEME;
};

const defaultRuntimeUiConfig = {
  websiteName: DEFAULT_WEBSITE_NAME,
  theme: DEFAULT_THEME,
} as const;

const runtimeUiConfigCandidate = {
  websiteName: resolveWebsiteName(),
  theme: resolveTheme(),
};

const runtimeUiConfigParseResult = RUNTIME_UI_CONFIG_SCHEMA.safeParse(runtimeUiConfigCandidate);

export const RUNTIME_UI_CONFIG = runtimeUiConfigParseResult.success
  ? runtimeUiConfigParseResult.data
  : defaultRuntimeUiConfig;
