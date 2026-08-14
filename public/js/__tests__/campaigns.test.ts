/**
 * @vitest-environment jsdom
 */
/* eslint-disable max-lines */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
  showScheduleForm,
  hideScheduleForm,
  handleScheduleSubmit,
  pauseCampaign,
  resumeCampaign,
  retriggerCampaign,
  retryFailedCampaign,
  viewCampaignStatus,
  hideStatusView,
  computeStartPreset,
  computeWindowPreset,
  updateScheduleSummary,
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
    <div id="campaign-schedule-container" class="hidden"></div>
    <form id="campaign-schedule-form"></form>
    <input id="campaign-scheduled-at" value="">
    <input id="campaign-window-start" value="">
    <input id="campaign-window-end" value="">
    <select id="campaign-timezone"></select>
    <button id="btn-cancel-schedule"></button>
    <div id="campaign-schedule-summary"></div>
    <button data-start-preset="1h"></button>
    <button data-start-preset="now"></button>
    <button data-start-preset=""></button>
    <button data-window-preset="business"></button>
    <button data-window-preset="anytime"></button>
    <button data-window-preset=""></button>
    <div id="campaign-status-container" class="hidden"></div>
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

  describe('status-aware card actions', () => {
    async function renderWithStatus(status: string, extra: Record<string, unknown> = {}) {
      vi.mocked(api).mockResolvedValue([
        { id: 'c1', name: 'Camp', status, agent: { name: 'A' }, _count: { contacts: 2 }, ...extra },
      ]);
      await loadCampaigns();
      return document.getElementById('campaign-list')?.innerHTML || '';
    }

    it('shows trigger + schedule for draft', async () => {
      const html = await renderWithStatus('draft');
      expect(html).toContain('btn-trigger-campaign');
      expect(html).toContain('btn-schedule-campaign');
    });

    it('shows re-trigger + schedule for completed/failed', async () => {
      expect(await renderWithStatus('completed')).toContain('btn-retrigger-campaign');
      const failedHtml = await renderWithStatus('failed');
      expect(failedHtml).toContain('btn-retrigger-campaign');
      expect(failedHtml).toContain('btn-schedule-campaign');
    });

    it('shows pause for scheduled/running', async () => {
      expect(await renderWithStatus('scheduled')).toContain('btn-pause-campaign');
      expect(await renderWithStatus('running')).toContain('btn-pause-campaign');
    });

    it('shows resume for paused', async () => {
      expect(await renderWithStatus('paused')).toContain('btn-resume-campaign');
    });

    it('always shows a view-status button', async () => {
      expect(await renderWithStatus('running')).toContain('btn-view-campaign');
    });

    it('renders schedule metadata when present', async () => {
      const html = await renderWithStatus('scheduled', {
        scheduledAt: '2026-07-07T10:00:00.000Z',
        windowStart: '09:00',
        windowEnd: '18:00',
      });
      expect(html).toContain('campaign-schedule-meta');
      expect(html).toContain('09:00');
    });
  });

  describe('showScheduleForm / handleScheduleSubmit', () => {
    beforeEach(async () => {
      vi.mocked(api).mockResolvedValue([
        {
          id: 'c1', name: 'Camp', status: 'draft', agent: { name: 'A' }, _count: { contacts: 1 },
          scheduledAt: '2026-07-07T10:00:00.000Z', windowStart: '09:00', windowEnd: '18:00',
          timezone: 'Asia/Kolkata',
        },
      ]);
      await loadCampaigns();
      vi.clearAllMocks();
    });

    it('opens the schedule form pre-filled and hides it again', () => {
      showScheduleForm('c1');
      expect(document.getElementById('campaign-schedule-container')?.classList.contains('hidden')).toBe(false);
      expect((document.getElementById('campaign-window-start') as HTMLInputElement).value).toBe('09:00');
      hideScheduleForm();
      expect(document.getElementById('campaign-schedule-container')?.classList.contains('hidden')).toBe(true);
    });

    it('reopens the form in the campaign timezone and shows the original wall clock', () => {
      showScheduleForm('c1');
      // Asia/Kolkata is absent from Intl.supportedValuesOf (which canonicalises
      // it to Asia/Calcutta), so the stored zone has to be injected into the
      // option list rather than silently dropped.
      expect((document.getElementById('campaign-timezone') as HTMLSelectElement).value)
        .toBe('Asia/Kolkata');
      // 10:00 UTC is 15:30 IST — the form must show what an IST user typed.
      expect((document.getElementById('campaign-scheduled-at') as HTMLInputElement).value)
        .toBe('2026-07-07T15:30');
    });

    it('sends the picked wall clock plus an explicit timezone, not a browser-local instant', async () => {
      showScheduleForm('c1');
      (document.getElementById('campaign-timezone') as HTMLSelectElement).value = 'Asia/Kolkata';
      (document.getElementById('campaign-scheduled-at') as HTMLInputElement).value = '2026-07-07T18:00';
      (document.getElementById('campaign-window-start') as HTMLInputElement).value = '18:00';
      (document.getElementById('campaign-window-end') as HTMLInputElement).value = '21:00';
      vi.mocked(api).mockResolvedValue({ id: 'c1', status: 'scheduled' });

      await handleScheduleSubmit({ preventDefault: vi.fn() } as unknown as Event);

      const [, options] = vi.mocked(api).mock.calls[0];
      expect(JSON.parse(String((options as RequestInit).body))).toEqual({
        scheduledAtLocal: '2026-07-07T18:00',
        timezone: 'Asia/Kolkata',
        windowStart: '18:00',
        windowEnd: '21:00',
      });
    });

    it('omits the timezone when nothing time-bound was chosen', async () => {
      showScheduleForm('c1');
      (document.getElementById('campaign-scheduled-at') as HTMLInputElement).value = '';
      (document.getElementById('campaign-window-start') as HTMLInputElement).value = '';
      (document.getElementById('campaign-window-end') as HTMLInputElement).value = '';
      vi.mocked(api).mockResolvedValue({ id: 'c1', status: 'scheduled' });

      await handleScheduleSubmit({ preventDefault: vi.fn() } as unknown as Event);

      const [, options] = vi.mocked(api).mock.calls[0];
      expect(JSON.parse(String((options as RequestInit).body))).toEqual({
        scheduledAtLocal: null,
        timezone: null,
        windowStart: null,
        windowEnd: null,
      });
    });

    it('returns early when the container is missing', () => {
      document.getElementById('campaign-schedule-container')?.remove();
      showScheduleForm('c1');
      expect(true).toBe(true);
    });

    it('submits a valid schedule', async () => {
      showScheduleForm('c1');
      (document.getElementById('campaign-scheduled-at') as HTMLInputElement).value = '2026-07-07T10:00';
      vi.mocked(api).mockResolvedValue({ id: 'c1', status: 'scheduled' });
      await handleScheduleSubmit({ preventDefault: vi.fn() } as unknown as Event);
      expect(api).toHaveBeenCalledWith('/campaigns/c1/schedule', expect.objectContaining({ method: 'POST' }));
      expect(showToast).toHaveBeenCalledWith('Campaign scheduled', 'success');
    });

    it('rejects an invalid schedule (mismatched window)', async () => {
      showScheduleForm('c1');
      (document.getElementById('campaign-scheduled-at') as HTMLInputElement).value = '';
      (document.getElementById('campaign-window-start') as HTMLInputElement).value = '09:00';
      (document.getElementById('campaign-window-end') as HTMLInputElement).value = '';
      await handleScheduleSubmit({ preventDefault: vi.fn() } as unknown as Event);
      expect(showToast).toHaveBeenCalledWith('Provide a valid start time and matching call-window times', 'error');
      expect(api).not.toHaveBeenCalled();
    });

    it('does nothing when no campaign is being scheduled', async () => {
      hideScheduleForm();
      await handleScheduleSubmit({ preventDefault: vi.fn() } as unknown as Event);
      expect(api).not.toHaveBeenCalled();
    });

    it('shows an error when the schedule request fails', async () => {
      showScheduleForm('c1');
      vi.mocked(api).mockRejectedValue(new Error('sched fail'));
      await handleScheduleSubmit({ preventDefault: vi.fn() } as unknown as Event);
      expect(showToast).toHaveBeenCalledWith('sched fail', 'error');
    });

    it('is wired via initCampaignPanel', () => {
      initCampaignPanel();
      document.getElementById('btn-cancel-schedule')?.click();
      expect(document.getElementById('campaign-schedule-container')?.classList.contains('hidden')).toBe(true);
    });
  });

  describe('pauseCampaign / resumeCampaign', () => {
    it('pauses a campaign when confirmed', async () => {
      vi.mocked(api).mockResolvedValue({ id: 'c1', status: 'paused' });
      await pauseCampaign('c1');
      expect(api).toHaveBeenCalledWith('/campaigns/c1/pause', { method: 'POST' });
      expect(showToast).toHaveBeenCalledWith('Campaign paused', 'success');
    });

    it('aborts pause when not confirmed', async () => {
      vi.mocked(confirm).mockReturnValue(false);
      await pauseCampaign('c1');
      expect(api).not.toHaveBeenCalled();
    });

    it('shows an error when pause fails', async () => {
      vi.mocked(api).mockRejectedValue('pause raw');
      await pauseCampaign('c1');
      expect(showToast).toHaveBeenCalledWith('pause raw', 'error');
    });

    it('resumes a campaign', async () => {
      vi.mocked(api).mockResolvedValue({ id: 'c1', status: 'running' });
      await resumeCampaign('c1');
      expect(api).toHaveBeenCalledWith('/campaigns/c1/resume', { method: 'POST' });
      expect(showToast).toHaveBeenCalledWith('Campaign resumed', 'success');
    });

    it('shows an error when resume fails', async () => {
      vi.mocked(api).mockRejectedValue(new Error('resume fail'));
      await resumeCampaign('c1');
      expect(showToast).toHaveBeenCalledWith('resume fail', 'error');
    });
  });

  describe('retriggerCampaign', () => {
    it('re-triggers a campaign when confirmed', async () => {
      vi.mocked(api).mockResolvedValue({ status: 'completed', initiated: 3 });
      await retriggerCampaign('c1');
      expect(api).toHaveBeenCalledWith('/campaigns/c1/retrigger', { method: 'POST' });
      expect(showToast).toHaveBeenCalled();
    });

    it('aborts when not confirmed', async () => {
      vi.mocked(confirm).mockReturnValue(false);
      await retriggerCampaign('c1');
      expect(api).not.toHaveBeenCalled();
    });

    it('defaults the initiated count to zero when absent', async () => {
      vi.mocked(api).mockResolvedValue({ status: 'completed' });
      await retriggerCampaign('c1');
      expect(showToast).toHaveBeenCalled();
    });

    it('shows an error when re-trigger fails', async () => {
      vi.mocked(api).mockRejectedValue(new Error('retrigger fail'));
      await retriggerCampaign('c1');
      expect(showToast).toHaveBeenCalledWith('retrigger fail', 'error');
    });

    it('is triggered from the completed campaign card', async () => {
      vi.mocked(api).mockResolvedValue([
        { id: 'c1', name: 'Camp', status: 'completed', agent: { name: 'A' }, _count: { contacts: 1 } },
      ]);
      await loadCampaigns();
      vi.mocked(api).mockResolvedValue({ status: 'completed', initiated: 1 });
      (document.querySelector('.btn-retrigger-campaign') as HTMLButtonElement).click();
      await Promise.resolve();
      expect(api).toHaveBeenCalledWith('/campaigns/c1/retrigger', { method: 'POST' });
    });
  });

  describe('viewCampaignStatus', () => {
    it('renders per-number status, summary, progress and closes the view', async () => {
      vi.mocked(api).mockResolvedValue({
        id: 'c1', name: 'Camp',
        contacts: [
          { phoneNumber: '+111', status: 'completed', errorMessage: null },
          { phoneNumber: '+222', status: 'failed', errorMessage: 'busy' },
          { phoneNumber: '+333', status: 'pending', errorMessage: null },
          { phoneNumber: '+444', status: 'calling', errorMessage: null },
        ],
      });
      await viewCampaignStatus('c1');
      const container = document.getElementById('campaign-status-container');
      expect(container?.classList.contains('hidden')).toBe(false);
      expect(container?.innerHTML).toContain('+111');
      expect(container?.innerHTML).toContain('busy');
      expect(container?.innerHTML).toContain('campaign-status-summary');
      expect(container?.innerHTML).toContain('campaign-progress-bar');
      expect(container?.innerHTML).toContain('50%');

      (document.getElementById('btn-close-campaign-status') as HTMLButtonElement).click();
      expect(container?.classList.contains('hidden')).toBe(true);
    });

    it('refreshes and re-triggers from the status view', async () => {
      vi.mocked(api).mockResolvedValue({ id: 'c1', name: 'Camp', contacts: [] });
      await viewCampaignStatus('c1');

      vi.clearAllMocks();
      vi.mocked(api).mockResolvedValue({ id: 'c1', name: 'Camp', contacts: [] });
      (document.getElementById('btn-refresh-campaign-status') as HTMLButtonElement).click();
      await Promise.resolve();
      expect(api).toHaveBeenCalledWith('/campaigns/c1');

      vi.mocked(api).mockResolvedValue({ status: 'completed', initiated: 0 });
      (document.getElementById('btn-retrigger-campaign-status') as HTMLButtonElement).click();
      await Promise.resolve();
      expect(api).toHaveBeenCalledWith('/campaigns/c1/retrigger', { method: 'POST' });
    });

    it('renders an empty state when there are no contacts', async () => {
      vi.mocked(api).mockResolvedValue({ id: 'c1', name: 'Camp', contacts: [] });
      await viewCampaignStatus('c1');
      expect(document.getElementById('campaign-status-container')?.innerHTML).toContain('No contacts');
    });

    it('returns early when the container is missing', async () => {
      document.getElementById('campaign-status-container')?.remove();
      await viewCampaignStatus('c1');
      expect(api).not.toHaveBeenCalled();
    });

    it('shows an error when the status request fails', async () => {
      vi.mocked(api).mockRejectedValue(new Error('status fail'));
      await viewCampaignStatus('c1');
      expect(showToast).toHaveBeenCalledWith('status fail', 'error');
    });

    it('is triggered from the card view button', async () => {
      vi.mocked(api).mockResolvedValue([
        { id: 'c1', name: 'Camp', status: 'running', agent: { name: 'A' }, _count: { contacts: 1 } },
      ]);
      await loadCampaigns();
      vi.mocked(api).mockResolvedValue({ id: 'c1', name: 'Camp', contacts: [] });
      (document.querySelector('.btn-view-campaign') as HTMLButtonElement).click();
      await Promise.resolve();
      expect(api).toHaveBeenCalledWith('/campaigns/c1');
    });

    it('hideStatusView tolerates missing containers', () => {
      document.body.innerHTML = '';
      hideStatusView();
      expect(document.getElementById('campaign-status-container')).toBeNull();
    });

    it('reports how many of the campaign numbers are on screen', async () => {
      vi.mocked(api).mockResolvedValue({
        id: 'c1',
        name: 'Camp',
        _count: { contacts: 2 },
        contacts: [
          { phoneNumber: '+111', status: 'completed' },
          { phoneNumber: '+222', status: 'failed', errorMessage: 'Number was busy' },
        ],
      });
      await viewCampaignStatus('c1');
      const html = document.getElementById('campaign-status-container')?.innerHTML || '';
      expect(html).toContain('Showing all 2 of 2 numbers');
      expect(html).toContain('Number was busy');
    });

    it('disables the retry action when nothing has failed', async () => {
      vi.mocked(api).mockResolvedValue({
        id: 'c1', name: 'Camp', contacts: [{ phoneNumber: '+111', status: 'completed' }],
      });
      await viewCampaignStatus('c1');
      const btn = document.getElementById('btn-retry-failed-campaign-status') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('retries the failed numbers from the status view', async () => {
      vi.mocked(api).mockResolvedValue({
        id: 'c1',
        name: 'Camp',
        contacts: [{ phoneNumber: '+222', status: 'failed', errorMessage: 'No answer' }],
      });
      await viewCampaignStatus('c1');
      const btn = document.getElementById('btn-retry-failed-campaign-status') as HTMLButtonElement;
      expect(btn.disabled).toBe(false);

      vi.clearAllMocks();
      vi.mocked(api).mockResolvedValue({ status: 'running', initiated: 1, queued: 0 });
      btn.click();
      await Promise.resolve();
      expect(api).toHaveBeenCalledWith('/campaigns/c1/retry-failed', { method: 'POST' });
    });
  });

  describe('live status refresh', () => {
    beforeEach(() => { vi.useFakeTimers(); });

    afterEach(() => {
      hideStatusView();
      vi.useRealTimers();
    });

    it('re-fetches while numbers are still being called', async () => {
      vi.mocked(api).mockResolvedValue({
        id: 'c1', name: 'Camp', contacts: [{ phoneNumber: '+111', status: 'calling' }],
      });
      await viewCampaignStatus('c1');
      expect(document.getElementById('campaign-status-container')?.innerHTML)
        .toContain('campaign-status-live');

      vi.clearAllMocks();
      vi.mocked(api).mockResolvedValue({
        id: 'c1', name: 'Camp', contacts: [{ phoneNumber: '+111', status: 'completed' }],
      });
      await vi.advanceTimersByTimeAsync(5000);
      expect(api).toHaveBeenCalledWith('/campaigns/c1');
    });

    it('keeps polling a running campaign whose contacts are still queued', async () => {
      vi.mocked(api).mockResolvedValue({
        id: 'c1', name: 'Camp', status: 'running', contacts: [{ phoneNumber: '+111', status: 'pending' }],
      });
      await viewCampaignStatus('c1');
      expect(document.getElementById('campaign-status-container')?.innerHTML)
        .toContain('campaign-status-live');
    });

    it('stops polling once every number has a final status', async () => {
      vi.mocked(api).mockResolvedValue({
        id: 'c1', name: 'Camp', status: 'completed',
        contacts: [{ phoneNumber: '+111', status: 'completed' }],
      });
      await viewCampaignStatus('c1');
      expect(document.getElementById('campaign-status-container')?.innerHTML)
        .not.toContain('campaign-status-live');

      vi.clearAllMocks();
      await vi.advanceTimersByTimeAsync(15000);
      expect(api).not.toHaveBeenCalled();
    });

    it('stops polling after the view is closed', async () => {
      vi.mocked(api).mockResolvedValue({
        id: 'c1', name: 'Camp', contacts: [{ phoneNumber: '+111', status: 'calling' }],
      });
      await viewCampaignStatus('c1');
      hideStatusView();

      vi.clearAllMocks();
      await vi.advanceTimersByTimeAsync(15000);
      expect(api).not.toHaveBeenCalled();
    });
  });

  describe('retryFailedCampaign', () => {
    it('retries only the failed numbers when confirmed', async () => {
      vi.mocked(api).mockResolvedValue({ status: 'running', initiated: 2, queued: 0 });
      await retryFailedCampaign('c1');
      expect(api).toHaveBeenCalledWith('/campaigns/c1/retry-failed', { method: 'POST' });
      expect(showToast).toHaveBeenCalled();
    });

    it('aborts when not confirmed', async () => {
      vi.mocked(confirm).mockReturnValue(false);
      await retryFailedCampaign('c1');
      expect(api).not.toHaveBeenCalled();
    });

    it('reports queued numbers held back by the concurrency limit', async () => {
      vi.mocked(api).mockResolvedValue({ status: 'running', initiated: 3, queued: 7 });
      await retryFailedCampaign('c1');
      expect(showToast).toHaveBeenCalledWith(expect.stringContaining('7 number(s) queued'), 'info');
    });

    it('surfaces the server error when there is nothing to retry', async () => {
      vi.mocked(api).mockRejectedValue(new Error('Campaign has no failed numbers to retry'));
      await retryFailedCampaign('c1');
      expect(showToast).toHaveBeenCalledWith('Campaign has no failed numbers to retry', 'error');
    });

    it('is offered on a card whose campaign has failures', async () => {
      vi.mocked(api).mockResolvedValue([{
        id: 'c1', name: 'Camp', status: 'running', agent: { name: 'A' },
        _count: { contacts: 4 }, statusCounts: { pending: 0, calling: 1, completed: 1, failed: 2 },
      }]);
      await loadCampaigns();
      const btn = document.querySelector('.btn-retry-failed-campaign') as HTMLButtonElement;
      expect(btn).toBeTruthy();

      vi.mocked(api).mockResolvedValue({ status: 'running', initiated: 2, queued: 0 });
      btn.click();
      await Promise.resolve();
      expect(api).toHaveBeenCalledWith('/campaigns/c1/retry-failed', { method: 'POST' });
    });

    it('is hidden on a card with no failures', async () => {
      vi.mocked(api).mockResolvedValue([{
        id: 'c1', name: 'Camp', status: 'running', agent: { name: 'A' },
        _count: { contacts: 2 }, statusCounts: { pending: 0, calling: 0, completed: 2, failed: 0 },
      }]);
      await loadCampaigns();
      expect(document.querySelector('.btn-retry-failed-campaign')).toBeNull();
    });

    it('is hidden for a campaign list response without tallies', async () => {
      vi.mocked(api).mockResolvedValue([{
        id: 'c1', name: 'Camp', status: 'completed', agent: { name: 'A' }, _count: { contacts: 2 },
      }]);
      await loadCampaigns();
      expect(document.querySelector('.btn-retry-failed-campaign')).toBeNull();
    });
  });

  describe('additional branch coverage', () => {
    it('shows an Error message when pause fails', async () => {
      vi.mocked(api).mockRejectedValue(new Error('pause err'));
      await pauseCampaign('c1');
      expect(showToast).toHaveBeenCalledWith('pause err', 'error');
    });

    it('shows a string error when resume fails', async () => {
      vi.mocked(api).mockRejectedValue('resume raw');
      await resumeCampaign('c1');
      expect(showToast).toHaveBeenCalledWith('resume raw', 'error');
    });

    it('shows a string error when status view fails', async () => {
      vi.mocked(api).mockRejectedValue('status raw');
      await viewCampaignStatus('c1');
      expect(showToast).toHaveBeenCalledWith('status raw', 'error');
    });

    it('renders contacts with missing fields and unknown status', async () => {
      vi.mocked(api).mockResolvedValue({ contacts: [{ status: 'weird' }] });
      await viewCampaignStatus('c1');
      const html = document.getElementById('campaign-status-container')?.innerHTML || '';
      expect(html).toContain('weird');
    });

    it('treats non-array contacts as empty', async () => {
      vi.mocked(api).mockResolvedValue({ id: 'c1', name: 'X', contacts: null });
      await viewCampaignStatus('c1');
      expect(document.getElementById('campaign-status-container')?.innerHTML).toContain('No contacts');
    });

    it('opens the schedule form for a campaign without a schedule', async () => {
      vi.mocked(api).mockResolvedValue([{ id: 'c2', name: 'C2', status: 'draft', _count: { contacts: 0 } }]);
      await loadCampaigns();
      showScheduleForm('c2');
      expect((document.getElementById('campaign-scheduled-at') as HTMLInputElement).value).toBe('');
    });

    it('ignores an invalid stored schedule date', async () => {
      vi.mocked(api).mockResolvedValue([
        { id: 'c3', name: 'C3', status: 'draft', scheduledAt: 'not-a-date', _count: { contacts: 0 } },
      ]);
      await loadCampaigns();
      showScheduleForm('c3');
      expect((document.getElementById('campaign-scheduled-at') as HTMLInputElement).value).toBe('');
    });

    it('renders schedule metadata with only a start time', async () => {
      vi.mocked(api).mockResolvedValue([
        { id: 'c1', name: 'C', status: 'scheduled', agent: { name: 'A' }, _count: { contacts: 1 },
          scheduledAt: '2026-07-07T10:00:00.000Z' },
      ]);
      await loadCampaigns();
      expect(document.getElementById('campaign-list')?.innerHTML).toContain('campaign-schedule-meta');
    });

    it('omits schedule metadata when none is set', async () => {
      vi.mocked(api).mockResolvedValue([
        { id: 'c1', name: 'C', status: 'draft', agent: { name: 'A' }, _count: { contacts: 1 } },
      ]);
      await loadCampaigns();
      expect(document.getElementById('campaign-list')?.innerHTML).not.toContain('campaign-schedule-meta');
    });
  });

  describe('schedule presets and summary', () => {
    const now = new Date('2026-07-07T10:00:00');

    it('computes quick-start presets', () => {
      expect(computeStartPreset('1h', now)).toBe('2026-07-07T11:00');
      expect(computeStartPreset('evening', now)).toBe('2026-07-07T18:00');
      expect(computeStartPreset('tomorrow', now)).toBe('2026-07-08T09:00');
      expect(computeStartPreset('now', now)).toBe('');
      expect(computeStartPreset('bogus', now)).toBe('');
    });

    it('computes quick-start presets in the selected timezone', () => {
      // 10:00 UTC is 15:30 IST, so "this evening" means 18:00 IST that same day
      // and "tomorrow" rolls the IST calendar date, not the UTC one.
      expect(computeStartPreset('evening', now, 'Asia/Kolkata')).toBe('2026-07-07T18:00');
      expect(computeStartPreset('tomorrow', now, 'Asia/Kolkata')).toBe('2026-07-08T09:00');
      // +1h stays an instant shift, re-read in the target zone.
      expect(computeStartPreset('1h', now, 'Asia/Kolkata')).toBe('2026-07-07T16:30');
    });

    it('rolls month boundaries when computing the tomorrow preset', () => {
      expect(computeStartPreset('tomorrow', new Date('2026-07-31T10:00:00Z'), 'UTC'))
        .toBe('2026-08-01T09:00');
      expect(computeStartPreset('tomorrow', new Date('2026-12-31T10:00:00Z'), 'UTC'))
        .toBe('2027-01-01T09:00');
    });

    it('computes quick call-window presets', () => {
      expect(computeWindowPreset('business')).toEqual({ start: '09:00', end: '18:00' });
      expect(computeWindowPreset('morning')).toEqual({ start: '09:00', end: '12:00' });
      expect(computeWindowPreset('afternoon')).toEqual({ start: '12:00', end: '17:00' });
      expect(computeWindowPreset('bogus')).toEqual({ start: '', end: '' });
    });

    it('summarises the current selection', () => {
      (document.getElementById('campaign-scheduled-at') as HTMLInputElement).value = '2026-07-07T11:00';
      (document.getElementById('campaign-window-start') as HTMLInputElement).value = '09:00';
      (document.getElementById('campaign-window-end') as HTMLInputElement).value = '18:00';
      updateScheduleSummary();
      const text = document.getElementById('campaign-schedule-summary')?.textContent || '';
      expect(text).toContain('Starts');
      expect(text).toContain('calls between 09:00 and 18:00');
    });

    it('names the timezone in the summary so the schedule is unambiguous', () => {
      const select = document.getElementById('campaign-timezone') as HTMLSelectElement;
      select.innerHTML = '<option value="Asia/Kolkata">Asia/Kolkata</option>';
      select.value = 'Asia/Kolkata';
      (document.getElementById('campaign-scheduled-at') as HTMLInputElement).value = '2026-07-07T18:00';
      updateScheduleSummary();
      const text = document.getElementById('campaign-schedule-summary')?.textContent || '';
      expect(text).toContain('Starts 2026-07-07 18:00');
      expect(text).toContain('times in Asia/Kolkata');
    });

    it('summarises defaults when nothing is chosen', () => {
      updateScheduleSummary();
      expect(document.getElementById('campaign-schedule-summary')?.textContent)
        .toBe('Starts as soon as queued · calls anytime');
    });

    it('returns early when the summary element is missing', () => {
      document.getElementById('campaign-schedule-summary')?.remove();
      updateScheduleSummary();
      expect(true).toBe(true);
    });

    it('applies presets via the wired buttons', () => {
      initCampaignPanel();

      (document.querySelector('[data-start-preset="1h"]') as HTMLButtonElement).click();
      expect((document.getElementById('campaign-scheduled-at') as HTMLInputElement).value).not.toBe('');

      (document.querySelector('[data-start-preset="now"]') as HTMLButtonElement).click();
      expect((document.getElementById('campaign-scheduled-at') as HTMLInputElement).value).toBe('');

      (document.querySelector('[data-window-preset="business"]') as HTMLButtonElement).click();
      expect((document.getElementById('campaign-window-start') as HTMLInputElement).value).toBe('09:00');
      expect((document.getElementById('campaign-window-end') as HTMLInputElement).value).toBe('18:00');

      (document.querySelector('[data-window-preset="anytime"]') as HTMLButtonElement).click();
      expect((document.getElementById('campaign-window-start') as HTMLInputElement).value).toBe('');

      // Empty-key preset buttons are ignored.
      (document.querySelector('[data-start-preset=""]') as HTMLButtonElement).click();
      (document.querySelector('[data-window-preset=""]') as HTMLButtonElement).click();

      // Typing in a field refreshes the summary.
      const startInput = document.getElementById('campaign-scheduled-at') as HTMLInputElement;
      startInput.value = '2026-07-07T11:00';
      startInput.dispatchEvent(new Event('input'));
      expect(document.getElementById('campaign-schedule-summary')?.textContent).toContain('Starts');
    });
  });
});
