import { describe, it, expect, vi, beforeEach } from 'vitest';
import router from '../routes/telephony.js';
import prisma from '../lib/prisma.js';
import { UI_STRINGS } from '../constants/uiStrings.js';

vi.mock('../lib/prisma.js', () => ({
  default: {
    telephonyProvider: {
      findMany: vi.fn(), findFirst: vi.fn(),
      create: vi.fn(), update: vi.fn(), delete: vi.fn(),
    },
  },
}));

const getRouteHandler = (path: string, method: string): any => {
  const layer = (router as any).stack.find((l: any) => {
    return l.route && l.route.path === path && l.route.methods[method.toLowerCase()];
  });
  return layer.route.stack[layer.route.stack.length - 1].handle;
};

describe('Telephony Routes — Branch Coverage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('handles non-Error rejection in all operations', async () => {
    const res = { json: vi.fn().mockReturnThis(), status: vi.fn().mockReturnThis() };

    (prisma.telephonyProvider.findMany as ReturnType<typeof vi.fn>).mockRejectedValue('str');
    await getRouteHandler('/', 'get')({ user: { id: 'u1' } } as never, res);
    expect(res.status).toHaveBeenCalledWith(500);
    res.status.mockClear();

    (prisma.telephonyProvider.findFirst as ReturnType<typeof vi.fn>).mockRejectedValue({ r: 1 });
    await getRouteHandler('/:id', 'get')({ params: { id: 'x' }, user: { id: 'u1' } } as never, res);
    expect(res.status).toHaveBeenCalledWith(500);
    res.status.mockClear();

    (prisma.telephonyProvider.create as ReturnType<typeof vi.fn>).mockRejectedValue(42);
    await getRouteHandler('/', 'post')(
      { body: { name: 'V', provider: 'vobiz' }, user: { id: 'u1' } } as never, res,
    );
    expect(res.status).toHaveBeenCalledWith(500);
    res.status.mockClear();

    (prisma.telephonyProvider.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'x' });
    (prisma.telephonyProvider.update as ReturnType<typeof vi.fn>).mockRejectedValue(null);
    await getRouteHandler('/:id', 'put')(
      { params: { id: 'x' }, body: { name: 'N' }, user: { id: 'u1' } } as never, res,
    );
    expect(res.status).toHaveBeenCalledWith(500);
    res.status.mockClear();

    (prisma.telephonyProvider.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'x' });
    (prisma.telephonyProvider.delete as ReturnType<typeof vi.fn>).mockRejectedValue(false);
    await getRouteHandler('/:id', 'delete')(
      { params: { id: 'x' }, user: { id: 'u1' } } as never, res,
    );
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('POST with invalid headers', async () => {
    const res = { json: vi.fn().mockReturnThis(), status: vi.fn().mockReturnThis() };
    await getRouteHandler('/', 'post')(
      { headers: 42, body: { name: 'V', provider: 'vobiz' }, user: { id: 'u1' } } as never, res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('GET / returns 400 on invalid headers', async () => {
    const res = { json: vi.fn().mockReturnThis(), status: vi.fn().mockReturnThis() };
    await getRouteHandler('/', 'get')({ headers: 42, user: { id: 'u1' } } as never, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
