import { z } from 'zod';
import { AVAILABLE_MODELS, AVAILABLE_VOICES } from './agents.js';
import { SUPPORTED_THEMES } from './index.js';
import { MESSAGE_TYPE, CAMPAIGN_SCHEDULER, TELEPHONY_LIMITS } from '../types/index.js';
import { isValidTimeZone } from '../utils/timezone.js';

const VOICE_IDS = AVAILABLE_VOICES.map((voice) => voice.id);
const MODEL_IDS = AVAILABLE_MODELS.map((model) => model.id);

const isValidVoiceId = (value: string): boolean => VOICE_IDS.includes(value);
const isValidModelId = (value: string): boolean => MODEL_IDS.includes(value);

export const WEBSITE_NAME_SCHEMA = z.string().trim().min(1).max(120);
export const RUNTIME_THEME_SCHEMA = z.enum(SUPPORTED_THEMES);
export const RUNTIME_UI_CONFIG_SCHEMA = z.object({
  websiteName: WEBSITE_NAME_SCHEMA,
  theme: RUNTIME_THEME_SCHEMA,
}).strict();

export const REQUEST_HEADERS_SCHEMA = z.object({
  'content-type': z.string().optional(),
}).passthrough();

export const AGENT_ID_PARAMS_SCHEMA = z.object({
  id: z.string().trim().min(1),
});

export const AGENTS_LIST_QUERY_SCHEMA = z.object({}).strict();

export const CREATE_AGENT_BODY_SCHEMA = z.object({
  name: z.string().trim().min(1),
  systemPrompt: z.string().trim().min(1),
  voiceName: z.string().trim().optional().refine((value) => !value || isValidVoiceId(value)),
  modelName: z.string().trim().optional().refine((value) => !value || isValidModelId(value)),
  publicPreviewEnabled: z.boolean().optional(),
  inactivityTimeoutMs: z.number().int().min(3000).max(60000).optional(),
  maxInactivityNudges: z.number().int().min(0).max(10).optional(),
  maxCallDurationSecs: z.number().int().min(0).max(3600).optional(),
  callAnalysisEnabled: z.boolean().optional(),
  analysisTemplateName: z.string().trim().min(1).max(200).nullable().optional(),
}).strict();

export const UPDATE_AGENT_BODY_SCHEMA = z.object({
  name: z.string().trim().min(1).optional(),
  systemPrompt: z.string().trim().min(1).optional(),
  voiceName: z.string().trim().min(1).optional().refine((value) => !value || isValidVoiceId(value)),
  modelName: z.string().trim().min(1).optional().refine((value) => !value || isValidModelId(value)),
  publicPreviewEnabled: z.boolean().optional(),
  inactivityTimeoutMs: z.number().int().min(3000).max(60000).optional(),
  maxInactivityNudges: z.number().int().min(0).max(10).optional(),
  maxCallDurationSecs: z.number().int().min(0).max(3600).optional(),
  callAnalysisEnabled: z.boolean().optional(),
  analysisTemplateName: z.string().trim().min(1).max(200).nullable().optional(),
}).strict();

export const SIGNALING_START_CALL_MESSAGE_SCHEMA = z.object({
  type: z.literal(MESSAGE_TYPE.START_CALL),
  agentId: z.string().trim().min(1),
  variables: z.record(z.string().trim().min(1), z.string()).optional(),
}).strict();

export const SIGNALING_AUDIO_DATA_MESSAGE_SCHEMA = z.object({
  type: z.literal(MESSAGE_TYPE.AUDIO_DATA),
  data: z.string().trim().min(1),
}).strict();

export const SIGNALING_END_CALL_MESSAGE_SCHEMA = z.object({
  type: z.literal(MESSAGE_TYPE.END_CALL),
}).strict();

export const SIGNALING_MESSAGE_SCHEMA = z.discriminatedUnion('type', [
  SIGNALING_START_CALL_MESSAGE_SCHEMA,
  SIGNALING_AUDIO_DATA_MESSAGE_SCHEMA,
  SIGNALING_END_CALL_MESSAGE_SCHEMA,
]);

export const TELEPHONY_PROVIDER_VALUES = ['vobiz', 'twilio', 'plivo'] as const;
export const TELEPHONY_DIRECTION_VALUES = ['outbound', 'inbound'] as const;

