/**
 * TypeScript interfaces for the application.
 */

export interface VoiceAgent {
  id: string;
  name: string;
  systemPrompt: string;
  voiceName: string;
  modelName: string;
  publicPreviewEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface GeminiSession {
  session: unknown;
  // Actually, let's use a more specific type if we can find it, or mark it as an interface.
  voiceName: string;
  model: string;
  correlationId?: string;
  startTime: number;
  audioChunksSent: number;
  audioChunksReceived: number;
  firstClientAudioAt?: number;
  firstModelAudioAt?: number;
  firstUserTranscriptAt?: number;
  firstModelTranscriptAt?: number;
  firstTextPromptAt?: number;
  lastAudioChunkSentAt?: number;
  firstResponseLatencyWarned?: boolean;
}

export interface SignalingClient {
  sessionId: string;
  agentId: string;
  correlationId?: string;
  audioChunksRelayed: number;
  modelAudioChunksRelayed: number;
  startTime: number;
  firstModelAudioRelayedAt?: number;
  firstUserTranscriptRelayedAt?: number;
  firstModelTranscriptRelayedAt?: number;
  proactiveGreetingSent: boolean;
  proactiveGreetingSentAt?: number;
  lastModelResponseAt: number;
  lastUserAudioAt: number;
  nudgeCount: number;
  inactivityTimeoutMs: number;
  maxInactivityNudges: number;
  maxCallDurationSecs: number;
  inactivityTimer?: ReturnType<typeof setInterval>;
  callDurationTimer?: ReturnType<typeof setTimeout>;
}

export interface Transcript {
  role: 'user' | 'model';
  text: string;
}

export interface AudioConfig {
  DEFAULT_MODEL: string;
  MIME_TYPE: string;
  SAMPLE_RATE_INPUT: number;
  SAMPLE_RATE_OUTPUT: number;
}

export interface TimeConstants {
  MS_TO_SEC: number;
  GEMINI_CONNECT_TIMEOUT_MS: number;
}

export interface RoutesConfig {
  API_PREFIX: string;
  WS_PATH: string;
  HEALTH_CHECK: string;
  RUNTIME_CONFIG: string;
  CONSTANTS_UI_STRINGS: string;
  CONSTANTS_CONFIG: string;
}

export interface RuntimeUiConfig {
  websiteName: string;
  theme: 'dark' | 'light';
}

export interface TelephonyProviderConfig {
  id: string;
  name: string;
  provider: string;
  direction: string;
  isActive: boolean;
  phoneNumber?: string | null;
  sipServer?: string | null;
  sipUsername?: string | null;
  sipPassword?: string | null;
  apiKey?: string | null;
  apiSecret?: string | null;
  accountSid?: string | null;
  authToken?: string | null;
  webhookUrl?: string | null;
  extraConfig?: string | null;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}
