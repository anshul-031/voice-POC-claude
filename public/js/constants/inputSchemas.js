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
});

export const START_CALL_INPUT_SCHEMA = z.object({
  agentId: z.string().trim().min(1),
});

export const OUTBOUND_CALL_INPUT_SCHEMA = z.object({
  agentId: z.string().trim().min(1),
  phoneNumber: z.string().trim().min(4).max(30),
});

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