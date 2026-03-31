/**
 * Configuration constants for the frontend.
 */

export const CONFIG = {
  API_PREFIX: '/api',
  WS_PATH: '/ws',
  DEFAULT_VOICE: 'Puck',
  DEFAULT_MODEL: 'gemini-2.0-flash-exp',
  SAMPLE_RATE_INPUT: 16000,
  SAMPLE_RATE_OUTPUT: 24000,
  AUDIO_LOG_THROTTLE: 50,
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
