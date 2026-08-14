/**
 * Configuration constants for the frontend.
 */

export const CONFIG = {
  API_PREFIX: '/api',
  RUNTIME_CONFIG_PATH: '/runtime-config',
  SSR_RUNTIME_CONFIG_KEY: '__RUNTIME_UI_CONFIG__',
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
  DEFAULT_WEBSITE_NAME: 'AnshulTheGreat.com',
  DEFAULT_THEME: 'dark',
  THEMES: {
    DARK: 'dark',
    LIGHT: 'light',
  },
  DEFAULT_VOICE: 'Puck',
  DEFAULT_MODEL: 'gemini-3.1-flash-live-preview',
  SAMPLE_RATE_INPUT: 16000,
  SAMPLE_RATE_OUTPUT: 24000,
  AUDIO_UNLOCK_SILENT_FRAME_COUNT: 256,
  AUDIO_CONTEXT_RESUME_MAX_ATTEMPTS: 3,
  AUDIO_CONTEXT_RESUME_RETRY_DELAY_MS: 40,
  AUDIO_CONTEXT_FAILURE_TOAST_THRESHOLD: 2,
  // iOS Safari only (navigator.audioSession is undefined elsewhere). The previous
  // 'play-and-record' value maps to AVAudioSessionCategoryPlayAndRecord WITHOUT
  // defaultToSpeaker, which forces output to the quiet earpiece on iPhone so the
  // call appears "not working". 'auto' restores the default getUserMedia behavior,
  // which routes playback to the main loudspeaker while still capturing the mic.
  IOS_AUDIO_SESSION_TYPE: 'auto',
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
  MIC_HIGHPASS_FREQUENCY_HZ: 120,
  MIC_HIGHPASS_Q: 0.7,
  BARGE_IN_RMS_THRESHOLD: 0.03,
  BARGE_IN_MIN_INTERRUPT_RMS: 0.05,
  BARGE_IN_MIN_FRAMES: 2,
  BARGE_IN_COOLDOWN_MS: 700,
  BARGE_IN_NOISE_FLOOR_INITIAL_RMS: 0.006,
  BARGE_IN_NOISE_FLOOR_SMOOTHING: 0.6,
  BARGE_IN_DYNAMIC_THRESHOLD_MULTIPLIER: 2.6,
  DEBUG_LOG_MAX_ITEMS: 150,
  MODEL_INACTIVITY_WARN_MS: 8000,
  AUDIO_QUEUE_DEPTH_WARN: 20,
  AUDIO_CROSSFADE_SAMPLES: 48,
  AUDIO_DIAG_LOG_INTERVAL_CHUNKS: 25,
  DEFAULT_INACTIVITY_TIMEOUT_MS: 10000,
  DEFAULT_MAX_INACTIVITY_NUDGES: 3,
  DEFAULT_MAX_CALL_DURATION_SECS: 0,
  // Mirrors TELEPHONY_LIMITS on the server: how many calls a provider may have
  // in flight at once. Vendors reject anything past their own cap.
  DEFAULT_CALL_CONCURRENCY: 3,
  MIN_CALL_CONCURRENCY: 1,
  MAX_CALL_CONCURRENCY: 100,
  // Per-number campaign status is polled while calls are still in flight, so a
  // number moves off "Calling" on screen without the user hitting Refresh.
  CAMPAIGN_STATUS_POLL_MS: 5000,
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
  INACTIVITY_NUDGE: 'inactivity-nudge',
  AUTO_CALL_END: 'auto-call-end',
};
