/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../ui.js', () => ({
  applyI18n: vi.fn(),
}));

vi.mock('../waveform.js', () => ({
  initWaveform: vi.fn(),
}));

vi.mock('../call.js', () => ({
  toggleCall: vi.fn(),
  endCall: vi.fn().mockResolvedValue(undefined),
  toggleMute: vi.fn(() => true),
  prepareAudioPlaybackOnGesture: vi.fn(),
}));

vi.mock('../api.js', () => ({
  api: vi.fn(),
}));

vi.mock('../utils.js', () => ({
  showToast: vi.fn(),
}));

vi.mock('../transcript.js', () => ({
  appendTranscript: vi.fn(),
  clearDebugLogs: vi.fn(),
}));

function setDom(): void {
  document.body.innerHTML = `
    <button id="btn-call"></button>
    <button id="btn-mute"></button>
    <button id="btn-back-call"></button>
    <div id="call-agent-name"></div>
    <div id="call-status"></div>
    <div id="call-timer" class="hidden"></div>
    <div id="mute-icon-off"></div>
    <div id="mute-icon-on" class="hidden"></div>
  `;
}

describe('preview.js', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    setDom();
    vi.stubGlobal('location', {
      pathname: '/preview/agent-1',
      search: '',
      href: '',
    });
  });

  it('should load public agent metadata and start call on click', async () => {
    const apiModule = await import('../api.js');
    const callModule = await import('../call.js');
    const transcriptModule = await import('../transcript.js');
    vi.mocked(apiModule.api).mockResolvedValue({ id: 'agent-1', name: 'Preview Agent' });

    await import('../preview.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await Promise.resolve();

    expect(document.getElementById('call-agent-name')?.textContent).toBe('Preview Agent');

    document.getElementById('btn-call')?.click();
    expect(callModule.toggleCall).toHaveBeenCalledWith('agent-1', expect.any(Object));

    const callbacks = vi.mocked(callModule.toggleCall).mock.calls[0]?.[1] as {
      onStatusChange: (text: string, className: string) => void;
      onTimerUpdate: (seconds: number) => void;
      onTranscript: (role: 'user' | 'model', text: string) => void;
    };

    callbacks.onStatusChange('Connected', 'active');
    expect(document.getElementById('call-status')?.textContent).toBe('Connected');

    callbacks.onTimerUpdate(65);
    expect(document.getElementById('call-timer')?.textContent).toBe('01:05');

    callbacks.onTranscript('user', 'hello');
    expect(transcriptModule.appendTranscript).toHaveBeenCalledWith('user', 'hello');

    document.getElementById('call-status')?.remove();
    callbacks.onStatusChange('No DOM', 'missing');
    document.getElementById('call-timer')?.remove();
    callbacks.onTimerUpdate(70);

    document.getElementById('call-agent-name')?.remove();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await Promise.resolve();
  });

  it('should use query fallback and disable call on load failure', async () => {
    const apiModule = await import('../api.js');
    const utilsModule = await import('../utils.js');

    vi.stubGlobal('location', {
      pathname: '/preview',
      search: '?agentId=agent-query',
      href: '',
    });

    vi.mocked(apiModule.api).mockRejectedValue(new Error('404'));

    await import('../preview.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await Promise.resolve();

    const btnCall = document.getElementById('btn-call');
    expect(btnCall?.getAttribute('disabled')).toBe('true');
    expect(utilsModule.showToast).toHaveBeenCalled();

    btnCall?.remove();
    vi.mocked(apiModule.api).mockRejectedValueOnce(new Error('404-again'));
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await Promise.resolve();
  });

  it('should handle unavailable preview id and skip start call', async () => {
    const callModule = await import('../call.js');
    const utilsModule = await import('../utils.js');

    vi.stubGlobal('location', {
      pathname: '/not-preview',
      search: '',
      href: '',
    });

    await import('../preview.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await Promise.resolve();

    document.getElementById('btn-call')?.click();
    expect(callModule.toggleCall).not.toHaveBeenCalled();
    expect(utilsModule.showToast).toHaveBeenCalled();
  });

  it('should handle mute toggle, back action, and beforeunload cleanup', async () => {
    const apiModule = await import('../api.js');
    const callModule = await import('../call.js');
    vi.mocked(apiModule.api).mockResolvedValue({ id: 'agent-1', name: 'Preview Agent' });

    await import('../preview.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await Promise.resolve();

    document.getElementById('btn-mute')?.click();
    expect(document.getElementById('btn-mute')?.classList.contains('muted')).toBe(true);
    expect(callModule.toggleMute).toHaveBeenCalled();

    document.getElementById('btn-mute')?.remove();
    document.getElementById('mute-icon-off')?.remove();
    document.getElementById('mute-icon-on')?.remove();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await Promise.resolve();

    document.getElementById('btn-back-call')?.click();
    await Promise.resolve();
    expect(callModule.endCall).toHaveBeenCalled();

    window.dispatchEvent(new Event('beforeunload'));
    expect(vi.mocked(callModule.endCall).mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
