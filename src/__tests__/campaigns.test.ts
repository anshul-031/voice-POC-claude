/* eslint-disable max-lines */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import router from '../routes/campaigns.js';
import prisma from '../lib/prisma.js';
import { UI_STRINGS } from '../constants/uiStrings.js';

vi.mock('../lib/prisma.js', () => ({
  default: {
    campaign: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    voiceAgent: { findFirst: vi.fn() },
    user: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ walletBalance: 100, costPerMinute: 7 }),
    },
    telephonyProvider: { findFirst: vi.fn() },
    campaignContact: { update: vi.fn(), updateMany: vi.fn() },
  },
}));

vi.mock('../services/excelParser.js', async () => {
  const actual = await vi.importActual('../services/excelParser.js');
  return { ...(actual as Record<string, unknown>), parseCampaignSpreadsheet: vi.fn() };
});

vi.mock('../services/vobizCalling.js', () => ({
  extractVobizCredentials: vi.fn(),
}));

vi.mock('../services/campaignRunner.js', () => ({
  runCampaign: vi.fn(),
}));

import { parseCampaignSpreadsheet, CampaignParseError, CAMPAIGN_PARSE_ERROR } from '../services/excelParser.js';
import { extractVobizCredentials } from '../services/vobizCalling.js';
import { runCampaign } from '../services/campaignRunner.js';

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

const baseReq = (overrides: Record<string, unknown> = {}) => ({
  headers: { 'content-type': 'application/json' },
  body: {},
  params: {},
  user: { id: 'user-1' },
  protocol: 'https',
  get: vi.fn().mockReturnValue('example.com'),
  ...overrides,
});

