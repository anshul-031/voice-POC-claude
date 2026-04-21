/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  checkAuthAndInit, handleLogout, loadVoices, loadModels, loadAgents,
  deleteAgent, showCallPanel, 
  handleSubmit, initApp, initDashboard,
  resetMainState, selectAgent, hideCallPanel, callCallbacks,
  editAgent, hideForm, toggleMute
} from '../main.js';
import * as apiModule from '../api.js';
import { UI_STRINGS } from '../constants/uiStrings.js';

describe('Dashboard Logic (main.js) — 90%+ Exclusive Coverage', () => {
  beforeEach(() => {
    resetMainState();
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('location', { href: '', search: '', protocol: 'http:', host: 'localhost' });
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
    
    // Mock api module
    vi.spyOn(apiModule, 'api').mockImplementation(async (path) => {
      if (path === '/voices') return [{ id: 'v1', name: 'Voice 1' }];
      if (path === '/models') return [{ id: 'm1', name: 'Model 1' }];
      if (path === '/agents') return [
        { id: 'a1', name: 'Agent 1', voiceName: 'v1', modelName: 'm1', systemPrompt: 'p1' },
         // Agent 2 keeps voice fallback and uses unknown model id to hit branded model fallback.
        { id: 'a2', name: 'Agent 2', modelName: 'gemini-3.1-flash-lite-preview', systemPrompt: 'p2' }
      ];
      return {};
    });

    document.body.innerHTML = `
      <div id="user-menu" style="display:none"></div>
      <div id="user-name"></div>
      <div id="agent-list"></div>
      <div id="voice-grid"></div>
      <form id="agent-form">
        <input id="form-agent-id" value="" />
        <input id="form-name" value="Test Agent" />
        <textarea id="form-prompt">Test Prompt</textarea>
        <select id="form-model">
          <option value="m1">Model 1</option>
        </select>
        <div id="form-title"></div>
        <button id="form-submit-text"></button>
        <button type="submit">Submit</button>
      </form>
      <div id="call-panel" class="hidden">
        <div id="call-agent-name"></div>
        <div id="call-voice-name"></div>
        <div id="call-model-badge"></div>
        <div id="call-status"></div>
        <div id="call-timer"></div>
      </div>
      <div id="transcript-body"></div>
      <button id="btn-mute">
        <div id="mute-icon-off"></div>
        <div id="mute-icon-on"></div>
      </button>
      <div id="btn-new-agent"></div>
      <button id="btn-call"></button>
      <div id="btn-back-call"></div>
      <div id="btn-cancel-form"></div>
      <div id="btn-close-form"></div>
      <div id="btn-logout"></div>
      <div id="messages"></div>
    `;
  });

  describe('Auth & Initialization', () => {
    it('should handle checkAuthAndInit variants', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ user: { name: 'Admin' } }),
      } as unknown as Response);

      await checkAuthAndInit();
      expect(document.getElementById('user-name')?.textContent).toBe('Admin');
      
      vi.mocked(fetch).mockResolvedValue({ ok: false } as unknown as Response);
      await checkAuthAndInit();
      expect(window.location.href).toBe('/login');

      vi.mocked(fetch).mockRejectedValue(new Error('Network error'));
      await checkAuthAndInit();
      expect(window.location.href).toBe('/login');
    });

    it('should handle initDashboard and DOMContentLoaded', () => {
      document.dispatchEvent(new Event('DOMContentLoaded'));
    });

    it('should handle logout', async () => {
      await handleLogout();
      expect(window.location.href).toBe('/login');
    });

    it('should initApp and trigger listeners', async () => {
      initApp();
      
      // Click listeners triggering exports
      document.getElementById('btn-new-agent')?.click();
      expect(document.getElementById('form-title')?.textContent).toBe('Create New Agent');

      document.getElementById('btn-mute')?.click();
      expect(document.getElementById('btn-mute')?.classList.contains('muted')).toBe(true);

      document.getElementById('btn-back-call')?.click();
      document.getElementById('btn-cancel-form')?.click();
      document.getElementById('btn-logout')?.click();
    });
  });

  describe('API Data Loading', () => {
    it('should load all data and render', async () => {
      await loadVoices();
      await loadModels();
      await loadAgents();
      expect(document.getElementById('agent-list')?.innerHTML).toContain('Agent 1');
    });

    it('should handle loadVoices and loadModels errors', async () => {
      vi.mocked(apiModule.api).mockRejectedValueOnce(new Error('FAIL'));
      await loadVoices();
      vi.mocked(apiModule.api).mockRejectedValueOnce(new Error('FAIL'));
      await loadModels();
    });

    it('should handle loadAgents error', async () => {
      vi.mocked(apiModule.api).mockRejectedValueOnce(new Error('FAIL'));
      await loadAgents();
      expect(document.getElementById('agent-list')?.innerHTML).toContain('No agents yet');
    });
  });

  describe('Form & Agent Operations', () => {
    it('should handle selectAgent and handleSubmit', async () => {
      await loadAgents();
      selectAgent('a1');
      expect((document.getElementById('form-name') as HTMLInputElement).value).toBe('Agent 1');

      const event = { preventDefault: vi.fn() } as unknown as Event;
      await handleSubmit(event);
      expect(apiModule.api).toHaveBeenCalledWith('/agents/a1', expect.anything());
    });

    it('should handle form validation edge cases and non-Error throws', async () => {
      resetMainState();
      
      const event = { preventDefault: vi.fn() } as unknown as Event;
      
      // empty form (validation fails early)
      (document.getElementById('form-name') as HTMLInputElement).value = '';
      await handleSubmit(event);

      // valid form but API throws string
      (document.getElementById('form-name') as HTMLInputElement).value = 'A';
      (document.getElementById('form-prompt') as HTMLTextAreaElement).value = 'P';
      const voiceSelect = document.createElement('select');
      voiceSelect.id = 'form-voice';
      voiceSelect.innerHTML = '<option value="v1">v</option>';
      document.getElementById('agent-form')?.appendChild(voiceSelect);
      (document.getElementById('form-model') as HTMLSelectElement).value = 'm1';
      
      vi.mocked(apiModule.api).mockRejectedValueOnce('string error');
      await handleSubmit(event);
    });

    it('should handle create handleSubmit', async () => {
      resetMainState();
      await handleSubmit({ preventDefault: vi.fn() } as unknown as Event);
      expect(apiModule.api).toHaveBeenCalledWith('/agents', expect.anything());
    });

    it('should handle deleteAgent confirm/cancel', async () => {
      await deleteAgent('a1');
      expect(apiModule.api).toHaveBeenCalledWith('/agents/a1', { method: 'DELETE' });

      vi.stubGlobal('confirm', vi.fn().mockReturnValue(false));
      await deleteAgent('a1');

      vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
      vi.mocked(apiModule.api).mockRejectedValueOnce('string error');
      await deleteAgent('a1');
    });
  });

  describe('Call Panel Logic', () => {
    it('should show and hide call panel', async () => {
      await loadAgents();
      await loadModels();
      showCallPanel('a1');
      expect(document.getElementById('call-agent-name')?.textContent).toBe('Agent 1');
      
      // show agent 2 to hit model/voice fallbacks
      showCallPanel('a2');
      expect(document.getElementById('call-model-badge')?.textContent)
        .toBe(`${UI_STRINGS.header.title}-3.1-flash-lite-preview`);
      
      // try invalid
      showCallPanel('invalid-id');
      selectAgent('invalid-id');

      hideCallPanel();
    });
    
    it('should handle btn-call click if agent selected', async () => {
      initApp();
      await loadAgents();
      // without agent
      resetMainState();
      document.getElementById('btn-call')?.click();

      // with agent
      await loadAgents(); // Re-load since reset cleared them!
      showCallPanel('a1');
      document.getElementById('btn-call')?.click();
    });

    it('should execute callCallbacks functions', () => {
      callCallbacks.onTimerUpdate(65);
      expect(document.getElementById('call-timer')?.textContent).toBe('01:05');

      callCallbacks.onTimerUpdate(65); // timer again with different dom states potentially
      // trigger transcript
      callCallbacks.onTranscript('user', 'Hello');
      
      // trigger status change
      callCallbacks.onStatusChange('Connecting', 'connecting');
      expect(document.getElementById('call-status')?.textContent).toBe('Connecting');
    });

    it('should handle missing UI elements gracefully for branch coverage', async () => {
      document.body.innerHTML = '';
      
      // Auth & Init
      vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ user: { name: 'Admin' } }) } as unknown as Response);
      await checkAuthAndInit();
      initApp();

      // Api Loads
      await loadVoices();
      await loadModels();
      await loadAgents();

      // Agent Selection
      selectAgent('a1');
      selectAgent('invalid');
      
      // Form missing strings branch
      const origEdit = UI_STRINGS.form.editTitle;
      const origSave = UI_STRINGS.common.save;
      (UI_STRINGS.form as any).editTitle = '';
      (UI_STRINGS.common as any).save = '';
      editAgent('a1');
      (UI_STRINGS.form as any).editTitle = origEdit;
      (UI_STRINGS.common as any).save = origSave;
      
      // Trigger showForm without active agent and test hideForm/toggleMute missing DOMs
      document.getElementById('btn-new-agent')?.click();
      hideForm();
      toggleMute();

      // Call Panel
      showCallPanel('a1');
      hideCallPanel();

      // Callbacks (with DOM clear)
      callCallbacks.onTimerUpdate(10);
      callCallbacks.onStatusChange('c', 'c');
      callCallbacks.onTranscript('user', 't');
    });
  });
});
