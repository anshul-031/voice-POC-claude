/* eslint-disable max-lines */
import WebSocket, { WebSocketServer } from 'ws';
import type { WebSocket as WSWebSocket, WebSocketServer as WSWebSocketServer } from 'ws';
import type { IncomingMessage, Server } from 'http';
import { URL } from 'url';
import { v4 as uuidv4 } from 'uuid';
import geminiLiveService from './geminiLive.js';
import prisma from '../lib/prisma.js';
import { UI_STRINGS } from '../constants/uiStrings.js';
import {
  LIVE_CALL,
  LOGGING,
  AUDIO_CONFIG,
  ROUTES,
  TIME,
  MESSAGE_TYPE,
  CAMPAIGN_CONTACT_STATUS,
  CALL_STATUS,
  RECORDING,
  TELEPHONY_DIRECTION,
} from '../types/index.js';
import type { AudioChunkMetrics, ModelAudioRelayMetrics, SignalingClient } from '../types/index.js';
import logger from '../utils/logger.js';
import { verifyToken } from './auth.js';
import {
  createCallRecord,
  finalizeCallRecord,
  appendTranscriptEntry,
  resolveCallType,
} from './callHistoryService.js';
import {
  SIGNALING_AUDIO_DATA_MESSAGE_SCHEMA,
  SIGNALING_MESSAGE_SCHEMA,
  SIGNALING_START_CALL_MESSAGE_SCHEMA,
  type SignalingMessage,
} from '../constants/inputSchemas.js';
import { downsample24To8, upsample8To16 } from '../utils/audioResampler.js';
import { substituteTemplateVariables } from '../utils/templateVariables.js';
import { getWalletAccount } from './walletService.js';

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

