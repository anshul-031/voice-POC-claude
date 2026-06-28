import { describe, it, expect, vi, beforeEach } from 'vitest';
import router from '../routes/integration.js';
import prisma from '../lib/prisma.js';

vi.mock('../lib/prisma.js', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const getRouteHandler = (path: string, method: string): any => {
  const layer = (router as any).stack.find(
    (l: any) => l.route && l.route.path === path && l.route.methods[method.toLowerCase()],
  );
  return layer.route.stack[layer.route.stack.length - 1].handle;
};

const makeRes = (): any => ({
  json: vi.fn().mockReturnThis(),
  status: vi.fn().mockReturnThis(),
});

const user = { id: 'u1' };

describe('Integration Routes (sales-analyser)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /sales-analyser', () => {
    it('reports a connected account (without leaking the password)', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({
        salesAnalyserEmail: 'a@b.com',
        salesAnalyserPassword: 'secret',
      });
      const res = makeRes();
      await getRouteHandler('/sales-analyser', 'get')({ user } as any, res);
      const payload = res.json.mock.calls[0][0];
      expect(payload.connected).toBe(true);
      expect(payload.email).toBe('a@b.com');
      expect(payload).not.toHaveProperty('salesAnalyserPassword');
    });

    it('reports a disconnected account', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({
        salesAnalyserEmail: null,
        salesAnalyserPassword: null,
      });
      const res = makeRes();
      await getRouteHandler('/sales-analyser', 'get')({ user } as any, res);
      const payload = res.json.mock.calls[0][0];
      expect(payload.connected).toBe(false);
      expect(payload.email).toBeNull();
    });

    it('returns 500 on a database error', async () => {
      (prisma.user.findUnique as any).mockRejectedValue(new Error('db down'));
      const res = makeRes();
      await getRouteHandler('/sales-analyser', 'get')({ user } as any, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('PUT /sales-analyser', () => {
    it('rejects an invalid payload with 400', async () => {
      const res = makeRes();
      await getRouteHandler('/sales-analyser', 'put')(
        { user, body: { email: 'not-an-email', password: '' } } as any,
        res,
      );
      expect(res.status).toHaveBeenCalledWith(400);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('saves valid credentials', async () => {
      (prisma.user.update as any).mockResolvedValue({});
      const res = makeRes();
      await getRouteHandler('/sales-analyser', 'put')(
        { user, body: { email: 'a@b.com', password: 'pw12345' } } as any,
        res,
      );
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1' },
          data: { salesAnalyserEmail: 'a@b.com', salesAnalyserPassword: 'pw12345' },
        }),
      );
      const payload = res.json.mock.calls[0][0];
      expect(payload).toMatchObject({ success: true, connected: true, email: 'a@b.com' });
    });

    it('returns 500 when the update fails', async () => {
      (prisma.user.update as any).mockRejectedValue(new Error('boom'));
      const res = makeRes();
      await getRouteHandler('/sales-analyser', 'put')(
        { user, body: { email: 'a@b.com', password: 'pw12345' } } as any,
        res,
      );
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('DELETE /sales-analyser', () => {
    it('clears the stored credentials', async () => {
      (prisma.user.update as any).mockResolvedValue({});
      const res = makeRes();
      await getRouteHandler('/sales-analyser', 'delete')({ user } as any, res);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { salesAnalyserEmail: null, salesAnalyserPassword: null },
        }),
      );
      expect(res.json.mock.calls[0][0]).toMatchObject({ success: true, connected: false });
    });

    it('returns 500 when clearing fails', async () => {
      (prisma.user.update as any).mockRejectedValue(new Error('boom'));
      const res = makeRes();
      await getRouteHandler('/sales-analyser', 'delete')({ user } as any, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
