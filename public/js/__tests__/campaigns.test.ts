/**
 * @vitest-environment jsdom
 */
/* eslint-disable max-lines */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api.js', () => ({
  api: vi.fn(),
}));

vi.mock('../utils.js', () => ({
  showToast: vi.fn(),
  escapeHtml: vi.fn((s) => s),
}));

import {
  loadCampaigns,
  showAddCampaignForm,
  hideCampaignForm,
  handleCampaignSubmit,
  handleFileChange,
  triggerCampaign,
  handleDownloadTemplate,
  initCampaignPanel,
  resetCampaignState,
} from '../campaigns.js';
import { api } from '../api.js';
import { showToast } from '../utils.js';

function setupDOM() {
  document.body.innerHTML = `
    <div id="campaign-list"></div>
    <div id="campaign-list-section"></div>
    <div id="campaign-form-container" class="hidden"></div>
    <h2 id="campaign-form-title"></h2>
    <span id="campaign-form-submit-text"></span>
    <form id="campaign-form"></form>
    <button id="btn-add-campaign"></button>
    <button id="btn-cancel-campaign"></button>
    <div id="campaign-file-group"></div>
    <input id="campaign-name" value="">
    <select id="campaign-agent"></select>
    <select id="campaign-provider"></select>
    <input id="campaign-file" type="file">
    <button id="btn-download-template"></button>
  `;
}

