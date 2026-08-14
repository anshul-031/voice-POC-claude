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
  PCM_BYTES_PER_SAMPLE: 2,
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

export const WALLET = {
  MINIMUM_CALL_BALANCE_INR: 10,
  DEFAULT_COST_PER_MINUTE_INR: 7,
  CURRENCY_DECIMAL_PLACES: 2,
  PAYMENT_REQUIRED_STATUS: 402,
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

export const TELEPHONY_PROVIDER = {
  VOBIZ: 'vobiz',
  TWILIO: 'twilio',
  PLIVO: 'plivo',
} as const;

export const TELEPHONY_DIRECTION = {
  OUTBOUND: 'outbound',
  INBOUND: 'inbound',
} as const;

export const VOBIZ_MACHINE_DETECTION = {
  HANGUP: 'hangup',
} as const;

export const TELEPHONY_LIMITS = {
  /**
   * Simultaneous outbound calls assumed when a provider has no explicit limit.
   * Deliberately conservative: most trial/entry telephony plans cap at a
   * handful of channels and silently drop anything past the cap.
   */
  DEFAULT_CONCURRENCY: 3,
  MIN_CONCURRENCY: 1,
  MAX_CONCURRENCY: 100,
} as const;

/**
 * Vobiz `HangupCause` values that mean the call was answered by a person and
 * then ended normally. Anything outside this set is treated as a call that
 * never connected, so the campaign contact is recorded as failed rather than
 * being left stuck on "calling".
 */
export const VOBIZ_CONNECTED_HANGUP_CAUSES = [
  'NORMAL_CLEARING',
  'BLIND_TRANSFER',
  'ATTENDED_TRANSFER',
] as const;

/** Vobiz `HangupCause` values mapped to a specific "did not connect" reason. */
export const VOBIZ_HANGUP_CAUSE = {
  USER_BUSY: 'USER_BUSY',
  NO_ANSWER: 'NO_ANSWER',
  NO_USER_RESPONSE: 'NO_USER_RESPONSE',
  CALL_REJECTED: 'CALL_REJECTED',
  UNALLOCATED_NUMBER: 'UNALLOCATED_NUMBER',
  INVALID_NUMBER_FORMAT: 'INVALID_NUMBER_FORMAT',
  SUBSCRIBER_ABSENT: 'SUBSCRIBER_ABSENT',
  NORMAL_UNSPECIFIED: 'NORMAL_UNSPECIFIED',
  NORMAL_TEMPORARY_FAILURE: 'NORMAL_TEMPORARY_FAILURE',
  RECOVERY_ON_TIMER_EXPIRE: 'RECOVERY_ON_TIMER_EXPIRE',
  PROGRESS_TIMEOUT: 'PROGRESS_TIMEOUT',
  MEDIA_TIMEOUT: 'MEDIA_TIMEOUT',
  MACHINE_DETECTED: 'MACHINE_DETECTED',
  /** We hung up while the phone was still ringing, so nobody was reached. */
  ORIGINATOR_CANCEL: 'ORIGINATOR_CANCEL',
} as const;

/**
 * Provider-agnostic call outcomes reported alongside a hangup. Vobiz mirrors
 * Plivo's `CallStatus`, which is more reliable than `HangupCause` when present.
 */
export const VOBIZ_CALL_STATUS = {
  COMPLETED: 'completed',
  BUSY: 'busy',
  NO_ANSWER: 'no-answer',
  FAILED: 'failed',
  CANCEL: 'cancel',
  TIMEOUT: 'timeout',
} as const;

export const CAMPAIGN_STATUS = {
  DRAFT: 'draft',
  SCHEDULED: 'scheduled',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export const CAMPAIGN_CONTACT_STATUS = {
  PENDING: 'pending',
  CALLING: 'calling',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export const CALL_TYPE = {
  PREVIEW: 'preview',
  TEST: 'test',
  TELEPHONY: 'telephony',
} as const;

export const CALL_STATUS = {
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export const RECORDING = {
  TELEPHONY_SAMPLE_RATE: 8000,
  TELEPHONY_MIME_TYPE: 'audio/wav',
  MAX_UPLOAD_BYTES: 50_000_000,
} as const;

export const CAMPAIGN_LIMITS = {
  MAX_CONTACTS: 1000,
  MAX_FILE_BASE64_LENGTH: 15_000_000,
  PHONE_COLUMN_PATTERN: /^(phone|phonenumber|mobile|mobilenumber|number|msisdn|contact|contactnumber)$/i,
} as const;

export const CAMPAIGN_SCHEDULER = {
  /** How often the background scheduler wakes up to process due campaigns. */
  TICK_INTERVAL_MS: 60_000,
  /** Maximum number of calls dispatched per campaign per tick. */
  BATCH_SIZE: 25,
  /** Validates an "HH:MM" 24-hour time-of-day string. */
  TIME_OF_DAY_PATTERN: /^([01]\d|2[0-3]):[0-5]\d$/,
  /**
   * Zone used when a campaign has no stored timezone. Call windows and start
   * times must never fall back to the server process timezone, which varies
   * between a developer machine and a container.
   */
  FALLBACK_TIMEZONE: 'UTC',
  /** Validates an IANA zone name such as "Asia/Kolkata" or "UTC". */
  TIMEZONE_PATTERN: /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+){0,2}$/,
  /** Upper bound on a stored zone name, guarding the DB column. */
  MAX_TIMEZONE_LENGTH: 64,
  /** Validates a zoneless wall-clock stamp "YYYY-MM-DDTHH:MM". */
  LOCAL_DATE_TIME_PATTERN: /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/,
  /** Minutes in a full day, used for wrap-around window maths. */
  MINUTES_PER_DAY: 1440,
  /**
   * How long a contact may sit on "calling" before it is written off as failed.
   *
   * A contact only stays on "calling" while the phone is ringing — the moment
   * the media stream opens it is marked completed. So anything still ringing
   * this long means the provider never sent its hangup callback, and without
   * this sweep the row would show "Calling" forever and its concurrency slot
   * would never be released.
   */
  CALLING_TIMEOUT_MS: 600_000,
} as const;

export type RoutePath = typeof ROUTES[keyof typeof ROUTES];
export type MessageType = typeof MESSAGE_TYPE[keyof typeof MESSAGE_TYPE];
export type VoiceName = typeof VOICE_NAME[keyof typeof VOICE_NAME];
export type TelephonyProviderType = typeof TELEPHONY_PROVIDER[keyof typeof TELEPHONY_PROVIDER];
export type TelephonyDirectionType = typeof TELEPHONY_DIRECTION[keyof typeof TELEPHONY_DIRECTION];
export type CampaignStatus = typeof CAMPAIGN_STATUS[keyof typeof CAMPAIGN_STATUS];
export type CampaignContactStatus = typeof CAMPAIGN_CONTACT_STATUS[keyof typeof CAMPAIGN_CONTACT_STATUS];
export type CallType = typeof CALL_TYPE[keyof typeof CALL_TYPE];
export type CallStatus = typeof CALL_STATUS[keyof typeof CALL_STATUS];
