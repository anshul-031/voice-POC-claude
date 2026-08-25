import type { AudioChunkMetrics, Transcript } from './interfaces.js';

export interface GeminiTurnPart {
  inlineData?: {
    mimeType?: string;
    data?: string;
  };
  text?: string;
}

export interface GeminiServerContent {
  modelTurn?: {
    parts?: GeminiTurnPart[];
  };
  interrupted?: boolean;
  inputTranscription?: unknown;
  outputTranscription?: unknown;
  turnComplete?: boolean;
  generationComplete?: boolean;
}

export interface GeminiMessage {
  serverContent?: GeminiServerContent;
  data?: string;
  setupComplete?: boolean;
}

export interface CreateSessionCallbacks {
  systemPrompt?: string;
  voiceName?: string;
  modelName?: string;
  correlationId?: string;
  onAudio?: (audioBase64: string, metrics?: AudioChunkMetrics) => void;
  onTranscript?: (transcript: Transcript) => void;
  onTurnComplete?: () => void;
  onInterrupted?: () => void;
  onError?: (error: Error) => void;
  onClose?: (event: { reason?: string; code?: number }) => void;
}

export interface GeminiRealtimeTextInput {
  text: string;
}

export interface GeminiRealtimeAudioStreamEnd {
  audioStreamEnd: true;
}
