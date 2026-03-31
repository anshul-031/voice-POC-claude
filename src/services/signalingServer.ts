import WSLib from 'ws';
import type { WebSocket as WSWebSocket, WebSocketServer as WSWebSocketServer } from 'ws';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { WebSocketServer } = WSLib as any;
import type { IncomingMessage, Server } from 'http';
import { v4 as uuidv4 } from 'uuid';
import geminiLiveService from './geminiLive.js';
import prisma from '../lib/prisma.js';
import { UI_STRINGS } from '../constants/uiStrings.js';
import { ROUTES, TIME, MESSAGE_TYPE } from '../types/index.js';
import type { SignalingClient } from '../types/index.js';
import logger from '../utils/logger.js';

/**
 * WebSocket signaling server for audio relay between browser and Gemini Live API.
 * Also relays transcription text for live display.
 */
class SignalingServer {
  /** @internal */
  public wss: WSWebSocketServer | null = null;
  /** @internal */
  public clients: Map<WSWebSocket, SignalingClient> = new Map();

  public attach(httpServer: Server): void {
    this.wss = new WebSocketServer({ server: httpServer, path: ROUTES.WS_PATH });

    if (!this.wss) return;

    this.wss.on('connection', (socket: WSWebSocket, req: IncomingMessage) => {
      const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      logger.info('New WebSocket connection', { clientIp });

      socket.on('message', async (data: Buffer | string | ArrayBuffer | Buffer[]) => {
        try {
          const message = JSON.parse(data.toString()) as { 
            type: string; 
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            [key: string]: any; 
          };
          logger.debug('Signaling message received', { type: message.type, clientIp });
          await this._handleMessage(socket, message);
        } catch (error: unknown) {
          const errMsg = error instanceof Error ? error.message : String(error);
          logger.error('Error handling signaling message', { 
            error: errMsg, 
            clientIp,
          });
          socket.send(JSON.stringify({ type: MESSAGE_TYPE.ERROR, message: errMsg }));
        }
      });

      socket.on('close', (code: number, reason: Buffer) => {
        logger.info('WebSocket closed', { 
          code, 
          reason: reason.toString() || 'none', 
          clientIp,
        });
        this._handleDisconnect(socket);
      });

      socket.on('error', (error: Error) => {
        logger.error('WebSocket error', { 
          error: error.message, 
          clientIp,
        });
        this._handleDisconnect(socket);
      });
    });

    logger.info('WebSocket server attached', { path: ROUTES.WS_PATH });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async _handleMessage(socket: WSWebSocket, message: { type: string; [key: string]: any }): Promise<void> {
    switch (message.type) {
      case MESSAGE_TYPE.START_CALL:
        await this._handleStartCall(socket, message as unknown as { agentId: string });
        break;
      case MESSAGE_TYPE.AUDIO_DATA:
        await this._handleAudioData(socket, message as unknown as { data: string });
        break;
      case MESSAGE_TYPE.END_CALL:
        await this._handleEndCall(socket);
        break;
      default:
        logger.warn('Unknown signaling message type', { type: message.type });
        socket.send(JSON.stringify({ 
          type: MESSAGE_TYPE.ERROR, 
          message: UI_STRINGS.signaling.errors.unknownMessageType(message.type),
        }));
    }
  }

  /** @internal */
  public async _handleStartCall(socket: WSWebSocket, message: { agentId: string }): Promise<void> {
    const { agentId } = message;
    logger.info('Start call request', { agentId });

    if (!agentId) {
      logger.warn('No agent ID provided in start call');
      socket.send(JSON.stringify({ type: MESSAGE_TYPE.ERROR, message: UI_STRINGS.signaling.errors.agentIdRequired }));
      return;
    }

    // Fetch agent config
    logger.debug('Fetching agent config', { agentId });
    const agent = await prisma.voiceAgent.findUnique({ where: { id: agentId } });
    if (!agent) {
      logger.warn('Agent not found', { agentId });
      socket.send(JSON.stringify({ type: MESSAGE_TYPE.ERROR, message: UI_STRINGS.signaling.errors.agentNotFound }));
      return;
    }
    logger.info('Agent found for call', { 
      agentId, 
      name: agent.name, 
      voice: agent.voiceName, 
      model: agent.modelName, 
    });

    const sessionId = uuidv4();

    // Close existing session if any
    const existing = this.clients.get(socket);
    if (existing) {
      logger.info('Closing existing session for client reconnect', { sessionId: existing.sessionId });
      await geminiLiveService.closeSession(existing.sessionId);
    }

    // Create Gemini Live session
    try {
      logger.info('Creating Gemini Live session', { sessionId });

      await geminiLiveService.createSession(sessionId, {
        systemPrompt: agent.systemPrompt,
        voiceName: agent.voiceName,
        modelName: agent.modelName || undefined,
        onAudio: (audioData: string) => {
          if (socket.readyState === WSLib.OPEN) {
            socket.send(JSON.stringify({
              type: MESSAGE_TYPE.AUDIO_RESPONSE,
              data: audioData,
            }));
          }
        },
        onTranscript: (transcript: { role: 'user' | 'model'; text: string }) => {
          logger.debug('Relaying transcript', { role: transcript.role, sessionId });
          if (socket.readyState === WSLib.OPEN) {
            socket.send(JSON.stringify({
              type: MESSAGE_TYPE.TRANSCRIPT,
              role: transcript.role,
              text: transcript.text,
            }));
          }
        },
        onInterrupted: (): void => {
          logger.info('Model interrupted, relaying to client', { sessionId });
          if (socket.readyState === WSLib.OPEN) {
            socket.send(JSON.stringify({ type: MESSAGE_TYPE.INTERRUPTED }));
          }
        },
        onError: (error: Error) => {
          logger.error('Gemini session error, relaying to client', { 
            sessionId, 
            error: error.message, 
          });
          if (socket.readyState === WSLib.OPEN) {
            socket.send(JSON.stringify({ type: MESSAGE_TYPE.ERROR, message: error.message }));
          }
        },
        onClose: (): void => {
          logger.info('Gemini session closed, notifying client', { sessionId });
          if (socket.readyState === WSLib.OPEN) {
            socket.send(JSON.stringify({ 
              type: MESSAGE_TYPE.CALL_ENDED, 
              reason: UI_STRINGS.signaling.status.geminiClosed,
            }));
          }
          this.clients.delete(socket);
        },
      });

      this.clients.set(socket, { sessionId, agentId, audioChunksRelayed: 0, startTime: Date.now() });

      socket.send(JSON.stringify({
        type: MESSAGE_TYPE.CALL_STARTED,
        sessionId,
        agentName: agent.name,
        voiceName: agent.voiceName,
        modelName: agent.modelName,
      }));

      logger.info('Call started successfully', { sessionId, agentName: agent.name });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to start call', { 
        agentId, 
        error: errMsg, 
      });
      socket.send(JSON.stringify({
        type: MESSAGE_TYPE.ERROR,
        message: UI_STRINGS.signaling.errors.geminiConnectFailed,
      }));
    }
  }

  /** @internal */
  public async _handleAudioData(socket: WSWebSocket, message: { data: string }): Promise<void> {
    const client = this.clients.get(socket);
    if (!client) return;

    client.audioChunksRelayed++;
    if (client.audioChunksRelayed % 50 === 1) {
      logger.debug('Relaying audio chunks to Gemini', { 
        sessionId: client.sessionId, 
        chunkCount: client.audioChunksRelayed, 
      });
    }

    await geminiLiveService.sendAudio(client.sessionId, message.data);
  }

  /** @internal */
  public async _handleEndCall(socket: WSWebSocket): Promise<void> {
    const client = this.clients.get(socket);
    if (client) {
      const duration = Math.round((Date.now() - client.startTime) / TIME.MS_TO_SEC);
      logger.info('End call request from client', { 
        sessionId: client.sessionId, 
        durationSeconds: duration, 
        audioChunks: client.audioChunksRelayed, 
      });
      await geminiLiveService.closeSession(client.sessionId);
      this.clients.delete(socket);
      socket.send(JSON.stringify({ 
        type: MESSAGE_TYPE.CALL_ENDED, 
        reason: UI_STRINGS.signaling.status.userEnded, 
      }));
    }
  }

  /** @internal */
  public _handleDisconnect(socket: WSWebSocket): void {
    const client = this.clients.get(socket);
    if (client) {
      const duration = Math.round((Date.now() - client.startTime) / 1000);
      logger.info('Client disconnected', { 
        sessionId: client.sessionId, 
        durationSeconds: duration, 
      });
      geminiLiveService.closeSession(client.sessionId).catch((err: Error) => {
        logger.error('Error closing session on disconnect', { error: err.message });
      });
      this.clients.delete(socket);
    }
  }
}

const signalingServer = new SignalingServer();
export default signalingServer;
