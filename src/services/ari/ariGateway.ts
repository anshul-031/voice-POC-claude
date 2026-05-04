import dgram from 'dgram';
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../../lib/prisma.js';
import geminiLiveService from '../geminiLive.js';
import logger from '../../utils/logger.js';
import {
  ARI_CONFIG,
  ARI_FALLBACK_SYSTEM_PROMPT,
  ARI_RTP_DEFAULTS,
  ARI_RTP_HANDSHAKE_TIMEOUT_MS,
} from '../../constants/ari.js';
import { AUDIO_CONFIG, LIVE_CALL } from '../../types/index.js';
import {
  ARI_STASIS_END_SCHEMA,
  ARI_STASIS_START_SCHEMA,
} from '../../constants/inputSchemas.js';
import type {
  AriConfig,
  AriStasisEndEvent,
  AriStasisStartEvent,
  SipCallSession,
} from '../../types/index.js';
import AriClient from './ariClient.js';
import {
  base64ToInt16,
  buildRtpPacket,
  decodeMuLawPayload,
  downsampleTo8k,
  encodeMuLawPayload,
  upsampleTo16k,
} from './rtp.js';
import { bindRtpSocket } from './rtpSocket.js';

const RECONNECT_DELAY_MS = 5000;

class AriGateway {
  private ws: WebSocket | null = null;
  private readonly sessions = new Map<string, SipCallSession>();
  private readonly config: AriConfig = ARI_CONFIG;
  private readonly client: AriClient = new AriClient(this.config);
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  public async start(): Promise<void> {
    logger.info('ARI_START_TRIGGERED');
    const missingEnv = [
      !this.config.url ? 'ARI_URL' : null,
      !this.config.username ? 'ARI_USERNAME' : null,
      !this.config.password ? 'ARI_PASSWORD' : null,
    ].filter((value): value is string => value !== null);

    if (missingEnv.length > 0) {
      logger.error('ARI gateway disabled: missing required environment variables', {
        missing: missingEnv,
      });
      return;
    }

    if (!this.config.rtpHost) {
      logger.warn('ARI RTP host missing, SIP gateway disabled', {
        appCallbackUrl: process.env.APP_CALLBACK_URL || '',
      });
      return;
    }

    if (this.config.rtpPortMin > this.config.rtpPortMax) {
      logger.error('ARI RTP port range invalid, SIP gateway disabled', {
        rtpPortMin: this.config.rtpPortMin,
        rtpPortMax: this.config.rtpPortMax,
      });
      return;
    }

    logger.info('ARI gateway configured', {
      url: this.config.url,
      appName: this.config.appName,
      rtpHost: this.config.rtpHost,
      rtpPortMin: this.config.rtpPortMin,
      rtpPortMax: this.config.rtpPortMax,
      hasDefaultAgentId: !!this.config.defaultAgentId,
    });

    await this.connect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, RECONNECT_DELAY_MS);
  }

  private async connect(): Promise<void> {
    logger.info(`ATTEMPTING ARI CONNECT TO: ${this.config.url}`);
    let wsUrl = '';
    try {
      wsUrl = this.buildEventsWsUrl();
    } catch (error) {
      logger.error('Failed to build ARI WebSocket URL', {
        error: (error as Error).message,
        url: this.config.url,
      });
      this.scheduleReconnect();
      return;
    }

    logger.info(`Initiating WebSocket connection to ${wsUrl}`);
    logger.info(`Attempting WebSocket to: ${wsUrl}`);

    logger.info('Connecting to ARI WebSocket', { wsUrl });

    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => {
      logger.info('ARI Client connected');
    });

    this.ws.on('message', (data: WebSocket.RawData) => {
      void this.handleEventPayload(data.toString());
    });

    this.ws.on('close', (code: number) => {
      logger.warn('ARI WebSocket closed', { code, wsUrl });
      this.scheduleReconnect();
    });

    this.ws.on('error', (error: Error) => {
      logger.error('ARI WebSocket error', {
        error: error.message,
        wsUrl,
        hint: 'Check firewall, ARI credentials, and network reachability.',
      });
      this.scheduleReconnect();
    });

    (this.ws as unknown as { on: (event: string, handler: (error: unknown) => void) => void }).on(
      'connectionFailed',
      (error: unknown) => {
        logger.error('ARI WebSocket connection failed', {
          error: error instanceof Error ? error.message : String(error),
          wsUrl,
        });
      },
    );
  }

  private buildEventsWsUrl(): string {
    const base = new URL(this.config.url);
    const protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = new URL(`${protocol}//${base.host}/ari/events`);
    wsUrl.searchParams.set('app', this.config.appName);
    wsUrl.searchParams.set('api_key', `${this.config.username}:${this.config.password}`);
    return wsUrl.toString();
  }

  private async handleEventPayload(raw: string): Promise<void> {
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch (error) {
      logger.warn('Invalid ARI event payload', { error: (error as Error).message });
      return;
    }

    const startParse = ARI_STASIS_START_SCHEMA.safeParse(payload);
    if (startParse.success) {
      await this.handleStasisStart(startParse.data as AriStasisStartEvent);
      return;
    }

    const endParse = ARI_STASIS_END_SCHEMA.safeParse(payload);
    if (endParse.success) {
      await this.handleStasisEnd(endParse.data as AriStasisEndEvent);
    }
  }

  private async handleStasisStart(event: AriStasisStartEvent): Promise<void> {
    const channelId = event.channel.id;
    const channelName = event.channel.name;
    if (channelName && (channelName.includes('Unibody') || channelName.includes('externalMedia'))) {
      return;
    }
    logger.info('REAL_HUMAN_CALLER', { id: channelId });
    await this.client.answerChannel(channelId);
    const agentId = this.resolveAgentId(event.args);

    if (!agentId) {
      logger.warn('Missing agentId for SIP call, hanging up', { channelId });
      await this.client.hangupChannel(channelId);
      return;
    }

    const agent = await prisma.voiceAgent.findUnique({ where: { id: agentId } });
    const resolvedAgent = agent || {
      id: 'fallback',
      systemPrompt: ARI_FALLBACK_SYSTEM_PROMPT,
      voiceName: AUDIO_CONFIG.DEFAULT_VOICE,
      modelName: AUDIO_CONFIG.DEFAULT_MODEL,
    };

    if (!agent) {
      logger.warn('Agent not found for SIP call, using fallback prompt', { channelId, agentId });
    }

    try {
      const rtpSocket = dgram.createSocket('udp4');
      const localPort = await bindRtpSocket(rtpSocket, this.config);
      const sessionId = uuidv4();
      const bridgeId = await this.client.createBridge();
      const externalMediaChannelId = await this.client.createExternalMediaChannel(
        this.config.appName,
        `${this.config.rtpHost}:${localPort}`,
      );

      await this.client.addChannelToBridge(bridgeId, channelId);
      await this.client.addChannelToBridge(bridgeId, externalMediaChannelId);

      const callSession: SipCallSession = {
        channelId,
        sessionId,
        agentId,
        bridgeId,
        externalMediaChannelId,
        rtpSequence: Math.floor(Math.random() * 65535),
        rtpTimestamp: Math.floor(Math.random() * 0xffffffff),
        rtpSsrc: Math.floor(Math.random() * 0xffffffff),
        rtpSocket,
        startedAt: Date.now(),
      };

      this.sessions.set(channelId, callSession);

      callSession.rtpHandshakeTimeout = setTimeout(() => {
        if (!callSession.rtpRemote) {
          logger.warn('RTP handshake timeout: no inbound RTP detected', {
            channelId,
            timeoutMs: ARI_RTP_HANDSHAKE_TIMEOUT_MS,
          });
        }
      }, ARI_RTP_HANDSHAKE_TIMEOUT_MS);

      rtpSocket.on('message', (message, rinfo) => {
        this.handleInboundRtp(callSession, message, rinfo);
      });

      rtpSocket.on('error', (error) => {
        logger.error('RTP socket error', { channelId, error: error.message });
      });

      await geminiLiveService.createSession(sessionId, {
        systemPrompt: resolvedAgent.systemPrompt,
        voiceName: resolvedAgent.voiceName,
        modelName: resolvedAgent.modelName || undefined,
        correlationId: channelId,
        onAudio: (audio) => this.sendAudioToAsterisk(callSession, audio),
        onTranscript: (transcript) => {
          const filteredText = filterThoughtBlocks(transcript.text);
          if (!filteredText) {
            return;
          }
          logger.info('SIP transcript', { channelId, role: transcript.role, text: filteredText });
        },
        onInterrupted: () => {
          logger.info('SIP call interrupted', { channelId });
        },
        onError: (error) => {
          logger.error('Gemini session error (SIP)', { channelId, error: error.message });
        },
        onClose: async () => {
          logger.info('Gemini session closed (SIP)', { channelId });
          await this.client.hangupChannel(channelId);
          await this.cleanupSession(channelId);
        },
      });

      const greetingSent = await geminiLiveService.sendText(
        sessionId,
        LIVE_CALL.PROACTIVE_GREETING_PROMPT,
        'sip-initial-greeting',
      );

      if (!greetingSent) {
        logger.warn('Failed to send SIP proactive greeting', { channelId });
      }

      logger.info('SIP call bridged to Gemini', {
        channelId,
        agentId: resolvedAgent.id,
        bridgeId,
        externalMediaChannelId,
        caller: event.channel.caller?.number,
      });
    } catch (error) {
      logger.error('Failed to initialize SIP call', {
        channelId,
        error: (error as Error).message,
      });
      await this.client.hangupChannel(channelId);
    }
  }

  private async handleStasisEnd(event: AriStasisEndEvent): Promise<void> {
    await this.cleanupSession(event.channel.id);
  }

  private resolveAgentId(args?: string[]): string {
    if (args && args.length > 0 && args[0]?.trim()) {
      return args[0].trim();
    }
    return this.config.defaultAgentId;
  }

  private handleInboundRtp(session: SipCallSession, message: Buffer, rinfo: dgram.RemoteInfo): void {
    if (!session.rtpRemote) {
      session.rtpRemote = { address: rinfo.address, port: rinfo.port };
      logger.info('Discovered RTP remote', { channelId: session.channelId, ...session.rtpRemote });
      if (session.rtpHandshakeTimeout) {
        clearTimeout(session.rtpHandshakeTimeout);
        session.rtpHandshakeTimeout = undefined;
      }
    }

    if (message.length <= ARI_RTP_DEFAULTS.HEADER_BYTES) {
      return;
    }

    const payload = message.subarray(ARI_RTP_DEFAULTS.HEADER_BYTES);
    const pcm16 = decodeMuLawPayload(payload);
    const pcm16Upsampled = upsampleTo16k(pcm16);
    const base64 = Buffer.from(pcm16Upsampled.buffer).toString('base64');

    void geminiLiveService.sendAudio(session.sessionId, base64);
  }

  private sendAudioToAsterisk(session: SipCallSession, audioBase64: string): void {
    const remote = session.rtpRemote;
    if (!remote) {
      return;
    }

    const pcm16 = base64ToInt16(audioBase64);
    const pcm8k = downsampleTo8k(pcm16);
    const payload = encodeMuLawPayload(pcm8k);

    const packet = buildRtpPacket(payload, session, payload.length);

    session.rtpSocket.send(packet, remote.port, remote.address, (error) => {
      if (error) {
        logger.error('Failed to send RTP audio', { channelId: session.channelId, error: error.message });
      }
    });
  }

  private async cleanupSession(channelId: string): Promise<void> {
    const session = this.sessions.get(channelId);
    if (!session) {
      return;
    }

    this.sessions.delete(channelId);

    if (session.rtpHandshakeTimeout) {
      clearTimeout(session.rtpHandshakeTimeout);
      session.rtpHandshakeTimeout = undefined;
    }

    try {
      session.rtpSocket.close();
    } catch (_error) {
      // ignore
    }

    await geminiLiveService.closeSession(session.sessionId);

    await this.client.deleteBridge(session.bridgeId);
    await this.client.hangupChannel(session.externalMediaChannelId);
  }
}

const ariGateway = new AriGateway();
export default ariGateway;

function filterThoughtBlocks(text: string): string {
  return text.replace(/\*\*[^]*?\*\*/g, '').trim();
}
