/**
 * General application constants
 */

export const DEFAULT_PORT = 3000;

export const ROUTES = {
  API_PREFIX: '/api',
  WS_PATH: '/ws',
  HEALTH_CHECK: '/api/health',
  CONSTANTS_UI_STRINGS: '/constants/uiStrings.js',
  CONSTANTS_CONFIG: '/constants/config.js',
};

export const PRISMA_ERRORS = {
  NOT_FOUND: 'P2025',
};

export const AUDIO_CONFIG = {
  MIME_TYPE: 'audio/pcm;rate=16000',
  SAMPLE_RATE_INPUT: 16000,
  SAMPLE_RATE_OUTPUT: 24000,
  DEFAULT_VOICE: 'Puck',
  DEFAULT_MODEL: 'gemini-2.5-flash-native-audio-latest',
};

export const TIME = {
  MS_TO_SEC: 1000,
};

export const LOGGING = {
  THROTTLE_CHUNKS: 50,
};
