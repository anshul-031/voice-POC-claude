import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as R2StorageModule from '../services/r2Storage.js';

const sendMock = vi.fn();
const getSignedUrlMock = vi.fn();

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(function () { return { send: sendMock }; }),
  PutObjectCommand: vi.fn(function (args) { return { __cmd: 'put', args }; }),
  GetObjectCommand: vi.fn(function (args) { return { __cmd: 'get', args }; }),
  DeleteObjectCommand: vi.fn(function (args) { return { __cmd: 'del', args }; }),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: getSignedUrlMock,
}));

const CONFIGURED = {
  accountId: 'acc',
  accessKeyId: 'ak',
  secretAccessKey: 'sk',
  bucket: 'bucket-1',
  endpoint: 'https://acc.r2.cloudflarestorage.com',
};

async function loadR2(config: unknown): Promise<typeof R2StorageModule> {
  vi.resetModules();
  vi.doMock('../constants/config.js', () => ({ R2_CONFIG: config }));
  return import('../services/r2Storage.js');
}

describe('r2Storage', () => {
  beforeEach(async () => {
    sendMock.mockReset();
    getSignedUrlMock.mockReset();
    const { S3Client } = await import('@aws-sdk/client-s3');
    (S3Client as any).mockClear();
  });

  describe('isR2Configured', () => {
    it('is true when configured', async () => {
      const r2 = await loadR2(CONFIGURED);
      expect(r2.isR2Configured()).toBe(true);
    });
    it('is false when not configured', async () => {
      const r2 = await loadR2(null);
      expect(r2.isR2Configured()).toBe(false);
    });
  });

  describe('uploadRecording', () => {
    it('uploads and returns the key when configured', async () => {
      const r2 = await loadR2(CONFIGURED);
      sendMock.mockResolvedValue({});
      const key = await r2.uploadRecording('recordings/a.wav', Buffer.from([1]), 'audio/wav');
      expect(key).toBe('recordings/a.wav');
      expect(sendMock).toHaveBeenCalledTimes(1);
    });

    it('reuses the cached client on subsequent calls', async () => {
      const r2 = await loadR2(CONFIGURED);
      const { S3Client } = await import('@aws-sdk/client-s3');
      sendMock.mockResolvedValue({});
      await r2.uploadRecording('k1', Buffer.from([1]), 'audio/wav');
      await r2.uploadRecording('k2', Buffer.from([2]), 'audio/wav');
      expect((S3Client as any).mock.calls.length).toBe(1);
    });

    it('returns null when the upload fails', async () => {
      const r2 = await loadR2(CONFIGURED);
      sendMock.mockRejectedValue(new Error('S3 down'));
      const key = await r2.uploadRecording('k', Buffer.from([1]), 'audio/wav');
      expect(key).toBeNull();
    });

    it('returns null for a non-Error upload rejection', async () => {
      const r2 = await loadR2(CONFIGURED);
      sendMock.mockRejectedValue('boom');
      const key = await r2.uploadRecording('k', Buffer.from([1]), 'audio/wav');
      expect(key).toBeNull();
    });

    it('returns null and skips send when not configured', async () => {
      const r2 = await loadR2(null);
      const key = await r2.uploadRecording('k', Buffer.from([1]), 'audio/wav');
      expect(key).toBeNull();
      expect(sendMock).not.toHaveBeenCalled();
    });
  });

  describe('getSignedRecordingUrl', () => {
    it('returns a signed url when configured', async () => {
      const r2 = await loadR2(CONFIGURED);
      getSignedUrlMock.mockResolvedValue('https://signed.example/x');
      const url = await r2.getSignedRecordingUrl('k', 120);
      expect(url).toBe('https://signed.example/x');
    });

    it('returns null when signing fails', async () => {
      const r2 = await loadR2(CONFIGURED);
      getSignedUrlMock.mockRejectedValue(new Error('sign fail'));
      const url = await r2.getSignedRecordingUrl('k');
      expect(url).toBeNull();
    });

    it('returns null for a non-Error signing rejection', async () => {
      const r2 = await loadR2(CONFIGURED);
      getSignedUrlMock.mockRejectedValue('boom');
      const url = await r2.getSignedRecordingUrl('k');
      expect(url).toBeNull();
    });

    it('returns null when not configured', async () => {
      const r2 = await loadR2(null);
      const url = await r2.getSignedRecordingUrl('k');
      expect(url).toBeNull();
      expect(getSignedUrlMock).not.toHaveBeenCalled();
    });
  });

  describe('deleteRecording', () => {
    it('deletes when configured', async () => {
      const r2 = await loadR2(CONFIGURED);
      sendMock.mockResolvedValue({});
      await expect(r2.deleteRecording('k')).resolves.toBeUndefined();
      expect(sendMock).toHaveBeenCalledTimes(1);
    });

    it('swallows delete errors', async () => {
      const r2 = await loadR2(CONFIGURED);
      sendMock.mockRejectedValue(new Error('del fail'));
      await expect(r2.deleteRecording('k')).resolves.toBeUndefined();
    });

    it('swallows non-Error delete rejections', async () => {
      const r2 = await loadR2(CONFIGURED);
      sendMock.mockRejectedValue('boom');
      await expect(r2.deleteRecording('k')).resolves.toBeUndefined();
    });

    it('no-ops when not configured', async () => {
      const r2 = await loadR2(null);
      await expect(r2.deleteRecording('k')).resolves.toBeUndefined();
      expect(sendMock).not.toHaveBeenCalled();
    });
  });

  describe('resetR2Client', () => {
    it('clears the cached client so a new one is built', async () => {
      const r2 = await loadR2(CONFIGURED);
      const { S3Client } = await import('@aws-sdk/client-s3');
      sendMock.mockResolvedValue({});
      await r2.uploadRecording('k1', Buffer.from([1]), 'audio/wav');
      r2.resetR2Client();
      await r2.uploadRecording('k2', Buffer.from([2]), 'audio/wav');
      expect((S3Client as any).mock.calls.length).toBe(2);
    });
  });
});
