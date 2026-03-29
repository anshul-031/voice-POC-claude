import { describe, it, expect, vi, beforeEach } from 'vitest';
import router from '../routes/agents.js';
import prisma from '../lib/prisma.js';

vi.mock('../lib/prisma.js', () => ({
  default: {
    voiceAgent: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

const mockReqRes = (body = {}, params = {}) => {
  const req = { body, params };
  const res = {
    json: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
  };
  return { req, res };
};

const getRouteHandler = (path, method) => {
  const layer = router.stack.find(l => {
    return l.route && l.route.path === path && l.route.methods[method.toLowerCase()];
  });
  return layer.route.stack[0].handle;
};

describe('Agents Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /voices and /models', () => {
    const { res } = mockReqRes();
    getRouteHandler('/voices', 'get')({}, res);
    expect(res.json).toHaveBeenCalled();
    getRouteHandler('/models', 'get')({}, res);
    expect(res.json).toHaveBeenCalledTimes(2);
  });

  it('GET /agents success and error', async () => {
    prisma.voiceAgent.findMany.mockResolvedValue([]);
    const { res } = mockReqRes();
    await getRouteHandler('/agents', 'get')({}, res);
    expect(res.json).toHaveBeenCalled();

    prisma.voiceAgent.findMany.mockRejectedValue(new Error('err'));
    await getRouteHandler('/agents', 'get')({}, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('GET /agents/:id success, 404, error', async () => {
    const { res } = mockReqRes();
    prisma.voiceAgent.findUnique.mockResolvedValue({ id: '1' });
    await getRouteHandler('/agents/:id', 'get')({ params: { id: '1' } }, res);
    expect(res.json).toHaveBeenCalled();

    prisma.voiceAgent.findUnique.mockResolvedValue(null);
    await getRouteHandler('/agents/:id', 'get')({ params: { id: '404' } }, res);
    expect(res.status).toHaveBeenCalledWith(404);

    prisma.voiceAgent.findUnique.mockRejectedValue(new Error('err'));
    await getRouteHandler('/agents/:id', 'get')({ params: { id: '1' } }, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('POST /agents coverage', async () => {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    prisma.voiceAgent.create.mockResolvedValue({ id: '1' });

    // 1. Missing fields
    await getRouteHandler('/agents', 'post')({ body: {} }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    res.status.mockClear();

    // 2. Valid voice
    await getRouteHandler('/agents', 'post')({ body: { name: 'A', systemPrompt: 'S', voiceName: 'Puck' } }, res);
    expect(res.status).toHaveBeenCalledWith(201);
    res.status.mockClear();

    // 3. Invalid voice
    await getRouteHandler('/agents', 'post')({ body: { name: 'A', systemPrompt: 'S', voiceName: 'INV' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    res.status.mockClear();

    // 4. Valid model
    await getRouteHandler('/agents', 'post')({ body: { name: 'A', systemPrompt: 'S', modelName: 'gemini-2.5-flash-native-audio-latest' } }, res);
    expect(res.status).toHaveBeenCalledWith(201);
    res.status.mockClear();

    // 5. Invalid model
    await getRouteHandler('/agents', 'post')({ body: { name: 'A', systemPrompt: 'S', modelName: 'INV' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    res.status.mockClear();

    // 6. Generic error
    prisma.voiceAgent.create.mockRejectedValue(new Error('FAIL'));
    await getRouteHandler('/agents', 'post')({ body: { name: 'A', systemPrompt: 'S' } }, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('PUT /agents/:id coverage', async () => {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    prisma.voiceAgent.update.mockResolvedValue({ id: '1' });

    // 1. Invalid voice
    await getRouteHandler('/agents/:id', 'put')({ params: { id: '1' }, body: { voiceName: 'INV' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    res.status.mockClear();

    // 2. Valid voice
    await getRouteHandler('/agents/:id', 'put')({ params: { id: '1' }, body: { voiceName: 'Puck' } }, res);
    expect(res.json).toHaveBeenCalled();
    res.json.mockClear();

    // 3. Invalid model
    await getRouteHandler('/agents/:id', 'put')({ params: { id: '1' }, body: { modelName: 'INV' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    res.status.mockClear();

    // 4. Valid model
    await getRouteHandler('/agents/:id', 'put')({ params: { id: '1' }, body: { modelName: 'gemini-2.5-flash-native-audio-latest' } }, res);
    expect(res.json).toHaveBeenCalled();
    res.json.mockClear();

    // 5. P2025 Not Found
    const err = new Error(); err.code = 'P2025';
    prisma.voiceAgent.update.mockRejectedValue(err);
    await getRouteHandler('/agents/:id', 'put')({ params: { id: '1' }, body: { name: 'N' } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
    res.status.mockClear();

    // 6. Generic Error
    prisma.voiceAgent.update.mockRejectedValue(new Error('FAIL'));
    await getRouteHandler('/agents/:id', 'put')({ params: { id: '1' }, body: { name: 'N' } }, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('DELETE /agents/:id coverage', async () => {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    prisma.voiceAgent.delete.mockResolvedValue({});
    await getRouteHandler('/agents/:id', 'delete')({ params: { id: '1' } }, res);
    expect(res.json).toHaveBeenCalled();

    const err = new Error(); err.code = 'P2025';
    prisma.voiceAgent.delete.mockRejectedValue(err);
    await getRouteHandler('/agents/:id', 'delete')({ params: { id: '1' } }, res);
    expect(res.status).toHaveBeenCalledWith(404);

    prisma.voiceAgent.delete.mockRejectedValue(new Error('FAIL'));
    await getRouteHandler('/agents/:id', 'delete')({ params: { id: '1' } }, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
