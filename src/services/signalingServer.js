import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import geminiLiveService from './geminiLive.js';
import prisma from '../lib/prisma.js';
import { UI_STRINGS } from '../constants/uiStrings.js';
import { ROUTES, TIME } from '../constants/index.js';

/**
 * WebSocket signaling server for audio relay between browser and Gemini Live API.
 * Also relays transcription text for live display.
 */
class SignalingServer {
  constructor() {
    this.wss = null;
    this.clients = new Map(); // ws -> { sessionId, agentId, stats }
  }

  attach(httpServer) {
    this.wss = new WebSocketServer({ server: httpServer, path: ROUTES.WS_PATH });

    this.wss.on('connection', (ws, req) => {
      const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      console.log(`[Signaling] 🔗 New WebSocket connection from ${clientIp}`);

      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());
          console.log(`[Signaling] 📨 Message received | type=${message.type} | from=${clientIp}`);
          await this._handleMessage(ws, message);
        } catch (error) {
          console.error(`[Signaling] ❌ Error handling message:`, error.message);
          ws.send(JSON.stringify({ type: 'error', message: error.message }));
        }
      });

      ws.on('close', (code, reason) => {
        console.log(`[Signaling] 🔌 WebSocket closed | code=${code} | reason=${reason || 'none'} | from=${clientIp}`);
        this._handleDisconnect(ws);
      });

      ws.on('error', (error) => {
        console.error(`[Signaling] ❌ WebSocket error from ${clientIp}:`, error.message);
        this._handleDisconnect(ws);
      });
    });

    console.log(`[Signaling] ✅ WebSocket server attached at ${ROUTES.WS_PATH}`);
  }

  async _handleMessage(ws, message) {
    switch (message.type) {
      case 'start-call':
        await this._handleStartCall(ws, message);
        break;
      case 'audio-data':
        await this._handleAudioData(ws, message);
        break;
      case 'end-call':
        await this._handleEndCall(ws);
        break;
      default:
        console.warn(`[Signaling] ⚠️  Unknown message type: ${message.type}`);
        ws.send(JSON.stringify({ type: 'error', message: UI_STRINGS.signaling.errors.unknownMessageType(message.type) }));
    }
  }

  async _handleStartCall(ws, message) {
    const { agentId } = message;
    console.log(`[Signaling] 📞 Start call request | agentId=${agentId}`);

    if (!agentId) {
      console.warn(`[Signaling] ⚠️  No agent ID provided`);
      ws.send(JSON.stringify({ type: 'error', message: UI_STRINGS.signaling.errors.agentIdRequired }));
      return;
    }

    // Fetch agent config
    console.log(`[Signaling] 🔍 Fetching agent config from database...`);
    const agent = await prisma.voiceAgent.findUnique({ where: { id: agentId } });
    if (!agent) {
      console.warn(`[Signaling] ⚠️  Agent not found: ${agentId}`);
      ws.send(JSON.stringify({ type: 'error', message: UI_STRINGS.signaling.errors.agentNotFound }));
      return;
    }
    console.log(`[Signaling] ✅ Agent found: "${agent.name}" | voice=${agent.voiceName} | model=${agent.modelName}`);

    const sessionId = uuidv4();

    // Close existing session if any
    const existing = this.clients.get(ws);
    if (existing) {
      console.log(`[Signaling] 🔄 Closing existing session: ${existing.sessionId}`);
      await geminiLiveService.closeSession(existing.sessionId);
    }

    // Create Gemini Live session
    try {
      console.log(`[Signaling] 🚀 Creating Gemini Live session: ${sessionId}`);

      await geminiLiveService.createSession(sessionId, {
        systemPrompt: agent.systemPrompt,
        voiceName: agent.voiceName,
        modelName: agent.modelName,
        onAudio: (audioData) => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({
              type: 'audio-response',
              data: audioData,
            }));
          }
        },
        onTranscript: (transcript) => {
          console.log(`[Signaling] 💬 Relaying transcript | role=${transcript.role} | text="${transcript.text}"`);
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({
              type: 'transcript',
              role: transcript.role,
              text: transcript.text,
            }));
          }
        },
        onInterrupted: () => {
          console.log(`[Signaling] ⚡ Model interrupted — relaying to client`);
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'interrupted' }));
          }
        },
        onError: (error) => {
          console.error(`[Signaling] ❌ Gemini session error — relaying to client:`, error.message);
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'error', message: error.message }));
          }
        },
        onClose: () => {
          console.log(`[Signaling] 🔌 Gemini session closed — notifying client`);
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'call-ended', reason: UI_STRINGS.signaling.status.geminiClosed }));
          }
          this.clients.delete(ws);
        },
      });

      this.clients.set(ws, { sessionId, agentId, audioChunksRelayed: 0, startTime: Date.now() });

      ws.send(JSON.stringify({
        type: 'call-started',
        sessionId,
        agentName: agent.name,
        voiceName: agent.voiceName,
        modelName: agent.modelName,
      }));

      console.log(`[Signaling] ✅ Call started | session=${sessionId} | agent="${agent.name}"`);
    } catch (error) {
      console.error(`[Signaling] ❌ Failed to start call:`, error.message || error);
      ws.send(JSON.stringify({
        type: 'error',
        message: UI_STRINGS.signaling.errors.geminiConnectFailed,
      }));
    }
  }

  async _handleAudioData(ws, message) {
    const client = this.clients.get(ws);
    if (!client) return;

    client.audioChunksRelayed++;
    if (client.audioChunksRelayed % 50 === 1) {
      console.log(`[Signaling] 🎙️ Audio chunk #${client.audioChunksRelayed} relayed to Gemini | session=${client.sessionId}`);
    }

    await geminiLiveService.sendAudio(client.sessionId, message.data);
  }

  async _handleEndCall(ws) {
    const client = this.clients.get(ws);
    if (client) {
      const duration = Math.round((Date.now() - client.startTime) / TIME.MS_TO_SEC);
      console.log(`[Signaling] 📴 End call request | session=${client.sessionId} | duration=${duration}s | audio_chunks=${client.audioChunksRelayed}`);
      await geminiLiveService.closeSession(client.sessionId);
      this.clients.delete(ws);
      ws.send(JSON.stringify({ type: 'call-ended', reason: UI_STRINGS.signaling.status.userEnded }));
    }
  }

  _handleDisconnect(ws) {
    const client = this.clients.get(ws);
    if (client) {
      const duration = Math.round((Date.now() - client.startTime) / 1000);
      console.log(`[Signaling] 🔌 Client disconnected | session=${client.sessionId} | duration=${duration}s`);
      geminiLiveService.closeSession(client.sessionId);
      this.clients.delete(ws);
    }
  }
}

const signalingServer = new SignalingServer();
export default signalingServer;
