/**
 * Enum-like constant objects for the application.
 */

export const ROUTES = {
  API_PREFIX: '/api',
  WS_PATH: '/ws',
  PREVIEW_PAGE: '/preview',
  LANDING_PAGE: '/',
  LANDING_ALIAS_PAGE: '/landing',
  DASHBOARD_PAGE: '/dashboard',
  LOGIN_PAGE: '/login',
  SIGNUP_PAGE: '/signup',
  FORGOT_PASSWORD_PAGE: '/forgot-password',
  RESET_PASSWORD_PAGE: '/reset-password',
  LEGACY_LANDING_PAGE: '/landing.html',
  LEGACY_DASHBOARD_PAGE: '/index.html',
  LEGACY_LOGIN_PAGE: '/login.html',
  LEGACY_SIGNUP_PAGE: '/signup.html',
  LEGACY_FORGOT_PASSWORD_PAGE: '/forgot-password.html',
  LEGACY_RESET_PASSWORD_PAGE: '/reset-password.html',
  HEALTH_CHECK: '/api/health',
  RUNTIME_CONFIG: '/api/runtime-config',
  CONSTANTS_UI_STRINGS: '/constants/uiStrings.js',
  CONSTANTS_CONFIG: '/constants/config.js',
} as const;

export const PRISMA_ERRORS = {
  NOT_FOUND: 'P2025',
} as const;

export const AUDIO_CONFIG = {
  MIME_TYPE: 'audio/pcm;rate=16000',
  SAMPLE_RATE_INPUT: 16000,
  SAMPLE_RATE_OUTPUT: 24000,
  DEFAULT_VOICE: 'Puck',
  DEFAULT_MODEL: 'gemini-3.1-flash-live-preview',
} as const;

export const TIME = {
  MS_TO_SEC: 1000,
  GEMINI_CONNECT_TIMEOUT_MS: 15000,
} as const;

export const LOGGING = {
  THROTTLE_CHUNKS: 50,
} as const;

export const LIVE_CALL = {
  PROACTIVE_GREETING_PROMPT:
    'Start the call now. Greet the user briefly in the configured language and ask one short opening question.',
  FIRST_RESPONSE_WARN_THRESHOLD_MS: 2500,
  VAD_PREFIX_PADDING_MS: 180,
  VAD_SILENCE_DURATION_MS: 300,
  VAD_START_SENSITIVITY: 'START_SENSITIVITY_LOW',
  VAD_END_SENSITIVITY: 'END_SENSITIVITY_HIGH',
  DEFAULT_INACTIVITY_TIMEOUT_MS: 10000,
  DEFAULT_MAX_INACTIVITY_NUDGES: 3,
  DEFAULT_MAX_CALL_DURATION_SECS: 0,
  INACTIVITY_CHECK_INTERVAL_MS: 3000,
  NUDGE_PROMPT: 'The user seems to be waiting for a response. Please continue the conversation naturally.',
} as const;

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
  INACTIVITY_NUDGE: 'inactivity-nudge',
  AUTO_CALL_END: 'auto-call-end',
} as const;

export const VOICE_NAME = {
  PUCK: 'Puck',
  CHARLIE: 'Charlie',
  AOEDE: 'Aoede',
  CHARON: 'Charon',
  FENRIR: 'Fenrir',
} as const;

export type RoutePath = typeof ROUTES[keyof typeof ROUTES];
export type MessageType = typeof MESSAGE_TYPE[keyof typeof MESSAGE_TYPE];
export type VoiceName = typeof VOICE_NAME[keyof typeof VOICE_NAME];
