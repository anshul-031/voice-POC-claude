/**
 * Shared configuration for frontend
 * This file is exposed via an API endpoint
 */

export const CONFIG = {
  API_PREFIX: '/api',
  WS_PATH: '/ws',
  SAMPLE_RATE_INPUT: 16000,
  SAMPLE_RATE_OUTPUT: 24000,
  DEFAULT_VOICE: 'Puck',
} as const;
