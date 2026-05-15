import { describe, it, expect, vi, beforeEach } from 'vitest';
import router from '../routes/agents.js';
import prisma from '../lib/prisma.js';
import { UI_STRINGS } from '../constants/uiStrings.js';
import { RUNTIME_UI_CONFIG } from '../constants/config.js';
import { AVAILABLE_MODELS, getWhitelabeledModelName } from '../constants/agents.js';

vi.mock('../lib/prisma.js', () => ({
  default: {
    voiceAgent: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
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

const getRouteHandler = (path: string, method: string): any => {
  const layer = (router as any).stack.find((l: any) => {
    return l.route && l.route.path === path && l.route.methods[method.toLowerCase()];
  });
  return layer.route.stack[layer.route.stack.length - 1].handle;
};

describe('Agents Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /voices and /models', () => {
    const { res } = mockReqRes();
    getRouteHandler('/voices', 'get')({} as any, res);
    expect(res.json).toHaveBeenCalled();
    getRouteHandler('/models', 'get')({} as any, res);
    expect(res.json).toHaveBeenCalledTimes(2);

    const modelsPayload = res.json.mock.calls[1]?.[0];
    expect(modelsPayload).toHaveLength(AVAILABLE_MODELS.length);
    expect(modelsPayload[0].id).toBe(AVAILABLE_MODELS[0].id);
    expect(modelsPayload[0].description).toBe(AVAILABLE_MODELS[0].description);
    expect(modelsPayload[0].name).toBe(
      getWhitelabeledModelName(AVAILABLE_MODELS[0].name, RUNTIME_UI_CONFIG.websiteName),
    );
  });

  it('GET /agents success and error', async () => {
    (prisma.voiceAgent.findMany as any).mockResolvedValue([]);
    const { res } = mockReqRes();

    await getRouteHandler('/agents', 'get')({ query: { extra: '1' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: UI_STRINGS.api.errors.invalidInput });
    res.status.mockClear();

    await getRouteHandler('/agents', 'get')({} as any, res);
    expect(res.json).toHaveBeenCalled();

    (prisma.voiceAgent.findMany as any).mockRejectedValue(new Error('err'));
    await getRouteHandler('/agents', 'get')({} as any, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: UI_STRINGS.api.errors.fetchAgents });
  });

  it('GET /agents/:id success, 404, error', async () => {
    const { res } = mockReqRes();

    await getRouteHandler('/agents/:id', 'get')({ params: { id: '' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: UI_STRINGS.api.errors.invalidInput });
    res.status.mockClear();

    (prisma.voiceAgent.findFirst as any).mockResolvedValue({ id: '1' });
    await getRouteHandler('/agents/:id', 'get')({ params: { id: '1' } } as any, res);
    expect(res.json).toHaveBeenCalled();

    (prisma.voiceAgent.findFirst as any).mockResolvedValue(null);
    await getRouteHandler('/agents/:id', 'get')({ params: { id: '404' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: UI_STRINGS.api.errors.agentNotFound });

    (prisma.voiceAgent.findFirst as any).mockRejectedValue(new Error('err'));
    await getRouteHandler('/agents/:id', 'get')({ params: { id: '1' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: UI_STRINGS.api.errors.fetchAgent });
  });

  it('POST /agents coverage', async () => {
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    (prisma.voiceAgent.create as any).mockResolvedValue({ id: '1' });

    // 0. Invalid content-type
    await getRouteHandler('/agents', 'post')({
      headers: { 'content-type': 'text/plain' },
      body: { name: 'A', systemPrompt: 'S' },
    } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: UI_STRINGS.api.errors.invalidInput });
    res.status.mockClear();

    // 1. Missing fields
    await getRouteHandler('/agents', 'post')({ body: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: UI_STRINGS.api.errors.requiredNamePrompt });
    res.status.mockClear();

    // 1.1 Empty name should fail validation branch
    await getRouteHandler('/agents', 'post')({ body: { name: '', systemPrompt: 'S' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: UI_STRINGS.api.errors.requiredNamePrompt });
    res.status.mockClear();

    // 1.2 Unknown key should map to generic invalid input
    await getRouteHandler('/agents', 'post')({ body: { name: 'A', systemPrompt: 'S', extra: 'x' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: UI_STRINGS.api.errors.invalidInput });
    res.status.mockClear();

    // 2. Valid voice
    await getRouteHandler('/agents', 'post')({ body: { name: 'A', systemPrompt: 'S', voiceName: 'Puck' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(201);
    res.status.mockClear();

    // 2.1 Public preview enabled on create
    await getRouteHandler('/agents', 'post')({
      body: {
        name: 'A',
        systemPrompt: 'S',
        voiceName: 'Puck',
        publicPreviewEnabled: true,
      },
    } as any, res);
    expect(prisma.voiceAgent.create).toHaveBeenCalled();
    res.status.mockClear();

    // 3. Invalid voice
    await getRouteHandler('/agents', 'post')({ body: { name: 'A', systemPrompt: 'S', voiceName: 'INV' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: UI_STRINGS.api.errors.invalidVoice });
    res.status.mockClear();

    // 4. Valid model
    await getRouteHandler('/agents', 'post')({ body: { name: 'A', systemPrompt: 'S', modelName: 'gemini-2.5-flash-native-audio-latest' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(201);
    res.status.mockClear();

    // 5. Invalid model
    await getRouteHandler('/agents', 'post')({ body: { name: 'A', systemPrompt: 'S', modelName: 'INV' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: UI_STRINGS.api.errors.invalidModel });
    res.status.mockClear();

    // 6. Generic error
    (prisma.voiceAgent.create as any).mockRejectedValue(new Error('FAIL'));
    await getRouteHandler('/agents', 'post')({ body: { name: 'A', systemPrompt: 'S' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: UI_STRINGS.api.errors.createAgent });

    // 7. Non-Error failure object
    (prisma.voiceAgent.create as any).mockRejectedValue({ reason: 'plain-object' });
    await getRouteHandler('/agents', 'post')({ body: { name: 'A', systemPrompt: 'S' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: UI_STRINGS.api.errors.createAgent });
  });

  it('PUT /agents/:id coverage', async () => {
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    (prisma.voiceAgent.update as any).mockResolvedValue({ id: '1' });

    (prisma.voiceAgent.findFirst as any).mockResolvedValue({ id: '1' });
    // 0. Invalid content-type
    await getRouteHandler('/agents/:id', 'put')({
      params: { id: '1' },
      headers: { 'content-type': 'text/plain' },
      body: { name: 'N' },
    } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: UI_STRINGS.api.errors.invalidInput });
    res.status.mockClear();

    // 0.1 Empty update payload
    await getRouteHandler('/agents/:id', 'put')({ params: { id: '1' }, body: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: UI_STRINGS.api.errors.invalidInput });
    res.status.mockClear();

    // 1. Invalid voice
    await getRouteHandler('/agents/:id', 'put')({ params: { id: '1' }, body: { voiceName: 'INV' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: UI_STRINGS.api.errors.invalidVoice });
    res.status.mockClear();

    // 1.1 Empty systemPrompt should hit required validation branch
    await getRouteHandler('/agents/:id', 'put')({ params: { id: '1' }, body: { systemPrompt: '' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: UI_STRINGS.api.errors.requiredNamePrompt });
    res.status.mockClear();

    // 2. Valid voice
    await getRouteHandler('/agents/:id', 'put')({ params: { id: '1' }, body: { voiceName: 'Puck' } } as any, res);
    expect(res.json).toHaveBeenCalled();
    res.json.mockClear();

    // 3. Invalid model
    await getRouteHandler('/agents/:id', 'put')({ params: { id: '1' }, body: { modelName: 'INV' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: UI_STRINGS.api.errors.invalidModel });
    res.status.mockClear();

    // 4. Valid model
    await getRouteHandler('/agents/:id', 'put')({ params: { id: '1' }, body: { modelName: 'gemini-2.0-flash-exp' } } as any, res);
    expect(res.json).toHaveBeenCalled();
    res.json.mockClear();

    // 4.1 Full payload should pass through all prepareUpdateData branches
    await getRouteHandler('/agents/:id', 'put')({
      params: { id: '1' },
      body: {
        name: 'N',
        systemPrompt: 'S',
        voiceName: 'Puck',
        modelName: 'gemini-2.0-flash-exp',
      },
    } as any, res);
    expect(res.json).toHaveBeenCalled();
    res.json.mockClear();

    // 4.2 Boolean-only payload should pass publicPreviewEnabled branch
    await getRouteHandler('/agents/:id', 'put')({
      params: { id: '1' },
      body: { publicPreviewEnabled: true },
    } as any, res);
    expect(res.json).toHaveBeenCalled();
    res.json.mockClear();

    // 4.3 Missing agent should return 404 before update
    (prisma.voiceAgent.findFirst as any).mockResolvedValue(null);
    await getRouteHandler('/agents/:id', 'put')({
      params: { id: '404' },
      headers: { 'content-type': 'application/json' },
      body: { name: 'N' },
    } as any, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: UI_STRINGS.api.errors.agentNotFound });
    res.status.mockClear();

    (prisma.voiceAgent.findFirst as any).mockResolvedValue({ id: '1' });

    // 5. P2025 Not Found
    const err: any = new Error(); err.code = 'P2025';
    (prisma.voiceAgent.update as any).mockRejectedValue(err);
    await getRouteHandler('/agents/:id', 'put')({ params: { id: '1' }, body: { name: 'N' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: UI_STRINGS.api.errors.agentNotFound });
    res.status.mockClear();

    // 6. Generic Error
    (prisma.voiceAgent.update as any).mockRejectedValue(new Error('FAIL'));
    await getRouteHandler('/agents/:id', 'put')({ params: { id: '1' }, body: { name: 'N' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: UI_STRINGS.api.errors.updateAgent });

    // 7. Non-Error failure object
    (prisma.voiceAgent.update as any).mockRejectedValue({ reason: 'plain-object' });
    await getRouteHandler('/agents/:id', 'put')({ params: { id: '1' }, body: { name: 'N' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: UI_STRINGS.api.errors.updateAgent });
  });

  it('DELETE /agents/:id coverage', async () => {
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };

    // 0. Invalid id param
    await getRouteHandler('/agents/:id', 'delete')({ params: { id: '' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: UI_STRINGS.api.errors.invalidInput });
    res.status.mockClear();

    // 0.1 Missing agent should hit getAgentOrThrow 404 branch
    (prisma.voiceAgent.findFirst as any).mockResolvedValue(null);
    await getRouteHandler('/agents/:id', 'delete')({ params: { id: '404' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: UI_STRINGS.api.errors.agentNotFound });
    res.status.mockClear();

    const deleteCallsBefore = (prisma.voiceAgent.delete as any).mock.calls.length;

    (prisma.voiceAgent.findFirst as any).mockResolvedValue({ id: '1' });
    (prisma.voiceAgent.delete as any).mockResolvedValue({});
    await getRouteHandler('/agents/:id', 'delete')({ params: { id: '1' } } as any, res);
    expect(res.json).toHaveBeenCalled();

    expect((prisma.voiceAgent.delete as any).mock.calls.length).toBeGreaterThan(deleteCallsBefore);

    const err: any = new Error(); err.code = 'P2025';
    (prisma.voiceAgent.findFirst as any).mockResolvedValue({ id: '1' });
    (prisma.voiceAgent.delete as any).mockRejectedValue(err);
    await getRouteHandler('/agents/:id', 'delete')({ params: { id: '1' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: UI_STRINGS.api.errors.agentNotFound });

    (prisma.voiceAgent.findFirst as any).mockResolvedValue({ id: '1' });
    (prisma.voiceAgent.delete as any).mockRejectedValue(new Error('FAIL'));
    await getRouteHandler('/agents/:id', 'delete')({ params: { id: '1' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: UI_STRINGS.api.errors.deleteAgent });
  });

  it('Helper functions coverage', async () => {
    const { res } = mockReqRes();
    // Re-import internal functions for direct testing via proxy if needed,
    // but here we just test them through the router handlers or by picking them from the module if exported.
    // Since they are not exported, we hit them via route handlers (already mostly done).
    
    // To hit the "Error creating agent" branch in handleAgentError, we use POST /agents failure
    (prisma.voiceAgent.create as any).mockRejectedValue(new Error('CREATE_FAIL'));
    await getRouteHandler('/agents', 'post')({ body: { name: 'A', systemPrompt: 'S' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: UI_STRINGS.api.errors.createAgent });

    // To hit isPrismaNotFound directly, we can't easily as it's internal.
    // But it's covered by the 404 tests in GET/PUT/DELETE.
  });

  it('GET /public/agents/:id/preview coverage', async () => {
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };

    await getRouteHandler('/public/agents/:id/preview', 'get')({ params: { id: '' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    res.status.mockClear();

    (prisma.voiceAgent.findUnique as any).mockResolvedValue(null);
    await getRouteHandler('/public/agents/:id/preview', 'get')({ params: { id: 'x' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(404);
    res.status.mockClear();

    (prisma.voiceAgent.findUnique as any).mockResolvedValue({
      id: 'x',
      name: 'agent',
      systemPrompt: 'prompt',
      publicPreviewEnabled: false,
    });
    await getRouteHandler('/public/agents/:id/preview', 'get')({ params: { id: 'x' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(404);
    res.status.mockClear();

    (prisma.voiceAgent.findUnique as any).mockResolvedValue({
      id: 'x',
      name: 'agent',
      systemPrompt: 'prompt',
      publicPreviewEnabled: true,
    });
    await getRouteHandler('/public/agents/:id/preview', 'get')({ params: { id: 'x' } } as any, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 'x' }));

    (prisma.voiceAgent.findUnique as any).mockRejectedValue(new Error('fail'));
    await getRouteHandler('/public/agents/:id/preview', 'get')({ params: { id: 'x' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