describe('campaigns.js', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDOM();
    resetCampaignState();
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
  });

  describe('loadCampaigns / render', () => {
    it('renders an empty state when there are no campaigns', async () => {
      vi.mocked(api).mockResolvedValue([]);
      await loadCampaigns();
      expect(document.getElementById('campaign-list')?.innerHTML).toContain('No campaigns yet');
    });

    it('renders campaign cards with actions', async () => {
      vi.mocked(api).mockResolvedValue([
        { id: 'c1', name: 'Camp One', status: 'draft', agent: { name: 'Agent A' }, _count: { contacts: 3 } },
      ]);
      await loadCampaigns();
      const html = document.getElementById('campaign-list')?.innerHTML || '';
      expect(html).toContain('Camp One');
      expect(html).toContain('Agent A');
      expect(html).toContain('3 contacts');
      expect(html).toContain('btn-trigger-campaign');
    });

    it('handles a load failure', async () => {
      vi.mocked(api).mockRejectedValue(new Error('fail'));
      await loadCampaigns();
      expect(showToast).toHaveBeenCalled();
      expect(document.getElementById('campaign-list')?.innerHTML).toContain('No campaigns yet');
    });

    it('renders cards with missing optional fields and unknown status', async () => {
      vi.mocked(api).mockResolvedValue([
        { id: 'c1', name: 'Solo', status: 'weird-status' },
      ]);
      await loadCampaigns();
      const html = document.getElementById('campaign-list')?.innerHTML || '';
      expect(html).toContain('Solo');
      expect(html).toContain('weird-status');
      expect(html).toContain('0 contacts');
    });

    it('returns early when the list element is missing', async () => {
      document.getElementById('campaign-list')?.remove();
      vi.mocked(api).mockResolvedValue([{ id: 'c1', name: 'X', status: 'draft', _count: { contacts: 0 } }]);
      await loadCampaigns();
      expect(true).toBe(true);
    });

    it('wires card buttons to trigger/edit/delete', async () => {
      vi.mocked(api).mockResolvedValue([
        { id: 'c1', name: 'Camp', status: 'draft', agent: { name: 'A' }, _count: { contacts: 1 } },
      ]);
      await loadCampaigns();

      // delete flow
      vi.mocked(api).mockResolvedValue({ message: 'ok' });
      const delBtn = document.querySelector('.btn-delete-campaign') as HTMLButtonElement;
      delBtn.click();
      await Promise.resolve();
      expect(confirm).toHaveBeenCalled();
    });

    it('cancels delete when not confirmed', async () => {
      vi.mocked(api).mockResolvedValue([
        { id: 'c1', name: 'Camp', status: 'draft', agent: { name: 'A' }, _count: { contacts: 1 } },
      ]);
      await loadCampaigns();
      vi.mocked(confirm).mockReturnValue(false);
      vi.clearAllMocks();
      (document.querySelector('.btn-delete-campaign') as HTMLButtonElement).click();
      await Promise.resolve();
      expect(api).not.toHaveBeenCalled();
    });

    it('shows an error when delete fails', async () => {
      vi.mocked(api).mockResolvedValue([
        { id: 'c1', name: 'Camp', status: 'draft', agent: { name: 'A' }, _count: { contacts: 1 } },
      ]);
      await loadCampaigns();
      vi.mocked(api).mockRejectedValue(new Error('del fail'));
      (document.querySelector('.btn-delete-campaign') as HTMLButtonElement).click();
      await Promise.resolve();
      await Promise.resolve();
      expect(showToast).toHaveBeenCalledWith('del fail', 'error');
    });

    it('opens the edit form from a card button', async () => {
      vi.mocked(api).mockResolvedValue([
        { id: 'c1', name: 'Camp', status: 'draft', agentId: 'a1', agent: { name: 'A' }, _count: { contacts: 1 } },
      ]);
      await loadCampaigns();
      (document.querySelector('.btn-edit-campaign') as HTMLButtonElement).click();
      await Promise.resolve();
      expect(document.getElementById('campaign-form-container')?.classList.contains('hidden')).toBe(false);
    });
  });

  describe('showAddCampaignForm', () => {
    it('opens the create form and loads options', async () => {
      vi.mocked(api).mockImplementation(async (path: string) => {
        if (path === '/agents') return [{ id: 'a1', name: 'Agent A' }];
        if (path === '/telephony') return [{ id: 'p1', name: 'Provider P' }];
        return [];
      });

      await showAddCampaignForm();

      expect(document.getElementById('campaign-form-container')?.classList.contains('hidden')).toBe(false);
      expect(document.getElementById('campaign-agent')?.innerHTML).toContain('Agent A');
      expect(document.getElementById('campaign-provider')?.innerHTML).toContain('Provider P');
      expect(document.getElementById('campaign-file-group')?.classList.contains('hidden')).toBe(false);
    });

    it('opens the edit form with populated values and hidden file input', async () => {
      vi.mocked(api).mockImplementation(async (path: string) => {
        if (path === '/campaigns') return [
          { id: 'c1', name: 'Camp', status: 'draft', agentId: 'a1', providerId: 'p1', agent: { name: 'A' }, _count: { contacts: 1 } },
        ];
        if (path === '/agents') return [{ id: 'a1', name: 'Agent A' }];
        if (path === '/telephony') return [{ id: 'p1', name: 'Provider P' }];
        return [];
      });
      await loadCampaigns();

      await showAddCampaignForm('c1');
      expect((document.getElementById('campaign-name') as HTMLInputElement).value).toBe('Camp');
      expect((document.getElementById('campaign-agent') as HTMLSelectElement).value).toBe('a1');
      expect(document.getElementById('campaign-file-group')?.classList.contains('hidden')).toBe(true);
    });

    it('opens the edit form even when the campaign is not cached', async () => {
      vi.mocked(api).mockResolvedValue([{ id: 'a1', name: 'A' }]);
      await showAddCampaignForm('missing-id');
      expect(document.getElementById('campaign-form-title')?.textContent).toBe('Edit Campaign');
      // Name stays blank because the campaign was not found in the cache.
      expect((document.getElementById('campaign-name') as HTMLInputElement).value).toBe('');
    });

    it('handles a form-options load failure', async () => {
      vi.mocked(api).mockRejectedValue(new Error('fail'));
      await showAddCampaignForm();
      expect(showToast).toHaveBeenCalled();
    });

    it('returns early when form containers are missing', async () => {
      document.body.innerHTML = '';
      await showAddCampaignForm();
      expect(api).not.toHaveBeenCalled();
    });
  });

  describe('handleFileChange', () => {
    it('stores the selected file as base64', async () => {
      const file = new File([new Uint8Array([104, 105])], 'contacts.xlsx');
      const input = document.getElementById('campaign-file') as HTMLInputElement;
      Object.defineProperty(input, 'files', { value: [file], configurable: true });

      await handleFileChange({ target: input } as unknown as Event);

      // Submit a create form to confirm the base64 was captured.
      vi.mocked(api).mockResolvedValue({});
      (document.getElementById('campaign-name') as HTMLInputElement).value = 'Camp';
      const agent = document.getElementById('campaign-agent') as HTMLSelectElement;
      agent.innerHTML = '<option value="a1">A</option>';
      agent.value = 'a1';

      await handleCampaignSubmit({ preventDefault: vi.fn() } as unknown as Event);
      const createCall = vi.mocked(api).mock.calls.find(
        (c) => c[0] === '/campaigns' && (c[1] as any)?.method === 'POST',
      );
      const body = JSON.parse((createCall?.[1] as any)?.body as string);
      expect(body.fileBase64.length).toBeGreaterThan(0);
    });

    it('clears state when no file is chosen', async () => {
      const input = document.getElementById('campaign-file') as HTMLInputElement;
      Object.defineProperty(input, 'files', { value: [], configurable: true });
      await handleFileChange({ target: input } as unknown as Event);
      // No throw = pass
      expect(true).toBe(true);
    });
  });

  describe('handleCampaignSubmit', () => {
    it('rejects an invalid create form', async () => {
      await handleCampaignSubmit({ preventDefault: vi.fn() } as unknown as Event);
      expect(showToast).toHaveBeenCalled();
      expect(api).not.toHaveBeenCalled();
    });

    it('creates a campaign on valid submit', async () => {
      // capture a file first
      const file = new File([new Uint8Array([1, 2, 3])], 'c.xlsx');
      const input = document.getElementById('campaign-file') as HTMLInputElement;
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      await handleFileChange({ target: input } as unknown as Event);

      (document.getElementById('campaign-name') as HTMLInputElement).value = 'Camp';
      const agent = document.getElementById('campaign-agent') as HTMLSelectElement;
      agent.innerHTML = '<option value="a1">A</option>';
      agent.value = 'a1';
      const provider = document.getElementById('campaign-provider') as HTMLSelectElement;
      provider.innerHTML = '<option value="p1">P</option>';
      provider.value = 'p1';

      vi.mocked(api).mockResolvedValue({ id: 'c1' });
      await handleCampaignSubmit({ preventDefault: vi.fn() } as unknown as Event);
      expect(api).toHaveBeenCalledWith('/campaigns', expect.objectContaining({ method: 'POST' }));
      expect(showToast).toHaveBeenCalled();
    });

    it('shows an error when create fails', async () => {
      const file = new File([new Uint8Array([1])], 'c.xlsx');
      const input = document.getElementById('campaign-file') as HTMLInputElement;
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      await handleFileChange({ target: input } as unknown as Event);
      (document.getElementById('campaign-name') as HTMLInputElement).value = 'Camp';
      const agent = document.getElementById('campaign-agent') as HTMLSelectElement;
      agent.innerHTML = '<option value="a1">A</option>';
      agent.value = 'a1';

      vi.mocked(api).mockRejectedValue(new Error('server error'));
      await handleCampaignSubmit({ preventDefault: vi.fn() } as unknown as Event);
      expect(showToast).toHaveBeenCalledWith('server error', 'error');
    });

    it('updates a campaign in edit mode', async () => {
      vi.mocked(api).mockImplementation(async (path: string) => {
        if (path === '/campaigns') return [
          { id: 'c1', name: 'Camp', status: 'draft', agentId: 'a1', providerId: null, agent: { name: 'A' }, _count: { contacts: 1 } },
        ];
        return [{ id: 'a1', name: 'A' }];
      });
      await loadCampaigns();
      await showAddCampaignForm('c1');

      vi.mocked(api).mockResolvedValue({ id: 'c1' });
      await handleCampaignSubmit({ preventDefault: vi.fn() } as unknown as Event);
      expect(api).toHaveBeenCalledWith('/campaigns/c1', expect.objectContaining({ method: 'PUT' }));
    });

    it('rejects an edit form missing name/agent', async () => {
      vi.mocked(api).mockImplementation(async (path: string) => {
        if (path === '/campaigns') return [
          { id: 'c1', name: 'Camp', status: 'draft', agentId: 'a1', providerId: null, agent: { name: 'A' }, _count: { contacts: 1 } },
        ];
        return [{ id: 'a1', name: 'A' }];
      });
      await loadCampaigns();
      await showAddCampaignForm('c1');
      (document.getElementById('campaign-name') as HTMLInputElement).value = '';
      (document.getElementById('campaign-agent') as HTMLSelectElement).value = '';

      vi.clearAllMocks();
      await handleCampaignSubmit({ preventDefault: vi.fn() } as unknown as Event);
      expect(showToast).toHaveBeenCalled();
      expect(api).not.toHaveBeenCalled();
    });
  });

  describe('triggerCampaign', () => {
    it('triggers a campaign and reports initiated count', async () => {
      vi.mocked(api).mockResolvedValue({ status: 'completed', initiated: 5 });
      await triggerCampaign('c1');
      expect(api).toHaveBeenCalledWith('/campaigns/c1/trigger', { method: 'POST' });
      expect(showToast).toHaveBeenCalled();
    });

    it('defaults the initiated count to zero when absent', async () => {
      vi.mocked(api).mockResolvedValue({ status: 'completed' });
      await triggerCampaign('c1');
      expect(showToast).toHaveBeenCalled();
    });

    it('aborts when the user cancels', async () => {
      vi.mocked(confirm).mockReturnValue(false);
      await triggerCampaign('c1');
      expect(api).not.toHaveBeenCalled();
    });

    it('shows an error when trigger fails', async () => {
      vi.mocked(api).mockRejectedValue(new Error('trigger fail'));
      await triggerCampaign('c1');
      expect(showToast).toHaveBeenCalledWith('trigger fail', 'error');
    });
  });

  describe('handleDownloadTemplate', () => {
    it('warns when no agent is selected', () => {
      const agent = document.getElementById('campaign-agent') as HTMLSelectElement;
      agent.innerHTML = '<option value=""></option>';
      agent.value = '';
      handleDownloadTemplate();
      expect(showToast).toHaveBeenCalled();
    });

    it('triggers a download for the selected agent', () => {
      const agent = document.getElementById('campaign-agent') as HTMLSelectElement;
      agent.innerHTML = '<option value="a1">A</option>';
      agent.value = 'a1';

      const anchor = document.createElement('a');
      const clickSpy = vi.spyOn(anchor, 'click').mockImplementation(() => {});
      const createSpy = vi.spyOn(document, 'createElement').mockReturnValue(anchor);

      handleDownloadTemplate();

      expect(anchor.getAttribute('href')).toBe('/api/campaigns/template/a1');
      expect(anchor.getAttribute('download')).toBe('campaign-template.xlsx');
      expect(clickSpy).toHaveBeenCalled();

      createSpy.mockRestore();
    });

    it('is wired to the download button via initCampaignPanel', () => {
      const agent = document.getElementById('campaign-agent') as HTMLSelectElement;
      agent.innerHTML = '<option value="a1">A</option>';
      agent.value = 'a1';
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      initCampaignPanel();
      document.getElementById('btn-download-template')?.click();

      expect(clickSpy).toHaveBeenCalled();
      clickSpy.mockRestore();
    });
  });

  describe('hideCampaignForm / initCampaignPanel', () => {
    it('hides the form', () => {
      hideCampaignForm();
      expect(document.getElementById('campaign-form-container')?.classList.contains('hidden')).toBe(true);
    });

    it('wires up panel buttons', () => {
      vi.mocked(api).mockResolvedValue([]);
      initCampaignPanel();
      document.getElementById('btn-add-campaign')?.click();
      document.getElementById('btn-cancel-campaign')?.click();
      expect(document.getElementById('campaign-form-container')?.classList.contains('hidden')).toBe(true);
    });
  });

  describe('branch coverage edge cases', () => {
    it('ignores card button clicks when the id is empty', async () => {
      vi.mocked(api).mockResolvedValue([
        { id: '', name: 'NoId', status: 'draft', agent: { name: 'A' }, _count: { contacts: 2 } },
      ]);
      await loadCampaigns();
      vi.clearAllMocks();

      (document.querySelector('.btn-trigger-campaign') as HTMLButtonElement).click();
      (document.querySelector('.btn-edit-campaign') as HTMLButtonElement).click();
      (document.querySelector('.btn-delete-campaign') as HTMLButtonElement).click();
      await Promise.resolve();
      expect(api).not.toHaveBeenCalled();
    });

    it('tolerates missing optional form elements in create mode', async () => {
      document.body.innerHTML = `
        <div id="campaign-list-section"></div>
        <div id="campaign-form-container" class="hidden"></div>
      `;
      vi.mocked(api).mockResolvedValue([]);
      await showAddCampaignForm();
      expect(document.getElementById('campaign-form-container')?.classList.contains('hidden')).toBe(false);
    });

    it('tolerates missing optional form elements in edit mode', async () => {
      vi.mocked(api).mockResolvedValue([
        { id: 'c1', name: 'Camp', status: 'draft', agentId: 'a1', providerId: null, agent: { name: 'A' }, _count: { contacts: 1 } },
      ]);
      await loadCampaigns();

      document.body.innerHTML = `
        <div id="campaign-list-section"></div>
        <div id="campaign-form-container" class="hidden"></div>
      `;
      vi.mocked(api).mockResolvedValue([]);
      await showAddCampaignForm('c1');
      expect(document.getElementById('campaign-form-container')?.classList.contains('hidden')).toBe(false);
    });

    it('shows a string error when an update rejects with a non-Error', async () => {
      vi.mocked(api).mockImplementation(async (path: string) => {
        if (path === '/campaigns') return [
          { id: 'c1', name: 'Camp', status: 'draft', agentId: 'a1', providerId: null, agent: { name: 'A' }, _count: { contacts: 1 } },
        ];
        return [{ id: 'a1', name: 'A' }];
      });
      await loadCampaigns();
      await showAddCampaignForm('c1');

      vi.mocked(api).mockRejectedValue('raw string failure');
      await handleCampaignSubmit({ preventDefault: vi.fn() } as unknown as Event);
      expect(showToast).toHaveBeenCalledWith('raw string failure', 'error');
    });

    it('handles non-Error rejection from trigger', async () => {
      vi.mocked(api).mockRejectedValue('trigger raw');
      await triggerCampaign('c1');
      expect(showToast).toHaveBeenCalledWith('trigger raw', 'error');
    });

    it('handles non-Error rejection from delete', async () => {
      vi.mocked(api).mockResolvedValue([
        { id: 'c1', name: 'C', status: 'draft', agent: { name: 'A' }, _count: { contacts: 1 } },
      ]);
      await loadCampaigns();
      vi.mocked(api).mockRejectedValue('del raw');
      (document.querySelector('.btn-delete-campaign') as HTMLButtonElement).click();
      await Promise.resolve();
      await Promise.resolve();
      expect(showToast).toHaveBeenCalledWith('del raw', 'error');
    });

    it('hideCampaignForm tolerates missing containers', () => {
      document.body.innerHTML = '';
      hideCampaignForm();
      expect(document.getElementById('campaign-form-container')).toBeNull();
    });

    it('treats missing inputs as empty on create submit', async () => {
      document.body.innerHTML = '';
      await handleCampaignSubmit({ preventDefault: vi.fn() } as unknown as Event);
      expect(showToast).toHaveBeenCalled();
    });
  });
});
