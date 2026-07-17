import { describe, it, expect, vi, beforeEach } from 'vitest';
import router from '../routes/outboundCall.js';
import prisma from '../lib/prisma.js';
import { UI_STRINGS } from '../constants/uiStrings.js';

vi.mock('../lib/prisma.js', () => ({
  default: {
    voiceAgent: { findFirst: vi.fn() },
    user: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ walletBalance: 100, costPerMinute: 7 }),
    },
    telephonyProvider: { findFirst: vi.fn() },
  },
}));

vi.mock('../services/vobizCalling.js', () => ({
  extractVobizCredentials: vi.fn(),
  initiateVobizCall: vi.fn(),
}));

import {
  extractVobizCredentials,
  initiateVobizCall,
} from '../services/vobizCalling.js';

type MockFn = ReturnType<typeof vi.fn>;
const mockRes = () => ({
  json: vi.fn().mockReturnThis(),
  status: vi.fn().mockReturnThis(),
});

const getRouteHandler = (path: string, method: string): any => {
  const layer = (router as any).stack.find((l: any) =>
    l.route && l.route.path === path && l.route.methods[method.toLowerCase()],
  );
  return layer.route.stack[layer.route.stack.length - 1].handle;
};

const baseReq = (body: Record<string, unknown> = {}) => ({
  headers: { 'content-type': 'application/json' },
  body,
  user: { id: 'user-1' },
  protocol: 'https',
  get: vi.fn().mockReturnValue('example.com'),
});

