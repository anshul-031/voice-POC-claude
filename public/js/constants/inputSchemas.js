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
});

export const START_CALL_INPUT_SCHEMA = z.object({
  agentId: z.string().trim().min(1),
});

export const WS_INBOUND_MESSAGE_SCHEMA = z.union([
  z.object({
    type: z.literal(MESSAGE_TYPE.CALL_STARTED),
    sessionId: z.string().optional(),
    agentName: z.string().optional(),
  }).strict(),
  z.object({
    type: z.literal(MESSAGE_TYPE.AUDIO_RESPONSE),
    data: z.string().trim().min(1),
  }).strict(),
  z.object({
    type: z.literal(MESSAGE_TYPE.TRANSCRIPT),
    role: z.enum(['user', 'model']),
    text: z.string().trim().min(1),
  }).strict(),
  z.object({
    type: z.literal(MESSAGE_TYPE.CALL_ENDED),
    reason: z.string().optional(),
  }).strict(),
  z.object({
    type: z.literal(MESSAGE_TYPE.ERROR),
    message: z.string().trim().min(1),
  }).strict(),
]);