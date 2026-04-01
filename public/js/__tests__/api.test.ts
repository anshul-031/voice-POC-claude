/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api, checkApiHealth } from '../api.js';
import { UI_STRINGS } from '../constants/uiStrings.js';

describe('Frontend API Utils', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    document.body.innerHTML = `
      <div id="api-status" class="status-dot"></div>
      <div id="api-status-text">Disconnected</div>
    `;
  });

  describe('api()', () => {
    it('should fetch and return json on success', async () => {
      const mockResponse = { data: 'test' };
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as unknown as Response);

      const result = await api('/test');
      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/test'), expect.any(Object));
    });

    it('should throw error on invalid input', async () => {
      // @ts-expect-error test invalid param
      await expect(api(123)).rejects.toThrow(UI_STRINGS.api.errors.invalidInput);
    });

    it('should throw error on failed response', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'FAILED' }),
      } as unknown as Response);

      await expect(api('/fail')).rejects.toThrow('FAILED');
    });

    it('should throw generic error if json() fails on non-ok response', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        json: async () => { throw new Error('no json'); },
      } as unknown as Response);

      await expect(api('/fail')).rejects.toThrow(UI_STRINGS.api.errors.genericRequestFailed);
    });
  });

  describe('checkApiHealth()', () => {
    it('should update UI to connected on success', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'ok' }),
      } as unknown as Response);

      await checkApiHealth();
      
      const dot = document.getElementById('api-status');
      const text = document.getElementById('api-status-text');
      expect(dot?.className).toBe('status-dot connected');
      expect(text?.textContent).toBe(UI_STRINGS.header.apiStatus.connected);
    });

    it('should update UI to error on failure', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('fail'));

      await checkApiHealth();
      
      const dot = document.getElementById('api-status');
      const text = document.getElementById('api-status-text');
      expect(dot?.className).toBe('status-dot error');
      expect(text?.textContent).toBe(UI_STRINGS.header.apiStatus.disconnected);
    });

    it('should return if elements are missing', async () => {
      document.body.innerHTML = '';
      await checkApiHealth();
      // No crash means success
    });
  });
});
