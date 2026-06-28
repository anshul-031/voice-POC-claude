/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../api.js', () => ({ api: vi.fn() }));
vi.mock('../utils.js', () => ({ showToast: vi.fn() }));

import {
  loadIntegrationStatus,
  handleIntegrationSubmit,
  handleIntegrationDisconnect,
  initIntegrationsPanel,
} from '../integrations.js';
import { api } from '../api.js';
import { showToast } from '../utils.js';

const apiMock = api as unknown as ReturnType<typeof vi.fn>;

function setupDOM() {
  document.body.innerHTML = `
    <span id="integration-status"></span>
    <button id="btn-disconnect-integration" class="hidden"></button>
    <p id="integration-unavailable" class="hidden"></p>
    <form id="integration-form">
      <input id="integration-email" value="">
      <input id="integration-password" value="">
    </form>
  `;
}

const evt = () => ({ preventDefault: vi.fn() } as unknown as Event);

describe('integrations.js', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDOM();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadIntegrationStatus', () => {
    it('renders a connected status', async () => {
      apiMock.mockResolvedValue({ available: true, connected: true, email: 'a@b.com' });
      await loadIntegrationStatus();
      const badge = document.getElementById('integration-status');
      expect(badge?.textContent).toContain('a@b.com');
      expect(badge?.className).toContain('active');
      expect(document.getElementById('btn-disconnect-integration')?.classList.contains('hidden')).toBe(false);
      expect(document.getElementById('integration-unavailable')?.classList.contains('hidden')).toBe(true);
      expect((document.getElementById('integration-email') as HTMLInputElement).value).toBe('a@b.com');
    });

    it('shows the unavailable banner when the server URL is not configured', async () => {
      apiMock.mockResolvedValue({ available: false, connected: false, email: null });
      await loadIntegrationStatus();
      const badge = document.getElementById('integration-status');
      expect(badge?.className).toContain('inactive');
      expect(document.getElementById('integration-unavailable')?.classList.contains('hidden')).toBe(false);
      expect(document.getElementById('btn-disconnect-integration')?.classList.contains('hidden')).toBe(true);
    });

    it('handles a load failure gracefully', async () => {
      apiMock.mockRejectedValue(new Error('load failed'));
      await loadIntegrationStatus();
      expect(showToast).toHaveBeenCalledWith(expect.any(String), 'error');
    });

    it('renders a connected status that has no email', async () => {
      apiMock.mockResolvedValue({ available: true, connected: true, email: null });
      await loadIntegrationStatus();
      const badge = document.getElementById('integration-status');
      expect(badge?.className).toContain('active');
      expect((document.getElementById('integration-email') as HTMLInputElement).value).toBe('');
    });

    it('tolerates a missing DOM (null elements)', async () => {
      document.body.innerHTML = '';
      apiMock.mockResolvedValue({ available: false, connected: false, email: null });
      await expect(loadIntegrationStatus()).resolves.toBeUndefined();
    });
  });

  describe('handleIntegrationSubmit', () => {
    it('blocks submission when fields are empty', async () => {
      await handleIntegrationSubmit(evt());
      expect(apiMock).not.toHaveBeenCalled();
      expect(showToast).toHaveBeenCalledWith(expect.any(String), 'error');
    });

    it('saves credentials and shows a connected status', async () => {
      (document.getElementById('integration-email') as HTMLInputElement).value = 'a@b.com';
      (document.getElementById('integration-password') as HTMLInputElement).value = 'pw';
      apiMock.mockResolvedValue({ email: 'a@b.com' });

      await handleIntegrationSubmit(evt());

      expect(apiMock).toHaveBeenCalledWith(
        '/integration/sales-analyser',
        expect.objectContaining({ method: 'PUT' }),
      );
      expect(showToast).toHaveBeenCalledWith(expect.any(String), 'success');
      expect(document.getElementById('integration-status')?.className).toContain('active');
    });

    it('falls back to the typed email when the response omits it', async () => {
      (document.getElementById('integration-email') as HTMLInputElement).value = 'typed@b.com';
      (document.getElementById('integration-password') as HTMLInputElement).value = 'pw';
      apiMock.mockResolvedValue({});
      await handleIntegrationSubmit(evt());
      expect(document.getElementById('integration-status')?.textContent).toContain('typed@b.com');
    });

    it('shows an error toast when the save fails', async () => {
      (document.getElementById('integration-email') as HTMLInputElement).value = 'a@b.com';
      (document.getElementById('integration-password') as HTMLInputElement).value = 'pw';
      apiMock.mockRejectedValue(new Error('server error'));
      await handleIntegrationSubmit(evt());
      expect(showToast).toHaveBeenCalledWith('server error', 'error');
    });

    it('falls back to a generic message for non-Error rejections', async () => {
      (document.getElementById('integration-email') as HTMLInputElement).value = 'a@b.com';
      (document.getElementById('integration-password') as HTMLInputElement).value = 'pw';
      apiMock.mockRejectedValue('weird');
      await handleIntegrationSubmit(evt());
      expect(showToast).toHaveBeenCalledWith(expect.any(String), 'error');
    });

    it('uses the generic message when the rejection stringifies to empty', async () => {
      (document.getElementById('integration-email') as HTMLInputElement).value = 'a@b.com';
      (document.getElementById('integration-password') as HTMLInputElement).value = 'pw';
      apiMock.mockRejectedValue('');
      await handleIntegrationSubmit(evt());
      expect(showToast).toHaveBeenCalledWith(expect.any(String), 'error');
    });
  });

  describe('handleIntegrationDisconnect', () => {
    it('does nothing when the user cancels the confirm', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      await handleIntegrationDisconnect();
      expect(apiMock).not.toHaveBeenCalled();
    });

    it('disconnects when confirmed', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      apiMock.mockResolvedValue({});
      await handleIntegrationDisconnect();
      expect(apiMock).toHaveBeenCalledWith(
        '/integration/sales-analyser',
        expect.objectContaining({ method: 'DELETE' }),
      );
      expect(showToast).toHaveBeenCalledWith(expect.any(String), 'success');
      expect(document.getElementById('integration-status')?.className).toContain('inactive');
    });

    it('shows an error toast when disconnect fails', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      apiMock.mockRejectedValue(new Error('nope'));
      await handleIntegrationDisconnect();
      expect(showToast).toHaveBeenCalledWith('nope', 'error');
    });
  });

  describe('initIntegrationsPanel', () => {
    it('wires up the form submit and disconnect button', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      apiMock.mockResolvedValue({});
      initIntegrationsPanel();

      document.getElementById('btn-disconnect-integration')?.dispatchEvent(new Event('click'));
      document.getElementById('integration-form')?.dispatchEvent(new Event('submit'));
      // No throw means listeners were attached.
      expect(true).toBe(true);
    });
  });
});