type AuthorizedCallAgent = StartCallAgent & {
  billingRate: number;
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
  private audioDiagnosticCounters: Map<string, number> = new Map();

  private _shouldLogAudioDiagnostic(correlationId: string, reason: string): boolean {
    const key = `${correlationId}:${reason}`;
    const count = (this.audioDiagnosticCounters.get(key) ?? 0) + 1;
    this.audioDiagnosticCounters.set(key, count);
    return count === 1 || count % LOGGING.THROTTLE_CHUNKS === 1;
  }

  private _logAudioDiagnosticWarning(
    correlationId: string,
    reason: string,
    message: string,
  ): void {
    if (!this._shouldLogAudioDiagnostic(correlationId, reason)) return;
    logger.warn(message, { correlationId });
  }

  private _logInvalidSignalingMessage(
    correlationId: string,
    rawMessage: unknown,
    issues: string[],
    payloadBytes: number,
  ): void {
    const messageType = rawMessage && typeof rawMessage === 'object'
      ? (rawMessage as Record<string, unknown>).type
      : undefined;
    if (messageType === MESSAGE_TYPE.AUDIO_DATA) {
      this._logAudioDiagnosticWarning(
        correlationId,
        'invalid-client-audio',
        'Rejected invalid client audio payload',
      );
      return;
    }
    logger.warn('Invalid signaling message payload', {
      correlationId,
      issues,
      payloadBytes,
    });
  }

  private _clearAudioDiagnosticCounters(correlationId: string): void {
    this.audioDiagnosticCounters.delete(`${correlationId}:invalid-client-audio`);
    this.audioDiagnosticCounters.delete(`${correlationId}:missing-client-audio`);
    this.audioDiagnosticCounters.delete(`${correlationId}:missing-vobiz-audio`);
  }

  public attach(httpServer: Server): void {
    const wss = new WebSocketServer({ server: httpServer, path: ROUTES.WS_PATH });
    this.wss = wss;

    wss.on('connection', (socket: WSWebSocket, req: IncomingMessage) => {
      const correlationId = uuidv4();
      const hasClientAddress = Boolean(req.headers['x-forwarded-for'] || req.socket.remoteAddress);
      let signalingMessagesReceived = 0;
      let signalingMessageBytes = 0;
      logger.info('New WebSocket connection', { correlationId, hasClientAddress });

      socket.on('message', async (data: Buffer | string | ArrayBuffer | Buffer[]) => {
        try {
          const messageStart = Date.now();
          const dataString = data.toString();
          signalingMessagesReceived++;
          signalingMessageBytes += dataString.length;
          const rawMessage = JSON.parse(dataString);

          // Detect Vobiz stream protocol (uses 'event' field, not 'type')
          if (rawMessage.event) {
            await this._handleVobizStreamEvent(socket, rawMessage, req, correlationId);
            return;
          }

          const requesterUserId = this._resolveRequesterUserId(req);
          const messageParse = SIGNALING_MESSAGE_SCHEMA.safeParse(rawMessage);
          if (!messageParse.success) {
            this._logInvalidSignalingMessage(
              correlationId,
              rawMessage,
              messageParse.error.issues.map(issue => issue.code),
              dataString.length,
            );
            socket.send(JSON.stringify({
              type: MESSAGE_TYPE.ERROR,
              message: UI_STRINGS.signaling.errors.invalidMessageFormat,
            }));
            return;
          }

          const message = messageParse.data;
          logger.debug('Signaling message received', {
            type: message.type,
            correlationId,
            payloadBytes: dataString.length,
            messageCount: signalingMessagesReceived,
            totalMessageBytes: signalingMessageBytes,
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
            correlationId,
            messageCount: signalingMessagesReceived,
          });
          socket.send(JSON.stringify({
            type: MESSAGE_TYPE.ERROR,
            message: isJsonParseError ? UI_STRINGS.signaling.errors.invalidMessageFormat : errMsg,
          }));
        }
      });

      socket.on('close', (code: number, reason: Buffer) => {
        const client = this.clients.get(socket);
        logger.info('WebSocket closed', {
          code,
          reasonCodePresent: reason.length > 0,
          correlationId,
          messageCount: signalingMessagesReceived,
          messageBytes: signalingMessageBytes,
          audioChunksRelayed: client?.audioChunksRelayed ?? 0,
          modelAudioChunksRelayed: client?.modelAudioChunksRelayed ?? 0,
          modelAudioRelayFailures: client?.modelAudioRelayFailures ?? 0,
        });
        this._clearAudioDiagnosticCounters(correlationId);
        this._handleDisconnect(socket);
      });

      socket.on('error', (error: Error) => {
        logger.error('WebSocket error', {
          error: error.message,
          correlationId,
          messageCount: signalingMessagesReceived,
          messageBytes: signalingMessageBytes,
        });
        this._clearAudioDiagnosticCounters(correlationId);
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
  ): Promise<AuthorizedCallAgent | null> {
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

    const wallet = await getWalletAccount(agent.userId as string);
    if (!wallet.canStartCall) {
      logger.warn('Call blocked by insufficient wallet balance', {
        agentId,
        userId: agent.userId,
        balance: wallet.balance,
        correlationId,
      });
      this._sendSocketError(socket, UI_STRINGS.signaling.errors.insufficientBalance);
      return null;
    }

    logger.info('Agent found for call', {
      agentId,
      name: agent.name,
      voice: agent.voiceName,
      model: agent.modelName,
      correlationId,
    });

    return { ...agent, billingRate: wallet.costPerMinute };
  }

  private async _closeExistingClientSession(socket: WSWebSocket): Promise<void> {
    const existing = this.clients.get(socket);
    if (!existing) {
      return;
    }

    logger.info('Closing existing session for client reconnect', { sessionId: existing.sessionId });
    await geminiLiveService.closeSession(existing.sessionId);
  }

  private _updateModelAudioClientState(
    client: SignalingClient,
    metrics: ModelAudioRelayMetrics,
    now: number,
  ): void {
    client.modelAudioChunksRelayed++;
    client.modelAudioBytesRelayed = (client.modelAudioBytesRelayed ?? 0) + metrics.audioBytes;
    client.modelAudioSamplesRelayed = (client.modelAudioSamplesRelayed ?? 0) + metrics.audioSamples;
    client.modelAudioDurationMsRelayed = (client.modelAudioDurationMsRelayed ?? 0) + metrics.audioDurationMs;
    client.lastModelAudioAt = now;
    if (metrics.interArrivalMs !== undefined) {
      client.maxModelAudioInterArrivalMs = Math.max(
        client.maxModelAudioInterArrivalMs ?? 0,
        metrics.interArrivalMs,
      );
    }
    client.lastModelResponseAt = Math.max(now, client.lastModelResponseAt) + metrics.audioDurationMs;
  }

  private _logModelAudioProgress(
    client: SignalingClient,
    sessionId: string,
    metrics: ModelAudioRelayMetrics,
  ): void {
    if (client.modelAudioChunksRelayed % LOGGING.THROTTLE_CHUNKS !== 1) return;
    logger.debug('Relaying model audio to client', {
      sessionId,
      correlationId: client.correlationId,
      clientTraceId: client.clientTraceId,
      route: client.streamId ? 'telephony' : 'browser',
      modelAudioChunksRelayed: client.modelAudioChunksRelayed,
      audioBytes: metrics.audioBytes,
      audioSamples: metrics.audioSamples,
      audioDurationMs: metrics.audioDurationMs,
      interArrivalMs: metrics.interArrivalMs,
      maxInterArrivalMs: client.maxModelAudioInterArrivalMs,
    });
  }

  private _buildModelAudioRelayMetrics(
    client: SignalingClient | undefined,
    audioData: string,
    audioMetrics: AudioChunkMetrics | undefined,
    now: number,
  ): ModelAudioRelayMetrics {
    const decodedAudio = audioMetrics ? undefined : Buffer.from(audioData, 'base64');
    const baseMetrics = audioMetrics ?? {
      audioBytes: decodedAudio?.length ?? 0,
      audioSamples: Math.floor(
        (decodedAudio?.length ?? 0) / AUDIO_CONFIG.PCM_BYTES_PER_SAMPLE,
      ),
    };
    const audioDurationMs = baseMetrics.audioBytes
      / (AUDIO_CONFIG.SAMPLE_RATE_OUTPUT * AUDIO_CONFIG.PCM_BYTES_PER_SAMPLE)
      * TIME.MS_TO_SEC;
    const interArrivalMs = client?.lastModelAudioAt
      ? now - client.lastModelAudioAt
      : undefined;
    return { ...baseMetrics, audioDurationMs, interArrivalMs };
  }

  private _recordModelAudioMetrics(
    client: SignalingClient | undefined,
    sessionId: string,
    metrics: ModelAudioRelayMetrics,
    deliveredAt: number,
  ): void {
    if (!client) return;
    this._updateModelAudioClientState(client, metrics, deliveredAt);
    this._trackFirstModelAudio(client, sessionId, deliveredAt);
    this._logModelAudioProgress(client, sessionId, metrics);
  }

  private _recordBrowserBufferedAmount(client: SignalingClient | undefined, bufferedAmount: number): void {
    if (!client) return;
    client.maxModelAudioBufferedAmount = Math.max(
      client.maxModelAudioBufferedAmount ?? 0,
      bufferedAmount,
    );
  }

  private _recordBrowserSendSuccess(
    client: SignalingClient | undefined,
    sendStartedAt: number,
  ): void {
    if (client) client.modelAudioSendLatencyMs = Date.now() - sendStartedAt;
  }

  private _recordBrowserSendFailure(
    sessionId: string,
    client: SignalingClient | undefined,
    metrics: ModelAudioRelayMetrics,
    sendStartedAt: number,
    error: unknown,
  ): void {
    if (client) client.modelAudioRelayFailures = (client.modelAudioRelayFailures ?? 0) + 1;
    logger.error('Failed to relay model audio to browser', {
      sessionId,
      correlationId: client?.correlationId,
      audioBytes: metrics.audioBytes,
      sendLatencyMs: Date.now() - sendStartedAt,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  private _logBrowserBackpressure(
    sessionId: string,
    client: SignalingClient | undefined,
    bufferedAmount: number,
  ): void {
    if (
      !client
      || bufferedAmount < LOGGING.WS_BUFFERED_AMOUNT_WARN_BYTES
      || client.modelAudioChunksRelayed % LOGGING.THROTTLE_CHUNKS !== 1
    ) return;
    logger.warn('WebSocket buffered amount is high while relaying model audio', {
      sessionId,
      correlationId: client.correlationId,
      bufferedAmount,
      thresholdBytes: LOGGING.WS_BUFFERED_AMOUNT_WARN_BYTES,
      modelAudioChunksRelayed: client.modelAudioChunksRelayed,
    });
  }

  private _logBrowserModelAudioProgress(
    sessionId: string,
    client: SignalingClient | undefined,
    metrics: ModelAudioRelayMetrics,
    bufferedAmount: number,
  ): void {
    if (!client || client.modelAudioChunksRelayed % LOGGING.THROTTLE_CHUNKS !== 1) return;
    logger.debug('Model audio chunk relayed', {
      sessionId,
      correlationId: client.correlationId,
      clientTraceId: client.clientTraceId,
      route: 'browser',
      chunkIndex: client.modelAudioChunksRelayed,
      audioBytes: metrics.audioBytes,
      audioSamples: metrics.audioSamples,
      audioDurationMs: metrics.audioDurationMs,
      bufferedAmount,
      sendLatencyMs: client.modelAudioSendLatencyMs,
    });
  }

  private _sendBrowserModelAudio(
    socket: WSWebSocket,
    sessionId: string,
    client: SignalingClient | undefined,
    audioData: string,
    metrics: ModelAudioRelayMetrics,
  ): void {
    const payload = JSON.stringify({
      type: MESSAGE_TYPE.AUDIO_RESPONSE,
      data: audioData,
    });
    const bufferedAmountBeforeSend = socket.bufferedAmount;
    this._recordBrowserBufferedAmount(client, bufferedAmountBeforeSend);
    const sendStartedAt = Date.now();
    try {
      socket.send(payload);
      this._recordBrowserSendSuccess(client, sendStartedAt);
      this._recordModelAudioMetrics(client, sessionId, metrics, Date.now());
    } catch (error: unknown) {
      this._recordBrowserSendFailure(sessionId, client, metrics, sendStartedAt, error);
    }

    this._logBrowserBackpressure(sessionId, client, bufferedAmountBeforeSend);
    this._logBrowserModelAudioProgress(sessionId, client, metrics, bufferedAmountBeforeSend);
  }

  private _relayModelAudioToClient(
    socket: WSWebSocket,
    sessionId: string,
    audioData: string,
    audioMetrics?: AudioChunkMetrics,
  ): void {
    if (socket.readyState !== WebSocket.OPEN) {
      logger.debug('Dropping model audio because signaling socket is not open', { sessionId });
      return;
    }

    const client = this.clients.get(socket);
    const metrics = this._buildModelAudioRelayMetrics(client, audioData, audioMetrics, Date.now());
    if (client?.streamId) {
      this._sendVobizPlayAudio(socket, client, audioData, metrics);
      return;
    }

    this._sendBrowserModelAudio(socket, sessionId, client, audioData, metrics);
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
      const outputBytes = Buffer.from(resampledData, 'base64').length;
      client.recordingChunks?.push(Buffer.from(resampledData, 'base64'));
      socket.send(JSON.stringify({
        event: 'playAudio',
        media: {
          contentType: 'audio/x-l16',
          sampleRate: 8000,
          payload: resampledData,
        },
      }));
      if (client.modelAudioChunksRelayed % LOGGING.THROTTLE_CHUNKS === 1) {
        logger.debug('Telephony model audio relayed', {
          sessionId: client.sessionId,
          correlationId: client.correlationId,
          modelAudioChunksRelayed: client.modelAudioChunksRelayed,
          inputBytes: Buffer.from(audioData, 'base64').length,
          outputBytes,
          outputSampleRate: 8000,
          bufferedAmount: socket.bufferedAmount,
        });
      }
    } catch (error: unknown) {
      client.modelAudioRelayFailures = (client.modelAudioRelayFailures ?? 0) + 1;
      logger.error('Failed to relay model audio to telephony provider', {
        sessionId: client.sessionId,
        correlationId: client.correlationId,
        failures: client.modelAudioRelayFailures,
        error: error instanceof Error ? error.message : String(error),
      });
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

    if (client.transcriptEntries) {
      appendTranscriptEntry(
        client.transcriptEntries,
        transcript,
        client.transcriptOpenRole === transcript.role,
      );
      client.transcriptOpenRole = transcript.role;
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
      client.lastModelResponseAt = Math.max(client.lastModelResponseAt, now);
    }
  }

  private _buildGeminiCallbacks(
    socket: WSWebSocket,
    sessionId: string,
    correlationId: string,
  ): {
    onAudio: (audioData: string) => void;
    onTranscript: (transcript: { role: 'user' | 'model'; text: string }) => void;
    onTurnComplete: () => void;
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
      onTurnComplete: (): void => {
        const client = this.clients.get(socket);
        if (client?.transcriptOpenRole === 'model') {
          client.transcriptOpenRole = undefined;
        }
      },
      onInterrupted: (): void => {
        logger.info('Model interrupted, relaying to client', { sessionId, correlationId });
        const client = this.clients.get(socket);
        if (client) {
          client.lastModelResponseAt = Date.now();
          client.nudgeCount = 0;
        }
        if (client?.transcriptOpenRole === 'model') {
          client.transcriptOpenRole = undefined;
        }
        if (socket.readyState === WebSocket.OPEN) {
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
        const client = this.clients.get(socket);
        if (client) {
          this._finalizeCall(client, CALL_STATUS.COMPLETED);
        }
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
    requesterUserId?: string | null,
    clientTraceId?: string,
  ): void {
    const now = Date.now();
    const callType = resolveCallType(streamId, requesterUserId);
    this.clients.set(socket, {
      sessionId,
      agentId,
      correlationId,
      clientTraceId,
      streamId,
      audioChunksRelayed: 0,
      audioBytesRelayed: 0,
      audioSamplesRelayed: 0,
      audioRelayInFlight: 0,
      maxAudioRelayInFlight: 0,
      maxAudioRelayLatencyMs: 0,
      maxAudioInterArrivalMs: 0,
      modelAudioChunksRelayed: 0,
      modelAudioBytesRelayed: 0,
      modelAudioSamplesRelayed: 0,
      modelAudioDurationMsRelayed: 0,
      modelAudioRelayFailures: 0,
      maxModelAudioInterArrivalMs: 0,
      maxModelAudioBufferedAmount: 0,
      modelAudioSendLatencyMs: 0,
      startTime,
      proactiveGreetingSent: false,
      lastModelResponseAt: now,
      lastUserAudioAt: now,
      nudgeCount: 0,
      callType,
      transcriptEntries: [],
      recordingChunks: [],
      callHistoryFinalized: false,
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

  /**
   * Persist a new in-progress call history record for a started call.
   * Best-effort: failures are swallowed inside the service.
   */
  private async _createCallHistoryRecord(
    socket: WSWebSocket,
    sessionId: string,
    agent: StartCallAgent,
    billingRate: number,
    streamId?: string,
    requesterUserId?: string | null,
  ): Promise<void> {
    const client = this.clients.get(socket);
    await createCallRecord({
      sessionId,
      callType: client?.callType ?? resolveCallType(streamId, requesterUserId),
      agentId: agent.id,
      agentName: agent.name,
      userId: agent.userId,
      billingRate,
      ...(streamId && { direction: TELEPHONY_DIRECTION.OUTBOUND }),
    });
  }

  private _getInputAudioDiagnostics(client: SignalingClient): Record<string, unknown> {
    return {
      inputAudioChunks: client.audioChunksRelayed,
      inputAudioBytes: client.audioBytesRelayed ?? 0,
      inputAudioSamples: client.audioSamplesRelayed ?? 0,
      inputMaxInterArrivalMs: client.maxAudioInterArrivalMs ?? 0,
      inputMaxRelayLatencyMs: client.maxAudioRelayLatencyMs ?? 0,
      inputMaxInFlight: client.maxAudioRelayInFlight ?? 0,
      inputRelayInFlight: client.audioRelayInFlight ?? 0,
    };
  }

  private _getModelAudioDiagnostics(client: SignalingClient): Record<string, unknown> {
    return {
      modelAudioChunks: client.modelAudioChunksRelayed,
      modelAudioBytes: client.modelAudioBytesRelayed ?? 0,
      modelAudioSamples: client.modelAudioSamplesRelayed ?? 0,
      modelAudioDurationMs: client.modelAudioDurationMsRelayed ?? 0,
      modelMaxInterArrivalMs: client.maxModelAudioInterArrivalMs ?? 0,
      modelMaxBufferedAmount: client.maxModelAudioBufferedAmount ?? 0,
      modelLastSendLatencyMs: client.modelAudioSendLatencyMs ?? 0,
      relayFailures: client.modelAudioRelayFailures ?? 0,
    };
  }

  private _getRecordingDiagnostics(
    client: SignalingClient,
    recordingChunks: Buffer[],
  ): Record<string, unknown> {
    return {
      transcriptEntryCount: client.transcriptEntries?.length ?? 0,
      recordingChunkCount: recordingChunks.length,
      recordingBytes: recordingChunks.reduce((total, chunk) => total + chunk.length, 0),
    };
  }

  private _logCallAudioDiagnostics(
    client: SignalingClient,
    status: string,
    durationSecs: number,
    recordingChunks: Buffer[],
  ): void {
    logger.info('Call audio diagnostics summary', {
      sessionId: client.sessionId,
      agentId: client.agentId,
      correlationId: client.correlationId,
      clientTraceId: client.clientTraceId,
      callType: client.callType,
      status,
      durationSecs,
      ...this._getInputAudioDiagnostics(client),
      ...this._getModelAudioDiagnostics(client),
      ...this._getRecordingDiagnostics(client, recordingChunks),
    });
  }

  /**
   * Finalize the call history record (duration, transcript, recording, status).
   * Idempotent — guarded by a per-client flag so end + disconnect don't double-write.
   */
  private _finalizeCall(client: SignalingClient, status: string): void {
    if (client.callHistoryFinalized) {
      return;
    }
    client.callHistoryFinalized = true;

    const durationSecs = Math.round((Date.now() - client.startTime) / TIME.MS_TO_SEC);
    const isTelephony = !!client.streamId;
    const recordingChunks = client.recordingChunks ?? [];
    this._logCallAudioDiagnostics(client, status, durationSecs, recordingChunks);

    void finalizeCallRecord({
      sessionId: client.sessionId,
      status,
      durationSecs,
      transcript: client.transcriptEntries ?? [],
      ...(isTelephony && recordingChunks.length > 0 && {
        recordingChunks,
        recordingSampleRate: RECORDING.TELEPHONY_SAMPLE_RATE,
      }),
    });
  }

  /** @internal */
  public async _handleStartCall(
    socket: WSWebSocket,
    message: { agentId: string; variables?: Record<string, string>; clientTraceId?: string },
    requesterUserId: string | null = null,
    correlationId = uuidv4(),
    streamId?: string,
  ): Promise<void> {
    const startCallAt = Date.now();
    const parseResult = SIGNALING_START_CALL_MESSAGE_SCHEMA.safeParse({
      type: MESSAGE_TYPE.START_CALL,
      agentId: message.agentId,
      variables: message.variables,
      clientTraceId: message.clientTraceId,
    });
    if (!parseResult.success) {
      this._sendSocketError(socket, UI_STRINGS.signaling.errors.agentIdRequired);
      return;
    }

    const { agentId, variables, clientTraceId } = parseResult.data;
    logger.info('Start call request', {
      agentId,
      correlationId,
      clientTraceId,
      variableCount: variables ? Object.keys(variables).length : 0,
    });

    const agent = await this._fetchAgentForCall(socket, agentId, requesterUserId, correlationId);
    if (!agent) {
      return;
    }

    try {
      const resolvedSystemPrompt = substituteTemplateVariables(agent.systemPrompt, variables);

      const sessionId = uuidv4();
      await this._closeExistingClientSession(socket);

      const geminiConnectStart = Date.now();
      logger.info('Creating Gemini Live session', { sessionId, correlationId });

      await geminiLiveService.createSession(sessionId, {
        systemPrompt: resolvedSystemPrompt,
        voiceName: agent.voiceName,
        modelName: agent.modelName || undefined,
        correlationId,
        ...this._buildGeminiCallbacks(socket, sessionId, correlationId),
      });

      const callStartedAt = Date.now();
      this._registerClientSession(
        socket,
        sessionId,
        agentId,
        correlationId,
        callStartedAt,
        agent,
        streamId,
        requesterUserId,
        clientTraceId,
      );
      await this._createCallHistoryRecord(
        socket,
        sessionId,
        agent,
        agent.billingRate,
        streamId,
        requesterUserId,
      );

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

  private _recordIncomingAudio(
    client: SignalingClient,
    audioBytes: number,
    audioSamples: number,
    now: number,
  ): AudioChunkMetrics {
    const interArrivalMs = client.audioChunksRelayed > 0
      ? now - client.lastUserAudioAt
      : undefined;
    client.audioChunksRelayed++;
    client.audioBytesRelayed = (client.audioBytesRelayed ?? 0) + audioBytes;
    client.audioSamplesRelayed = (client.audioSamplesRelayed ?? 0) + audioSamples;
    client.audioRelayInFlight = (client.audioRelayInFlight ?? 0) + 1;
    client.maxAudioRelayInFlight = Math.max(
      client.maxAudioRelayInFlight ?? 0,
      client.audioRelayInFlight,
    );
    if (interArrivalMs !== undefined) {
      client.maxAudioInterArrivalMs = Math.max(client.maxAudioInterArrivalMs ?? 0, interArrivalMs);
    }
    client.lastUserAudioAt = now;
    client.nudgeCount = 0;
    return { audioBytes, audioSamples, interArrivalMs };
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
      this._logAudioDiagnosticWarning(
        correlationId,
        'invalid-client-audio',
        'Rejected invalid client audio payload',
      );
      socket.send(JSON.stringify({
        type: MESSAGE_TYPE.ERROR,
        message: UI_STRINGS.signaling.errors.invalidMessageFormat,
      }));
      return;
    }

    const client = this.clients.get(socket);
    if (!client) {
      this._logAudioDiagnosticWarning(
        correlationId,
        'missing-client-audio',
        'Dropped client audio without an active session',
      );
      return;
    }

    const now = Date.now();
    const audioBase64 = parseResult.data.data;
    const audioBytes = Buffer.from(audioBase64, 'base64').length;
    const audioSamples = Math.floor(audioBytes / AUDIO_CONFIG.PCM_BYTES_PER_SAMPLE);
    const audioMetrics = this._recordIncomingAudio(client, audioBytes, audioSamples, now);
    const relayStartedAt = now;

    if (client.audioChunksRelayed === 1) {
      logger.info('First client audio chunk relayed to Gemini', {
        sessionId: client.sessionId,
        correlationId,
        clientTraceId: client.clientTraceId,
        elapsedMs: now - client.startTime,
        audioBytes: audioMetrics.audioBytes,
        audioSamples: audioMetrics.audioSamples,
      });
    }
    if (client.audioChunksRelayed % LOGGING.THROTTLE_CHUNKS === 1) {
      logger.debug('Relaying browser audio chunks to Gemini', {
        sessionId: client.sessionId,
        chunkCount: client.audioChunksRelayed,
        audioBytes: audioMetrics.audioBytes,
        audioSamples: audioMetrics.audioSamples,
        interArrivalMs: audioMetrics.interArrivalMs,
        maxInterArrivalMs: client.maxAudioInterArrivalMs,
        inFlight: client.audioRelayInFlight,
        socketBufferedAmount: socket.bufferedAmount,
        correlationId,
      });
    }

    try {
      await geminiLiveService.sendAudio(client.sessionId, audioBase64);
    } finally {
      client.audioRelayInFlight = Math.max(0, (client.audioRelayInFlight ?? 1) - 1);
      const relayLatencyMs = Date.now() - relayStartedAt;
      client.maxAudioRelayLatencyMs = Math.max(client.maxAudioRelayLatencyMs ?? 0, relayLatencyMs);
      if (client.audioChunksRelayed % LOGGING.THROTTLE_CHUNKS === 1) {
        logger.debug('Client audio relay completed', {
          sessionId: client.sessionId,
          correlationId,
          chunkCount: client.audioChunksRelayed,
          relayLatencyMs,
          maxRelayLatencyMs: client.maxAudioRelayLatencyMs,
          inFlight: client.audioRelayInFlight,
        });
      }
    }
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
      this._finalizeCall(client, CALL_STATUS.COMPLETED);
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
    return this._extractQueryParam(req, 'agentId');
  }

  /** Extract a single query parameter from the WS upgrade request URL. */
  private _extractQueryParam(req: IncomingMessage, key: string): string | null {
    try {
      const baseUrl = `http://${req.headers.host || 'localhost'}`;
      const parsed = new URL(req.url || '', baseUrl);
      return parsed.searchParams.get(key) || null;
    } catch {
      return null;
    }
  }

  /**
   * Load a campaign contact's per-row variables (for telephony campaign calls).
   * Marks the contact as connected. Failures are swallowed so a bad/expired
   * contactId never blocks the call from starting.
   */
  private async _loadCampaignContactVariables(
    contactId: string,
    correlationId: string,
  ): Promise<Record<string, string> | undefined> {
    try {
      const contact = await prisma.campaignContact.findUnique({ where: { id: contactId } });
      if (!contact) {
        logger.warn('Campaign contact not found for stream', { contactId, correlationId });
        return undefined;
      }

      await prisma.campaignContact.update({
        where: { id: contactId },
        data: { status: CAMPAIGN_CONTACT_STATUS.COMPLETED },
      });

      const raw = contact.variables as Record<string, unknown> | null;
      if (!raw || typeof raw !== 'object') return undefined;

      const variables: Record<string, string> = {};
      for (const [key, value] of Object.entries(raw)) {
        variables[key] = typeof value === 'string' ? value : String(value);
      }
      return variables;
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to load campaign contact variables', { contactId, error: errMsg, correlationId });
      return undefined;
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
    const contactId = this._extractQueryParam(req, 'contactId');
    logger.info('Vobiz stream started', { streamId, agentId, contactId, correlationId });

    if (!agentId) {
      logger.error('No agentId in Vobiz stream URL', { streamId, correlationId });
      return;
    }

    // Campaign calls carry a contactId; load that contact's prompt variables.
    const variables = contactId
      ? await this._loadCampaignContactVariables(contactId, correlationId)
      : undefined;

    // Trigger the same start-call flow used by browser clients
    await this._handleStartCall(socket, { agentId, variables }, null, correlationId, streamId);
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
    if (!client) {
      this._logAudioDiagnosticWarning(
        correlationId,
        'missing-vobiz-audio',
        'Dropped Vobiz audio without an active session',
      );
      return;
    }

    const now = Date.now();
    const inputBytes = Buffer.from(payload, 'base64').length;
    const inputSamples = Math.floor(inputBytes / AUDIO_CONFIG.PCM_BYTES_PER_SAMPLE);
    client.recordingChunks?.push(Buffer.from(payload, 'base64'));
    const audioMetrics = this._recordIncomingAudio(client, inputBytes, inputSamples, now);
    const relayStartedAt = now;

    if (client.audioChunksRelayed === 1) {
      logger.info('First Vobiz audio chunk relayed to Gemini', {
        sessionId: client.sessionId,
        correlationId,
        elapsedMs: now - client.startTime,
        inputBytes: audioMetrics.audioBytes,
        inputSamples: audioMetrics.audioSamples,
      });
    }
    if (client.audioChunksRelayed % LOGGING.THROTTLE_CHUNKS === 1) {
      logger.debug('Relaying Vobiz audio chunks', {
        sessionId: client.sessionId,
        chunkCount: client.audioChunksRelayed,
        inputBytes: audioMetrics.audioBytes,
        inputSamples: audioMetrics.audioSamples,
        interArrivalMs: audioMetrics.interArrivalMs,
        maxInterArrivalMs: client.maxAudioInterArrivalMs,
        socketBufferedAmount: socket.bufferedAmount,
        correlationId,
      });
    }

    try {
      // Payload from Vobiz is 8kHz, Gemini expects 16kHz.
      const resampledPayload = upsample8To16(payload);
      await geminiLiveService.sendAudio(client.sessionId, resampledPayload);
    } finally {
      client.audioRelayInFlight = Math.max(0, (client.audioRelayInFlight ?? 1) - 1);
      const relayLatencyMs = Date.now() - relayStartedAt;
      client.maxAudioRelayLatencyMs = Math.max(client.maxAudioRelayLatencyMs ?? 0, relayLatencyMs);
      if (client.audioChunksRelayed % LOGGING.THROTTLE_CHUNKS === 1) {
        logger.debug('Vobiz audio relay completed', {
          sessionId: client.sessionId,
          correlationId,
          chunkCount: client.audioChunksRelayed,
          relayLatencyMs,
          maxRelayLatencyMs: client.maxAudioRelayLatencyMs,
          inFlight: client.audioRelayInFlight,
        });
      }
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
      this._stopClientTimers(client);
      this._finalizeCall(client, CALL_STATUS.COMPLETED);
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
      currentClient.lastModelResponseAt = now;

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
    this._finalizeCall(client, CALL_STATUS.COMPLETED);
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
