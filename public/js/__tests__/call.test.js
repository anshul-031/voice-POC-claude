// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MESSAGE_TYPE } from '../constants/config.js';

const showToastMock = vi.fn();
const updateCallUIMock = vi.fn();
const startWaveformAnimationMock = vi.fn();
const stopWaveformAnimationMock = vi.fn();
const appendDebugLogMock = vi.fn();

vi.mock('../utils.js', () => ({
  showToast: showToastMock,
  uint8ToBase64: () => 'AQI=',
}));

vi.mock('../ui.js', () => ({
  updateCallUI: updateCallUIMock,
}));

vi.mock('../waveform.js', () => ({
  startWaveformAnimation: startWaveformAnimationMock,
  stopWaveformAnimation: stopWaveformAnimationMock,
}));

vi.mock('../transcript.js', () => ({
  appendDebugLog: appendDebugLogMock,
}));

class FakeWebSocket {
  static OPEN = 1;
  /** @type {any[]} */
  static instances = [];

  /** @param {string} url */
  constructor(url) {
    this.url = url;
    this.readyState = FakeWebSocket.OPEN;
    this.send = vi.fn();
    this.close = vi.fn();
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
    FakeWebSocket.instances.push(this);
  }
}

const createAudioContextMock = () => {
  const analyser = { fftSize: 0 };
  return {
    destination: {},
    state: 'running',
    close: vi.fn().mockResolvedValue(undefined),
    createAnalyser: vi.fn(() => analyser),
    createMediaStreamSource: vi.fn(() => ({ connect: vi.fn() })),
    createScriptProcessor: vi.fn(() => ({
      connect: vi.fn(),
      disconnect: vi.fn(),
      onaudioprocess: null,
    })),
    createBuffer: vi.fn(() => ({ getChannelData: vi.fn(() => new Float32Array(4)) })),
    createBufferSource: vi.fn(() => ({
      connect: vi.fn(),
      start: vi.fn(),
      onended: null,
      buffer: null,
    })),
  };
};

describe('call module', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    FakeWebSocket.instances = [];
    document.body.innerHTML = '';

    const mediaStreamMock = {
      getTracks: () => [{ stop: vi.fn() }],
    };

    vi.stubGlobal('WebSocket', /** @type {any} */ (FakeWebSocket));
    Object.defineProperty(window, 'WebSocket', {
      value: /** @type {any} */ (FakeWebSocket),
      configurable: true,
    });
    vi.stubGlobal('atob', /** @param {string} value */ (value) => (value === 'AA==' ? '\u0000' : 'abc'));
    Object.defineProperty(window, 'location', {
      value: { protocol: 'https:', host: 'example.com' },
      configurable: true,
    });

    const audioContextMock = createAudioContextMock();
    const audioContextCtor = vi.fn(function AudioContextMock() {
      return audioContextMock;
    });
    window.AudioContext = /** @type {any} */ (audioContextCtor);
    /** @type {any} */ (window).webkitAudioContext = undefined;

    Object.defineProperty(window.navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mediaStreamMock),
      },
      configurable: true,
    });
  });

  it('rejects invalid start input and toggles mute state', async () => {
    const callModule = await import('../call.js');
    const callbacks = {
      onStatusChange: vi.fn(),
      onTimerUpdate: vi.fn(),
      onTranscript: vi.fn(),
    };

    await callModule.toggleCall('', callbacks);
    expect(showToastMock).toHaveBeenCalled();

    expect(callModule.toggleMute()).toBe(true);
    expect(callModule.toggleMute()).toBe(false);
  });

  it('starts call, processes websocket messages, and cleans up on end', async () => {
    vi.useFakeTimers();
    const callModule = await import('../call.js');
    const callbacks = {
      onStatusChange: vi.fn(),
      onTimerUpdate: vi.fn(),
      onTranscript: vi.fn(),
    };

    await callModule.toggleCall('agent-1', callbacks);
    expect(FakeWebSocket.instances.length).toBe(1);

    const ws = FakeWebSocket.instances[0];
    if (typeof ws.onopen === 'function') {
      ws.onopen();
    }

    expect(ws.send).toHaveBeenCalled();

    if (typeof ws.onmessage === 'function') {
      ws.onmessage({ data: JSON.stringify({ type: MESSAGE_TYPE.CALL_STARTED, agentName: 'A1' }) });
      ws.onmessage({ data: JSON.stringify({ type: MESSAGE_TYPE.TRANSCRIPT, role: 'user', text: 'Hi' }) });
      ws.onmessage({ data: JSON.stringify({ type: MESSAGE_TYPE.TRANSCRIPT, role: 'model', text: 'Hello' }) });
      ws.onmessage({ data: JSON.stringify({ type: MESSAGE_TYPE.AUDIO_RESPONSE, data: 'AA==' }) });
      ws.onmessage({ data: JSON.stringify({ type: MESSAGE_TYPE.INTERRUPTED }) });
      ws.onmessage({ data: JSON.stringify({ type: MESSAGE_TYPE.CALL_ENDED, reason: 'Done' }) });
    }

    vi.advanceTimersByTime(1100);
    expect(callbacks.onTimerUpdate).toHaveBeenCalled();
    expect(updateCallUIMock).toHaveBeenCalledWith(true);

    await callModule.endCall();
    expect(updateCallUIMock).toHaveBeenCalledWith(false);
    expect(stopWaveformAnimationMock).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('handles websocket parse errors and generic error message branch', async () => {
    const callModule = await import('../call.js');
    const callbacks = {
      onStatusChange: vi.fn(),
      onTimerUpdate: vi.fn(),
      onTranscript: vi.fn(),
    };

    await callModule.toggleCall('agent-2', callbacks);

    const ws = FakeWebSocket.instances[0];
    if (typeof ws.onmessage === 'function') {
      ws.onmessage({ data: 'not-json' });
      ws.onmessage({ data: JSON.stringify({ type: 'unknown' }) });
      ws.onmessage({ data: JSON.stringify({ type: MESSAGE_TYPE.ERROR, message: 'fail' }) });
    }

    if (typeof ws.onerror === 'function') {
      ws.onerror(new Event('error'));
    }

    expect(appendDebugLogMock).toHaveBeenCalled();
    expect(showToastMock).toHaveBeenCalled();

    await callModule.endCall();
  });

  it('handles start call failures from media setup', async () => {
    Object.defineProperty(window.navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new Error('No mic')),
      },
      configurable: true,
    });

    const callModule = await import('../call.js');
    await callModule.toggleCall('agent-3', {
      onStatusChange: vi.fn(),
      onTimerUpdate: vi.fn(),
      onTranscript: vi.fn(),
    });

    expect(showToastMock).toHaveBeenCalled();
  });
});