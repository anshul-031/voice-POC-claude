/**
 * Call history service.
 *
 * Owns the lifecycle of a CallHistory record:
 *  - createCallRecord: persisted when a call starts (browser preview/test or telephony)
 *  - finalizeCallRecord: persisted when a call ends — stores duration, transcript,
 *    final status, and (for telephony) uploads the buffered PCM audio to R2 as WAV.
 *
 * All persistence is best-effort: failures are logged but never bubble up to break
 * an in-progress or ending call.
 */
import type { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma.js';
import logger from '../utils/logger.js';
import { CALL_STATUS, CALL_TYPE, RECORDING, WALLET } from '../types/enums.js';
import type {
  CreateCallRecordInput,
  FinalizeCallRecordInput,
  StoredCallRecording,
  Transcript,
} from '../types/interfaces.js';
import { uploadRecording } from './r2Storage.js';
import { triggerCallAnalysis } from './salesAnalyserService.js';
const WAV_HEADER_BYTES = 44;
const BITS_PER_SAMPLE = 16;
const CHANNELS = 1;

/** Calculate a prorated INR charge and round it to the nearest paise. */
export function calculateBilledAmount(durationSecs: number, billingRate: number): number {
  const nonNegativeDuration = Math.max(0, durationSecs);
  const amount = (nonNegativeDuration / 60) * billingRate;
  return Number(amount.toFixed(WALLET.CURRENCY_DECIMAL_PLACES));
}

/** Decide the call type from connection context. */
export function resolveCallType(streamId?: string, requesterUserId?: string | null): string {
  if (streamId) {
    return CALL_TYPE.TELEPHONY;
  }
  return requesterUserId ? CALL_TYPE.TEST : CALL_TYPE.PREVIEW;
}

/** Build the R2 object key for a recording. */
export function buildRecordingKey(sessionId: string, extension: string): string {
  return `recordings/${sessionId}-${uuidv4()}.${extension}`;
}

/**
 * Wrap raw mono 16-bit PCM chunks in a WAV container.
 * Chunks are concatenated in arrival order.
 */
export function pcmChunksToWav(chunks: Buffer[], sampleRate: number): Buffer {
  const data = Buffer.concat(chunks);
  const byteRate = (sampleRate * CHANNELS * BITS_PER_SAMPLE) / 8;
  const blockAlign = (CHANNELS * BITS_PER_SAMPLE) / 8;
  const header = Buffer.alloc(WAV_HEADER_BYTES);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(CHANNELS, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(BITS_PER_SAMPLE, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);

  return Buffer.concat([header, data]);
}

/** Persist a new in-progress call record. Best-effort. */
export async function createCallRecord(input: CreateCallRecordInput): Promise<void> {
  try {
    await prisma.callHistory.create({
      data: {
        sessionId: input.sessionId,
        callType: input.callType,
        status: CALL_STATUS.IN_PROGRESS,
        agentId: input.agentId,
        agentName: input.agentName,
        userId: input.userId,
        billingRate: input.billingRate,
        phoneNumber: input.phoneNumber ?? null,
        direction: input.direction ?? null,
      },
    });
    logger.info('Call history record created', {
      sessionId: input.sessionId,
      callType: input.callType,
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to create call history record', { sessionId: input.sessionId, error: errMsg });
  }
}

/** Upload buffered telephony PCM as a WAV recording. Returns the key + mime, or null. */
async function uploadTelephonyRecording(
  sessionId: string,
  chunks: Buffer[],
  sampleRate: number,
): Promise<StoredCallRecording | null> {
  if (chunks.length === 0) {
    return null;
  }
  const wav = pcmChunksToWav(chunks, sampleRate);
  const key = buildRecordingKey(sessionId, 'wav');
  const storedKey = await uploadRecording(key, wav, RECORDING.TELEPHONY_MIME_TYPE);
  return storedKey ? { key: storedKey, mimeType: RECORDING.TELEPHONY_MIME_TYPE } : null;
}

/** Atomically persist final call data and deduct the snapshotted call charge once. */
async function persistFinalCall(
  input: FinalizeCallRecordInput,
  recording: StoredCallRecording | null,
): Promise<boolean> {
  const call = await prisma.callHistory.findUniqueOrThrow({
    where: { sessionId: input.sessionId },
    select: { userId: true, billingRate: true, billedAt: true },
  });
  if (call.billedAt) return false;

  const billingRate = Number(call.billingRate);
  const billedAmount = calculateBilledAmount(input.durationSecs, billingRate);
  const billedAt = new Date();
  const callUpdate = prisma.callHistory.update({
    where: { sessionId: input.sessionId, billedAt: null },
    data: {
      status: input.status,
      durationSecs: input.durationSecs,
      endedAt: billedAt,
      transcript: input.transcript as unknown as Prisma.InputJsonValue,
      billingRate,
      billedAmount,
      billedAt,
      ...(recording && { recordingKey: recording.key, recordingMimeType: recording.mimeType }),
    },
  });

  if (call.userId && billedAmount > 0) {
    await prisma.$transaction([
      callUpdate,
      prisma.user.update({
        where: { id: call.userId },
        data: { walletBalance: { decrement: billedAmount } },
      }),
    ]);
  } else {
    await callUpdate;
  }

  logger.info('Call history finalized and wallet billed', {
    sessionId: input.sessionId,
    status: input.status,
    durationSecs: input.durationSecs,
    billingRate,
    billedAmount,
    hasRecording: !!recording,
  });
  return true;
}

/**
 * Finalize a call record when the call ends. Persists duration, transcript,
 * status, and (for telephony) the uploaded recording. Best-effort.
 */
export async function finalizeCallRecord(input: FinalizeCallRecordInput): Promise<void> {
  try {
    const recording = input.recordingChunks
      ? await uploadTelephonyRecording(
        input.sessionId,
        input.recordingChunks,
        input.recordingSampleRate ?? RECORDING.TELEPHONY_SAMPLE_RATE,
      )
      : null;
    const finalized = await persistFinalCall(input, recording);

    if (recording && finalized) {
      const updated = await prisma.callHistory.findUnique({
        where: { sessionId: input.sessionId },
        select: {
          id: true,
          sessionId: true,
          agentId: true,
          userId: true,
          phoneNumber: true,
          recordingKey: true,
          recordingMimeType: true,
        },
      });
      if (updated) void triggerCallAnalysis(updated);
    }
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to finalize call history record', { sessionId: input.sessionId, error: errMsg });
  }
}

/** Append a transcript entry to an in-memory list (used by the signaling server). */
export function appendTranscriptEntry(entries: Transcript[], entry: Transcript): void {
  entries.push({ role: entry.role, text: entry.text });
}
