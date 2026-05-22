import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractVobizCredentials,
  initiateVobizCall,
} from '../services/vobizCalling.js';

// Mock logger
vi.mock('../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('vobizCalling service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe('extractVobizCredentials', () => {
    it('returns credentials from sipUsername/sipPassword/phoneNumber', () => {
      const provider = {
        sipUsername: 'auth123',
        sipPassword: 'token456',
        phoneNumber: '+919876543210',
      };
      const creds = extractVobizCredentials(provider);
      expect(creds).toEqual({
        authId: 'auth123',
        authToken: 'token456',
        fromNumber: '+919876543210',
      });
    });

    it('falls back to apiKey/authToken', () => {
      const provider = {
        apiKey: 'key123',
        authToken: 'tok456',
        phoneNumber: '+1234567890',
      };
      const creds = extractVobizCredentials(provider);
      expect(creds).toEqual({
        authId: 'key123',
        authToken: 'tok456',
        fromNumber: '+1234567890',
      });
    });

    it('returns null when authId is missing', () => {
      const provider = { phoneNumber: '+123' };
      expect(extractVobizCredentials(provider)).toBeNull();
    });

    it('returns null when authToken is missing', () => {
      const provider = { sipUsername: 'u', phoneNumber: '+123' };
      expect(extractVobizCredentials(provider)).toBeNull();
    });

    it('returns null when phoneNumber is missing', () => {
      const provider = { sipUsername: 'u', sipPassword: 'p' };
      expect(extractVobizCredentials(provider)).toBeNull();
    });

    it('returns null for empty provider', () => {
      expect(extractVobizCredentials({})).toBeNull();
    });
  });

  describe('initiateVobizCall', () => {
    const creds = {
      authId: 'auth123',
      authToken: 'token456',
      fromNumber: '+919876543210',
    };

    it('returns success on 200 response', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          request_uuid: 'call-uuid-123',
        }),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockResponse as unknown as Response,
      );

      const result = await initiateVobizCall(
        creds,
        '+1234567890',
        'https://example.com/answer',
      );

      expect(result.success).toBe(true);
      expect(result.callId).toBe('call-uuid-123');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://api.vobiz.ai/api/v1/Account/auth123/Call/',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-Auth-ID': 'auth123',
            'X-Auth-Token': 'token456',
          }),
        }),
      );
    });

    it('extracts call_uuid as fallback', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ call_uuid: 'alt-uuid' }),
      } as unknown as Response);

      const result = await initiateVobizCall(
        creds, '+123', 'https://x.com/a',
      );
      expect(result.callId).toBe('alt-uuid');
    });

    it('extracts id as final fallback', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ id: 'id-uuid' }),
      } as unknown as Response);

      const result = await initiateVobizCall(
        creds, '+123', 'https://x.com/a',
      );
      expect(result.callId).toBe('id-uuid');
    });

    it('returns error on non-ok response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: vi.fn().mockResolvedValue({ message: 'Bad auth' }),
      } as unknown as Response);

      const result = await initiateVobizCall(
        creds, '+123', 'https://x.com/a',
      );
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('Bad auth');
    });

    it('uses statusText when no message in body', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Server Error',
        json: vi.fn().mockResolvedValue({}),
      } as unknown as Response);

      const result = await initiateVobizCall(
        creds, '+123', 'https://x.com/a',
      );
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('Server Error');
    });

    it('extracts nested error.message from Vobiz response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: vi.fn().mockResolvedValue({
          error: { code: 401, message: 'Invalid authentication credentials' },
        }),
      } as unknown as Response);

      const result = await initiateVobizCall(
        creds, '+123', 'https://x.com/a',
      );
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('Invalid authentication credentials');
    });

    it('extracts string error field from response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: vi.fn().mockResolvedValue({ error: 'bad params' }),
      } as unknown as Response);

      const result = await initiateVobizCall(
        creds, '+123', 'https://x.com/a',
      );
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('bad params');
    });

    it('handles fetch exception', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(
        new Error('Network failure'),
      );

      const result = await initiateVobizCall(
        creds, '+123', 'https://x.com/a',
      );
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('Network failure');
    });

    it('handles non-Error exception', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue('string error');

      const result = await initiateVobizCall(
        creds, '+123', 'https://x.com/a',
      );
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('string error');
    });

    it('sends correct body payload', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({}),
      } as unknown as Response);

      await initiateVobizCall(
        creds,
        '+1987654321',
        'https://my.server.com/webhook',
      );

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.from).toBe('+919876543210');
      expect(body.to).toBe('+1987654321');
      expect(body.answer_url).toBe('https://my.server.com/webhook');
    });

    it('aborts fetch when timeout fires', async () => {
      // Mock fetch to simulate an AbortError (what happens when signal aborts)
      vi.spyOn(globalThis, 'fetch').mockImplementation(
        async () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          throw err;
        },
      );

      const result = await initiateVobizCall(
        creds, '+123', 'https://x.com/a',
      );
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('The operation was aborted');
    });

    it('passes abort signal to fetch', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({}),
      } as unknown as Response);

      await initiateVobizCall(creds, '+123', 'https://x.com/a');

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>)
        .mock.calls[0];
      expect(fetchCall[1].signal).toBeInstanceOf(AbortSignal);
    });
  });
});
