import { z } from 'zod';
import { AVAILABLE_MODELS, AVAILABLE_VOICES } from './agents.js';
import { SUPPORTED_THEMES } from './index.js';
import { MESSAGE_TYPE } from '../types/index.js';

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
}).strict();

export const UPDATE_AGENT_BODY_SCHEMA = z.object({
  name: z.string().trim().min(1).optional(),
  systemPrompt: z.string().trim().min(1).optional(),
  voiceName: z.string().trim().min(1).optional().refine((value) => !value || isValidVoiceId(value)),
  modelName: z.string().trim().min(1).optional().refine((value) => !value || isValidModelId(value)),
  publicPreviewEnabled: z.boolean().optional(),
}).strict();

export const SIGNALING_START_CALL_MESSAGE_SCHEMA = z.object({
  type: z.literal(MESSAGE_TYPE.START_CALL),
  agentId: z.string().trim().min(1),
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

export const ARI_ENV_SCHEMA = z.object({
  ARI_URL: z.string().trim().url().optional(),
  ARI_USERNAME: z.string().trim().min(1).optional(),
  ARI_PASSWORD: z.string().trim().min(1).optional(),
  ARI_APP_NAME: z.string().trim().min(1).optional(),
  ARI_RTP_HOST: z.string().trim().min(1).optional(),
  ARI_DEFAULT_AGENT_ID: z.string().trim().min(1).optional(),
  ARI_RTP_PORT_MIN: z.coerce.number().int().min(10000).max(65000).optional(),
  ARI_RTP_PORT_MAX: z.coerce.number().int().min(10000).max(65000).optional(),
}).passthrough();

export const ARI_STASIS_START_SCHEMA = z.object({
  type: z.literal('StasisStart'),
  channel: z.object({
    id: z.string().trim().min(1),
    name: z.string().trim().optional(),
    caller: z.object({
      number: z.string().trim().optional(),
    }).optional(),
  }).passthrough(),
  args: z.array(z.string()).optional(),
}).passthrough();

export const ARI_STASIS_END_SCHEMA = z.object({
  type: z.literal('StasisEnd'),
  channel: z.object({
    id: z.string().trim().min(1),
  }).passthrough(),
}).passthrough();

export type AgentIdParams = z.infer<typeof AGENT_ID_PARAMS_SCHEMA>;
export type CreateAgentBody = z.infer<typeof CREATE_AGENT_BODY_SCHEMA>;
export type UpdateAgentBody = z.infer<typeof UPDATE_AGENT_BODY_SCHEMA>;
export type SignalingMessage = z.infer<typeof SIGNALING_MESSAGE_SCHEMA>;
export type RuntimeUiConfig = z.infer<typeof RUNTIME_UI_CONFIG_SCHEMA>;