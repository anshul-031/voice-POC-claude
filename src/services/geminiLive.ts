import { GoogleGenAI, Modality } from '@google/genai';
import {
  logGenerationComplete,
  logMessageEnvelope,
  logTurnComplete,
} from './geminiLiveLogging.js';
import {
  processDirectAudio,
  processModelTurnParts,
  processTranscription,
} from './geminiLiveHandlers.js';
import { closeGeminiSession, sendAudioToGemini, sendTextToGemini } from './geminiLiveTransport.js';
import { AUDIO_CONFIG, LIVE_CALL } from '../types/index.js';
import type { GeminiSession, Transcript } from '../types/index.js';
import type {
  CreateSessionCallbacks,
  GeminiMessage,
  GeminiServerContent,
} from '../types/geminiLive.js';
import logger from '../utils/logger.js';

class GeminiLiveService {
  private ai: GoogleGenAI;
  /** @internal */
  public sessions: Map<string, GeminiSession>;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not defined');
    // @ts-expect-error - SDK constructor types are strictly checked but it accepts string
    this.ai = new GoogleGenAI(apiKey);
    this.sessions = new Map<string, GeminiSession>();
    logger.info('GeminiLive Service initialized');
  }

  private _resolveModel(modelName?: string): string {
    const model = modelName || AUDIO_CONFIG.DEFAULT_MODEL;
    const supportedLiveModels = [
      'gemini-2.5-flash-native-audio-latest',
      'gemini-3.1-flash-live-preview',
      'gemini-2.5-flash-native-audio-preview-12-2025',
      'gemini-2.5-flash-native-audio-preview-09-2025',
      'gemini-2.0-flash',
      'gemini-2.0-flash-exp',
    ];
    if (supportedLiveModels.includes(model)) return model;
    logger.warn('Model does not support Gemini Live API, falling back to default', {
      requested: model,
      fallback: AUDIO_CONFIG.DEFAULT_MODEL,
    });
    return AUDIO_CONFIG.DEFAULT_MODEL;
  }

  private _buildConfig(voice: string, systemPrompt?: string): Record<string, unknown> {
    const config: Record<string, unknown> = {
      responseModalities: [Modality.AUDIO],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      realtimeInputConfig: {
        automaticActivityDetection: {
          startOfSpeechSensitivity: LIVE_CALL.VAD_START_SENSITIVITY,
          endOfSpeechSensitivity: LIVE_CALL.VAD_END_SENSITIVITY,
          prefixPaddingMs: LIVE_CALL.VAD_PREFIX_PADDING_MS,
          silenceDurationMs: LIVE_CALL.VAD_SILENCE_DURATION_MS,
        },
      },
      inputAudioTranscription: { enabled: true },
      outputAudioTranscription: { enabled: true },
    };
    if (systemPrompt) config.systemInstruction = systemPrompt;
    return config;
  }

  private _toGeminiMessage(message: unknown): GeminiMessage {
    if (!message || typeof message !== 'object') return {};
    return message as GeminiMessage;
  }

  async createSession(sessionId: string, callbacks: CreateSessionCallbacks): Promise<void> {
    const {
      systemPrompt,
      voiceName,
      modelName,
      correlationId,
      onAudio,
      onTranscript,
      onInterrupted,
      onError,
      onClose,
    } = callbacks;
    try {
      const model = this._resolveModel(modelName);
      const voice = voiceName || 'Puck';
      const config = this._buildConfig(voice, systemPrompt);

      logger.info('Creating Gemini Live session', {
        sessionId,
        model,
        voice,
        systemPromptSnippet: (systemPrompt || '').substring(0, 80),
        correlationId,
      });
      logger.info('Applied Gemini Live first-turn tuning', {
        sessionId,
        startSensitivity: LIVE_CALL.VAD_START_SENSITIVITY,
        endSensitivity: LIVE_CALL.VAD_END_SENSITIVITY,
        prefixPaddingMs: LIVE_CALL.VAD_PREFIX_PADDING_MS,
        silenceDurationMs: LIVE_CALL.VAD_SILENCE_DURATION_MS,
        correlationId,
      });

      const startTime = Date.now();
      logger.debug('Connecting to Gemini Live API', { sessionId, model, correlationId });

      let pendingReady = false;
      const session = await this.ai.live.connect({
        model,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        config: config as any,
        callbacks: {
          onopen: () => {
            logger.info('Gemini Live session opened', {
              sessionId,
              elapsedMs: Date.now() - startTime,
              correlationId,
            });
            const entry = this.sessions.get(sessionId);
            if (entry) {
              entry.isReady = true;
            } else {
              pendingReady = true;
            }
          },
          onmessage: (message: unknown) => {
            this._handleMessage(sessionId, message, onAudio, onTranscript, onInterrupted);
          },
          onerror: (error: unknown) => {
            const errorMsg = error instanceof Error
              ? error.message
              : (typeof error === 'object' && error !== null
                ? JSON.stringify(error)
                : String(error || 'Unknown Gemini error'));
            logger.error('Gemini Live session error', {
              sessionId,
              error: errorMsg,
              errorType: typeof error,
              stack: error instanceof Error ? error.stack : undefined,
              correlationId,
            });
            if (onError) onError(new Error(errorMsg));
          },
          onclose: (event: { reason?: string; code?: number }) => {
            logger.info('Gemini Live session closed', {
              sessionId,
              reason: event?.reason || event?.code || 'unknown',
              correlationId,
            });
            this.sessions.delete(sessionId);
            if (onClose) onClose(event);
          },
        },
      });

      const entry: GeminiSession = {
        session,
        voiceName: voice,
        model,
        correlationId,
        isReady: false,
        startTime,
        audioChunksSent: 0,
        audioChunksReceived: 0,
      };
      if (pendingReady) {
        entry.isReady = true;
      }
      this.sessions.set(sessionId, entry);
      logger.debug('Gemini Live session registered', { sessionId, correlationId });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to create Gemini Live session', {
        sessionId,
        error: errMsg,
        stack: error instanceof Error ? error.stack : undefined,
        correlationId,
      });
      throw error;
    }
  }

  private _handleMessage(
    sessionId: string,
    message: unknown,
    onAudio?: (audio: string) => void,
    onTranscript?: (transcript: Transcript) => void,
    onInterrupted?: () => void,
  ): void {
    const payload = this._toGeminiMessage(message);
    logMessageEnvelope(sessionId, payload);
    if (!this.sessions.has(sessionId)) return;

    if (payload.serverContent) {
      this._processServerContent(sessionId, payload.serverContent, onAudio, onTranscript, onInterrupted);
    }
    if (payload.data && !payload.serverContent) {
      processDirectAudio({
        sessionId,
        data: payload.data,
        entry: this.sessions.get(sessionId),
        onAudio,
      });
    }
    if (payload.setupComplete) logger.info('Gemini setup complete', { sessionId });
  }

  private _processServerContent(
    sessionId: string,
    content: GeminiServerContent,
    onAudio?: (audio: string) => void,
    onTranscript?: (transcript: Transcript) => void,
    onInterrupted?: () => void,
  ): void {
    const entry = this.sessions.get(sessionId);

    if (content.modelTurn?.parts) {
      processModelTurnParts({
        sessionId,
        parts: content.modelTurn.parts,
        entry,
        onAudio,
        onTranscript,
      });
    }
    if (content.turnComplete) logTurnComplete(sessionId, entry);
    if (content.generationComplete) logGenerationComplete(sessionId, entry);

    if (content.interrupted) {
      logger.info('Model interrupted', { sessionId });
      if (onInterrupted) onInterrupted();
    }

    this._processServerTranscriptions(sessionId, content, entry, onTranscript);
  }

  private _processServerTranscriptions(
    sessionId: string,
    content: GeminiServerContent,
    entry: GeminiSession | undefined,
    onTranscript?: (transcript: Transcript) => void,
  ): void {
    if (content.inputTranscription !== undefined && content.inputTranscription !== null) {
      processTranscription({
        sessionId,
        transcription: content.inputTranscription,
        role: 'user',
        entry,
        onTranscript,
      });
    }
    if (content.outputTranscription !== undefined && content.outputTranscription !== null) {
      processTranscription({
        sessionId,
        transcription: content.outputTranscription,
        role: 'model',
        entry,
        onTranscript,
      });
    }
  }

  async sendAudio(sessionId: string, audioBase64: string): Promise<void> {
    const entry = this.sessions.get(sessionId);
    if (!entry) {
      logger.warn('Attempted to send audio for missing Gemini session', { sessionId });
      return;
    }

    await sendAudioToGemini(sessionId, entry, audioBase64);
  }

  async sendText(sessionId: string, text: string, reason = 'client-message'): Promise<boolean> {
    const entry = this.sessions.get(sessionId);
    if (!entry) {
      logger.warn('Attempted to send text for missing Gemini session', { sessionId, reason });
      return false;
    }

    return sendTextToGemini(sessionId, entry, text, reason);
  }

  async closeSession(sessionId: string): Promise<void> {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;
    await closeGeminiSession(sessionId, entry);
    this.sessions.delete(sessionId);
  }

  public isSessionReady(sessionId: string): boolean {
    return this.sessions.get(sessionId)?.isReady ?? false;
  }

  public hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }
}

const geminiLiveService = new GeminiLiveService();
export default geminiLiveService;
