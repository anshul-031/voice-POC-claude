/**
 * Enum-like constant objects for the application.
 */

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

export const MESSAGE_TYPE = {
  START_CALL: 'start-call',
  AUDIO_DATA: 'audio-data',
  END_CALL: 'end-call',
  AUDIO_RESPONSE: 'audio-response',
  TRANSCRIPT: 'transcript',
  INTERRUPTED: 'interrupted',
  ERROR: 'error',
  CALL_STARTED: 'call-started',
  CALL_ENDED: 'call-ended',
};

export const VOICE_NAME = {
  PUCK: 'Puck',
  CHARLIE: 'Charlie',
  AOEDE: 'Aoede',
  CHARON: 'Charon',
  FENRIR: 'Fenrir',
};