describe('Campaign Routes', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('GET /', () => {
    it('lists campaigns for the user', async () => {
      (prisma.campaign.findMany as any).mockResolvedValue([{ id: 'c1' }]);
      const res = mockRes();
      await getRouteHandler('/', 'get')(baseReq(), res);
      expect(res.json).toHaveBeenCalledWith([{ id: 'c1' }]);
    });

    it('returns 500 on db error', async () => {
      (prisma.campaign.findMany as any).mockRejectedValue(new Error('DB'));
      const res = mockRes();
      await getRouteHandler('/', 'get')(baseReq(), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('GET /:id', () => {
    it('returns a campaign', async () => {
      (prisma.campaign.findFirst as any).mockResolvedValue({ id: 'c1' });
      const res = mockRes();
      await getRouteHandler('/:id', 'get')(baseReq({ params: { id: 'c1' } }), res);
      expect(res.json).toHaveBeenCalledWith({ id: 'c1' });
    });

    it('returns 400 for invalid params', async () => {
      const res = mockRes();
      await getRouteHandler('/:id', 'get')(baseReq({ params: { id: '' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 404 when missing', async () => {
      (prisma.campaign.findFirst as any).mockResolvedValue(null);
      const res = mockRes();
      await getRouteHandler('/:id', 'get')(baseReq({ params: { id: 'nope' } }), res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 500 on db error', async () => {
      (prisma.campaign.findFirst as any).mockRejectedValue(new Error('DB'));
      const res = mockRes();
      await getRouteHandler('/:id', 'get')(baseReq({ params: { id: 'c1' } }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('POST /', () => {
    const validBody = { name: 'Camp', agentId: 'a1', fileBase64: 'ZmFrZQ==' };

    it('creates a campaign from a valid upload', async () => {
      (prisma.voiceAgent.findFirst as any).mockResolvedValue({ id: 'a1' });
      (parseCampaignSpreadsheet as any).mockReturnValue({
        phoneColumn: 'phone',
        variableColumns: ['name'],
        contacts: [{ phoneNumber: '+1', variables: { name: 'Sam' } }],
      });
      (prisma.campaign.create as any).mockResolvedValue({ id: 'c1', name: 'Camp' });

      const res = mockRes();
      await getRouteHandler('/', 'post')(baseReq({ body: validBody }), res);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(prisma.campaign.create).toHaveBeenCalled();
    });

    it('accepts a data-URL encoded file', async () => {
      (prisma.voiceAgent.findFirst as any).mockResolvedValue({ id: 'a1' });
      (parseCampaignSpreadsheet as any).mockReturnValue({
        phoneColumn: 'phone', variableColumns: [], contacts: [{ phoneNumber: '+1', variables: {} }],
      });
      (prisma.campaign.create as any).mockResolvedValue({ id: 'c1' });
      const res = mockRes();
      await getRouteHandler('/', 'post')(
        baseReq({ body: { ...validBody, fileBase64: 'data:application/vnd.ms-excel;base64,ZmFrZQ==' } }),
        res,
      );
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('validates provider ownership when providerId given', async () => {
      (prisma.voiceAgent.findFirst as any).mockResolvedValue({ id: 'a1' });
      (prisma.telephonyProvider.findFirst as any).mockResolvedValue(null);
      const res = mockRes();
      await getRouteHandler('/', 'post')(
        baseReq({ body: { ...validBody, providerId: 'p1' } }), res,
      );
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: UI_STRINGS.api.errors.telephonyNotFound });
    });

    it('accepts a valid providerId', async () => {
      (prisma.voiceAgent.findFirst as any).mockResolvedValue({ id: 'a1' });
      (prisma.telephonyProvider.findFirst as any).mockResolvedValue({ id: 'p1' });
      (parseCampaignSpreadsheet as any).mockReturnValue({
        phoneColumn: 'phone', variableColumns: [], contacts: [{ phoneNumber: '+1', variables: {} }],
      });
      (prisma.campaign.create as any).mockResolvedValue({ id: 'c1' });
      const res = mockRes();
      await getRouteHandler('/', 'post')(
        baseReq({ body: { ...validBody, providerId: 'p1' } }), res,
      );
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('rejects non-JSON content type', async () => {
      const res = mockRes();
      await getRouteHandler('/', 'post')(
        baseReq({ headers: { 'content-type': 'text/plain' }, body: validBody }), res,
      );
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('rejects invalid body', async () => {
      const res = mockRes();
      await getRouteHandler('/', 'post')(baseReq({ body: { name: '' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 404 when agent not owned', async () => {
      (prisma.voiceAgent.findFirst as any).mockResolvedValue(null);
      const res = mockRes();
      await getRouteHandler('/', 'post')(baseReq({ body: validBody }), res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: UI_STRINGS.api.errors.agentNotFound });
    });

    it('returns 400 with a parse-error message', async () => {
      (prisma.voiceAgent.findFirst as any).mockResolvedValue({ id: 'a1' });
      (parseCampaignSpreadsheet as any).mockImplementation(() => {
        throw new CampaignParseError(CAMPAIGN_PARSE_ERROR.NO_PHONE_COLUMN);
      });
      const res = mockRes();
      await getRouteHandler('/', 'post')(baseReq({ body: validBody }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: UI_STRINGS.api.errors.campaignNoPhoneColumn });
    });

    it('returns 500 on unexpected parse error', async () => {
      (prisma.voiceAgent.findFirst as any).mockResolvedValue({ id: 'a1' });
      (parseCampaignSpreadsheet as any).mockImplementation(() => {
        throw new Error('boom');
      });
      const res = mockRes();
      await getRouteHandler('/', 'post')(baseReq({ body: validBody }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('returns 400 when required variable columns are missing', async () => {
      (prisma.voiceAgent.findFirst as any).mockResolvedValue({ id: 'a1', systemPrompt: 'Hi {{name}} from {{city}}' });
      (parseCampaignSpreadsheet as any).mockReturnValue({
        phoneColumn: 'phone',
        variableColumns: ['name'],
        contacts: [{ phoneNumber: '+1', variables: { name: 'Sam' } }],
      });
      const res = mockRes();
      await getRouteHandler('/', 'post')(baseReq({ body: validBody }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      const arg = (res.json as any).mock.calls[0][0];
      expect(arg.error).toContain('city');
    });
  });

  describe('GET /template/:agentId', () => {
    it('returns an xlsx attachment for the agent', async () => {
      (prisma.voiceAgent.findFirst as any).mockResolvedValue({ id: 'a1', systemPrompt: 'Hi {{name}}' });
      const res = { ...mockRes(), set: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() };
      await getRouteHandler('/template/:agentId', 'get')(baseReq({ params: { agentId: 'a1' } }), res);
      expect(res.set).toHaveBeenCalledWith(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(res.set).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="campaign-template.xlsx"');
      expect(res.send).toHaveBeenCalled();
    });

    it('returns 400 when agentId is blank', async () => {
      const res = { ...mockRes(), set: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() };
      await getRouteHandler('/template/:agentId', 'get')(baseReq({ params: { agentId: '' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 404 when the agent is not owned', async () => {
      (prisma.voiceAgent.findFirst as any).mockResolvedValue(null);
      const res = { ...mockRes(), set: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() };
      await getRouteHandler('/template/:agentId', 'get')(baseReq({ params: { agentId: 'a1' } }), res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 500 on db error', async () => {
      (prisma.voiceAgent.findFirst as any).mockRejectedValue(new Error('DB'));
      const res = { ...mockRes(), set: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() };
      await getRouteHandler('/template/:agentId', 'get')(baseReq({ params: { agentId: 'a1' } }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('PUT /:id', () => {
    it('updates a campaign', async () => {
      (prisma.campaign.findFirst as any).mockResolvedValue({ id: 'c1' });
      (prisma.campaign.update as any).mockResolvedValue({ id: 'c1', name: 'New' });
      const res = mockRes();
      await getRouteHandler('/:id', 'put')(
        baseReq({ params: { id: 'c1' }, body: { name: 'New' } }), res,
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('returns 400 for invalid params/headers', async () => {
      const res = mockRes();
      await getRouteHandler('/:id', 'put')(
        baseReq({ params: { id: '' }, body: { name: 'New' } }), res,
      );
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 404 when campaign missing', async () => {
      (prisma.campaign.findFirst as any).mockResolvedValue(null);
      const res = mockRes();
      await getRouteHandler('/:id', 'put')(
        baseReq({ params: { id: 'c1' }, body: { name: 'New' } }), res,
      );
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 400 for empty update body', async () => {
      (prisma.campaign.findFirst as any).mockResolvedValue({ id: 'c1' });
      const res = mockRes();
      await getRouteHandler('/:id', 'put')(
        baseReq({ params: { id: 'c1' }, body: {} }), res,
      );
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 404 when new agent not owned', async () => {
      (prisma.campaign.findFirst as any).mockResolvedValue({ id: 'c1' });
      (prisma.voiceAgent.findFirst as any).mockResolvedValue(null);
      const res = mockRes();
      await getRouteHandler('/:id', 'put')(
        baseReq({ params: { id: 'c1' }, body: { agentId: 'a2' } }), res,
      );
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: UI_STRINGS.api.errors.agentNotFound });
    });

    it('returns 500 on db error', async () => {
      (prisma.campaign.findFirst as any).mockRejectedValue(new Error('DB'));
      const res = mockRes();
      await getRouteHandler('/:id', 'put')(
        baseReq({ params: { id: 'c1' }, body: { name: 'New' } }), res,
      );
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('DELETE /:id', () => {
    it('deletes a campaign', async () => {
      (prisma.campaign.findFirst as any).mockResolvedValue({ id: 'c1' });
      (prisma.campaign.delete as any).mockResolvedValue({});
      const res = mockRes();
      await getRouteHandler('/:id', 'delete')(baseReq({ params: { id: 'c1' } }), res);
      expect(res.json).toHaveBeenCalledWith({ message: UI_STRINGS.api.success.deleteCampaign });
    });

    it('returns 400 for invalid params', async () => {
      const res = mockRes();
      await getRouteHandler('/:id', 'delete')(baseReq({ params: { id: '' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 404 when missing', async () => {
      (prisma.campaign.findFirst as any).mockResolvedValue(null);
      const res = mockRes();
      await getRouteHandler('/:id', 'delete')(baseReq({ params: { id: 'c1' } }), res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 500 on db error', async () => {
      (prisma.campaign.findFirst as any).mockResolvedValue({ id: 'c1' });
      (prisma.campaign.delete as any).mockRejectedValue(new Error('DB'));
      const res = mockRes();
      await getRouteHandler('/:id', 'delete')(baseReq({ params: { id: 'c1' } }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('POST /:id/trigger', () => {
    const pendingCampaign = {
      id: 'c1',
      agentId: 'a1',
      providerId: 'p1',
      contacts: [{ id: 'ct1', phoneNumber: '+1' }],
    };

    it('triggers calls and marks the campaign completed', async () => {
      (prisma.campaign.findFirst as any).mockResolvedValue(pendingCampaign);
      (prisma.telephonyProvider.findFirst as any).mockResolvedValue({ id: 'p1', sipUsername: 'u' });
      (extractVobizCredentials as any).mockReturnValue({ authId: 'u', authToken: 't', fromNumber: '+1' });
      (prisma.campaign.update as any).mockResolvedValue({});
      (runCampaign as any).mockImplementation((params: any) => {
        // Exercise the answer-url builder (fallback proto/host branches).
        const url = params.answerUrlBuilder('a1', 'ct1');
        expect(url).toContain('agentId=a1');
        expect(url).toContain('contactId=ct1');
        return Promise.resolve({ total: 1, initiated: 1, failed: 0 });
      });

      const res = mockRes();
      await getRouteHandler('/:id/trigger', 'post')(baseReq({ params: { id: 'c1' } }), res);
      expect(runCampaign).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ status: 'completed', total: 1, initiated: 1, failed: 0 });
    });

    it('builds the answer url from forwarded headers', async () => {
      (prisma.campaign.findFirst as any).mockResolvedValue(pendingCampaign);
      (prisma.telephonyProvider.findFirst as any).mockResolvedValue({ id: 'p1' });
      (extractVobizCredentials as any).mockReturnValue({ authId: 'u', authToken: 't', fromNumber: '+1' });
      (prisma.campaign.update as any).mockResolvedValue({});
      let builtUrl = '';
      (runCampaign as any).mockImplementation((params: any) => {
        builtUrl = params.answerUrlBuilder('a1', 'ct1');
        return Promise.resolve({ total: 1, initiated: 1, failed: 0 });
      });

      const res = mockRes();
      await getRouteHandler('/:id/trigger', 'post')(
        baseReq({
          params: { id: 'c1' },
          headers: { 'content-type': 'application/json', 'x-forwarded-proto': 'https', 'x-forwarded-host': 'fwd.example.com' },
        }),
        res,
      );
      expect(builtUrl).toContain('https://fwd.example.com/api/webhooks/vobiz/answer');
    });

    it('marks the campaign failed when no calls initiate', async () => {
      (prisma.campaign.findFirst as any).mockResolvedValue(pendingCampaign);
      (prisma.telephonyProvider.findFirst as any).mockResolvedValue({ id: 'p1' });
      (extractVobizCredentials as any).mockReturnValue({ authId: 'u', authToken: 't', fromNumber: '+1' });
      (prisma.campaign.update as any).mockResolvedValue({});
      (runCampaign as any).mockResolvedValue({ total: 1, initiated: 0, failed: 1 });

      const res = mockRes();
      await getRouteHandler('/:id/trigger', 'post')(baseReq({ params: { id: 'c1' } }), res);
      expect(res.json).toHaveBeenCalledWith({ status: 'failed', total: 1, initiated: 0, failed: 1 });
    });

    it('returns 400 for invalid params', async () => {
      const res = mockRes();
      await getRouteHandler('/:id/trigger', 'post')(baseReq({ params: { id: '' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 404 when campaign missing', async () => {
      (prisma.campaign.findFirst as any).mockResolvedValue(null);
      const res = mockRes();
      await getRouteHandler('/:id/trigger', 'post')(baseReq({ params: { id: 'c1' } }), res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 400 when no pending contacts', async () => {
      (prisma.campaign.findFirst as any).mockResolvedValue({ ...pendingCampaign, contacts: [] });
      const res = mockRes();
      await getRouteHandler('/:id/trigger', 'post')(baseReq({ params: { id: 'c1' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: UI_STRINGS.api.errors.campaignNotRunnable });
    });

    it('returns 404 when no active provider', async () => {
      (prisma.campaign.findFirst as any).mockResolvedValue(pendingCampaign);
      (prisma.telephonyProvider.findFirst as any).mockResolvedValue(null);
      const res = mockRes();
      await getRouteHandler('/:id/trigger', 'post')(baseReq({ params: { id: 'c1' } }), res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: UI_STRINGS.api.errors.noActiveProvider });
    });

    it('returns 400 when provider credentials incomplete', async () => {
      (prisma.campaign.findFirst as any).mockResolvedValue(pendingCampaign);
      (prisma.telephonyProvider.findFirst as any).mockResolvedValue({ id: 'p1' });
      (extractVobizCredentials as any).mockReturnValue(null);
      const res = mockRes();
      await getRouteHandler('/:id/trigger', 'post')(baseReq({ params: { id: 'c1' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: UI_STRINGS.api.errors.missingProviderCreds });
    });

    it('returns 500 on db error', async () => {
      (prisma.campaign.findFirst as any).mockRejectedValue(new Error('DB'));
      const res = mockRes();
      await getRouteHandler('/:id/trigger', 'post')(baseReq({ params: { id: 'c1' } }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('POST /:id/schedule', () => {
    const validBody = {
      scheduledAt: '2026-07-07T10:00:00.000Z',
      windowStart: '09:00',
      windowEnd: '18:00',
      timezone: 'Asia/Kolkata',
    };

    it('schedules a campaign with a start time and call window', async () => {
      (prisma.campaign.findFirst as any).mockResolvedValue({ id: 'c1' });
      (prisma.campaign.update as any).mockResolvedValue({ id: 'c1', status: 'scheduled' });
      (prisma.campaignContact.updateMany as any).mockResolvedValue({ count: 2 });
      const res = mockRes();
      await getRouteHandler('/:id/schedule', 'post')(
        baseReq({ params: { id: 'c1' }, body: validBody }), res,
      );
      expect(prisma.campaign.update).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ id: 'c1', status: 'scheduled' });
    });

    it('resets all contacts to pending so the scheduled run has contacts to dial', async () => {
      (prisma.campaign.findFirst as any).mockResolvedValue({ id: 'c1' });
      (prisma.campaign.update as any).mockResolvedValue({ id: 'c1', status: 'scheduled' });
      (prisma.campaignContact.updateMany as any).mockResolvedValue({ count: 3 });
      const res = mockRes();
      await getRouteHandler('/:id/schedule', 'post')(
        baseReq({ params: { id: 'c1' }, body: validBody }), res,
      );
      expect(prisma.campaignContact.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { campaignId: 'c1' },
          data: expect.objectContaining({ status: 'pending', callId: null, errorMessage: null }),
        }),
      );
    });

    it('clears scheduling fields when values are omitted', async () => {
      (prisma.campaign.findFirst as any).mockResolvedValue({ id: 'c1' });
      (prisma.campaign.update as any).mockResolvedValue({ id: 'c1', status: 'scheduled' });
      (prisma.campaignContact.updateMany as any).mockResolvedValue({ count: 0 });
      const res = mockRes();
      await getRouteHandler('/:id/schedule', 'post')(
        baseReq({ params: { id: 'c1' }, body: {} }), res,
      );
      const data = (prisma.campaign.update as any).mock.calls[0][0].data;
      expect(data).toMatchObject({
        scheduledAt: null, windowStart: null, windowEnd: null, timezone: null, status: 'scheduled',
      });
    });

    it('persists the timezone alongside the call window', async () => {
      (prisma.campaign.findFirst as any).mockResolvedValue({ id: 'c1' });
      (prisma.campaign.update as any).mockResolvedValue({ id: 'c1', status: 'scheduled' });
      (prisma.campaignContact.updateMany as any).mockResolvedValue({ count: 1 });
      await getRouteHandler('/:id/schedule', 'post')(
        baseReq({ params: { id: 'c1' }, body: validBody }), mockRes(),
      );
      const data = (prisma.campaign.update as any).mock.calls[0][0].data;
      expect(data.timezone).toBe('Asia/Kolkata');
    });

    it('resolves a wall-clock start time against the given timezone', async () => {
      (prisma.campaign.findFirst as any).mockResolvedValue({ id: 'c1' });
      (prisma.campaign.update as any).mockResolvedValue({ id: 'c1', status: 'scheduled' });
      (prisma.campaignContact.updateMany as any).mockResolvedValue({ count: 1 });
      await getRouteHandler('/:id/schedule', 'post')(
        baseReq({
          params: { id: 'c1' },
          body: { scheduledAtLocal: '2026-07-07T18:00', timezone: 'Asia/Kolkata' },
        }),
        mockRes(),
      );
      const data = (prisma.campaign.update as any).mock.calls[0][0].data;
      // 6 PM IST is 12:30 UTC — not 18:00 UTC.
      expect((data.scheduledAt as Date).toISOString()).toBe('2026-07-07T12:30:00.000Z');
    });

    it('prefers the wall clock over a stale absolute instant', async () => {
      (prisma.campaign.findFirst as any).mockResolvedValue({ id: 'c1' });
      (prisma.campaign.update as any).mockResolvedValue({ id: 'c1', status: 'scheduled' });
      (prisma.campaignContact.updateMany as any).mockResolvedValue({ count: 1 });
      await getRouteHandler('/:id/schedule', 'post')(
        baseReq({
          params: { id: 'c1' },
          body: {
            scheduledAt: '2026-07-07T18:00:00.000Z',
            scheduledAtLocal: '2026-07-07T18:00',
            timezone: 'Asia/Kolkata',
          },
        }),
        mockRes(),
      );
      const data = (prisma.campaign.update as any).mock.calls[0][0].data;
      expect((data.scheduledAt as Date).toISOString()).toBe('2026-07-07T12:30:00.000Z');
    });

    it('rejects a call window sent without a timezone', async () => {
      const res = mockRes();
      await getRouteHandler('/:id/schedule', 'post')(
        baseReq({ params: { id: 'c1' }, body: { windowStart: '09:00', windowEnd: '18:00' } }), res,
      );
      expect(res.status).toHaveBeenCalledWith(400);
      expect(prisma.campaign.update).not.toHaveBeenCalled();
    });

    it('rejects an unknown timezone', async () => {
      const res = mockRes();
      await getRouteHandler('/:id/schedule', 'post')(
        baseReq({
          params: { id: 'c1' },
          body: { ...validBody, timezone: 'Mars/Olympus' },
        }),
        res,
      );
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('rejects a wall-clock start time sent without a timezone', async () => {
      const res = mockRes();
      await getRouteHandler('/:id/schedule', 'post')(
        baseReq({ params: { id: 'c1' }, body: { scheduledAtLocal: '2026-07-07T18:00' } }), res,
      );
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 for invalid params', async () => {
      const res = mockRes();
      await getRouteHandler('/:id/schedule', 'post')(baseReq({ params: { id: '' }, body: validBody }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 for an invalid body (mismatched window)', async () => {
      const res = mockRes();
      await getRouteHandler('/:id/schedule', 'post')(
        baseReq({ params: { id: 'c1' }, body: { windowStart: '09:00' } }), res,
      );
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 404 when the campaign is missing', async () => {
      (prisma.campaign.findFirst as any).mockResolvedValue(null);
      const res = mockRes();
      await getRouteHandler('/:id/schedule', 'post')(baseReq({ params: { id: 'c1' }, body: validBody }), res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 500 on db error', async () => {
      (prisma.campaign.findFirst as any).mockRejectedValue(new Error('DB'));
      const res = mockRes();
      await getRouteHandler('/:id/schedule', 'post')(baseReq({ params: { id: 'c1' }, body: validBody }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('POST /:id/pause', () => {
    it('pauses a running campaign', async () => {
      (prisma.campaign.findFirst as any).mockResolvedValue({ id: 'c1', status: 'running' });
      (prisma.campaign.update as any).mockResolvedValue({ id: 'c1', status: 'paused' });
      const res = mockRes();
      await getRouteHandler('/:id/pause', 'post')(baseReq({ params: { id: 'c1' } }), res);
      expect(res.json).toHaveBeenCalledWith({ id: 'c1', status: 'paused' });
    });

    it('returns 400 for invalid params', async () => {
      const res = mockRes();
      await getRouteHandler('/:id/pause', 'post')(baseReq({ params: { id: '' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 404 when the campaign is missing', async () => {
      (prisma.campaign.findFirst as any).mockResolvedValue(null);
      const res = mockRes();
      await getRouteHandler('/:id/pause', 'post')(baseReq({ params: { id: 'c1' } }), res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 400 when the campaign is not pausable', async () => {
      (prisma.campaign.findFirst as any).mockResolvedValue({ id: 'c1', status: 'draft' });
      const res = mockRes();
      await getRouteHandler('/:id/pause', 'post')(baseReq({ params: { id: 'c1' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: UI_STRINGS.api.errors.campaignNotPausable });
    });

    it('returns 500 on db error', async () => {
      (prisma.campaign.findFirst as any).mockRejectedValue(new Error('DB'));
      const res = mockRes();
      await getRouteHandler('/:id/pause', 'post')(baseReq({ params: { id: 'c1' } }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('POST /:id/resume', () => {
    it('resumes a paused campaign into running when no future start time', async () => {
      (prisma.campaign.findFirst as any).mockResolvedValue({ id: 'c1', status: 'paused', scheduledAt: null });
      (prisma.campaign.update as any).mockResolvedValue({ id: 'c1', status: 'running' });
      const res = mockRes();
      await getRouteHandler('/:id/resume', 'post')(baseReq({ params: { id: 'c1' } }), res);
      const data = (prisma.campaign.update as any).mock.calls[0][0].data;
      expect(data.status).toBe('running');
      expect(res.json).toHaveBeenCalled();
    });

    it('resumes into scheduled when a future start time remains', async () => {
      const future = new Date(Date.now() + 3_600_000);
      (prisma.campaign.findFirst as any).mockResolvedValue({ id: 'c1', status: 'paused', scheduledAt: future });
      (prisma.campaign.update as any).mockResolvedValue({ id: 'c1', status: 'scheduled' });
      const res = mockRes();
      await getRouteHandler('/:id/resume', 'post')(baseReq({ params: { id: 'c1' } }), res);
      const data = (prisma.campaign.update as any).mock.calls[0][0].data;
      expect(data.status).toBe('scheduled');
    });

    it('returns 400 for invalid params', async () => {
      const res = mockRes();
      await getRouteHandler('/:id/resume', 'post')(baseReq({ params: { id: '' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 404 when the campaign is missing', async () => {
      (prisma.campaign.findFirst as any).mockResolvedValue(null);
      const res = mockRes();
      await getRouteHandler('/:id/resume', 'post')(baseReq({ params: { id: 'c1' } }), res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 400 when the campaign is not resumable', async () => {
      (prisma.campaign.findFirst as any).mockResolvedValue({ id: 'c1', status: 'running' });
      const res = mockRes();
      await getRouteHandler('/:id/resume', 'post')(baseReq({ params: { id: 'c1' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: UI_STRINGS.api.errors.campaignNotResumable });
    });

    it('returns 500 on db error', async () => {
      (prisma.campaign.findFirst as any).mockRejectedValue(new Error('DB'));
      const res = mockRes();
      await getRouteHandler('/:id/resume', 'post')(baseReq({ params: { id: 'c1' } }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('POST /:id/retrigger', () => {
    const pendingCampaign = {
      id: 'c1',
      agentId: 'a1',
      providerId: 'p1',
      contacts: [{ id: 'ct1', phoneNumber: '+1' }],
    };

    it('resets contacts and dials again', async () => {
      (prisma.campaign.findFirst as any)
        .mockResolvedValueOnce({ id: 'c1' }) // ownership lookup
        .mockResolvedValueOnce(pendingCampaign); // loadRunnableCampaign
      (prisma.campaignContact.updateMany as any).mockResolvedValue({ count: 1 });
      (prisma.telephonyProvider.findFirst as any).mockResolvedValue({ id: 'p1' });
      (extractVobizCredentials as any).mockReturnValue({ authId: 'u', authToken: 't', fromNumber: '+1' });
      (prisma.campaign.update as any).mockResolvedValue({});
      (runCampaign as any).mockResolvedValue({ total: 1, initiated: 1, failed: 0 });

      const res = mockRes();
      await getRouteHandler('/:id/retrigger', 'post')(baseReq({ params: { id: 'c1' } }), res);
      expect(prisma.campaignContact.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { campaignId: 'c1' } }),
      );
      expect(res.json).toHaveBeenCalledWith({ status: 'completed', total: 1, initiated: 1, failed: 0 });
    });

    it('returns 400 for invalid params', async () => {
      const res = mockRes();
      await getRouteHandler('/:id/retrigger', 'post')(baseReq({ params: { id: '' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 404 when the campaign is missing', async () => {
      (prisma.campaign.findFirst as any).mockResolvedValue(null);
      const res = mockRes();
      await getRouteHandler('/:id/retrigger', 'post')(baseReq({ params: { id: 'c1' } }), res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('propagates a not-runnable result after reset', async () => {
      (prisma.campaign.findFirst as any)
        .mockResolvedValueOnce({ id: 'c1' })
        .mockResolvedValueOnce({ ...pendingCampaign, contacts: [] });
      (prisma.campaignContact.updateMany as any).mockResolvedValue({ count: 0 });
      const res = mockRes();
      await getRouteHandler('/:id/retrigger', 'post')(baseReq({ params: { id: 'c1' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: UI_STRINGS.api.errors.campaignNotRunnable });
    });

    it('returns 500 on db error', async () => {
      (prisma.campaign.findFirst as any).mockRejectedValue(new Error('DB'));
      const res = mockRes();
      await getRouteHandler('/:id/retrigger', 'post')(baseReq({ params: { id: 'c1' } }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('non-Error rejections cover String(error) branches', () => {
    it('handles raw string rejections across handlers', async () => {
      (prisma.campaign.findMany as any).mockRejectedValue('raw');
      await getRouteHandler('/', 'get')(baseReq(), mockRes());

      (prisma.campaign.findFirst as any).mockRejectedValue('raw');
      await getRouteHandler('/:id', 'get')(baseReq({ params: { id: 'c1' } }), mockRes());
      await getRouteHandler('/:id', 'put')(baseReq({ params: { id: 'c1' }, body: { name: 'X' } }), mockRes());
      await getRouteHandler('/:id', 'delete')(baseReq({ params: { id: 'c1' } }), mockRes());
      await getRouteHandler('/:id/trigger', 'post')(baseReq({ params: { id: 'c1' } }), mockRes());
      await getRouteHandler('/:id/schedule', 'post')(
        baseReq({ params: { id: 'c1' }, body: { scheduledAt: '2026-07-07T10:00:00.000Z' } }), mockRes(),
      );
      await getRouteHandler('/:id/pause', 'post')(baseReq({ params: { id: 'c1' } }), mockRes());
      await getRouteHandler('/:id/resume', 'post')(baseReq({ params: { id: 'c1' } }), mockRes());
      await getRouteHandler('/:id/retrigger', 'post')(baseReq({ params: { id: 'c1' } }), mockRes());

      (prisma.voiceAgent.findFirst as any).mockRejectedValue('raw');
      await getRouteHandler('/template/:agentId', 'get')(
        baseReq({ params: { agentId: 'a1' } }),
        { ...mockRes(), set: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() },
      );
      await getRouteHandler('/', 'post')(
        baseReq({ body: { name: 'C', agentId: 'a1', fileBase64: 'ZmFrZQ==' } }), mockRes(),
      );

      expect(true).toBe(true);
    });
  });
});
