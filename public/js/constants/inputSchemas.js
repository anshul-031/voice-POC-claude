import { z } from 'zod';
import { MESSAGE_TYPE } from './config.js';

export const API_REQUEST_SCHEMA = z.object({
  path: z.string().regex(/^\/[a-zA-Z0-9/_-]*$/),
  options: z.record(z.string(), z.unknown()).optional(),
});

export const AGENT_FORM_SCHEMA = z.object({
  id: z.string(),
  name: z.string().trim().min(1),
  systemPrompt: z.string().trim().min(1),
  voiceName: z.string().trim().min(1),
  modelName: z.string().trim().min(1),
  publicPreviewEnabled: z.boolean(),
  inactivityTimeoutMs: z.number().int().min(3000).max(60000).optional(),
  maxInactivityNudges: z.number().int().min(0).max(10).optional(),
  maxCallDurationSecs: z.number().int().min(0).max(3600).optional(),
  callAnalysisEnabled: z.boolean().optional(),
  analysisTemplateName: z.string().trim().max(200).optional(),
}).refine(
  (data) => !data.callAnalysisEnabled || !!data.analysisTemplateName?.trim(),
  { message: 'Analysis template name is required when call analysis is enabled', path: ['analysisTemplateName'] },
);

export const START_CALL_INPUT_SCHEMA = z.object({
  agentId: z.string().trim().min(1),
  variables: z.record(z.string().trim().min(1), z.string()).optional(),
});

export const OUTBOUND_CALL_INPUT_SCHEMA = z.object({
  agentId: z.string().trim().min(1),
  phoneNumber: z.string().trim().min(4).max(30),
});

export const CAMPAIGN_FORM_SCHEMA = z.object({
  name: z.string().trim().min(1),
  agentId: z.string().trim().min(1),
  providerId: z.string().trim().optional(),
  fileName: z.string().trim().optional(),
  fileBase64: z.string().min(1),
});

const CAMPAIGN_TIME_OF_DAY = z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const CAMPAIGN_LOCAL_DATE_TIME = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/);
const CAMPAIGN_TIMEZONE = z.string().trim().min(1).max(64)
  .regex(/^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+){0,2}$/);

// Mirrors SCHEDULE_CAMPAIGN_BODY_SCHEMA on the server. The start time is sent
// as a zoneless wall clock plus an explicit IANA zone so the server resolves the
// instant identically no matter what timezone this browser is set to.
export const CAMPAIGN_SCHEDULE_SCHEMA = z.object({
  scheduledAtLocal: CAMPAIGN_LOCAL_DATE_TIME.nullable().optional(),
  timezone: CAMPAIGN_TIMEZONE.nullable().optional(),
  windowStart: CAMPAIGN_TIME_OF_DAY.nullable().optional(),
  windowEnd: CAMPAIGN_TIME_OF_DAY.nullable().optional(),
}).refine(
  (data) => Boolean(data.windowStart) === Boolean(data.windowEnd),
  { message: 'windowStart and windowEnd must be provided together', path: ['windowEnd'] },
).refine(
  (data) => !data.windowStart || Boolean(data.timezone),
  { message: 'timezone is required when a call window is set', path: ['timezone'] },
).refine(
  (data) => !data.scheduledAtLocal || Boolean(data.timezone),
  { message: 'timezone is required when scheduledAtLocal is set', path: ['timezone'] },
);

export const WS_INBOUND_MESSAGE_SCHEMA = z.union([
  z.object({
    type: z.literal(MESSAGE_TYPE.CALL_STARTED),
    sessionId: z.string().optional(),
    agentName: z.string().optional(),
    voiceName: z.string().optional(),
    modelName: z.string().optional(),
  }).passthrough(),
  z.object({
    type: z.literal(MESSAGE_TYPE.AUDIO_RESPONSE),
    data: z.string().trim().min(1),
  }).passthrough(),
  z.object({
    type: z.literal(MESSAGE_TYPE.TRANSCRIPT),
    role: z.enum(['user', 'model']),
    text: z.string().trim().min(1),
  }).passthrough(),
  z.object({
    type: z.literal(MESSAGE_TYPE.INTERRUPTED),
  }).passthrough(),
  z.object({
    type: z.literal(MESSAGE_TYPE.CALL_ENDED),
    reason: z.string().optional(),
  }).passthrough(),
  z.object({
    type: z.literal(MESSAGE_TYPE.ERROR),
    message: z.string().trim().min(1),
  }).passthrough(),
  z.object({
    type: z.literal(MESSAGE_TYPE.INACTIVITY_NUDGE),
    nudgeNum: z.number(),
    maxNudges: z.number(),
    message: z.string().optional(),
  }).passthrough(),
  z.object({
    type: z.literal(MESSAGE_TYPE.AUTO_CALL_END),
    reason: z.string().optional(),
  }).passthrough(),
]);