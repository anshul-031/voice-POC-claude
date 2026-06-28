/**
 * Shared configuration for frontend
 * This file is exposed via an API endpoint
 */

import { DEFAULT_THEME, DEFAULT_WEBSITE_NAME } from './index.js';
import {
  R2_CONFIG_SCHEMA,
  RUNTIME_THEME_SCHEMA,
  RUNTIME_UI_CONFIG_SCHEMA,
  WEBSITE_NAME_SCHEMA,
  type R2Config,
} from './inputSchemas.js';

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

/**
 * Resolve Cloudflare R2 object-store configuration from the environment.
 * Returns null (R2 disabled) when required variables are missing or invalid,
 * so the app keeps working without call-recording storage configured.
 */
const trimmedEnv = (key: string): string | undefined => {
  const value = process.env[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

export const resolveR2Config = (): R2Config | null => {
  const accountId = trimmedEnv('R2_ACCOUNT_ID');
  const endpoint = trimmedEnv('R2_ENDPOINT')
    ?? (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);
  const publicUrl = trimmedEnv('R2_PUBLIC_URL');

  const candidate = {
    accountId,
    accessKeyId: trimmedEnv('R2_ACCESS_KEY_ID'),
    secretAccessKey: trimmedEnv('R2_SECRET_ACCESS_KEY'),
    bucket: trimmedEnv('R2_BUCKET'),
    endpoint,
    ...(publicUrl && { publicUrl }),
  };

  const parseResult = R2_CONFIG_SCHEMA.safeParse(candidate);
  return parseResult.success ? parseResult.data : null;
};

export const R2_CONFIG = resolveR2Config();

/**
 * Sales Analyser integration configuration.
 *
 * The base URL of the Sales Analyser application that exposes
 * POST /api/external/analyze. When unset, call-recording analysis is disabled
 * regardless of per-agent settings (the integration simply no-ops).
 */
export const SALES_ANALYSER_URL = trimmedEnv('SALES_ANALYSER_URL') ?? null;

/** Whether the Sales Analyser integration is configured at the environment level. */
export const isSalesAnalyserConfigured = (): boolean => SALES_ANALYSER_URL !== null;
