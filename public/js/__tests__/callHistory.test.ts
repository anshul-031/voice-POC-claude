/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api.js', () => ({
  api: vi.fn(),
}));

vi.mock('../utils.js', () => ({
  showToast: vi.fn(),
  escapeHtml: vi.fn((s) => s),
}));

import {
  loadCallHistory,
  renderCallHistoryList,
  viewCallDetail,
  deleteCallRecord,
  initCallHistoryPanel,
  resetCallHistoryState,
} from '../callHistory.js';
import { api } from '../api.js';
import { showToast } from '../utils.js';

function setupDOM() {
  document.body.innerHTML = `
    <div id="call-history-list-section"></div>
    <div id="call-history-list"></div>
    <div id="call-history-detail-section" class="hidden"></div>
    <div id="call-history-detail"></div>
    <button id="btn-refresh-call-history"></button>
    <button id="btn-back-call-history"></button>
  `;
}

const sampleCall = {
  id: 'c1',
  agentName: 'Agent A',
  agent: { name: 'Agent A' },
  callType: 'telephony',
  status: 'completed',
  durationSecs: 75,
  startedAt: '2026-06-25T10:00:00.000Z',
  recordingKey: 'recordings/x.wav',
};

describe('callHistory.js', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDOM();
    resetCallHistoryState();
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
  });

  describe('loadCallHistory / render', () => {
    it('renders an empty state when there are no calls', async () => {
      vi.mocked(api).mockResolvedValue([]);
      await loadCallHistory();
      expect(document.getElementById('call-history-list')?.innerHTML).toContain('No calls yet');
    });

    it('renders call cards with actions and a recording badge', async () => {
      vi.mocked(api).mockResolvedValue([sampleCall]);
      await loadCallHistory();
      const html = document.getElementById('call-history-list')?.innerHTML || '';
      expect(html).toContain('Agent A');
      expect(html).toContain('Telephony');
      expect(html).toContain('01:15');
      expect(html).toContain('Recording');
      expect(html).toContain('btn-view-call');
      expect(html).toContain('btn-delete-call');
    });

    it('renders cards with missing fields and unknown labels', async () => {
      vi.mocked(api).mockResolvedValue([
        { id: 'c2', callType: 'weird', status: 'weird', recordingKey: null },
      ]);
      await loadCallHistory();
      const html = document.getElementById('call-history-list')?.innerHTML || '';
      expect(html).toContain('weird');
      expect(html).toContain('No recording');
      expect(html).toContain('00:00');
    });

    it('handles a load failure', async () => {
      vi.mocked(api).mockRejectedValue(new Error('fail'));
      await loadCallHistory();
      expect(showToast).toHaveBeenCalled();
      expect(document.getElementById('call-history-list')?.innerHTML).toContain('No calls yet');
    });

    it('returns early when the list element is missing', () => {
      document.getElementById('call-history-list')?.remove();
      renderCallHistoryList();
      expect(true).toBe(true);
    });

    it('ignores card clicks when the id is empty', async () => {
      vi.mocked(api).mockResolvedValue([{ ...sampleCall, id: '' }]);
      await loadCallHistory();
      vi.clearAllMocks();
      (document.querySelector('.btn-view-call') as HTMLButtonElement).click();
      (document.querySelector('.btn-delete-call') as HTMLButtonElement).click();
      await Promise.resolve();
      expect(api).not.toHaveBeenCalled();
    });
  });

  describe('viewCallDetail', () => {
    it('renders detail with a recording player and transcript', async () => {
      const signedUrl = 'https://b.r2.example.com/recordings/x.webm?X-Amz-Credential=key%2F20260625%2Fauto&X-Amz-Signature=abc';
      vi.mocked(api).mockResolvedValue({
        ...sampleCall,
        phoneNumber: '+1999',
        recordingUrl: signedUrl,
        transcript: [
          { role: 'user', text: 'Hello' },
          { role: 'model', text: 'Hi there' },
        ],
      });
      await viewCallDetail('c1');
      const html = document.getElementById('call-history-detail')?.innerHTML || '';
      expect(html).toContain('<audio');
      expect(html).toContain('Hello');
      expect(html).toContain('Hi there');
      expect(html).toContain('+1999');
      const audioEl = document.getElementById('call-recording-audio') as HTMLAudioElement;
      // The signed URL must be assigned verbatim (no double-encoding of %2F).
      expect(audioEl.getAttribute('src')).toBe(signedUrl);
      expect(document.getElementById('call-history-detail-section')?.classList.contains('hidden')).toBe(false);
    });

    it('shows fallbacks when there is no recording or transcript', async () => {
      vi.mocked(api).mockResolvedValue({
        ...sampleCall,
        recordingUrl: null,
        transcript: [],
      });
      await viewCallDetail('c1');
      const html = document.getElementById('call-history-detail')?.innerHTML || '';
      expect(html).toContain('No recording is available');
      expect(html).toContain('No transcript');
    });

    it('handles a non-array transcript safely', async () => {
      vi.mocked(api).mockResolvedValue({ ...sampleCall, recordingUrl: null, transcript: null });
      await viewCallDetail('c1');
      expect(document.getElementById('call-history-detail')?.innerHTML).toContain('No transcript');
    });

    it('returns early when detail containers are missing', async () => {
      vi.mocked(api).mockResolvedValue({ ...sampleCall, transcript: [] });
      document.body.innerHTML = '';
      await viewCallDetail('c1');
      expect(true).toBe(true);
    });

    it('shows a toast when the detail fetch fails', async () => {
      vi.mocked(api).mockRejectedValue(new Error('fail'));
      await viewCallDetail('c1');
      expect(showToast).toHaveBeenCalled();
    });

    it('is wired to view buttons in the rendered list', async () => {
      vi.mocked(api).mockResolvedValue([sampleCall]);
      await loadCallHistory();
      vi.mocked(api).mockResolvedValue({ ...sampleCall, recordingUrl: null, transcript: [] });
      (document.querySelector('.btn-view-call') as HTMLButtonElement).click();
      await Promise.resolve();
      expect(api).toHaveBeenCalledWith('/call-history/c1');
    });
  });

  describe('deleteCallRecord', () => {
    it('deletes after confirmation and reloads', async () => {
      vi.mocked(api).mockResolvedValue({ message: 'ok' });
      await deleteCallRecord('c1');
      expect(api).toHaveBeenCalledWith('/call-history/c1', { method: 'DELETE' });
      expect(showToast).toHaveBeenCalled();
    });

    it('aborts when not confirmed', async () => {
      vi.mocked(confirm).mockReturnValue(false);
      await deleteCallRecord('c1');
      expect(api).not.toHaveBeenCalled();
    });

    it('shows an error when delete fails', async () => {
      vi.mocked(api).mockRejectedValue(new Error('del fail'));
      await deleteCallRecord('c1');
      expect(showToast).toHaveBeenCalledWith('del fail', 'error');
    });

    it('shows a fallback error message for non-Error rejections', async () => {
      vi.mocked(api).mockRejectedValue('raw');
      await deleteCallRecord('c1');
      expect(showToast).toHaveBeenCalled();
    });

    it('is wired to delete buttons in the rendered list', async () => {
      vi.mocked(api).mockResolvedValue([sampleCall]);
      await loadCallHistory();
      vi.mocked(api).mockResolvedValue({ message: 'ok' });
      (document.querySelector('.btn-delete-call') as HTMLButtonElement).click();
      await Promise.resolve();
      expect(confirm).toHaveBeenCalled();
    });
  });

  describe('initCallHistoryPanel', () => {
    it('wires the refresh and back buttons', async () => {
      vi.mocked(api).mockResolvedValue([]);
      initCallHistoryPanel();
      document.getElementById('btn-refresh-call-history')?.click();
      await Promise.resolve();
      expect(api).toHaveBeenCalledWith('/call-history');

      document.getElementById('call-history-detail-section')?.classList.remove('hidden');
      document.getElementById('btn-back-call-history')?.click();
      expect(document.getElementById('call-history-detail-section')?.classList.contains('hidden')).toBe(true);
    });
  });
});
