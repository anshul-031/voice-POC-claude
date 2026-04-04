/* eslint-disable max-lines */
import WebSocket, { WebSocketServer } from 'ws';
import type { WebSocket as WSWebSocket, WebSocketServer as WSWebSocketServer } from 'ws';
import type { IncomingMessage, Server } from 'http';
import { v4 as uuidv4 } from 'uuid';
import geminiLiveService from './geminiLive.js';
import prisma from '../lib/prisma.js';
import { UI_STRINGS } from '../constants/uiStrings.js';
import { ROUTES, TIME, MESSAGE_TYPE } from '../types/index.js';
import type { SignalingClient } from '../types/index.js';
import logger from '../utils/logger.js';
import { verifyToken } from './auth.js';
import {
  SIGNALING_AUDIO_DATA_MESSAGE_SCHEMA,
  SIGNALING_MESSAGE_SCHEMA,
  SIGNALING_START_CALL_MESSAGE_SCHEMA,
  type SignalingMessage,
} from '../constants/inputSchemas.js';

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
    const wss = new WebSocketServer({ server: httpServer, path: ROUTES.WS_PATH });
    this.wss = wss;

    wss.on('connection', (socket: WSWebSocket, req: IncomingMessage) => {
      const correlationId = uuidv4();
      const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      logger.info('New WebSocket connection', { clientIp, correlationId });

      socket.on('message', async (data: Buffer | string | ArrayBuffer | Buffer[]) => {
        try {
          const messageStart = Date.now();
          const requesterUserId = this._resolveRequesterUserId(req);
          const dataString = data.toString();
          const rawMessage = JSON.parse(dataString);
          const messageParse = SIGNALING_MESSAGE_SCHEMA.safeParse(rawMessage);
          if (!messageParse.success) {
            logger.warn('Invalid signaling message payload', {
              clientIp,
              correlationId,
              issues: messageParse.error.issues,
              payloadPreview: dataString.slice(0, 400),
            });
            socket.send(JSON.stringify({
              type: MESSAGE_TYPE.ERROR,
              message: UI_STRINGS.signaling.errors.invalidMessageFormat,
            }));
            return;
          }

          const message = messageParse.data;
          logger.debug('Signaling message received', {
            type: message.type,
            clientIp,
            correlationId,
            payloadBytes: dataString.length,
          });
          await this._handleMessage(socket, message, requesterUserId, correlationId);
          logger.debug('Signaling message handled', {
            type: message.type,
            correlationId,
            elapsedMs: Date.now() - messageStart,
          });
        } catch (error: unknown) {
          const isJsonParseError = error instanceof SyntaxError;
          const errMsg = error instanceof Error ? error.message : String(error);
          logger.error('Error handling signaling message', {
            error: errMsg, 
            clientIp,
            correlationId,
          });
          socket.send(JSON.stringify({
            type: MESSAGE_TYPE.ERROR,
            message: isJsonParseError ? UI_STRINGS.signaling.errors.invalidMessageFormat : errMsg,
          }));
        }
      });

      socket.on('close', (code: number, reason: Buffer) => {
        logger.info('WebSocket closed', { 
          code, 
          reason: reason.toString() || 'none', 
          clientIp,
          correlationId,
        });
        this._handleDisconnect(socket);
      });

      socket.on('error', (error: Error) => {
        logger.error('WebSocket error', { 
          error: error.message, 
          clientIp,
          correlationId,
        });
        this._handleDisconnect(socket);
      });
    });

    logger.info('WebSocket server attached', { path: ROUTES.WS_PATH });
  }

  private _resolveRequesterUserId(req: IncomingMessage): string | null {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return null;
    const tokenCookie = cookieHeader
      .split(';')
      .map((item) => item.trim())
      .find((item) => item.startsWith('token='));
    if (!tokenCookie) return null;

    const encodedToken = tokenCookie.slice('token='.length);
    if (!encodedToken) return null;

    const decodedToken = verifyToken(decodeURIComponent(encodedToken));
    return decodedToken?.userId || null;
  }

  private async _handleMessage(
    socket: WSWebSocket,
    message: SignalingMessage,
    requesterUserId: string | null,
    correlationId: string,
  ): Promise<void> {
    switch (message.type) {
      case MESSAGE_TYPE.START_CALL:
        await this._handleStartCall(socket, message, requesterUserId, correlationId);
        break;
      case MESSAGE_TYPE.AUDIO_DATA:
        await this._handleAudioData(socket, message, correlationId);
        break;
      case MESSAGE_TYPE.END_CALL:
        await this._handleEndCall(socket, correlationId);
        break;
    }
  }

  private _sendSocketError(socket: WSWebSocket, message: string): void {
    socket.send(JSON.stringify({ type: MESSAGE_TYPE.ERROR, message }));
  }

  private _canAccessAgent(
    agent: { publicPreviewEnabled: boolean; userId: string | null },
    requesterUserId: string | null,
  ): boolean {
    const isOwner = !!requesterUserId && agent.userId === requesterUserId;
    return agent.publicPreviewEnabled || isOwner;
  }

  /** @internal */
  public async _handleStartCall(
    socket: WSWebSocket,
    message: { agentId: string },
    requesterUserId: string | null = null,
    correlationId = uuidv4(),
  ): Promise<void> {
    const startCallAt = Date.now();
    const parseResult = SIGNALING_START_CALL_MESSAGE_SCHEMA.safeParse({
      type: MESSAGE_TYPE.START_CALL,
      agentId: message.agentId,
    });
    if (!parseResult.success) {
      this._sendSocketError(socket, UI_STRINGS.signaling.errors.agentIdRequired);
      return;
    }

    const { agentId } = parseResult.data;
    logger.info('Start call request', { agentId, correlationId });

    // Fetch agent config
    logger.debug('Fetching agent config', { agentId, correlationId });
    const agentLookupStart = Date.now();
    const agent = await prisma.voiceAgent.findUnique({ where: { id: agentId } });
    logger.info('Agent lookup completed', {
      agentId,
      correlationId,
      elapsedMs: Date.now() - agentLookupStart,
      found: !!agent,
    });
    if (!agent) {
      logger.warn('Agent not found', { agentId, correlationId });
      this._sendSocketError(socket, UI_STRINGS.signaling.errors.agentNotFound);
      return;
    }

    if (!this._canAccessAgent(agent, requesterUserId)) {
      logger.warn('Blocked unauthorized call start for private agent', {
        agentId,
        requesterUserId,
        correlationId,
      });
      this._sendSocketError(socket, UI_STRINGS.signaling.errors.agentNotPublic);
      return;
    }

    logger.info('Agent found for call', { 
      agentId, 
      name: agent.name, 
      voice: agent.voiceName, 
      model: agent.modelName, 
      correlationId,
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
      const geminiConnectStart = Date.now();
      logger.info('Creating Gemini Live session', { sessionId, correlationId });

      await geminiLiveService.createSession(sessionId, {
        systemPrompt: agent.systemPrompt,
        voiceName: agent.voiceName,
        modelName: agent.modelName || undefined,
        correlationId,
        onAudio: (audioData: string) => {
          if (socket.readyState === WebSocket.OPEN) {
            const client = this.clients.get(socket);
            if (client && client.audioChunksRelayed > 0 && client.audioChunksRelayed === 1) {
              logger.info('First model audio relayed to client', {
                sessionId,
                correlationId: client.correlationId,
                elapsedMs: Date.now() - client.startTime,
              });
            }
            socket.send(JSON.stringify({
              type: MESSAGE_TYPE.AUDIO_RESPONSE,
              data: audioData,
            }));
          }
        },
        onTranscript: (transcript: { role: 'user' | 'model'; text: string }) => {
          logger.debug('Relaying transcript', {
            role: transcript.role,
            sessionId,
            correlationId,
            chars: transcript.text.length,
          });
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
              type: MESSAGE_TYPE.TRANSCRIPT,
              role: transcript.role,
              text: transcript.text,
            }));
          }
        },
        onInterrupted: (): void => {
          logger.info('Model interrupted, relaying to client', { sessionId, correlationId });
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: MESSAGE_TYPE.INTERRUPTED }));
          }
        },
        onError: (error: Error) => {
          logger.error('Gemini session error, relaying to client', { 
            sessionId, 
            error: error.message, 
            correlationId,
          });
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: MESSAGE_TYPE.ERROR, message: error.message }));
          }
        },
        onClose: (): void => {
          logger.info('Gemini session closed, notifying client', { sessionId, correlationId });
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ 
              type: MESSAGE_TYPE.CALL_ENDED, 
              reason: UI_STRINGS.signaling.status.geminiClosed,
            }));
          }
          this.clients.delete(socket);
        },
      });

      const callStartedAt = Date.now();
      this.clients.set(socket, {
        sessionId,
        agentId,
        correlationId,
        audioChunksRelayed: 0,
        startTime: callStartedAt,
      });

      logger.info('Gemini session created', {
        sessionId,
        correlationId,
        elapsedMs: callStartedAt - geminiConnectStart,
      });

      socket.send(JSON.stringify({
        type: MESSAGE_TYPE.CALL_STARTED,
        sessionId,
        agentName: agent.name,
        voiceName: agent.voiceName,
        modelName: agent.modelName,
        correlationId,
      }));
      logger.debug('Sent call-started payload', {
        sessionId,
        agentName: agent.name,
        voiceName: agent.voiceName,
        modelName: agent.modelName,
        correlationId,
      });

      logger.info('Call started successfully', {
        sessionId,
        agentName: agent.name,
        correlationId,
        totalStartupMs: Date.now() - startCallAt,
      });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to start call', { 
        agentId, 
        error: errMsg, 
        correlationId,
        totalStartupMs: Date.now() - startCallAt,
      });
      socket.send(JSON.stringify({
        type: MESSAGE_TYPE.ERROR,
        message: UI_STRINGS.signaling.errors.geminiConnectFailed,
      }));
    }
  }

  /** @internal */
  public async _handleAudioData(
    socket: WSWebSocket,
    message: { data: string },
    correlationId: string,
  ): Promise<void> {
    const parseResult = SIGNALING_AUDIO_DATA_MESSAGE_SCHEMA.safeParse({
      type: MESSAGE_TYPE.AUDIO_DATA,
      data: message.data,
    });
    if (!parseResult.success) {
      socket.send(JSON.stringify({
        type: MESSAGE_TYPE.ERROR,
        message: UI_STRINGS.signaling.errors.invalidMessageFormat,
      }));
      return;
    }

    const client = this.clients.get(socket);
    if (!client) return;

    client.audioChunksRelayed++;
    if (client.audioChunksRelayed === 1) {
      logger.info('First client audio chunk relayed to Gemini', {
        sessionId: client.sessionId,
        correlationId,
        elapsedMs: Date.now() - client.startTime,
      });
    }
    if (client.audioChunksRelayed % 50 === 1) {
      logger.debug('Relaying audio chunks to Gemini', { 
        sessionId: client.sessionId, 
        chunkCount: client.audioChunksRelayed, 
        correlationId,
      });
    }

    await geminiLiveService.sendAudio(client.sessionId, parseResult.data.data);
  }

  /** @internal */
  public async _handleEndCall(socket: WSWebSocket, correlationId: string): Promise<void> {
    const client = this.clients.get(socket);
    if (client) {
      const duration = Math.round((Date.now() - client.startTime) / TIME.MS_TO_SEC);
      logger.info('End call request from client', { 
        sessionId: client.sessionId, 
        durationSeconds: duration, 
        audioChunks: client.audioChunksRelayed, 
        correlationId,
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
        correlationId: client.correlationId,
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
