import { describe, it, expect, vi, beforeEach } from 'vitest';
import router from '../routes/vobizWebhooks.js';

vi.mock('../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

type MockFn = ReturnType<typeof vi.fn>;

const mockRes = () => ({
  send: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis(),
});

const getRouteHandler = (path: string, method: string): any => {
  const layer = (router as any).stack.find((l: any) =>
    l.route && l.route.path === path && l.route.methods[method.toLowerCase()],
  );
  return layer.route.stack[layer.route.stack.length - 1].handle;
};

describe('Vobiz Webhook Routes', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('POST /answer', () => {
    it('returns valid XML with Stream element and agentId', () => {
      const res = mockRes();
      const req = {
        body: {
          CallUUID: 'call-123',
          From: '+91111',
          To: '+91222',
        },
        query: { agentId: 'agent-abc' },
        headers: {},
        protocol: 'https',
        get: vi.fn().mockReturnValue('example.com'),
      };

      getRouteHandler('/answer', 'post')(req as never, res);

      expect(res.set).toHaveBeenCalledWith('Content-Type', 'application/xml');
      const xml = (res.send as MockFn).mock.calls[0][0] as string;
      expect(xml).toContain('<?xml');
      expect(xml).toContain('<Response>');
      expect(xml).toContain('<Stream');
      expect(xml).toContain('bidirectional="true"');
      expect(xml).toContain('keepCallAlive="true"');
      expect(xml).toContain('wss://example.com/ws?agentId=agent-abc');
      expect(xml).toContain('</Stream>');
      expect(xml).toContain('</Response>');
    });

    it('uses x-forwarded-proto and x-forwarded-host headers', () => {
      const res = mockRes();
      const req = {
        body: { callUuid: 'c1', from: '+1', to: '+2' },
        query: { agentId: 'a1' },
        headers: {
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'my-app.render.com',
        },
        protocol: 'http',
        get: vi.fn().mockReturnValue('localhost:3000'),
      };

      getRouteHandler('/answer', 'post')(req as never, res);

      const xml = (res.send as MockFn).mock.calls[0][0] as string;
      expect(xml).toContain('wss://my-app.render.com/ws?agentId=a1');
    });

    it('uses ws:// for http protocol', () => {
      const res = mockRes();
      const req = {
        body: {},
        query: {},
        headers: {},
        protocol: 'http',
        get: vi.fn().mockReturnValue('localhost:3000'),
      };

      getRouteHandler('/answer', 'post')(req as never, res);

      const xml = (res.send as MockFn).mock.calls[0][0] as string;
      expect(xml).toContain('ws://localhost:3000/ws');
    });

    it('handles missing body fields gracefully', () => {
      const res = mockRes();
      const req = {
        body: undefined,
        query: {},
        headers: {},
        protocol: 'https',
        get: vi.fn().mockReturnValue('host.com'),
      };

      getRouteHandler('/answer', 'post')(req as never, res);

      expect(res.set).toHaveBeenCalledWith('Content-Type', 'application/xml');
      const xml = (res.send as MockFn).mock.calls[0][0] as string;
      expect(xml).toContain('<Response>');
    });

    it('omits query string when agentId is empty', () => {
      const res = mockRes();
      const req = {
        body: {},
        query: { agentId: '' },
        headers: {},
        protocol: 'https',
        get: vi.fn().mockReturnValue('host.com'),
      };

      getRouteHandler('/answer', 'post')(req as never, res);

      const xml = (res.send as MockFn).mock.calls[0][0] as string;
      expect(xml).toContain('wss://host.com/ws');
      expect(xml).not.toContain('?agentId');
    });

    it('includes contactId in the stream URL for campaign calls', () => {
      const res = mockRes();
      const req = {
        body: {},
        query: { agentId: 'agent-abc', contactId: 'ct-1' },
        headers: {},
        protocol: 'https',
        get: vi.fn().mockReturnValue('example.com'),
      };

      getRouteHandler('/answer', 'post')(req as never, res);

      const xml = (res.send as MockFn).mock.calls[0][0] as string;
      expect(xml).toContain('agentId=agent-abc');
      expect(xml).toContain('contactId=ct-1');
      // The `&` joining the two query params must be XML-escaped, otherwise
      // Vobiz cannot parse the Stream element and drops the answered call.
      expect(xml).toContain('agentId=agent-abc&amp;contactId=ct-1');
      expect(xml).not.toContain('agentId=agent-abc&contactId=ct-1');
    });
  });

  describe('POST /hangup', () => {
    it('returns empty XML response', () => {
      const res = mockRes();
      const req = {
        body: {
          CallUUID: 'call-456',
          HangupCause: 'NORMAL_CLEARING',
          Duration: '30',
        },
      };

      getRouteHandler('/hangup', 'post')(req as never, res);

      expect(res.set).toHaveBeenCalledWith('Content-Type', 'application/xml');
      const xml = (res.send as MockFn).mock.calls[0][0] as string;
      expect(xml).toContain('<Response></Response>');
    });

    it('handles lowercase body fields', () => {
      const res = mockRes();
      const req = {
        body: {
          callUuid: 'c2',
          hangupCause: 'NO_ANSWER',
          duration: '10',
        },
      };

      getRouteHandler('/hangup', 'post')(req as never, res);
      expect(res.set).toHaveBeenCalledWith('Content-Type', 'application/xml');
    });

    it('handles empty body', () => {
      const res = mockRes();
      const req = { body: {} };

      getRouteHandler('/hangup', 'post')(req as never, res);
      expect(res.set).toHaveBeenCalledWith('Content-Type', 'application/xml');
    });
  });
});
