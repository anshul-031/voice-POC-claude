import { GoogleGenAI, Modality } from '@google/genai';
import logger from '../utils/logger.js';
import { AUDIO_CONFIG } from '../types/index.js';
import type { GeminiSession, Transcript } from '../types/index.js';

/**
 * Manages Gemini Live API sessions for real-time voice interaction.
 * Each session maintains a persistent WebSocket connection to Gemini.
 */
class GeminiLiveService {
  private ai: GoogleGenAI;
  /** @internal */
  public sessions: Map<string, GeminiSession>;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined');
    }
    // @ts-expect-error - SDK constructor types are strictly checked but it accepts string
    this.ai = new GoogleGenAI(apiKey);
    this.sessions = new Map<string, GeminiSession>();
    logger.info('GeminiLive Service initialized');
  }

  /**
   * Resolve model name with fallback for unsupported Live API models.
   */
  private _resolveModel(modelName?: string): string {
    const model = modelName || AUDIO_CONFIG.DEFAULT_MODEL;
    // Native audio and newer Live API models that support bidiGenerateContent
    const supportedLiveModels = [
      'gemini-2.5-flash-native-audio-latest',
      'gemini-3.1-flash-live-preview',
      'gemini-2.5-flash-native-audio-preview-12-2025',
      'gemini-2.5-flash-native-audio-preview-09-2025',
      'gemini-2.0-flash',
      'gemini-2.0-flash-exp',
    ];
    if (!supportedLiveModels.includes(model)) {
      logger.warn('Model does not support Gemini Live API, falling back to default', {
        requested: model,
        fallback: AUDIO_CONFIG.DEFAULT_MODEL,
      });
      return AUDIO_CONFIG.DEFAULT_MODEL;
    }
    return model;
  }

  /**
   * Create a new Gemini Live session for voice conversation.
   */
  async createSession(
    sessionId: string,
    {
      systemPrompt,
      voiceName,
      modelName,
      onAudio,
      onTranscript,
      onInterrupted,
      onError,
      onClose,
    }: {
      systemPrompt?: string;
      voiceName?: string;
      modelName?: string;
      onAudio?: (audioBase64: string) => void;
      onTranscript?: (transcript: Transcript) => void;
      onInterrupted?: () => void;
      onError?: (error: Error) => void;
      onClose?: (event: { reason?: string; code?: number }) => void;
    },
  ): Promise<void> {
    try {
      const model = this._resolveModel(modelName);

      logger.info('Creating Gemini Live session', {
        sessionId,
        model,
        voice: voiceName || 'Puck',
        systemPromptSnippet: (systemPrompt || '').substring(0, 80),
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const config: any = {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voiceName || 'Puck',
            },
          },
        },
        inputAudioTranscription: { enabled: true },
        outputAudioTranscription: { enabled: true },
      };

      if (systemPrompt) {
        config.systemInstruction = systemPrompt;
      }

      const startTime = Date.now();

      const session = await this.ai.live.connect({
        model,
        config,
        callbacks: {
          onopen: () => {
            const elapsed = Date.now() - startTime;
            logger.info('Gemini Live session opened', {
              sessionId,
              elapsedMs: elapsed,
            });
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onmessage: (message: any) => {
            this._handleMessage(sessionId, message, onAudio, onTranscript, onInterrupted);
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onerror: (e: any) => {
            const errorMsg = e.message || (typeof e === 'string' ? e : 'Unknown Gemini error');
            logger.error('Gemini Live session error', {
              sessionId,
              error: errorMsg,
              stack: e.stack,
            });
            if (onError) onError(new Error(errorMsg));
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onclose: (e: any) => {
            logger.info('Gemini Live session closed', {
              sessionId,
              reason: e?.reason || e?.code || 'unknown',
            });
            this.sessions.delete(sessionId);
            if (onClose) onClose(e);
          },
        },
      });

      const sessionEntry: GeminiSession = {
        session,
        voiceName: voiceName || 'Puck',
        model,
        startTime: Date.now(),
        audioChunksSent: 0,
        audioChunksReceived: 0,
      };
      this.sessions.set(sessionId, sessionEntry);
      logger.debug('Gemini Live session registered', { sessionId });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to create Gemini Live session', {
        sessionId,
        error: errMsg,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Handle messages from Gemini Live API
   */
  private _handleMessage(
    sessionId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    message: any,
    onAudio?: (audio: string) => void,
    onTranscript?: (transcript: Transcript) => void,
    onInterrupted?: () => void,
  ): void {
    logger.info('Gemini Message received', { keys: Object.keys(message), sample: JSON.stringify(message).substring(0, 500) });
    const entry = this.sessions.get(sessionId);
    if (!entry) return;

    if (message.serverContent) {
      this._processServerContent(sessionId, message.serverContent, onAudio, onTranscript, onInterrupted);
    }

    if (message.data && !message.serverContent) {
      this._processDirectAudio(sessionId, message.data, onAudio);
    }

    if (message.setupComplete) {
      logger.info('Gemini setup complete', { sessionId });
    }
  }

  private _processServerContent(
    sessionId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    content: any,
    onAudio?: (audio: string) => void,
    onTranscript?: (transcript: Transcript) => void,
    onInterrupted?: () => void,
  ): void {
    if (content.modelTurn?.parts) {
      this._processModelTurnParts(sessionId, content.modelTurn.parts, onAudio, onTranscript);
    }
    if (content.interrupted) {
      logger.info('Model interrupted', { sessionId });
      if (onInterrupted) onInterrupted();
    }
    if (content.inputTranscription) this._processTranscription(sessionId, content.inputTranscription, 'user', onTranscript);
    if (content.outputTranscription) this._processTranscription(sessionId, content.outputTranscription, 'model', onTranscript);
  }

  private _processModelTurnParts(
    sessionId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parts: any[],
    onAudio?: (audio: string) => void,
    onTranscript?: (transcript: Transcript) => void,
  ): void {
    for (const part of parts) {
      if (part.inlineData?.mimeType?.startsWith('audio/') && part.inlineData.data) {
        this._processDirectAudio(sessionId, part.inlineData.data, onAudio);
      }
      if (part.text && onTranscript) {
        onTranscript({ role: 'model', text: part.text });
      }
    }
  }

  private _processTranscription(
    sessionId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transcription: any,
    role: 'user' | 'model',
    onTranscript?: (transcript: Transcript) => void,
  ): void {
    const text = transcription.text || transcription;
    const finalMsg = typeof text === 'string' ? text : JSON.stringify(text);
    logger.info(`${role === 'user' ? 'User' : 'Output'} transcript received`, { sessionId, text: finalMsg });
    if (onTranscript) onTranscript({ role, text: finalMsg });
  }

  private _processDirectAudio(sessionId: string, data: string, onAudio?: (audio: string) => void): void {
    const entry = this.sessions.get(sessionId);
    if (entry) entry.audioChunksReceived++;
    logger.debug('Audio data received', { sessionId, totalReceived: entry?.audioChunksReceived });
    if (onAudio) onAudio(data);
  }

  async sendAudio(sessionId: string, audioBase64: string): Promise<void> {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;
    try {
      entry.audioChunksSent++;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (entry.session as any).sendRealtimeInput({
        audio: { data: audioBase64, mimeType: AUDIO_CONFIG.MIME_TYPE },
      });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('Error sending audio', { sessionId, error: errMsg });
    }
  }

  async sendText(sessionId: string, text: string): Promise<void> {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (entry.session as any).sendClientContent([{ text }], true);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('Error sending text', { sessionId, error: errMsg });
    }
  }

  async closeSession(sessionId: string): Promise<void> {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (entry.session as any).close();
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('Error closing Gemini session', { sessionId, error: errMsg });
    } finally {
      this.sessions.delete(sessionId);
    }
  }

  public hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }
}

const geminiLiveService = new GeminiLiveService();
export default geminiLiveService;
