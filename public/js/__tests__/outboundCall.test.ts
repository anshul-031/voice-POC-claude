/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock modules before imports
vi.mock('../api.js', () => ({
  api: vi.fn(),
  checkApiHealth: vi.fn(),
}));

vi.mock('../call.js', () => ({
  toggleCall: vi.fn(),
  endCall: vi.fn(),
  toggleMute: vi.fn().mockReturnValue(false),
  prepareAudioPlaybackOnGesture: vi.fn(),
}));

vi.mock('../utils.js', () => ({
  showToast: vi.fn(),
  whitelabelModelName: vi.fn((n: string) => n),
  escapeHtml: vi.fn((s: string) => s),
}));

vi.mock('../waveform.js', () => ({
  initWaveform: vi.fn(),
  startWaveformAnimation: vi.fn(),
  stopWaveformAnimation: vi.fn(),
}));

vi.mock('../transcript.js', () => ({
  appendTranscript: vi.fn(),
  appendDebugLog: vi.fn(),
  clearDebugLogs: vi.fn(),
}));

vi.mock('../telephony.js', () => ({
  initTelephonyPanel: vi.fn(),
}));

vi.mock('../sidebar.js', () => ({
  initSidebarNavigation: vi.fn(),
  switchSection: vi.fn(),
}));

import {
  handleOutboundCall,
  showCallPanel,
  resetMainState,
  loadAgents,
} from '../main.js';
import { api } from '../api.js';
import { showToast } from '../utils.js';

function setupOutboundDOM() {
  document.body.innerHTML = `
    <div id="agent-list"></div>
    <div id="voice-grid"></div>
    <form id="agent-form">
      <input id="form-agent-id" value="" />
      <input id="form-name" value="" />
      <textarea id="form-prompt"></textarea>
      <select id="form-model"><option value="m1">M</option></select>
      <div id="form-title"></div>
      <button id="form-submit-text"></button>
    </form>
    <div id="call-panel" class="hidden">
      <div id="call-agent-name"></div>
      <div id="call-voice-name"></div>
      <div id="call-model-badge"></div>
      <div id="call-status"></div>
      <div id="call-timer"></div>
    </div>
    <div id="transcript-body"></div>
    <div id="btn-mute"></div>
    <button id="btn-call"></button>
    <div id="btn-new-agent"></div>
    <div id="btn-back-call"></div>
    <div id="btn-cancel-form"></div>
    <div id="btn-close-form"></div>
    <div id="btn-logout"></div>
    <input id="outbound-phone-number" value="+919876543210" />
    <button id="btn-outbound-call">
      <span id="outbound-call-btn-text">Call via Phone</span>
    </button>
    <div id="outbound-call-status" class="hidden"></div>
    <div id="messages"></div>
  `;
}

describe('handleOutboundCall', () => {
  beforeEach(() => {
    resetMainState();
    vi.clearAllMocks();
    setupOutboundDOM();

    // Setup agents mock
    (api as ReturnType<typeof vi.fn>).mockImplementation(
      async (path: string) => {
        if (path === '/agents') {
          return [
            {
              id: 'a1',
              name: 'Test Agent',
              voiceName: 'Puck',
              modelName: 'm1',
              systemPrompt: 'Hello',
            },
          ];
        }
        if (path === '/outbound-call') {
          return { callId: 'call-123', providerName: 'My Line' };
        }
        return {};
      },
    );
  });

  it('does nothing when no agent selected', async () => {
    await handleOutboundCall();
    expect(api).not.toHaveBeenCalledWith(
      '/outbound-call',
      expect.anything(),
    );
  });

  it('shows error for invalid phone number', async () => {
    // Load agents and select one
    await loadAgents();
    showCallPanel('a1');

    // Set empty phone
    const input = document.getElementById(
      'outbound-phone-number',
    ) as HTMLInputElement;
    input.value = '';

    await handleOutboundCall();
    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining('failed'),
      'error',
    );
  });

  it('calls API and shows success on valid input', async () => {
    await loadAgents();
    showCallPanel('a1');

    await handleOutboundCall();

    expect(api).toHaveBeenCalledWith(
      '/outbound-call',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('+919876543210'),
      }),
    );
    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining('+919876543210'),
      'success',
    );

    // Status element should show success
    const statusEl = document.getElementById('outbound-call-status');
    expect(statusEl?.classList.contains('hidden')).toBe(false);
    expect(statusEl?.classList.contains('success')).toBe(true);
  });

  it('shows error when API call fails', async () => {
    (api as ReturnType<typeof vi.fn>).mockImplementation(
      async (path: string) => {
        if (path === '/agents') {
          return [{
            id: 'a1', name: 'Test', voiceName: 'Puck',
            modelName: 'm1', systemPrompt: 'Hi',
          }];
        }
        if (path === '/outbound-call') {
          throw new Error('Server error');
        }
        return {};
      },
    );

    await loadAgents();
    showCallPanel('a1');

    await handleOutboundCall();

    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining('Server error'),
      'error',
    );

    const statusEl = document.getElementById('outbound-call-status');
    expect(statusEl?.classList.contains('error')).toBe(true);
  });

  it('sets and resets button state during call', async () => {
    await loadAgents();
    showCallPanel('a1');

    // The button should be reset after the call
    const btn = document.getElementById('btn-outbound-call');
    const btnText = document.getElementById('outbound-call-btn-text');

    await handleOutboundCall();

    // After completion, button should be in normal state
    expect(btn?.classList.contains('calling')).toBe(false);
    expect(btn?.hasAttribute('disabled')).toBe(false);
    expect(btnText?.textContent).toBe('Call via Phone');
  });

  it('handles non-Error rejection', async () => {
    (api as ReturnType<typeof vi.fn>).mockImplementation(
      async (path: string) => {
        if (path === '/agents') {
          return [{
            id: 'a1', name: 'A', voiceName: 'Puck',
            modelName: 'm1', systemPrompt: 'H',
          }];
        }
        if (path === '/outbound-call') {
          throw 'string-error';
        }
        return {};
      },
    );

    await loadAgents();
    showCallPanel('a1');
    await handleOutboundCall();

    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining('string-error'),
      'error',
    );
  });

  it('handles missing DOM elements gracefully', async () => {
    await loadAgents();
    showCallPanel('a1');

    // Remove DOM elements
    document.getElementById('btn-outbound-call')?.remove();
    document.getElementById('outbound-call-btn-text')?.remove();
    document.getElementById('outbound-call-status')?.remove();

    // Should not throw
    await handleOutboundCall();
    expect(showToast).toHaveBeenCalled();
  });
});
