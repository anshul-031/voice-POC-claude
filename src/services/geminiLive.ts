import { GoogleGenAI, Modality } from '@google/genai';
import {
  getTranscriptText,
  logGenerationComplete,
  logMessageEnvelope,
  logTranscriptMilestone,
  logTranscriptPayload,
  logTurnComplete,
  markFirstModelAudio,
  shouldLogChunkProgress,
} from './geminiLiveLogging.js';
import { closeGeminiSession, sendAudioToGemini, sendTextToGemini } from './geminiLiveTransport.js';
import { AUDIO_CONFIG, LIVE_CALL } from '../types/index.js';
import type { GeminiSession, Transcript } from '../types/index.js';
import type {
  CreateSessionCallbacks,
  GeminiMessage,
  GeminiServerContent,
  GeminiTurnPart,
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
          },
          onmessage: (message: unknown) => {
            this._handleMessage(sessionId, message, onAudio, onTranscript, onInterrupted);
          },
          onerror: (error: unknown) => {
            const errorMsg = error instanceof Error ? error.message : String(error || 'Unknown Gemini error');
            logger.error('Gemini Live session error', {
              sessionId,
              error: errorMsg,
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

      this.sessions.set(sessionId, {
        session,
        voiceName: voice,
        model,
        correlationId,
        startTime,
        audioChunksSent: 0,
        audioChunksReceived: 0,
      });
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
    if (payload.data && !payload.serverContent) this._processDirectAudio(sessionId, payload.data, onAudio);
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
      this._processModelTurnParts(sessionId, content.modelTurn.parts, onAudio, onTranscript);
    }
    if (content.turnComplete) logTurnComplete(sessionId, entry);
    if (content.generationComplete) logGenerationComplete(sessionId, entry);

    if (content.interrupted) {
      logger.info('Model interrupted', { sessionId });
      if (onInterrupted) onInterrupted();
    }

    this._processServerTranscriptions(sessionId, content, onTranscript);
  }

  private _processServerTranscriptions(
    sessionId: string,
    content: GeminiServerContent,
    onTranscript?: (transcript: Transcript) => void,
  ): void {
    if (content.inputTranscription !== undefined && content.inputTranscription !== null) {
      this._processTranscription(sessionId, content.inputTranscription, 'user', onTranscript);
    }
    if (content.outputTranscription !== undefined && content.outputTranscription !== null) {
      this._processTranscription(sessionId, content.outputTranscription, 'model', onTranscript);
    }
  }

  private _processModelTurnParts(
    sessionId: string,
    parts: GeminiTurnPart[],
    onAudio?: (audio: string) => void,
    onTranscript?: (transcript: Transcript) => void,
  ): void {
    for (const part of parts) {
      if (part.inlineData?.mimeType?.startsWith('audio/') && part.inlineData.data) {
        this._processDirectAudio(sessionId, part.inlineData.data, onAudio);
      }
      if (part.text && onTranscript) onTranscript({ role: 'model', text: part.text });
    }
  }

  private _processTranscription(
    sessionId: string,
    transcription: unknown,
    role: 'user' | 'model',
    onTranscript?: (transcript: Transcript) => void,
  ): void {
    const entry = this.sessions.get(sessionId);
    const now = Date.now();
    const finalMsg = getTranscriptText(transcription);

    logTranscriptMilestone(sessionId, entry, role, now);
    logTranscriptPayload(sessionId, role, finalMsg);
    if (onTranscript) onTranscript({ role, text: finalMsg });
  }

  private _processDirectAudio(sessionId: string, data: string, onAudio?: (audio: string) => void): void {
    const entry = this.sessions.get(sessionId);
    const now = Date.now();

    if (entry) {
      entry.audioChunksReceived++;
      markFirstModelAudio(sessionId, entry, now);
      if (shouldLogChunkProgress(entry.audioChunksReceived)) {
        logger.debug('Audio data received', {
          sessionId,
          totalReceived: entry.audioChunksReceived,
          correlationId: entry.correlationId,
        });
      }
    }

    if (onAudio) onAudio(data);
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

  public hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }
}

const geminiLiveService = new GeminiLiveService();
export default geminiLiveService;
