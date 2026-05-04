import { ARI_RTP_DEFAULTS } from '../../constants/ari.js';
import type { SipCallSession } from '../../types/index.js';

export function base64ToInt16(base64: string): Int16Array {
  const buffer = Buffer.from(base64, 'base64');
  return new Int16Array(buffer.buffer, buffer.byteOffset, Math.floor(buffer.length / 2));
}

export function upsampleTo16k(input: Int16Array): Int16Array {
  const output = new Int16Array(input.length * 2);
  for (let i = 0; i < input.length; i += 1) {
    const sample = input[i];
    const idx = i * 2;
    output[idx] = sample;
    output[idx + 1] = sample;
  }
  return output;
}

export function downsampleTo8k(input: Int16Array): Int16Array {
  const outputLength = Math.floor(input.length / 2);
  const output = new Int16Array(outputLength);
  for (let i = 0; i < outputLength; i += 1) {
    output[i] = input[i * 2];
  }
  return output;
}

export function decodeMuLawPayload(payload: Buffer): Int16Array {
  const output = new Int16Array(payload.length);
  for (let i = 0; i < payload.length; i += 1) {
    output[i] = muLawToLinear(payload[i]);
  }
  return output;
}

export function encodeMuLawPayload(samples: Int16Array): Buffer {
  const output = Buffer.alloc(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    output[i] = linearToMuLaw(samples[i]);
  }
  return output;
}

export function buildRtpPacket(payload: Buffer, session: SipCallSession, samples: number): Buffer {
  const header = Buffer.alloc(ARI_RTP_DEFAULTS.HEADER_BYTES);
  header[0] = (ARI_RTP_DEFAULTS.VERSION << 6);
  header[1] = ARI_RTP_DEFAULTS.PAYLOAD_TYPE;

  header.writeUInt16BE(session.rtpSequence, 2);
  header.writeUInt32BE(session.rtpTimestamp, 4);
  header.writeUInt32BE(session.rtpSsrc, 8);

  session.rtpSequence = (session.rtpSequence + 1) & 0xffff;
  session.rtpTimestamp = (session.rtpTimestamp + samples) >>> 0;

  return Buffer.concat([header, payload]);
}

function muLawToLinear(sample: number): number {
  const muLaw = (~sample) & 0xff;
  const sign = muLaw & 0x80;
  const exponent = (muLaw >> 4) & 0x07;
  const mantissa = muLaw & 0x0f;
  let value = ((mantissa << (exponent + 3)) + 0x84) << 1;
  if (sign) {
    value = -value;
  }
  return value;
}

function linearToMuLaw(sample: number): number {
  const BIAS = 0x84;
  const MAX = 0x1fff;
  let pcm = sample;
  let sign = 0;

  if (pcm < 0) {
    pcm = -pcm;
    sign = 0x80;
  }

  if (pcm > MAX) {
    pcm = MAX;
  }

  pcm += BIAS;

  let exponent = 7;
  for (let mask = 0x4000; (pcm & mask) === 0 && exponent > 0; mask >>= 1) {
    exponent -= 1;
  }

  const mantissa = (pcm >> (exponent + 3)) & 0x0f;
  const muLaw = ~(sign | (exponent << 4) | mantissa);
  return muLaw & 0xff;
}
