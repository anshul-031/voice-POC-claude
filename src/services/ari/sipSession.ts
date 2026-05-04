import dgram from 'dgram';
import geminiLiveService from '../geminiLive.js';
import logger from '../../utils/logger.js';
import {
  ARI_EXTERNAL_MEDIA_STASIS_TIMEOUT_MS,
  ARI_RTP_DEFAULTS,
  ARI_RTP_HANDSHAKE_TIMEOUT_MS,
  ARI_RTP_QUEUE_WINDOW_MS,
} from '../../constants/ari.js';
import { LIVE_CALL } from '../../types/index.js';
import type { AriConfig, AriStasisStartEvent, SipCallSession } from '../../types/index.js';
import type AriClient from './ariClient.js';
import { bindRtpSocket } from './rtpSocket.js';
import { enqueueOutboundAudio, stopRtpPacer } from './rtpPacer.js';
import {
  base64ToInt16,
  decodeMuLawPayload,
  downsampleTo8k,
  encodeMuLawPayload,
  upsampleTo16k,
} from './rtp.js';

export type ResolvedAgent = {
  id: string;
  systemPrompt: string;
  voiceName: string;
  modelName: string;
};

export async function initializeSipSession(params: {
  event: AriStasisStartEvent;
  resolvedAgent: ResolvedAgent;
  config: AriConfig;
  client: AriClient;
  sessions: Map<string, SipCallSession>;
  waitForExternalMediaStasis: (channelId: string) => Promise<void>;
  sessionId: string;
}): Promise<void> {
  const {
    event,
    resolvedAgent,
    config,
    client,
    sessions,
    waitForExternalMediaStasis,
    sessionId,
  } = params;
  const channelId = event.channel.id;

  try {
    const rtpSocket = dgram.createSocket('udp4');
    const localPort = await bindRtpSocket(rtpSocket, config);
    const bridgeId = await client.createBridge();
    const externalMediaChannelId = await client.createExternalMediaChannel(
      config.appName,
      `${config.rtpHost}:${localPort}`,
    );

    await waitForExternalMediaStasis(externalMediaChannelId);

    await client.addChannelToBridge(bridgeId, channelId);
    await client.addChannelToBridge(bridgeId, externalMediaChannelId);

    const callSession: SipCallSession = {
      channelId,
      sessionId,
      agentId: resolvedAgent.id,
      bridgeId,
      externalMediaChannelId,
      rtpSequence: Math.floor(Math.random() * 65535),
      rtpTimestamp: Math.floor(Math.random() * 0xffffffff),
      rtpSsrc: Math.floor(Math.random() * 0xffffffff),
      rtpSocket,
      outboundAudioQueue: [],
      startedAt: Date.now(),
    };

    sessions.set(channelId, callSession);
    attachRtpListeners(callSession);

    await geminiLiveService.createSession(sessionId, {
      systemPrompt: resolvedAgent.systemPrompt,
      voiceName: resolvedAgent.voiceName,
      modelName: resolvedAgent.modelName || undefined,
      correlationId: channelId,
      onAudio: (audio) => sendAudioToAsterisk(callSession, audio),
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
        await client.hangupChannel(channelId);
        await cleanupSession(callSession, client, sessions);
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
    await client.hangupChannel(channelId);
  }
}

export function attachRtpListeners(callSession: SipCallSession): void {
  callSession.rtpHandshakeTimeout = setTimeout(() => {
    if (!callSession.rtpRemote) {
      logger.warn('RTP handshake timeout: no inbound RTP detected', {
        channelId: callSession.channelId,
        timeoutMs: ARI_RTP_HANDSHAKE_TIMEOUT_MS,
      });
    }
  }, ARI_RTP_HANDSHAKE_TIMEOUT_MS);

  callSession.rtpSocket.on('message', (message, rinfo) => {
    handleInboundRtp(callSession, message, rinfo);
  });

  callSession.rtpSocket.on('error', (error) => {
    logger.error('RTP socket error', { channelId: callSession.channelId, error: error.message });
  });
}

export function handleInboundRtp(session: SipCallSession, message: Buffer, rinfo: dgram.RemoteInfo): void {
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

  if (!geminiLiveService.isSessionReady(session.sessionId)) {
    enqueuePendingAudio(session, base64);
    return;
  }

  void geminiLiveService.sendAudio(session.sessionId, base64);
}

export function sendAudioToAsterisk(session: SipCallSession, audioBase64: string): void {
  const pcm16 = base64ToInt16(audioBase64);
  const pcm8k = downsampleTo8k(pcm16);
  const payload = encodeMuLawPayload(pcm8k);
  enqueueOutboundAudio(session, payload);
}

export function enqueuePendingAudio(session: SipCallSession, data: string): void {
  const now = Date.now();
  if (!session.pendingAudio) {
    session.pendingAudio = [];
  }

  session.pendingAudio.push({ data, receivedAt: now });

  const windowStart = session.pendingAudio[0]?.receivedAt ?? now;
  if (now - windowStart > ARI_RTP_QUEUE_WINDOW_MS) {
    session.pendingAudio = session.pendingAudio.filter((item) => now - item.receivedAt <= ARI_RTP_QUEUE_WINDOW_MS);
    logger.warn('Dropping RTP audio before Gemini session ready', {
      channelId: session.channelId,
      windowMs: ARI_RTP_QUEUE_WINDOW_MS,
    });
  }

  if (!geminiLiveService.isSessionReady(session.sessionId)) {
    return;
  }

  const queue = session.pendingAudio;
  session.pendingAudio = [];
  queue.forEach((item) => {
    void geminiLiveService.sendAudio(session.sessionId, item.data);
  });
}

export async function cleanupSession(
  session: SipCallSession,
  client: AriClient,
  sessions: Map<string, SipCallSession>,
): Promise<void> {
  sessions.delete(session.channelId);

  if (session.rtpHandshakeTimeout) {
    clearTimeout(session.rtpHandshakeTimeout);
    session.rtpHandshakeTimeout = undefined;
  }

  stopRtpPacer(session);

  try {
    session.rtpSocket.close();
  } catch (_error) {
    // ignore
  }

  await geminiLiveService.closeSession(session.sessionId);
 try {
    // Add a check or just wrap in try-catch to ignore if bridge is already gone
    if (session.bridgeId) {
  await client.deleteBridge(session.bridgeId);
    }
    } catch (error) {
    // Log it quietly so the server doesn't crash
    console.log(`Bridge ${session.bridgeId} already deleted or not found.`);
}
  await client.hangupChannel(session.externalMediaChannelId);
}

export async function waitForExternalMediaStasis(
  channelId: string,
  pendingExternalMedia: Map<string, { timeout: ReturnType<typeof setTimeout>; resolve: () => void }>,
): Promise<void> {
  if (!channelId) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      pendingExternalMedia.delete(channelId);
      logger.warn('External media channel did not enter Stasis in time', {
        channelId,
        timeoutMs: ARI_EXTERNAL_MEDIA_STASIS_TIMEOUT_MS,
      });
      resolve();
    }, ARI_EXTERNAL_MEDIA_STASIS_TIMEOUT_MS);

    pendingExternalMedia.set(channelId, { timeout, resolve });
  });
}

export function filterThoughtBlocks(text: string): string {
  return text.replace(/\*\*[^]*?\*\*/g, '').trim();
}
