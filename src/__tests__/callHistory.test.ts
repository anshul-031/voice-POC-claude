import { describe, it, expect, vi, beforeEach } from 'vitest';
import router from '../routes/callHistory.js';
import prisma from '../lib/prisma.js';
import { UI_STRINGS } from '../constants/uiStrings.js';

vi.mock('../lib/prisma.js', () => ({
  default: {
    callHistory: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock('../services/r2Storage.js', () => ({
  uploadRecording: vi.fn(),
  getSignedRecordingUrl: vi.fn(),
  deleteRecording: vi.fn(),
}));

import { uploadRecording, getSignedRecordingUrl, deleteRecording } from '../services/r2Storage.js';

const mockRes = (): any => ({
  json: vi.fn().mockReturnThis(),
  status: vi.fn().mockReturnThis(),
});

const getRouteHandler = (path: string, method: string): any => {
  const layer = (router as any).stack.find((l: any) =>
    l.route && l.route.path === path && l.route.methods[method.toLowerCase()],
  );
  return layer.route.stack[layer.route.stack.length - 1].handle;
};

const baseReq = (overrides: Record<string, unknown> = {}): any => ({
  headers: { 'content-type': 'application/json' },
  body: {},
  params: {},
  user: { id: 'user-1' },
  ...overrides,
});

describe('Call History Routes', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('GET /', () => {
    it('lists the user calls', async () => {
      (prisma.callHistory.findMany as any).mockResolvedValue([{ id: 'c1' }]);
      const res = mockRes();
      await getRouteHandler('/', 'get')(baseReq(), res);
      expect(res.json).toHaveBeenCalledWith([{ id: 'c1' }]);
    });

    it('returns 500 on db error', async () => {
      (prisma.callHistory.findMany as any).mockRejectedValue(new Error('DB'));
      const res = mockRes();
      await getRouteHandler('/', 'get')(baseReq(), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('handles non-Error rejection', async () => {
      (prisma.callHistory.findMany as any).mockRejectedValue('raw');
      const res = mockRes();
      await getRouteHandler('/', 'get')(baseReq(), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('GET /:id', () => {
    it('returns 400 for invalid params', async () => {
      const res = mockRes();
      await getRouteHandler('/:id', 'get')(baseReq({ params: { id: '' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 404 when missing', async () => {
      (prisma.callHistory.findFirst as any).mockResolvedValue(null);
      const res = mockRes();
      await getRouteHandler('/:id', 'get')(baseReq({ params: { id: 'c1' } }), res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns a call with no recording url', async () => {
      (prisma.callHistory.findFirst as any).mockResolvedValue({ id: 'c1', recordingKey: null });
      const res = mockRes();
      await getRouteHandler('/:id', 'get')(baseReq({ params: { id: 'c1' } }), res);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ recordingUrl: null }));
      expect(getSignedRecordingUrl).not.toHaveBeenCalled();
    });

    it('returns a call with a signed recording url', async () => {
      (prisma.callHistory.findFirst as any).mockResolvedValue({ id: 'c1', recordingKey: 'recordings/x.wav' });
      (getSignedRecordingUrl as any).mockResolvedValue('https://signed/x');
      const res = mockRes();
      await getRouteHandler('/:id', 'get')(baseReq({ params: { id: 'c1' } }), res);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ recordingUrl: 'https://signed/x' }));
    });

    it('returns 500 on db error', async () => {
      (prisma.callHistory.findFirst as any).mockRejectedValue(new Error('DB'));
      const res = mockRes();
      await getRouteHandler('/:id', 'get')(baseReq({ params: { id: 'c1' } }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('handles non-Error rejection', async () => {
      (prisma.callHistory.findFirst as any).mockRejectedValue('raw');
      const res = mockRes();
      await getRouteHandler('/:id', 'get')(baseReq({ params: { id: 'c1' } }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('DELETE /:id', () => {
    it('returns 400 for invalid params', async () => {
      const res = mockRes();
      await getRouteHandler('/:id', 'delete')(baseReq({ params: { id: '' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 404 when missing', async () => {
      (prisma.callHistory.findFirst as any).mockResolvedValue(null);
      const res = mockRes();
      await getRouteHandler('/:id', 'delete')(baseReq({ params: { id: 'c1' } }), res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('deletes a record and its recording', async () => {
      (prisma.callHistory.findFirst as any).mockResolvedValue({ id: 'c1', recordingKey: 'recordings/x.wav' });
      (prisma.callHistory.delete as any).mockResolvedValue({});
      const res = mockRes();
      await getRouteHandler('/:id', 'delete')(baseReq({ params: { id: 'c1' } }), res);
      expect(deleteRecording).toHaveBeenCalledWith('recordings/x.wav');
      expect(res.json).toHaveBeenCalledWith({ message: UI_STRINGS.api.success.deleteCallHistory });
    });

    it('deletes a record without a recording', async () => {
      (prisma.callHistory.findFirst as any).mockResolvedValue({ id: 'c1', recordingKey: null });
      (prisma.callHistory.delete as any).mockResolvedValue({});
      const res = mockRes();
      await getRouteHandler('/:id', 'delete')(baseReq({ params: { id: 'c1' } }), res);
      expect(deleteRecording).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ message: UI_STRINGS.api.success.deleteCallHistory });
    });

    it('returns 500 on db error', async () => {
      (prisma.callHistory.findFirst as any).mockRejectedValue(new Error('DB'));
      const res = mockRes();
      await getRouteHandler('/:id', 'delete')(baseReq({ params: { id: 'c1' } }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('handles non-Error rejection', async () => {
      (prisma.callHistory.findFirst as any).mockRejectedValue('raw');
      const res = mockRes();
      await getRouteHandler('/:id', 'delete')(baseReq({ params: { id: 'c1' } }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('POST /:sessionId/recording', () => {
    const recReq = (overrides: Record<string, unknown> = {}): any => baseReq({
      headers: { 'content-type': 'audio/webm' },
      params: { sessionId: 's1' },
      body: Buffer.from([1, 2, 3]),
      ...overrides,
    });

    it('returns 400 for invalid session param', async () => {
      const res = mockRes();
      await getRouteHandler('/:sessionId/recording', 'post')(recReq({ params: { sessionId: '' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 for an empty body', async () => {
      const res = mockRes();
      await getRouteHandler('/:sessionId/recording', 'post')(recReq({ body: Buffer.alloc(0) }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 for a non-buffer body', async () => {
      const res = mockRes();
      await getRouteHandler('/:sessionId/recording', 'post')(recReq({ body: 'not-a-buffer' }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 404 when the call record is unknown', async () => {
      (prisma.callHistory.findUnique as any).mockResolvedValue(null);
      const res = mockRes();
      await getRouteHandler('/:sessionId/recording', 'post')(recReq(), res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 409 when a recording already exists', async () => {
      (prisma.callHistory.findUnique as any).mockResolvedValue({ recordingKey: 'recordings/x.wav' });
      const res = mockRes();
      await getRouteHandler('/:sessionId/recording', 'post')(recReq(), res);
      expect(res.status).toHaveBeenCalledWith(409);
    });

    it('returns 502 when storage fails', async () => {
      (prisma.callHistory.findUnique as any).mockResolvedValue({ recordingKey: null });
      (uploadRecording as any).mockResolvedValue(null);
      const res = mockRes();
      await getRouteHandler('/:sessionId/recording', 'post')(recReq(), res);
      expect(res.status).toHaveBeenCalledWith(502);
    });

    it('stores the recording and links it', async () => {
      (prisma.callHistory.findUnique as any).mockResolvedValue({ recordingKey: null });
      (uploadRecording as any).mockResolvedValue('recordings/s1.webm');
      (prisma.callHistory.update as any).mockResolvedValue({});
      const res = mockRes();
      await getRouteHandler('/:sessionId/recording', 'post')(recReq(), res);
      expect(uploadRecording).toHaveBeenCalled();
      expect(prisma.callHistory.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { sessionId: 's1' },
        data: { recordingKey: 'recordings/s1.webm', recordingMimeType: 'audio/webm' },
      }));
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('defaults the content type when the header is absent', async () => {
      (prisma.callHistory.findUnique as any).mockResolvedValue({ recordingKey: null });
      (uploadRecording as any).mockResolvedValue('recordings/s1.bin');
      (prisma.callHistory.update as any).mockResolvedValue({});
      const res = mockRes();
      await getRouteHandler('/:sessionId/recording', 'post')(recReq({ headers: {} }), res);
      expect(uploadRecording).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('returns 500 on unexpected error', async () => {
      (prisma.callHistory.findUnique as any).mockRejectedValue(new Error('DB'));
      const res = mockRes();
      await getRouteHandler('/:sessionId/recording', 'post')(recReq(), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('handles non-Error rejection', async () => {
      (prisma.callHistory.findUnique as any).mockRejectedValue('raw');
      const res = mockRes();
      await getRouteHandler('/:sessionId/recording', 'post')(recReq(), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