describe('Outbound Call Routes', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 400 for invalid body', async () => {
    const res = mockRes();
    await getRouteHandler('/', 'post')(baseReq({}) as never, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: UI_STRINGS.api.errors.invalidInput,
    });
  });

  it('returns 400 for short phone number', async () => {
    const res = mockRes();
    await getRouteHandler('/', 'post')(
      baseReq({ agentId: 'a1', phoneNumber: '12' }) as never,
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 for non-JSON content type', async () => {
    const res = mockRes();
    const req = baseReq({ agentId: 'a1', phoneNumber: '+919876543210' });
    req.headers['content-type'] = 'text/plain';
    await getRouteHandler('/', 'post')(req as never, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 when agent not found', async () => {
    const res = mockRes();
    (prisma.voiceAgent.findFirst as MockFn).mockResolvedValue(null);
    await getRouteHandler('/', 'post')(
      baseReq({ agentId: 'a1', phoneNumber: '+919876543210' }) as never,
      res,
    );
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: UI_STRINGS.api.errors.agentNotFound,
    });
  });

  it('returns 404 when no active provider', async () => {
    const res = mockRes();
    (prisma.voiceAgent.findFirst as MockFn)
      .mockResolvedValue({ id: 'a1' });
    (prisma.telephonyProvider.findFirst as MockFn)
      .mockResolvedValue(null);
    await getRouteHandler('/', 'post')(
      baseReq({ agentId: 'a1', phoneNumber: '+919876543210' }) as never,
      res,
    );
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: UI_STRINGS.api.errors.noActiveProvider,
    });
  });

  it('returns 400 when credentials incomplete', async () => {
    const res = mockRes();
    (prisma.voiceAgent.findFirst as MockFn)
      .mockResolvedValue({ id: 'a1' });
    (prisma.telephonyProvider.findFirst as MockFn)
      .mockResolvedValue({ id: 'p1' });
    (extractVobizCredentials as MockFn).mockReturnValue(null);
    await getRouteHandler('/', 'post')(
      baseReq({ agentId: 'a1', phoneNumber: '+919876543210' }) as never,
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: UI_STRINGS.api.errors.missingProviderCreds,
    });
  });

  it('returns 502 when Vobiz call fails', async () => {
    const res = mockRes();
    (prisma.voiceAgent.findFirst as MockFn)
      .mockResolvedValue({ id: 'a1' });
    (prisma.telephonyProvider.findFirst as MockFn)
      .mockResolvedValue({ id: 'p1', name: 'Line' });
    (extractVobizCredentials as MockFn).mockReturnValue({
      authId: 'u', authToken: 't', fromNumber: '+91',
    });
    (initiateVobizCall as MockFn).mockResolvedValue({
      success: false, errorMessage: 'Auth failed',
    });
    await getRouteHandler('/', 'post')(
      baseReq({ agentId: 'a1', phoneNumber: '+919876543210' }) as never,
      res,
    );
    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith({
      error: UI_STRINGS.api.errors.outboundCallFailed,
      detail: 'Auth failed',
    });
  });

  it('returns 200 on successful call', async () => {
    const res = mockRes();
    (prisma.voiceAgent.findFirst as MockFn)
      .mockResolvedValue({ id: 'a1' });
    (prisma.telephonyProvider.findFirst as MockFn)
      .mockResolvedValue({ id: 'p1', name: 'My Line' });
    (extractVobizCredentials as MockFn).mockReturnValue({
      authId: 'u', authToken: 't', fromNumber: '+91111',
    });
    (initiateVobizCall as MockFn).mockResolvedValue({
      success: true, callId: 'call-123',
    });
    await getRouteHandler('/', 'post')(
      baseReq({ agentId: 'a1', phoneNumber: '+919876543210' }) as never,
      res,
    );
    const body = res.json.mock.calls[0][0];
    expect(body.callId).toBe('call-123');
    expect(body.providerName).toBe('My Line');
    expect(body.message).toBe(UI_STRINGS.api.success.outboundCallInitiated);
  });

  it('passes providerId in lookup', async () => {
    const res = mockRes();
    (prisma.voiceAgent.findFirst as MockFn)
      .mockResolvedValue({ id: 'a1' });
    (prisma.telephonyProvider.findFirst as MockFn)
      .mockResolvedValue({ id: 'p2', name: 'Line 2' });
    (extractVobizCredentials as MockFn).mockReturnValue({
      authId: 'u', authToken: 't', fromNumber: '+91',
    });
    (initiateVobizCall as MockFn).mockResolvedValue({
      success: true, callId: 'c1',
    });
    await getRouteHandler('/', 'post')(
      baseReq({
        agentId: 'a1',
        phoneNumber: '+919876543210',
        providerId: 'p2',
      }) as never,
      res,
    );
    expect(
      (prisma.telephonyProvider.findFirst as MockFn)
        .mock.calls[0][0].where.id,
    ).toBe('p2');
  });

  it('returns 500 on unexpected error', async () => {
    const res = mockRes();
    (prisma.voiceAgent.findFirst as MockFn)
      .mockRejectedValue(new Error('DB down'));
    await getRouteHandler('/', 'post')(
      baseReq({ agentId: 'a1', phoneNumber: '+919876543210' }) as never,
      res,
    );
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: UI_STRINGS.api.errors.outboundCallFailed,
    });
  });

  it('returns 500 on non-Error exception', async () => {
    const res = mockRes();
    (prisma.voiceAgent.findFirst as MockFn)
      .mockRejectedValue('string-error');
    await getRouteHandler('/', 'post')(
      baseReq({ agentId: 'a1', phoneNumber: '+919876543210' }) as never,
      res,
    );
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('builds answer URL from request headers', async () => {
    const res = mockRes();
    (prisma.voiceAgent.findFirst as MockFn)
      .mockResolvedValue({ id: 'a1' });
    (prisma.telephonyProvider.findFirst as MockFn)
      .mockResolvedValue({ id: 'p1', name: 'L' });
    (extractVobizCredentials as MockFn).mockReturnValue({
      authId: 'u', authToken: 't', fromNumber: '+91',
    });
    (initiateVobizCall as MockFn).mockResolvedValue({
      success: true, callId: 'c',
    });

    const req = baseReq({ agentId: 'a1', phoneNumber: '+919876543210' });
    await getRouteHandler('/', 'post')(req as never, res);

    const callArgs = (initiateVobizCall as MockFn).mock.calls[0];
    expect(callArgs[2]).toContain('/api/webhooks/vobiz/answer');
  });
});
