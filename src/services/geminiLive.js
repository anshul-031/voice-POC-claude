import { GoogleGenAI, Modality } from '@google/genai';

/**
 * Manages Gemini Live API sessions for real-time voice interaction.
 * Each session maintains a persistent WebSocket connection to Gemini.
 */
class GeminiLiveService {
  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    this.sessions = new Map();
    console.log('[GeminiLive] Service initialized');
  }

  /**
   * Create a new Gemini Live session for voice conversation.
   */
  async createSession(sessionId, { systemPrompt, voiceName, modelName, onAudio, onTranscript, onInterrupted, onError, onClose }) {
    try {
      const model = modelName || 'gemini-2.5-flash-native-audio-latest';
      console.log(`[GeminiLive] ┌─ Creating session`);
      console.log(`[GeminiLive] │  Session ID: ${sessionId}`);
      console.log(`[GeminiLive] │  Model: ${model}`);
      console.log(`[GeminiLive] │  Voice: ${voiceName || 'Puck'}`);
      console.log(`[GeminiLive] │  System Prompt: "${(systemPrompt || '').substring(0, 80)}${(systemPrompt || '').length > 80 ? '...' : ''}"`);
      console.log(`[GeminiLive] └─ Connecting...`);

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
            console.log(`[GeminiLive] ✅ Session ${sessionId} opened (${elapsed}ms to connect)`);
          },
          onmessage: (message) => {
            this._handleMessage(sessionId, message, onAudio, onTranscript, onInterrupted);
          },
          onerror: (e) => {
            console.error(`[GeminiLive] ❌ Session ${sessionId} error:`, e.message || e);
            if (onError) onError(e);
          },
          onclose: (e) => {
            console.log(`[GeminiLive] 🔌 Session ${sessionId} closed — reason: ${e?.reason || e?.code || 'unknown'}`);
            this.sessions.delete(sessionId);
            if (onClose) onClose(e);
          },
        },
      });

      this.sessions.set(sessionId, { session, voiceName, model, startTime: Date.now(), audioChunksSent: 0, audioChunksReceived: 0 });
      console.log(`[GeminiLive] 📡 Session ${sessionId} registered and ready`);
      return session;
    } catch (error) {
      console.error(`[GeminiLive] ❌ Failed to create session ${sessionId}:`, error.message || error);
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
            console.log(`[GeminiLive] 🔊 Audio chunk received | session=${sessionId} | size=${dataSize} bytes | total_received=${entry?.audioChunksReceived || '?'}`);
            if (onAudio) {
              onAudio(part.inlineData.data);
            }
          }

          // Text transcript from model
          if (part.text) {
            console.log(`[GeminiLive] 💬 Model transcript | session=${sessionId} | text="${part.text}"`);
            if (onTranscript) {
              onTranscript({ role: 'model', text: part.text });
            }
          }
        }
      }

      // Turn complete
      if (serverContent.turnComplete) {
        console.log(`[GeminiLive] ✓ Turn complete | session=${sessionId}`);
      }

      // Check if model was interrupted
      if (serverContent.interrupted) {
        console.log(`[GeminiLive] ⚡ Model interrupted | session=${sessionId}`);
        if (onInterrupted) onInterrupted();
      }

      // Input transcription (what the user said)
      if (serverContent.inputTranscription) {
        const text = serverContent.inputTranscription.text || serverContent.inputTranscription;
        console.log(`[GeminiLive] 🎤 User transcript | session=${sessionId} | text="${text}"`);
        if (onTranscript) {
          onTranscript({ role: 'user', text: typeof text === 'string' ? text : JSON.stringify(text) });
        }
      }

      // Output transcription
      if (serverContent.outputTranscription) {
        const text = serverContent.outputTranscription.text || serverContent.outputTranscription;
        console.log(`[GeminiLive] 🤖 Output transcript | session=${sessionId} | text="${text}"`);
        if (onTranscript) {
          onTranscript({ role: 'model', text: typeof text === 'string' ? text : JSON.stringify(text) });
        }
      }
    }

    // Some SDK versions deliver audio in message.data directly
    if (message.data && !message.serverContent) {
      if (entry) entry.audioChunksReceived++;
      console.log(`[GeminiLive] 🔊 Direct audio data | session=${sessionId} | total_received=${entry?.audioChunksReceived || '?'}`);
      if (onAudio) {
        onAudio(message.data);
      }
    }

    // Log any setup complete or other messages
    if (message.setupComplete) {
      console.log(`[GeminiLive] ⚙️  Setup complete | session=${sessionId}`);
    }
  }

  /**
   * Send audio data to the Gemini Live session using sendRealtimeInput
   */
  async sendAudio(sessionId, audioBase64) {
    const entry = this.sessions.get(sessionId);
    if (!entry) {
      console.warn(`[GeminiLive] ⚠️  No session found for ${sessionId}`);
      return;
    }

    try {
      entry.audioChunksSent++;
      if (entry.audioChunksSent % 50 === 1) {
        console.log(`[GeminiLive] 🎙️  Sending audio | session=${sessionId} | chunk #${entry.audioChunksSent} | size=${audioBase64.length} chars`);
      }

      await entry.session.sendRealtimeInput({
        audio: {
          data: audioBase64,
          mimeType: 'audio/pcm;rate=16000',
        },
      });
    } catch (error) {
      console.error(`[GeminiLive] ❌ Error sending audio | session=${sessionId}:`, error.message);
    }
  }

  /**
   * Send text message to the Gemini Live session
   */
  async sendText(sessionId, text) {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;

    try {
      console.log(`[GeminiLive] 📝 Sending text | session=${sessionId} | text="${text}"`);
      await entry.session.sendClientContent({
        turns: [{ role: 'user', parts: [{ text }] }],
        turnComplete: true,
      });
    } catch (error) {
      console.error(`[GeminiLive] ❌ Error sending text | session=${sessionId}:`, error.message);
    }
  }

  /**
   * Close a Gemini Live session
   */
  async closeSession(sessionId) {
    const entry = this.sessions.get(sessionId);
    if (entry) {
      const duration = Math.round((Date.now() - entry.startTime) / 1000);
      console.log(`[GeminiLive] 🛑 Closing session ${sessionId}`);
      console.log(`[GeminiLive]    Duration: ${duration}s | Audio sent: ${entry.audioChunksSent} chunks | Audio received: ${entry.audioChunksReceived} chunks`);
      try {
        await entry.session.close();
      } catch (_e) {
        // ignore close errors
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
