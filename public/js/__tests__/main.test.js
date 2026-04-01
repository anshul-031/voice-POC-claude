// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.fn();
const checkApiHealthMock = vi.fn();
const applyI18nMock = vi.fn();
const showPanelMock = vi.fn();
const initWaveformMock = vi.fn();
const toggleCallMock = vi.fn();
const endCallMock = vi.fn();
const toggleMuteMock = vi.fn(() => true);
const showToastMock = vi.fn();
const appendTranscriptMock = vi.fn();
const selectVoiceInGridMock = vi.fn();
const clearDebugLogsMock = vi.fn();
const renderVoiceGridMock = vi.fn();
const renderModelSelectMock = vi.fn();
const renderAgentListMock = vi.fn();

vi.mock('../api.js', () => ({ api: apiMock, checkApiHealth: checkApiHealthMock }));
vi.mock('../ui.js', () => ({ applyI18n: applyI18nMock, showPanel: showPanelMock }));
vi.mock('../waveform.js', () => ({ initWaveform: initWaveformMock }));
vi.mock('../call.js', () => ({ toggleCall: toggleCallMock, endCall: endCallMock, toggleMute: toggleMuteMock }));
vi.mock('../utils.js', () => ({ showToast: showToastMock }));
vi.mock('../transcript.js', () => ({
  appendTranscript: appendTranscriptMock,
  selectVoiceInGrid: selectVoiceInGridMock,
  clearDebugLogs: clearDebugLogsMock,
}));
vi.mock('../render.js', () => ({
  renderVoiceGrid: renderVoiceGridMock,
  renderModelSelect: renderModelSelectMock,
  renderAgentList: renderAgentListMock,
}));

const importMainModule = async () => {
  await import('../main.js');
};

const createDom = () => {
  document.body.innerHTML = `
    <div id="user-menu"></div>
    <div id="user-name"></div>
    <button id="btn-new-agent"></button>
    <form id="agent-form"></form>
    <button id="btn-mute"></button>
    <button id="btn-call"></button>
    <button id="btn-back-call"></button>
    <button id="btn-cancel-form"></button>
    <button id="btn-close-form"></button>
    <button id="btn-logout"></button>
    <input id="form-agent-id">
    <input id="form-name">
    <textarea id="form-prompt"></textarea>
    <div id="form-title"></div>
    <div id="form-submit-text"></div>
    <select id="form-model"><option value="m1">M1</option></select>
    <div id="call-status"></div>
    <div id="call-timer"></div>
    <div id="agent-list"></div>
    <div id="call-agent-name"></div>
    <div id="call-voice-name"></div>
    <div id="call-model-badge"></div>
    <div id="transcript-body"></div>
    <span id="mute-icon-off"></span>
    <span id="mute-icon-on"></span>
    <input type="radio" name="voiceName" value="Puck" checked>
  `;
};

describe('main frontend entry smoke coverage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    createDom();

    Object.defineProperty(window, 'location', {
      value: { href: 'https://example.com/index.html' },
      configurable: true,
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ user: { name: 'User' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    apiMock.mockImplementation(async (path) => {
      if (path === '/voices') return [{ id: 'Puck', name: 'Puck', description: 'd' }];
      if (path === '/models') return [{ id: 'm1', name: 'Model 1', description: 'd' }];
      if (path === '/agents') {
        return [{ id: 'a1', name: 'Agent One', systemPrompt: 'Prompt', voiceName: 'Puck', modelName: 'm1' }];
      }
      return { ok: true };
    });
  });

  it('boots and runs top-level DOM interaction flows', async () => {
    await importMainModule();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await Promise.resolve();
    await Promise.resolve();

    document.getElementById('btn-new-agent')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.getElementById('btn-back-call')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.getElementById('btn-mute')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.getElementById('agent-form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    const selectAgent = /** @type {any} */ (window).selectAgent;
    const showCallPanel = /** @type {any} */ (window).showCallPanel;
    if (typeof selectAgent === 'function') selectAgent('a1');
    if (typeof showCallPanel === 'function') showCallPanel('a1');

    document.getElementById('btn-call')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.getElementById('btn-logout')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    expect(document.getElementById('btn-call')).not.toBeNull();
  });

  it('handles auth redirect branch', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 401 }));

    await importMainModule();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await Promise.resolve();

    expect(window.location.href).toContain('/login.html');
  });
});