export const SALES_ANALYSER_CREDENTIALS_SCHEMA = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(512),
}).strict();

export const CREATE_TELEPHONY_PROVIDER_SCHEMA = z.object({
  name: z.string().trim().min(1).max(100),
  provider: z.enum(TELEPHONY_PROVIDER_VALUES),
  direction: z.enum(TELEPHONY_DIRECTION_VALUES).optional().default('outbound'),
  isActive: z.boolean().optional().default(true),
  phoneNumber: z.string().trim().max(30).optional(),
  sipServer: z.string().trim().max(255).optional(),
  sipUsername: z.string().trim().max(255).optional(),
  sipPassword: z.string().trim().max(255).optional(),
  apiKey: z.string().trim().max(512).optional(),
  apiSecret: z.string().trim().max(512).optional(),
  accountSid: z.string().trim().max(255).optional(),
  authToken: z.string().trim().max(512).optional(),
  webhookUrl: z.string().trim().max(500).optional(),
  extraConfig: z.string().trim().max(5000).optional(),
  concurrencyLimit: z
    .number()
    .int()
    .min(TELEPHONY_LIMITS.MIN_CONCURRENCY)
    .max(TELEPHONY_LIMITS.MAX_CONCURRENCY)
    .optional()
    .default(TELEPHONY_LIMITS.DEFAULT_CONCURRENCY),
}).strict();

export const UPDATE_TELEPHONY_PROVIDER_SCHEMA = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  provider: z.enum(TELEPHONY_PROVIDER_VALUES).optional(),
  direction: z.enum(TELEPHONY_DIRECTION_VALUES).optional(),
  isActive: z.boolean().optional(),
  phoneNumber: z.string().trim().max(30).optional().nullable(),
  sipServer: z.string().trim().max(255).optional().nullable(),
  sipUsername: z.string().trim().max(255).optional().nullable(),
  sipPassword: z.string().trim().max(255).optional().nullable(),
  apiKey: z.string().trim().max(512).optional().nullable(),
  apiSecret: z.string().trim().max(512).optional().nullable(),
  accountSid: z.string().trim().max(255).optional().nullable(),
  authToken: z.string().trim().max(512).optional().nullable(),
  webhookUrl: z.string().trim().max(500).optional().nullable(),
  extraConfig: z.string().trim().max(5000).optional().nullable(),
  concurrencyLimit: z
    .number()
    .int()
    .min(TELEPHONY_LIMITS.MIN_CONCURRENCY)
    .max(TELEPHONY_LIMITS.MAX_CONCURRENCY)
    .optional(),
}).strict();

export const TELEPHONY_ID_PARAMS_SCHEMA = z.object({
  id: z.string().trim().min(1),
});

export const OUTBOUND_CALL_BODY_SCHEMA = z.object({
  agentId: z.string().trim().min(1),
  phoneNumber: z.string().trim().min(4).max(30),
  providerId: z.string().trim().min(1).optional(),
}).strict();

export const CREATE_CAMPAIGN_BODY_SCHEMA = z.object({
  name: z.string().trim().min(1).max(120),
  agentId: z.string().trim().min(1),
  providerId: z.string().trim().min(1).optional(),
  fileName: z.string().trim().max(255).optional(),
  fileBase64: z.string().min(1).max(15_000_000),
}).strict();

export const UPDATE_CAMPAIGN_BODY_SCHEMA = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  agentId: z.string().trim().min(1).optional(),
  providerId: z.string().trim().min(1).nullable().optional(),
}).strict();

const CAMPAIGN_TIME_OF_DAY_SCHEMA = z
  .string()
  .trim()
  .regex(CAMPAIGN_SCHEDULER.TIME_OF_DAY_PATTERN);

/** An IANA zone name the runtime's ICU data actually recognises. */
export const CAMPAIGN_TIMEZONE_SCHEMA = z
  .string()
  .trim()
  .max(CAMPAIGN_SCHEDULER.MAX_TIMEZONE_LENGTH)
  .regex(CAMPAIGN_SCHEDULER.TIMEZONE_PATTERN)
  .refine(isValidTimeZone, { message: 'Unknown IANA timezone' });

/** A zoneless wall clock, "YYYY-MM-DDTHH:MM", as produced by datetime-local. */
const CAMPAIGN_LOCAL_DATE_TIME_SCHEMA = z
  .string()
  .trim()
  .regex(CAMPAIGN_SCHEDULER.LOCAL_DATE_TIME_PATTERN);

