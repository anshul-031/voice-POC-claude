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

type MockFn = ReturnType<typeof vi.fn>;
const tp = () => prisma.telephonyProvider;
const mockRes = () => ({ json: vi.fn().mockReturnThis(), status: vi.fn().mockReturnThis() });

const getRouteHandler = (path: string, method: string): any => {
  const layer = (router as any).stack.find((l: any) =>
    l.route && l.route.path === path && l.route.methods[method.toLowerCase()],
  );
  return layer.route.stack[layer.route.stack.length - 1].handle;
};

describe('Telephony Routes', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('GET / lists providers with masked credentials', async () => {
    (tp().findMany as MockFn).mockResolvedValue([{
      id: '1', name: 'V', provider: 'vobiz',
      sipPassword: 'secret123', apiKey: null, apiSecret: null, authToken: null,
    }]);
    const res = mockRes();
    await getRouteHandler('/', 'get')({ user: { id: 'u1' } } as never, res);
    expect(res.json).toHaveBeenCalled();
    expect(res.json.mock.calls[0][0][0].sipPassword).toBe('*****t123');
  });

  it('GET / returns 500 on DB error', async () => {
    (tp().findMany as MockFn).mockRejectedValue(new Error('db'));
    const res = mockRes();
    await getRouteHandler('/', 'get')({ user: { id: 'u1' } } as never, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: UI_STRINGS.api.errors.fetchTelephony });
  });

  it('GET /:id success, 400, and 404', async () => {
    const res = mockRes();
    // Invalid id
    await getRouteHandler('/:id', 'get')({ params: { id: '' }, user: { id: 'u1' } } as never, res);
    expect(res.status).toHaveBeenCalledWith(400);
    res.status.mockClear();
    // Not found
    (tp().findFirst as MockFn).mockResolvedValue(null);
    await getRouteHandler('/:id', 'get')({ params: { id: 'x' }, user: { id: 'u1' } } as never, res);
    expect(res.status).toHaveBeenCalledWith(404);
    res.status.mockClear();
    // Success
    (tp().findFirst as MockFn).mockResolvedValue({
      id: 'x', sipPassword: 'pw1234', apiKey: null, apiSecret: null, authToken: null,
    });
    await getRouteHandler('/:id', 'get')({ params: { id: 'x' }, user: { id: 'u1' } } as never, res);
    expect(res.json).toHaveBeenCalled();
    const data = res.json.mock.calls[res.json.mock.calls.length - 1][0];
    expect(data.sipPassword).toBe('**1234');
  });

  it('GET /:id returns 500 on DB error', async () => {
    const res = mockRes();
    (tp().findFirst as MockFn).mockRejectedValue(new Error('db'));
    await getRouteHandler('/:id', 'get')({ params: { id: 'x' }, user: { id: 'u1' } } as never, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('POST / creates provider', async () => {
    const res = mockRes();
    // Invalid content type
    await getRouteHandler('/', 'post')(
      { headers: { 'content-type': 'text/plain' }, body: {}, user: { id: 'u1' } } as never, res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    res.status.mockClear();
    // Invalid body
    await getRouteHandler('/', 'post')({ body: {}, user: { id: 'u1' } } as never, res);
    expect(res.status).toHaveBeenCalledWith(400);
    res.status.mockClear();
    // Valid create
    (tp().create as MockFn).mockResolvedValue({
      id: 'n', name: 'V', provider: 'vobiz',
      sipPassword: null, apiKey: null, apiSecret: null, authToken: null,
    });
    await getRouteHandler('/', 'post')(
      { body: { name: 'V', provider: 'vobiz' }, user: { id: 'u1' } } as never, res,
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('POST / returns 500 on DB error', async () => {
    const res = mockRes();
    (tp().create as MockFn).mockRejectedValue(new Error('fail'));
    await getRouteHandler('/', 'post')(
      { body: { name: 'V', provider: 'vobiz' }, user: { id: 'u1' } } as never, res,
    );
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: UI_STRINGS.api.errors.createTelephony });
  });

  it('PUT /:id updates provider', async () => {
    const res = mockRes();
    // Invalid params
    await getRouteHandler('/:id', 'put')({ params: { id: '' }, user: { id: 'u1' } } as never, res);
    expect(res.status).toHaveBeenCalledWith(400);
    res.status.mockClear();
    // Invalid content type
    await getRouteHandler('/:id', 'put')(
      { params: { id: 'x' }, headers: { 'content-type': 'text/plain' }, body: { name: 'N' }, user: { id: 'u1' } } as never, res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    res.status.mockClear();
    // Not found
    (tp().findFirst as MockFn).mockResolvedValue(null);
    await getRouteHandler('/:id', 'put')(
      { params: { id: 'x' }, body: { name: 'N' }, user: { id: 'u1' } } as never, res,
    );
    expect(res.status).toHaveBeenCalledWith(404);
    res.status.mockClear();
    // Invalid body
    (tp().findFirst as MockFn).mockResolvedValue({ id: 'x' });
    await getRouteHandler('/:id', 'put')(
      { params: { id: 'x' }, body: { provider: 'bad' }, user: { id: 'u1' } } as never, res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    res.status.mockClear();
    // Empty body
    await getRouteHandler('/:id', 'put')(
      { params: { id: 'x' }, body: {}, user: { id: 'u1' } } as never, res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    res.status.mockClear();
    // Valid update
    (tp().update as MockFn).mockResolvedValue({
      id: 'x', name: 'N', sipPassword: null, apiKey: null, apiSecret: null, authToken: null,
    });
    await getRouteHandler('/:id', 'put')(
      { params: { id: 'x' }, body: { name: 'N' }, user: { id: 'u1' } } as never, res,
    );
    expect(res.json).toHaveBeenCalled();
  });

  it('PUT /:id returns 500 on DB error', async () => {
    const res = mockRes();
    (tp().findFirst as MockFn).mockResolvedValue({ id: 'x' });
    (tp().update as MockFn).mockRejectedValue(new Error('fail'));
    await getRouteHandler('/:id', 'put')(
      { params: { id: 'x' }, body: { name: 'N' }, user: { id: 'u1' } } as never, res,
    );
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('DELETE /:id deletes provider', async () => {
    const res = mockRes();
    // Invalid id
    await getRouteHandler('/:id', 'delete')({ params: { id: '' }, user: { id: 'u1' } } as never, res);
    expect(res.status).toHaveBeenCalledWith(400);
    res.status.mockClear();
    // Not found
    (tp().findFirst as MockFn).mockResolvedValue(null);
    await getRouteHandler('/:id', 'delete')({ params: { id: 'x' }, user: { id: 'u1' } } as never, res);
    expect(res.status).toHaveBeenCalledWith(404);
    res.status.mockClear();
    // Success
    (tp().findFirst as MockFn).mockResolvedValue({ id: 'x' });
    (tp().delete as MockFn).mockResolvedValue({});
    await getRouteHandler('/:id', 'delete')({ params: { id: 'x' }, user: { id: 'u1' } } as never, res);
    expect(res.json).toHaveBeenCalledWith({ message: UI_STRINGS.api.success.deleteTelephony });
  });

  it('DELETE /:id returns 500 on DB error', async () => {
    const res = mockRes();
    (tp().findFirst as MockFn).mockResolvedValue({ id: 'x' });
    (tp().delete as MockFn).mockRejectedValue(new Error('fail'));
    await getRouteHandler('/:id', 'delete')({ params: { id: 'x' }, user: { id: 'u1' } } as never, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
