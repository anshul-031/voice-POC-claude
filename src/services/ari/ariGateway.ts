import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../../lib/prisma.js';
import logger from '../../utils/logger.js';
import { ARI_CONFIG, ARI_FALLBACK_SYSTEM_PROMPT } from '../../constants/ari.js';
import { AUDIO_CONFIG } from '../../types/index.js';
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
import { cleanupSession, initializeSipSession, waitForExternalMediaStasis } from './sipSession.js';

const RECONNECT_DELAY_MS = 5000;

class AriGateway {
  private ws: WebSocket | null = null;
  private readonly sessions = new Map<string, SipCallSession>();
  private readonly config: AriConfig = ARI_CONFIG;
  private readonly client: AriClient = new AriClient(this.config);
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly pendingExternalMedia = new Map<string, {
    timeout: ReturnType<typeof setTimeout>;
    resolve: () => void;
  }>();

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
    if (this.handleExternalMediaSubscription(channelId, channelName)) {
      return;
    }

    logger.info('REAL_HUMAN_CALLER', { id: channelId });
    await this.client.answerChannel(channelId);

    const agentId = this.resolveAgentId(event.args);
    const resolvedAgent = await this.resolveAgentForCall(channelId, agentId);
    if (!resolvedAgent) {
      return;
    }

    await initializeSipSession({
      event,
      resolvedAgent,
      config: this.config,
      client: this.client,
      sessions: this.sessions,
      waitForExternalMediaStasis: (channelId) => waitForExternalMediaStasis(channelId, this.pendingExternalMedia),
      sessionId: uuidv4(),
    });
  }

  private async handleStasisEnd(event: AriStasisEndEvent): Promise<void> {
    const session = this.sessions.get(event.channel.id);
    if (session) {
      await cleanupSession(session, this.client, this.sessions);
    }
  }

  private resolveAgentId(args?: string[]): string {
    if (args && args.length > 0 && args[0]?.trim()) {
      return args[0].trim();
    }
    return this.config.defaultAgentId;
  }

  private handleExternalMediaSubscription(channelId: string, channelName?: string): boolean {
    if (this.pendingExternalMedia.has(channelId)) {
      const entry = this.pendingExternalMedia.get(channelId);
      if (entry) {
        clearTimeout(entry.timeout);
        entry.resolve();
      }
      this.pendingExternalMedia.delete(channelId);
      logger.info('External media channel subscribed', { channelId });
      return true;
    }

    return !!(channelName && (channelName.includes('Unibody') || channelName.includes('externalMedia')));
  }

  private async resolveAgentForCall(
    channelId: string,
    agentId: string,
  ): Promise<{ id: string; systemPrompt: string; voiceName: string; modelName: string } | null> {
    if (!agentId) {
      logger.warn('Missing agentId for SIP call, hanging up', { channelId });
      await this.client.hangupChannel(channelId);
      return null;
    }

    const agent = await prisma.voiceAgent.findUnique({ where: { id: agentId } });
    if (!agent) {
      logger.warn('Agent not found for SIP call, using fallback prompt', { channelId, agentId });
      return {
        id: 'fallback',
        systemPrompt: ARI_FALLBACK_SYSTEM_PROMPT,
        voiceName: AUDIO_CONFIG.DEFAULT_VOICE,
        modelName: AUDIO_CONFIG.DEFAULT_MODEL,
      };
    }

    return {
      id: agent.id,
      systemPrompt: agent.systemPrompt,
      voiceName: agent.voiceName,
      modelName: agent.modelName,
    };
  }

}

const ariGateway = new AriGateway();
export default ariGateway;

