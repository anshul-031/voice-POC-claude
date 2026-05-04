/**
 * TypeScript interfaces for the application.
 */

import type { Socket } from 'dgram';

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
  isReady: boolean;
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

export interface AriConfig {
  url: string;
  username: string;
  password: string;
  appName: string;
  rtpHost: string;
  defaultAgentId: string;
  rtpPortMin: number;
  rtpPortMax: number;
}

export interface AriBridgeResponse {
  id: string;
}

export interface AriChannelResponse {
  id: string;
}

export interface AriStasisStartEvent {
  type: 'StasisStart';
  channel: {
    id: string;
    name?: string;
    caller?: {
      number?: string;
    };
  };
  args?: string[];
}

export interface AriStasisEndEvent {
  type: 'StasisEnd';
  channel: {
    id: string;
  };
}

export interface SipRtpRemote {
  address: string;
  port: number;
}

export interface SipCallSession {
  channelId: string;
  sessionId: string;
  agentId: string;
  bridgeId: string;
  externalMediaChannelId: string;
  rtpSequence: number;
  rtpTimestamp: number;
  rtpSsrc: number;
  rtpSocket: Socket;
  rtpRemote?: SipRtpRemote;
  rtpHandshakeTimeout?: ReturnType<typeof setTimeout>;
  pendingAudio?: Array<{ data: string; receivedAt: number }>;
  outboundAudioQueue?: Uint8Array[];
  rtpPacer?: ReturnType<typeof setInterval>;
  startedAt: number;
}
