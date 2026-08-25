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
  AUDIO_CAPTURE_METRIC_SAMPLE_INTERVAL: 4,
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
  // Lead time placed in front of the first buffer of a playback run. Gemini
  // chunks arrive with network jitter, so scheduling the first one at
  // currentTime leaves no slack: every later chunk lands in the past, the write
  // head keeps getting re-based to "now", and each re-base loses the samples
  // between the previous buffer's end and the next render quantum. Those tiny
  // silences are what crackling sounds like.
  AUDIO_JITTER_BUFFER_MS: 120,
  // Fade applied only to a buffer that starts a run. Mid-run buffers continue
  // an existing waveform, so fading them would carve an amplitude notch at
  // every chunk boundary instead of smoothing anything.
  AUDIO_LEAD_IN_FADE_SAMPLES: 48,
  // Chunks already waiting are merged into one buffer before scheduling. Gemini
  // emits a lot of very short chunks (sometimes a handful of samples), and every
  // separate buffer is another boundary that can click.
  AUDIO_MAX_COALESCE_SAMPLES: 24000,
  // Gain ramp used when playback is cut short by barge-in or a server
  // interrupt. Stopping a buffer mid-waveform is a step discontinuity, which is
  // an audible pop.
  AUDIO_INTERRUPT_FADE_MS: 12,
  // Schedule slippage under this is ordinary render-quantum rounding: at 24kHz
  // a quantum is 128/24000 = 5.33ms and currentTime only advances in those
  // steps, so anything shorter says nothing about the scheduler.
  AUDIO_UNDERRUN_LOG_THRESHOLD_MS: 8,
  // Slippage at or above this is the model having stopped talking, not the
  // scheduler falling behind, so it re-bases the clock without warning.
  AUDIO_STREAM_RESTART_GAP_MS: 250,
  AUDIO_DIAG_LOG_INTERVAL_CHUNKS: 25,
  AUDIO_WS_BUFFERED_AMOUNT_WARN_BYTES: 1_000_000,
  AUDIO_CAPTURE_STARVATION_FACTOR: 2,
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
  //
  // Every poll costs a full campaign read on the server, so this trades a little
  // on-screen latency for a large drop in database load: a tab left open on a
  // live campaign was previously issuing 24 queries a minute indefinitely.
  CAMPAIGN_STATUS_POLL_MS: 15000,
  // Upper bound on consecutive automatic refreshes. A campaign whose provider
  // never reports back would otherwise keep an idle tab polling forever; after
  // this many cycles the user refreshes manually instead.
  CAMPAIGN_STATUS_POLL_MAX_CYCLES: 40,
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
