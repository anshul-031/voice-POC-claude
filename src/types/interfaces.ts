/**
 * TypeScript interfaces for the application.
 */

export interface VoiceAgent {
  id: string;
  name: string;
  systemPrompt: string;
  voiceName: string;
  modelName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface GeminiSession {
  session: unknown;
  // Actually, let's use a more specific type if we can find it, or mark it as an interface.
  voiceName: string;
  model: string;
  startTime: number;
  audioChunksSent: number;
  audioChunksReceived: number;
}

export interface SignalingClient {
  sessionId: string;
  agentId: string;
  audioChunksRelayed: number;
  startTime: number;
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
  RECONNECT_DELAY: number;
}

export interface RoutesConfig {
  API_PREFIX: string;
  WS_PATH: string;
  HEALTH_CHECK: string;
  CONSTANTS_UI_STRINGS: string;
  CONSTANTS_CONFIG: string;
}
