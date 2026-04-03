/**
 * Configuration constants for the frontend.
 */

export const CONFIG = {
  API_PREFIX: '/api',
  WS_PATH: '/ws',
  PREVIEW_PATH: '/preview',
  DEFAULT_VOICE: 'Puck',
  DEFAULT_MODEL: 'gemini-2.0-flash-exp',
  SAMPLE_RATE_INPUT: 16000,
  SAMPLE_RATE_OUTPUT: 24000,
  AUDIO_LOG_THROTTLE: 50,
  DEBUG_LOG_MAX_ITEMS: 150,
  // Voice Activity Detection (VAD)
  VAD_ENABLED: true,
  VAD_THRESHOLD: 0.01,
  VAD_SILENCE_DURATION_MS: 500,
  VAD_SAMPLE_INTERVAL_MS: 100,
  // Audio Queue Management
  MAX_AUDIO_QUEUE_SIZE: 20,
  // Audio Interruption
  AUDIO_FADE_OUT_MS: 75,
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
