import { GoogleGenAI, Modality } from '@google/genai';
import logger from '../utils/logger.js';
import { AUDIO_CONFIG, TIME } from '../constants/index.js';

/**
 * Manages Gemini Live API sessions for real-time voice interaction.
 * Each session maintains a persistent WebSocket connection to Gemini.
 */
class GeminiLiveService {
  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    this.sessions = new Map();
    logger.info('GeminiLive Service initialized');
  }

  /**
   * Create a new Gemini Live session for voice conversation.
   */
  async createSession(sessionId, { systemPrompt, voiceName, modelName, onAudio, onTranscript, onInterrupted, onError, onClose }) {
    try {
      const model = modelName || AUDIO_CONFIG.DEFAULT_MODEL;
      
      logger.info('Creating Gemini Live session', {
        sessionId,
        model,
        voice: voiceName || 'Puck',
        systemPromptSnippet: (systemPrompt || '').substring(0, 80),
      });

      const config = {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voiceName || 'Puck',
            },
          },
        },
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
          onmessage: (message) => {
            this._handleMessage(sessionId, message, onAudio, onTranscript, onInterrupted);
          },
          onerror: (e) => {
            const errorMsg = e.message || (typeof e === 'string' ? e : 'Unknown Gemini error');
            logger.error('Gemini Live session error', {
              sessionId,
              error: errorMsg,
              // @ts-ignore - stack might not exist on all error types from SDK
              stack: e.stack,
            });
            if (onError) onError(e);
          },
          onclose: (e) => {
            logger.info('Gemini Live session closed', {
              sessionId,
              reason: e?.reason || e?.code || 'unknown',
            });
            this.sessions.delete(sessionId);
            if (onClose) onClose(e);
          },
        },
      });

      this.sessions.set(sessionId, { session, voiceName, model, startTime: Date.now(), audioChunksSent: 0, audioChunksReceived: 0 });
      logger.debug('Gemini Live session registered', { sessionId });
      return session;
    } catch (error) {
      logger.error('Failed to create Gemini Live session', {
        sessionId,
        error: error.message || error,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Handle messages from Gemini Live API
   */
  _handleMessage(sessionId, message, onAudio, onTranscript, onInterrupted) {
    const entry = this.sessions.get(sessionId);

    // Handle serverContent (main message format)
    if (message.serverContent) {
      const serverContent = message.serverContent;

      if (serverContent.modelTurn && serverContent.modelTurn.parts) {
        for (const part of serverContent.modelTurn.parts) {
          // Audio data
          if (part.inlineData && part.inlineData.mimeType?.startsWith('audio/')) {
            if (entry) entry.audioChunksReceived++;
            const dataSize = part.inlineData.data ? part.inlineData.data.length : 0;
            
            logger.debug('Audio chunk received from Gemini', {
              sessionId,
              dataSize,
              totalReceived: entry?.audioChunksReceived,
            });

            if (onAudio) {
              onAudio(part.inlineData.data);
            }
          }

          // Text transcript from model
          if (part.text) {
            logger.info('Model transcript received', {
              sessionId,
              text: part.text,
            });
            if (onTranscript) {
              onTranscript({ role: 'model', text: part.text });
            }
          }
        }
      }

      // Turn complete
      if (serverContent.turnComplete) {
        logger.debug('Turn complete', { sessionId });
      }

      // Check if model was interrupted
      if (serverContent.interrupted) {
        logger.info('Model interrupted', { sessionId });
        if (onInterrupted) onInterrupted();
      }

      // Input transcription (what the user said)
      if (serverContent.inputTranscription) {
        const text = serverContent.inputTranscription.text || serverContent.inputTranscription;
        logger.info('User transcript received', {
          sessionId,
          text: typeof text === 'string' ? text : JSON.stringify(text),
        });
        if (onTranscript) {
          onTranscript({ role: 'user', text: typeof text === 'string' ? text : JSON.stringify(text) });
        }
      }

      // Output transcription
      if (serverContent.outputTranscription) {
        const text = serverContent.outputTranscription.text || serverContent.outputTranscription;
        logger.info('Output transcript received', {
          sessionId,
          text: typeof text === 'string' ? text : JSON.stringify(text),
        });
        if (onTranscript) {
          onTranscript({ role: 'model', text: typeof text === 'string' ? text : JSON.stringify(text) });
        }
      }
    }

    // Some SDK versions deliver audio in message.data directly
    if (message.data && !message.serverContent) {
      if (entry) entry.audioChunksReceived++;
      logger.debug('Direct audio data received from Gemini', {
        sessionId,
        totalReceived: entry?.audioChunksReceived,
      });
      if (onAudio) {
        onAudio(message.data);
      }
    }

    // Log any setup complete or other messages
    if (message.setupComplete) {
      logger.info('Gemini setup complete', { sessionId });
    }
  }

  /**
   * Send audio data to the Gemini Live session using sendRealtimeInput
   */
  async sendAudio(sessionId, audioBase64) {
    const entry = this.sessions.get(sessionId);
    if (!entry) {
      logger.warn('No session found for sending audio', { sessionId });
      return;
    }

    try {
      entry.audioChunksSent++;
      if (entry.audioChunksSent % 50 === 1) {
        logger.debug('Sending audio to Gemini', {
          sessionId,
          chunkCount: entry.audioChunksSent,
          dataSize: audioBase64.length,
        });
      }

      await entry.session.sendRealtimeInput({
        audio: {
          data: audioBase64,
          mimeType: AUDIO_CONFIG.MIME_TYPE,
        },
      });
    } catch (error) {
      logger.error('Error sending audio to Gemini', {
        sessionId,
        error: error.message,
      });
    }
  }

  /**
   * Send text message to the Gemini Live session
   */
  async sendText(sessionId, text) {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;

    try {
      logger.info('Sending text to Gemini', { sessionId, text });
      await entry.session.sendClientContent({
        turns: [{ role: 'user', parts: [{ text }] }],
        turnComplete: true,
      });
    } catch (error) {
      logger.error('Error sending text to Gemini', {
        sessionId,
        error: error.message,
      });
    }
  }

  /**
   * Close a Gemini Live session
   */
  async closeSession(sessionId) {
    const entry = this.sessions.get(sessionId);
    if (entry) {
      const duration = Math.round((Date.now() - entry.startTime) / TIME.MS_TO_SEC);
      logger.info('Closing Gemini session', {
        sessionId,
        durationSeconds: duration,
        audioChunksSent: entry.audioChunksSent,
        audioChunksReceived: entry.audioChunksReceived,
      });
      try {
        await entry.session.close();
      } catch (error) {
        logger.debug('Error closing Gemini session (expected)', {
          sessionId,
          error: error.message,
        });
      }
      this.sessions.delete(sessionId);
    }
  }

  hasSession(sessionId) {
    return this.sessions.has(sessionId);
  }
}

const geminiLiveService = new GeminiLiveService();
export default geminiLiveService;
