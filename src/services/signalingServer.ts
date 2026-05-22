/* eslint-disable max-lines */
import WebSocket, { WebSocketServer } from 'ws';
import type { WebSocket as WSWebSocket, WebSocketServer as WSWebSocketServer } from 'ws';
import type { IncomingMessage, Server } from 'http';
import { URL } from 'url';
import { v4 as uuidv4 } from 'uuid';
import geminiLiveService from './geminiLive.js';
import prisma from '../lib/prisma.js';
import { UI_STRINGS } from '../constants/uiStrings.js';
import { LIVE_CALL, LOGGING, ROUTES, TIME, MESSAGE_TYPE } from '../types/index.js';
import type { SignalingClient } from '../types/index.js';
import logger from '../utils/logger.js';
import { verifyToken } from './auth.js';
import {
  SIGNALING_AUDIO_DATA_MESSAGE_SCHEMA,
  SIGNALING_MESSAGE_SCHEMA,
  SIGNALING_START_CALL_MESSAGE_SCHEMA,
  type SignalingMessage,
} from '../constants/inputSchemas.js';
import { downsample24To8, upsample8To16 } from '../utils/audioResampler.js';

type StartCallAgent = {
  id: string;
  name: string;
  systemPrompt: string;
  voiceName: string;
  modelName: string | null;
  publicPreviewEnabled: boolean;
  userId: string | null;
  inactivityTimeoutMs: number;
  maxInactivityNudges: number;
  maxCallDurationSecs: number;
};

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
          const dataString = data.toString();
          const rawMessage = JSON.parse(dataString);

          // Detect Vobiz stream protocol (uses 'event' field, not 'type')
          if (rawMessage.event) {
            await this._handleVobizStreamEvent(socket, rawMessage, req, correlationId);
            return;
          }

          const requesterUserId = this._resolveRequesterUserId(req);
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

  private async _fetchAgentForCall(
    socket: WSWebSocket,
    agentId: string,
    requesterUserId: string | null,
    correlationId: string,
  ): Promise<StartCallAgent | null> {
    logger.debug('Fetching agent config', { agentId, correlationId });
    const agentLookupStart = Date.now();
    const agent = await prisma.voiceAgent.findUnique({ where: { id: agentId } }) as StartCallAgent | null;

    logger.info('Agent lookup completed', {
      agentId,
      correlationId,
      elapsedMs: Date.now() - agentLookupStart,
      found: !!agent,
    });

    if (!agent) {
      logger.warn('Agent not found', { agentId, correlationId });
      this._sendSocketError(socket, UI_STRINGS.signaling.errors.agentNotFound);
      return null;
    }

    if (!this._canAccessAgent(agent, requesterUserId)) {
      logger.warn('Blocked unauthorized call start for private agent', {
        agentId,
        requesterUserId,
        correlationId,
      });
      this._sendSocketError(socket, UI_STRINGS.signaling.errors.agentNotPublic);
      return null;
    }

    logger.info('Agent found for call', {
      agentId,
      name: agent.name,
      voice: agent.voiceName,
      model: agent.modelName,
      correlationId,
    });

    return agent;
  }

  private async _closeExistingClientSession(socket: WSWebSocket): Promise<void> {
    const existing = this.clients.get(socket);
    if (!existing) {
      return;
    }

    logger.info('Closing existing session for client reconnect', { sessionId: existing.sessionId });
    await geminiLiveService.closeSession(existing.sessionId);
  }

  private _relayModelAudioToClient(socket: WSWebSocket, sessionId: string, audioData: string): void {
    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const now = Date.now();
    const client = this.clients.get(socket);

    if (client) {
      client.modelAudioChunksRelayed++;
      client.lastModelResponseAt = now;
      this._trackFirstModelAudio(client, sessionId, now);

      if (client.modelAudioChunksRelayed % LOGGING.THROTTLE_CHUNKS === 1) {
        logger.debug('Relaying model audio to client', {
          sessionId,
          correlationId: client.correlationId,
          modelAudioChunksRelayed: client.modelAudioChunksRelayed,
        });
      }
    }

    if (client?.streamId) {
      // Telephony stream (Vobiz)
      this._sendVobizPlayAudio(socket, client, audioData);
    } else {
      // Browser client
      socket.send(JSON.stringify({
        type: MESSAGE_TYPE.AUDIO_RESPONSE,
        data: audioData,
      }));
    }

    if (client && client.modelAudioChunksRelayed % LOGGING.THROTTLE_CHUNKS === 1) {
      logger.debug('Model audio chunk relayed', {
        sessionId,
        correlationId: client.correlationId,
        chunkIndex: client.modelAudioChunksRelayed,
        chunkBytes: audioData.length,
      });
    }
  }

  private _trackFirstModelAudio(client: SignalingClient, sessionId: string, now: number): void {
    if (client.firstModelAudioRelayedAt) return;
    
    client.firstModelAudioRelayedAt = now;
    const firstResponseMs = now - client.startTime;
    logger.info('First model audio relayed to client', {
      sessionId,
      correlationId: client.correlationId,
      elapsedMs: firstResponseMs,
      sinceFirstUserTranscriptMs: client.firstUserTranscriptRelayedAt
        ? now - client.firstUserTranscriptRelayedAt
        : undefined,
      proactiveGreetingSent: client.proactiveGreetingSent,
      proactiveGreetingLatencyMs: client.proactiveGreetingSentAt
        ? now - client.proactiveGreetingSentAt
        : undefined,
    });

    if (firstResponseMs > LIVE_CALL.FIRST_RESPONSE_WARN_THRESHOLD_MS) {
      logger.warn('First model audio relay exceeded target latency', {
        sessionId,
        correlationId: client.correlationId,
        firstResponseMs,
        thresholdMs: LIVE_CALL.FIRST_RESPONSE_WARN_THRESHOLD_MS,
        clientAudioChunksRelayed: client.audioChunksRelayed,
      });
    }
  }

  /**
   * Send audio back to Vobiz via their playAudio protocol.
   * Vobiz expects a JSON message with event: "playAudio" and explicit contentType/sampleRate.
   */
  private _sendVobizPlayAudio(socket: WSWebSocket, client: SignalingClient, audioData: string): void {
    if (socket.readyState !== WebSocket.OPEN) return;
    if (!client.streamId) return;

    try {
      // audioData from Gemini is 24kHz. Vobiz expects 8kHz.
      const resampledData = downsample24To8(audioData);
      socket.send(JSON.stringify({
        event: 'playAudio',
        media: { 
          contentType: 'audio/x-l16',
          sampleRate: 8000,
          payload: resampledData,
        },
      }));
    } catch {
      // Silently ignore — socket may have closed
    }
  }

  private _relayTranscriptToClient(
    socket: WSWebSocket,
    sessionId: string,
    transcript: { role: 'user' | 'model'; text: string },
    correlationId: string,
  ): void {
    const now = Date.now();
    const client = this.clients.get(socket);

    this._trackTranscriptRelay(client, transcript, now, sessionId);

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
  }

  private _trackTranscriptRelay(
    client: SignalingClient | undefined,
    transcript: { role: 'user' | 'model'; text: string },
    now: number,
    sessionId: string,
  ): void {
    if (!client) {
      return;
    }

    if (transcript.role === 'user' && !client.firstUserTranscriptRelayedAt) {
      client.firstUserTranscriptRelayedAt = now;
      logger.info('First user transcript relayed to client', {
        sessionId,
        correlationId: client.correlationId,
        elapsedMs: now - client.startTime,
        chars: transcript.text.length,
      });
    }

    if (transcript.role === 'model' && !client.firstModelTranscriptRelayedAt) {
      client.firstModelTranscriptRelayedAt = now;
      logger.info('First model transcript relayed to client', {
        sessionId,
        correlationId: client.correlationId,
        elapsedMs: now - client.startTime,
        sinceFirstUserTranscriptMs: client.firstUserTranscriptRelayedAt
          ? now - client.firstUserTranscriptRelayedAt
          : undefined,
        chars: transcript.text.length,
      });
    }

    if (transcript.role === 'model') {
      client.lastModelResponseAt = now;
    }
  }

  private _buildGeminiCallbacks(
    socket: WSWebSocket,
    sessionId: string,
    correlationId: string,
  ): {
    onAudio: (audioData: string) => void;
    onTranscript: (transcript: { role: 'user' | 'model'; text: string }) => void;
    onInterrupted: () => void;
    onError: (error: Error) => void;
    onClose: () => void;
  } {
    return {
      onAudio: (audioData: string): void => {
        this._relayModelAudioToClient(socket, sessionId, audioData);
      },
      onTranscript: (transcript: { role: 'user' | 'model'; text: string }): void => {
        this._relayTranscriptToClient(socket, sessionId, transcript, correlationId);
      },
      onInterrupted: (): void => {
        logger.info('Model interrupted, relaying to client', { sessionId, correlationId });
        if (socket.readyState === WebSocket.OPEN) {
          const client = this.clients.get(socket);
          if (client?.streamId) {
            socket.send(JSON.stringify({ event: 'clearAudio', streamId: client.streamId }));
          } else {
            socket.send(JSON.stringify({ type: MESSAGE_TYPE.INTERRUPTED }));
          }
        }
      },
      onError: (error: Error): void => {
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
    };
  }

  private _registerClientSession(
    socket: WSWebSocket,
    sessionId: string,
    agentId: string,
    correlationId: string,
    startTime: number,
    agent: StartCallAgent,
    streamId?: string,
  ): void {
    const now = Date.now();
    this.clients.set(socket, {
      sessionId,
      agentId,
      correlationId,
      streamId,
      audioChunksRelayed: 0,
      modelAudioChunksRelayed: 0,
      startTime,
      proactiveGreetingSent: false,
      lastModelResponseAt: now,
      lastUserAudioAt: now,
      nudgeCount: 0,
      inactivityTimeoutMs: agent.inactivityTimeoutMs ?? LIVE_CALL.DEFAULT_INACTIVITY_TIMEOUT_MS,
      maxInactivityNudges: agent.maxInactivityNudges ?? LIVE_CALL.DEFAULT_MAX_INACTIVITY_NUDGES,
      maxCallDurationSecs: agent.maxCallDurationSecs ?? LIVE_CALL.DEFAULT_MAX_CALL_DURATION_SECS,
    });
  }

  private async _sendProactiveGreeting(
    socket: WSWebSocket,
    sessionId: string,
    correlationId: string,
  ): Promise<void> {
    const greetingSendStart = Date.now();
    const greetingSent = await geminiLiveService.sendText(
      sessionId,
      LIVE_CALL.PROACTIVE_GREETING_PROMPT,
      'initial-greeting',
    );

    const activeClient = this.clients.get(socket);
    if (greetingSent && activeClient) {
      activeClient.proactiveGreetingSent = true;
      activeClient.proactiveGreetingSentAt = greetingSendStart;
    }

    if (greetingSent) {
      logger.info('Proactive greeting prompt sent to Gemini', {
        sessionId,
        correlationId,
        elapsedMs: Date.now() - greetingSendStart,
      });
      return;
    }

    logger.warn('Proactive greeting prompt failed to send', {
      sessionId,
      correlationId,
      elapsedMs: Date.now() - greetingSendStart,
    });
  }

  /** @internal */
  public async _handleStartCall(
    socket: WSWebSocket,
    message: { agentId: string },
    requesterUserId: string | null = null,
    correlationId = uuidv4(),
    streamId?: string,
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

    const agent = await this._fetchAgentForCall(socket, agentId, requesterUserId, correlationId);
    if (!agent) {
      return;
    }

    const sessionId = uuidv4();
    await this._closeExistingClientSession(socket);

    try {
      const geminiConnectStart = Date.now();
      logger.info('Creating Gemini Live session', { sessionId, correlationId });

      await geminiLiveService.createSession(sessionId, {
        systemPrompt: agent.systemPrompt,
        voiceName: agent.voiceName,
        modelName: agent.modelName || undefined,
        correlationId,
        ...this._buildGeminiCallbacks(socket, sessionId, correlationId),
      });

      const callStartedAt = Date.now();
      this._registerClientSession(socket, sessionId, agentId, correlationId, callStartedAt, agent, streamId);

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
        inactivityConfig: {
          inactivityTimeoutMs: agent.inactivityTimeoutMs,
          maxInactivityNudges: agent.maxInactivityNudges,
          maxCallDurationSecs: agent.maxCallDurationSecs,
        },
      }));
      logger.debug('Sent call-started payload', {
        sessionId,
        agentName: agent.name,
        voiceName: agent.voiceName,
        modelName: agent.modelName,
        correlationId,
      });

      await this._sendProactiveGreeting(socket, sessionId, correlationId);

      logger.info('Call started successfully', {
        sessionId,
        agentName: agent.name,
        correlationId,
        totalStartupMs: Date.now() - startCallAt,
        inactivityTimeoutMs: agent.inactivityTimeoutMs,
        maxInactivityNudges: agent.maxInactivityNudges,
        maxCallDurationSecs: agent.maxCallDurationSecs,
      });

      this._startInactivityMonitor(socket, sessionId, correlationId);
      this._startCallDurationTimer(socket, sessionId, correlationId);
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
    client.lastUserAudioAt = Date.now();
    client.nudgeCount = 0;
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
      this._stopClientTimers(client);
      this.clients.delete(socket);
      socket.send(JSON.stringify({ 
        type: MESSAGE_TYPE.CALL_ENDED, 
        reason: UI_STRINGS.signaling.status.userEnded, 
      }));
    }
  }

  /**
   * Extract agentId from WebSocket upgrade request URL query params.
   */
  private _extractAgentIdFromUrl(req: IncomingMessage): string | null {
    try {
      const baseUrl = `http://${req.headers.host || 'localhost'}`;
      const parsed = new URL(req.url || '', baseUrl);
      return parsed.searchParams.get('agentId') || null;
    } catch {
      return null;
    }
  }

  /**
   * Handle Vobiz media stream protocol events.
   * Vobiz sends JSON with an 'event' field instead of 'type'.
   */
  private async _handleVobizStreamEvent(
    socket: WSWebSocket,
    message: Record<string, unknown>,
    req: IncomingMessage,
    correlationId: string,
  ): Promise<void> {
    const event = message.event as string;
    const streamId = (message.streamId as string) || 'unknown';

    switch (event) {
      case 'start':
        await this._handleVobizStart(socket, streamId, req, correlationId);
        break;
      case 'media':
        await this._handleVobizMedia(socket, message, correlationId);
        break;
      case 'stop':
        logger.info('Vobiz stream stopped', { streamId, correlationId });
        await this._handleEndCall(socket, correlationId);
        break;
      default:
        logger.debug('Unknown Vobiz stream event', { event, streamId, correlationId });
        break;
    }
  }

  /**
   * Handle Vobiz 'start' event: auto-start a Gemini session for the agent.
   */
  private async _handleVobizStart(
    socket: WSWebSocket,
    streamId: string,
    req: IncomingMessage,
    correlationId: string,
  ): Promise<void> {
    const agentId = this._extractAgentIdFromUrl(req);
    logger.info('Vobiz stream started', { streamId, agentId, correlationId });

    if (!agentId) {
      logger.error('No agentId in Vobiz stream URL', { streamId, correlationId });
      return;
    }

    // Trigger the same start-call flow used by browser clients
    await this._handleStartCall(socket, { agentId }, null, correlationId, streamId);
  }

  /**
   * Handle Vobiz 'media' event: relay base64 audio to Gemini.
   */
  private async _handleVobizMedia(
    socket: WSWebSocket,
    message: Record<string, unknown>,
    correlationId: string,
  ): Promise<void> {
    const media = message.media as Record<string, unknown> | undefined;
    if (!media?.payload) return;

    const payload = media.payload as string;
    const client = this.clients.get(socket);
    if (!client) return;

    client.audioChunksRelayed++;
    client.lastUserAudioAt = Date.now();
    client.nudgeCount = 0;

    if (client.audioChunksRelayed === 1) {
      logger.info('First Vobiz audio chunk relayed to Gemini', {
        sessionId: client.sessionId,
        correlationId,
      });
    }
    if (client.audioChunksRelayed % 50 === 1) {
      logger.debug('Relaying Vobiz audio chunks', {
        sessionId: client.sessionId,
        chunkCount: client.audioChunksRelayed,
        correlationId,
      });
    }

    // Payload from Vobiz is 8kHz, Gemini expects 16kHz
    const resampledPayload = upsample8To16(payload);
    await geminiLiveService.sendAudio(client.sessionId, resampledPayload);
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
      this._stopClientTimers(client);
      geminiLiveService.closeSession(client.sessionId).catch((err: Error) => {
        logger.error('Error closing session on disconnect', { error: err.message });
      });
      this.clients.delete(socket);
    }
  }

  private _startInactivityMonitor(
    socket: WSWebSocket,
    sessionId: string,
    correlationId: string,
  ): void {
    const client = this.clients.get(socket);
    if (!client || client.maxInactivityNudges <= 0) return;

    client.inactivityTimer = setInterval(() => {
      const currentClient = this.clients.get(socket);
      if (currentClient?.sessionId !== sessionId) {
        clearInterval(client.inactivityTimer);
        return;
      }

      const now = Date.now();
      const silenceMs = now - currentClient.lastModelResponseAt;
      const userSpokeAfterModel = currentClient.lastUserAudioAt > currentClient.lastModelResponseAt;
      const inNudgeCycle = currentClient.nudgeCount > 0;

      if (silenceMs < currentClient.inactivityTimeoutMs) {
        return;
      }

      if (!userSpokeAfterModel && !inNudgeCycle) {
        return;
      }

      currentClient.nudgeCount++;

      if (currentClient.nudgeCount > currentClient.maxInactivityNudges) {
        logger.warn('Max inactivity nudges exhausted, auto-ending call', {
          sessionId,
          correlationId,
          nudgeCount: currentClient.nudgeCount - 1,
          silenceMs,
        });
        this._autoEndCall(
          socket,
          sessionId,
          correlationId,
          UI_STRINGS.signaling.status.autoEndInactivity,
        );
        return;
      }

      logger.info('Sending inactivity nudge to Gemini', {
        sessionId,
        correlationId,
        nudgeNum: currentClient.nudgeCount,
        maxNudges: currentClient.maxInactivityNudges,
        silenceMs,
      });

      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: MESSAGE_TYPE.INACTIVITY_NUDGE,
          nudgeNum: currentClient.nudgeCount,
          maxNudges: currentClient.maxInactivityNudges,
          message: UI_STRINGS.signaling.status.inactivityNudge(
            currentClient.nudgeCount,
            currentClient.maxInactivityNudges,
          ),
        }));
      }

      geminiLiveService.sendText(
        sessionId,
        LIVE_CALL.NUDGE_PROMPT,
        `inactivity-nudge-${currentClient.nudgeCount}`,
      ).catch((err: Error) => {
        logger.error('Nudge send failed', {
          sessionId,
          correlationId,
          error: err.message,
        });
      });
    }, LIVE_CALL.INACTIVITY_CHECK_INTERVAL_MS);
  }

  private _startCallDurationTimer(
    socket: WSWebSocket,
    sessionId: string,
    correlationId: string,
  ): void {
    const client = this.clients.get(socket);
    if (!client?.maxCallDurationSecs || client.maxCallDurationSecs <= 0) return;

    const maxDurationMs = client.maxCallDurationSecs * TIME.MS_TO_SEC;
    logger.info('Call duration timer started', {
      sessionId,
      correlationId,
      maxCallDurationSecs: client.maxCallDurationSecs,
    });

    client.callDurationTimer = setTimeout(() => {
      const currentClient = this.clients.get(socket);
      if (currentClient?.sessionId !== sessionId) return;

      logger.info('Max call duration reached, auto-ending call', {
        sessionId,
        correlationId,
        maxCallDurationSecs: currentClient.maxCallDurationSecs,
      });

      this._autoEndCall(
        socket,
        sessionId,
        correlationId,
        UI_STRINGS.signaling.status.autoEndDuration(currentClient.maxCallDurationSecs),
      );
    }, maxDurationMs);
  }

  private _stopClientTimers(client: SignalingClient): void {
    if (client.inactivityTimer) {
      clearInterval(client.inactivityTimer);
      client.inactivityTimer = undefined;
    }
    if (client.callDurationTimer) {
      clearTimeout(client.callDurationTimer);
      client.callDurationTimer = undefined;
    }
  }

  private async _autoEndCall(
    socket: WSWebSocket,
    sessionId: string,
    correlationId: string,
    reason: string,
  ): Promise<void> {
    const client = this.clients.get(socket);
    if (!client) return;

    const duration = Math.round((Date.now() - client.startTime) / TIME.MS_TO_SEC);
    logger.info('Auto-ending call', {
      sessionId,
      correlationId,
      durationSeconds: duration,
      reason,
    });

    this._stopClientTimers(client);
    await geminiLiveService.closeSession(sessionId);
    this.clients.delete(socket);

    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: MESSAGE_TYPE.AUTO_CALL_END,
        reason,
      }));
    }
  }
}

const signalingServer = new SignalingServer();
export default signalingServer;
