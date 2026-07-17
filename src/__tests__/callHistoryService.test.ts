import { describe, it, expect, vi, beforeEach } from 'vitest';
import prisma from '../lib/prisma.js';

vi.mock('../lib/prisma.js', () => ({
  default: {
    callHistory: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ userId: null, billingRate: 7, billedAt: null }),
      update: vi.fn(),
    },
    user: { update: vi.fn() },
    $transaction: vi.fn(async (operations) => Promise.all(operations)),
  },
}));

vi.mock('../services/r2Storage.js', () => ({
  uploadRecording: vi.fn(),
}));

import {
  resolveCallType,
  buildRecordingKey,
  pcmChunksToWav,
  createCallRecord,
  finalizeCallRecord,
  appendTranscriptEntry,
} from '../services/callHistoryService.js';
import { uploadRecording } from '../services/r2Storage.js';
import { CALL_TYPE, CALL_STATUS } from '../types/enums.js';

describe('callHistoryService', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('resolveCallType', () => {
    it('returns telephony when a streamId is present', () => {
      expect(resolveCallType('stream-1', null)).toBe(CALL_TYPE.TELEPHONY);
    });
    it('returns test when an authenticated requester is present', () => {
      expect(resolveCallType(undefined, 'user-1')).toBe(CALL_TYPE.TEST);
    });
    it('returns preview for anonymous web calls', () => {
      expect(resolveCallType(undefined, null)).toBe(CALL_TYPE.PREVIEW);
    });
  });

  describe('buildRecordingKey', () => {
    it('builds a namespaced key with the session id and extension', () => {
      const key = buildRecordingKey('sess-1', 'wav');
      expect(key.startsWith('recordings/sess-1-')).toBe(true);
      expect(key.endsWith('.wav')).toBe(true);
    });
  });

  describe('pcmChunksToWav', () => {
    it('wraps PCM chunks in a valid WAV container', () => {
      const data = Buffer.from([1, 2, 3, 4]);
      const wav = pcmChunksToWav([data], 8000);
      expect(wav.length).toBe(44 + data.length);
      expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
      expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
      expect(wav.toString('ascii', 36, 40)).toBe('data');
      expect(wav.readUInt32LE(24)).toBe(8000);
      expect(wav.readUInt16LE(22)).toBe(1);
      expect(wav.readUInt32LE(40)).toBe(data.length);
    });
  });

  describe('createCallRecord', () => {
    it('persists an in-progress record', async () => {
      (prisma.callHistory.create as any).mockResolvedValue({});
      await createCallRecord({
        sessionId: 's1',
        callType: CALL_TYPE.TEST,
        agentId: 'a1',
        agentName: 'Agent',
        userId: 'u1',
        billingRate: 7,
        direction: 'outbound',
      });
      expect(prisma.callHistory.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          sessionId: 's1',
          status: CALL_STATUS.IN_PROGRESS,
          direction: 'outbound',
        }),
      }));
    });

    it('defaults nullable fields when omitted', async () => {
      (prisma.callHistory.create as any).mockResolvedValue({});
      await createCallRecord({
        sessionId: 's2', callType: CALL_TYPE.PREVIEW, agentId: 'a1', agentName: 'A',
        userId: null, billingRate: 7,
      });
      const arg = (prisma.callHistory.create as any).mock.calls[0][0];
      expect(arg.data.phoneNumber).toBeNull();
      expect(arg.data.direction).toBeNull();
    });

    it('swallows db errors', async () => {
      (prisma.callHistory.create as any).mockRejectedValue(new Error('DB'));
      await expect(createCallRecord({
        sessionId: 's3', callType: CALL_TYPE.TEST, agentId: 'a1', agentName: 'A',
        userId: 'u1', billingRate: 7,
      })).resolves.toBeUndefined();
    });

    it('swallows non-Error rejections', async () => {
      (prisma.callHistory.create as any).mockRejectedValue('boom');
      await expect(createCallRecord({
        sessionId: 's4', callType: CALL_TYPE.TEST, agentId: 'a1', agentName: 'A',
        userId: 'u1', billingRate: 7,
      })).resolves.toBeUndefined();
    });
  });

  describe('finalizeCallRecord', () => {
    it('finalizes without a recording', async () => {
      (prisma.callHistory.findUniqueOrThrow as any).mockResolvedValueOnce({
        userId: 'u1', billingRate: 7, billedAt: null,
      });
      (prisma.callHistory.update as any).mockResolvedValue({});
      await finalizeCallRecord({
        sessionId: 's1',
        status: CALL_STATUS.COMPLETED,
        durationSecs: 12,
        transcript: [{ role: 'user', text: 'hi' }],
      });
      const arg = (prisma.callHistory.update as any).mock.calls[0][0];
      expect(arg.where).toEqual({ sessionId: 's1', billedAt: null });
      expect(arg.data.recordingKey).toBeUndefined();
      expect(arg.data.durationSecs).toBe(12);
    });

    it('uploads a telephony recording and links it', async () => {
      (uploadRecording as any).mockResolvedValue('recordings/s1.wav');
      (prisma.callHistory.update as any).mockResolvedValue({});
      await finalizeCallRecord({
        sessionId: 's1',
        status: CALL_STATUS.COMPLETED,
        durationSecs: 5,
        transcript: [],
        recordingChunks: [Buffer.from([1, 2])],
        recordingSampleRate: 8000,
      });
      expect(uploadRecording).toHaveBeenCalled();
      const arg = (prisma.callHistory.update as any).mock.calls[0][0];
      expect(arg.data.recordingKey).toBe('recordings/s1.wav');
      expect(arg.data.recordingMimeType).toBe('audio/wav');
    });

    it('defaults the sample rate when not provided', async () => {
      (uploadRecording as any).mockResolvedValue('recordings/s1.wav');
      (prisma.callHistory.update as any).mockResolvedValue({});
      await finalizeCallRecord({
        sessionId: 's1', status: CALL_STATUS.COMPLETED, durationSecs: 5, transcript: [],
        recordingChunks: [Buffer.from([1, 2])],
      });
      expect(uploadRecording).toHaveBeenCalled();
    });

    it('skips linking when upload returns null', async () => {
      (uploadRecording as any).mockResolvedValue(null);
      (prisma.callHistory.update as any).mockResolvedValue({});
      await finalizeCallRecord({
        sessionId: 's1', status: CALL_STATUS.COMPLETED, durationSecs: 5, transcript: [],
        recordingChunks: [Buffer.from([1])],
      });
      const arg = (prisma.callHistory.update as any).mock.calls[0][0];
      expect(arg.data.recordingKey).toBeUndefined();
    });

    it('skips upload for empty recording chunks', async () => {
      (prisma.callHistory.findUniqueOrThrow as any).mockResolvedValueOnce({
        userId: 'u1', billingRate: 7, billedAt: new Date(),
      });
      (prisma.callHistory.update as any).mockResolvedValue({});
      await finalizeCallRecord({
        sessionId: 's1', status: CALL_STATUS.COMPLETED, durationSecs: 5, transcript: [],
        recordingChunks: [],
      });
      expect(uploadRecording).not.toHaveBeenCalled();
    });

    it('swallows db errors', async () => {
      (prisma.callHistory.update as any).mockRejectedValue(new Error('DB'));
      await expect(finalizeCallRecord({
        sessionId: 's1', status: CALL_STATUS.COMPLETED, durationSecs: 1, transcript: [],
      })).resolves.toBeUndefined();
    });

    it('swallows non-Error rejections', async () => {
      (prisma.callHistory.update as any).mockRejectedValue('boom');
      await expect(finalizeCallRecord({
        sessionId: 's1', status: CALL_STATUS.COMPLETED, durationSecs: 1, transcript: [],
      })).resolves.toBeUndefined();
    });
  });

  describe('appendTranscriptEntry', () => {
    it('pushes a normalized transcript entry', () => {
      const entries: any[] = [];
      appendTranscriptEntry(entries, { role: 'model', text: 'hello' });
      expect(entries).toEqual([{ role: 'model', text: 'hello' }]);
    });

    it('merges incremental chunks with natural spacing and ignores empty chunks', () => {
      const entries: any[] = [];
      appendTranscriptEntry(entries, { role: 'model', text: 'नमस्ते,' });
      appendTranscriptEntry(entries, { role: 'model', text: 'मैं' }, true);
      appendTranscriptEntry(entries, { role: 'model', text: ' ठीक' }, true);
      appendTranscriptEntry(entries, { role: 'model', text: '।' }, true);
      appendTranscriptEntry(entries, { role: 'user', text: '(' });
      appendTranscriptEntry(entries, { role: 'user', text: 'hello' }, true);
      appendTranscriptEntry(entries, { role: 'model', text: 'trailing ' });
      appendTranscriptEntry(entries, { role: 'model', text: 'space' }, true);
      appendTranscriptEntry(entries, { role: 'user', text: 'different role' }, true);
      appendTranscriptEntry(entries, { role: 'user', text: '   ' }, true);

      expect(entries).toEqual([
        { role: 'model', text: 'नमस्ते, मैं ठीक।' },
        { role: 'user', text: '(hello' },
        { role: 'model', text: 'trailing space' },
        { role: 'user', text: 'different role' },
      ]);
    });
  });
});
