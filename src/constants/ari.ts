import { ARI_ENV_SCHEMA } from './inputSchemas.js';

const DEFAULT_ARI_APP_NAME = 'voice_app';
const DEFAULT_RTP_PORT_MIN = 40000;
const DEFAULT_RTP_PORT_MAX = 45000;

const envParse = ARI_ENV_SCHEMA.safeParse(process.env);
const env = envParse.success ? envParse.data : {};

const resolveRtpHost = (): string => {
  if (env.ARI_RTP_HOST) {
    return env.ARI_RTP_HOST;
  }

  const appUrl = process.env.APP_CALLBACK_URL;
  if (!appUrl) {
    return '';
  }

  try {
    const parsed = new URL(appUrl);
    return parsed.hostname;
  } catch (_error) {
    return '';
  }
};

export const ARI_CONFIG = {
  url: env.ARI_URL || '',
  username: env.ARI_USERNAME || '',
  password: env.ARI_PASSWORD || '',
  appName: env.ARI_APP_NAME || DEFAULT_ARI_APP_NAME,
  rtpHost: resolveRtpHost(),
  defaultAgentId: env.ARI_DEFAULT_AGENT_ID || '',
  rtpPortMin: env.ARI_RTP_PORT_MIN ?? DEFAULT_RTP_PORT_MIN,
  rtpPortMax: env.ARI_RTP_PORT_MAX ?? DEFAULT_RTP_PORT_MAX,
};

export const ARI_RTP_DEFAULTS = {
  PAYLOAD_TYPE: 0,
  VERSION: 2,
  HEADER_BYTES: 12,
  SAMPLE_RATE: 8000,
} as const;

export const ARI_RTP_HANDSHAKE_TIMEOUT_MS = 8000;

export const ARI_RTP_QUEUE_WINDOW_MS = 500;
export const ARI_EXTERNAL_MEDIA_STASIS_TIMEOUT_MS = 3000;

export const ARI_RTP_PACER_INTERVAL_MS = 20;
export const ARI_RTP_PAYLOAD_BYTES = 320;
export const ARI_RTP_SILENCE_BYTE = 0xff;

export const ARI_FALLBACK_SYSTEM_PROMPT =
  'You are a helpful customer support voice agent. Greet the caller, ask how you can help, and keep responses short.';
