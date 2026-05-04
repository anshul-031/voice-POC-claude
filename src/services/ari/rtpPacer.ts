import logger from '../../utils/logger.js';
import {
  ARI_RTP_PACER_INTERVAL_MS,
  ARI_RTP_PAYLOAD_BYTES,
  ARI_RTP_SILENCE_BYTE,
} from '../../constants/ari.js';
import type { SipCallSession } from '../../types/index.js';
import { buildRtpPacket } from './rtp.js';

export function enqueueOutboundAudio(session: SipCallSession, payload: Buffer): void {
  const chunks = splitPayload(payload, ARI_RTP_PAYLOAD_BYTES);
  if (!session.outboundAudioQueue) {
    session.outboundAudioQueue = [];
  }
  session.outboundAudioQueue.push(...chunks);
  ensureRtpPacer(session);
}

export function stopRtpPacer(session: SipCallSession): void {
  if (session.rtpPacer) {
    clearInterval(session.rtpPacer);
    session.rtpPacer = undefined;
  }
}

function ensureRtpPacer(session: SipCallSession): void {
  if (session.rtpPacer) {
    return;
  }

  session.rtpPacer = setInterval(() => {
    const remote = session.rtpRemote;
    if (!remote) {
      return;
    }

    const queue = session.outboundAudioQueue ?? [];
    const next = queue.shift() ?? new Uint8Array(ARI_RTP_PAYLOAD_BYTES).fill(ARI_RTP_SILENCE_BYTE);
    session.outboundAudioQueue = queue;

    const packet = buildRtpPacket(Buffer.from(next), session, next.length);

    session.rtpSocket.send(packet, remote.port, remote.address, (error) => {
      if (error) {
        logger.error('Failed to send RTP audio', { channelId: session.channelId, error: error.message });
      }
    });
  }, ARI_RTP_PACER_INTERVAL_MS);
}

function splitPayload(payload: Buffer, chunkSize: number): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < payload.length; offset += chunkSize) {
    const slice = payload.subarray(offset, offset + chunkSize);
    if (slice.length === chunkSize) {
      chunks.push(new Uint8Array(slice));
    } else {
      const padded = new Uint8Array(chunkSize).fill(ARI_RTP_SILENCE_BYTE);
      padded.set(slice);
      chunks.push(padded);
    }
  }
  return chunks;
}