export const SCHEDULE_CAMPAIGN_BODY_SCHEMA = z
  .object({
    /** Absolute instant. Accepted for clients that already resolved the zone. */
    scheduledAt: z.string().datetime().nullable().optional(),
    /**
     * Preferred: the wall clock the user picked, resolved server-side against
     * `timezone`. Keeps the stored instant independent of the browser's and the
     * server's own timezone.
     */
    scheduledAtLocal: CAMPAIGN_LOCAL_DATE_TIME_SCHEMA.nullable().optional(),
    timezone: CAMPAIGN_TIMEZONE_SCHEMA.nullable().optional(),
    windowStart: CAMPAIGN_TIME_OF_DAY_SCHEMA.nullable().optional(),
    windowEnd: CAMPAIGN_TIME_OF_DAY_SCHEMA.nullable().optional(),
  })
  .strict()
  .refine(
    (data) => Boolean(data.windowStart) === Boolean(data.windowEnd),
    { message: 'windowStart and windowEnd must be provided together', path: ['windowEnd'] },
  )
  // A wall-clock value without a zone is exactly the ambiguity that caused
  // campaigns to fire at the wrong hour, so reject it instead of guessing.
  .refine(
    (data) => !data.windowStart || Boolean(data.timezone),
    { message: 'timezone is required when a call window is set', path: ['timezone'] },
  )
  .refine(
    (data) => !data.scheduledAtLocal || Boolean(data.timezone),
    { message: 'timezone is required when scheduledAtLocal is set', path: ['timezone'] },
  );

export const CAMPAIGN_ID_PARAMS_SCHEMA = z.object({
  id: z.string().trim().min(1),
});

export const CALL_HISTORY_ID_PARAMS_SCHEMA = z.object({
  id: z.string().trim().min(1),
});

export const CALL_HISTORY_SESSION_PARAMS_SCHEMA = z.object({
  sessionId: z.string().trim().min(1),
});

export const R2_CONFIG_SCHEMA = z.object({
  accountId: z.string().trim().min(1),
  accessKeyId: z.string().trim().min(1),
  secretAccessKey: z.string().trim().min(1),
  bucket: z.string().trim().min(1),
  endpoint: z.string().trim().url(),
  publicUrl: z.string().trim().url().optional(),
}).strict();

export type AgentIdParams = z.infer<typeof AGENT_ID_PARAMS_SCHEMA>;
export type CreateAgentBody = z.infer<typeof CREATE_AGENT_BODY_SCHEMA>;
export type UpdateAgentBody = z.infer<typeof UPDATE_AGENT_BODY_SCHEMA>;
export type SignalingMessage = z.infer<typeof SIGNALING_MESSAGE_SCHEMA>;
export type RuntimeUiConfig = z.infer<typeof RUNTIME_UI_CONFIG_SCHEMA>;
export type CreateTelephonyProviderBody = z.infer<typeof CREATE_TELEPHONY_PROVIDER_SCHEMA>;
export type UpdateTelephonyProviderBody = z.infer<typeof UPDATE_TELEPHONY_PROVIDER_SCHEMA>;
export type TelephonyIdParams = z.infer<typeof TELEPHONY_ID_PARAMS_SCHEMA>;
export type OutboundCallBody = z.infer<typeof OUTBOUND_CALL_BODY_SCHEMA>;
export type CreateCampaignBody = z.infer<typeof CREATE_CAMPAIGN_BODY_SCHEMA>;
export type UpdateCampaignBody = z.infer<typeof UPDATE_CAMPAIGN_BODY_SCHEMA>;
export type ScheduleCampaignBody = z.infer<typeof SCHEDULE_CAMPAIGN_BODY_SCHEMA>;
export type CampaignIdParams = z.infer<typeof CAMPAIGN_ID_PARAMS_SCHEMA>;
export type CallHistoryIdParams = z.infer<typeof CALL_HISTORY_ID_PARAMS_SCHEMA>;
export type CallHistorySessionParams = z.infer<typeof CALL_HISTORY_SESSION_PARAMS_SCHEMA>;
export type R2Config = z.infer<typeof R2_CONFIG_SCHEMA>;
export type SalesAnalyserCredentials = z.infer<typeof SALES_ANALYSER_CREDENTIALS_SCHEMA>;