/**
 * Configuration constants for the frontend.
 */

export const CONFIG = {
  API_PREFIX: '/api',
  WS_PATH: '/ws',
  PREVIEW_PATH: '/preview',
  PAGE_PATHS: {
    LANDING: '/',
    DASHBOARD: '/dashboard',
    LOGIN: '/login',
    SIGNUP: '/signup',
    FORGOT_PASSWORD: '/forgot-password',
    RESET_PASSWORD: '/reset-password',
  },
  DEFAULT_VOICE: 'Puck',
  DEFAULT_MODEL: 'gemini-2.0-flash-exp',
  SAMPLE_RATE_INPUT: 16000,
  SAMPLE_RATE_OUTPUT: 24000,
  AUDIO_UNLOCK_SILENT_FRAME_COUNT: 1,
  WS_CONNECT_TIMEOUT_MS: 10000,
  MEDIA_ACCESS_TIMEOUT_MS: 15000,
  CALL_START_ERROR_NAMES: {
    PERMISSION_DENIED: 'NotAllowedError',
    PERMISSION_DISMISSED: 'PermissionDismissedError',
    DEVICE_NOT_FOUND: 'NotFoundError',
    DEVICE_NOT_READABLE: 'NotReadableError',
    CONSTRAINT_FAILED: 'OverconstrainedError',
    SECURITY: 'SecurityError',
    UNSUPPORTED: 'TypeError',
  },
  AUDIO_LOG_THROTTLE: 50,
  BARGE_IN_RMS_THRESHOLD: 0.03,
  BARGE_IN_MIN_FRAMES: 2,
  BARGE_IN_COOLDOWN_MS: 700,
  DEBUG_LOG_MAX_ITEMS: 150,
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
