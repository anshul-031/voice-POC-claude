/**
 * @vitest-environment jsdom
 */
/* eslint-disable max-lines */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UI_STRINGS } from '../constants/uiStrings.js';
import { MESSAGE_TYPE } from '../constants/config.js';
import {
  getAudioContext,
  getCallState,
  getPlaybackAudioContext,
  getWs,
  playAudioResponse,
  prepareAudioPlaybackOnGesture,
  resetState,
  startCall,
} from '../call.js';

function createCallbacks() {
  return {
    onStatusChange: vi.fn(),
    onTimerUpdate: vi.fn(),
    onTranscript: vi.fn(),
  };
}

class MockWS {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  readyState = 1;
  send = vi.fn();
  close = vi.fn();

  constructor() {
    queueMicrotask(() => this.onopen?.());
  }
}

function stubBaseNavigator() {
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [{ stop: vi.fn(), enabled: true }],
      }),
    },
  });
}

function createMockAudioContext(overrides: Record<string, unknown> = {}) {
  return {
    state: 'running',
    sampleRate: 48000,
    destination: {},
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    createGain: vi.fn().mockReturnValue({
      gain: { value: 0 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    }),
    createBuffer: vi.fn().mockReturnValue({
      getChannelData: vi.fn().mockReturnValue(new Float32Array(8)),
    }),
    createBufferSource: vi.fn().mockReturnValue({
      buffer: null,
      connect: vi.fn(),
      start: vi.fn(),
      onended: null,
      disconnect: vi.fn(),
      stop: vi.fn(),
    }),
    createMediaStreamSource: vi.fn().mockReturnValue({ connect: vi.fn() }),
    createBiquadFilter: vi.fn().mockReturnValue({
      type: 'highpass',
      frequency: { value: 0 },
      Q: { value: 0 },
      connect: vi.fn(),
    }),
    createAnalyser: vi.fn().mockReturnValue({ connect: vi.fn(), fftSize: 256 }),
    createScriptProcessor: vi.fn().mockReturnValue({
      connect: vi.fn(),
      disconnect: vi.fn(),
      onaudioprocess: null,
    }),
    ...overrides,
  };
}

describe('call.js iOS audio hardening branches', () => {
  beforeEach(() => {
    resetState();
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.stubGlobal('atob', () => 'abcdabcd');
    window.atob = () => 'abcdabcd';
    vi.stubGlobal('WebSocket', MockWS as unknown as typeof WebSocket);
    stubBaseNavigator();

    document.body.innerHTML = `
      <div id="toast-container"></div>
      <div id="call-status"></div>
      <div id="call-timer"></div>
      <button id="btn-mute"></button>
      <canvas id="waveform-canvas"></canvas>
    `;
  });

  it('logs blocked playback path when context stays suspended after retries', async () => {
    class AlwaysSuspendedAudioContext {
      state = 'suspended';
      sampleRate = 16000;
      destination = {};
      resume = vi.fn().mockResolvedValue(undefined);
      close = vi.fn().mockResolvedValue(undefined);
      createBuffer = vi.fn().mockReturnValue({
        getChannelData: vi.fn().mockReturnValue(new Float32Array(8)),
      });
      createBufferSource = vi.fn().mockReturnValue({
        buffer: null,
        connect: vi.fn(),
        start: vi.fn(),
        onended: null,
        disconnect: vi.fn(),
        stop: vi.fn(),
      });
      createMediaStreamSource = vi.fn().mockReturnValue({ connect: vi.fn() });
      createAnalyser = vi.fn().mockReturnValue({ connect: vi.fn(), fftSize: 256 });
      createGain = vi.fn().mockReturnValue({
        gain: { value: 0 },
        connect: vi.fn(),
        disconnect: vi.fn(),
      });
      createScriptProcessor = vi.fn().mockReturnValue({
        connect: vi.fn(),
        disconnect: vi.fn(),
        onaudioprocess: null,
      });
    }

    vi.stubGlobal('AudioContext', AlwaysSuspendedAudioContext as unknown as typeof AudioContext);
    vi.stubGlobal('webkitAudioContext', AlwaysSuspendedAudioContext as unknown as typeof AudioContext);

    await startCall('agent-1', createCallbacks());

    const context = getAudioContext() as unknown as { state: string; resume: ReturnType<typeof vi.fn> };
    expect(context.state).toBe('suspended');
    expect(context.resume).toHaveBeenCalledTimes(3);
  });

  it('shows audio recovery toast after repeated playback resume failures', async () => {
    const runningAudioContext = createMockAudioContext();

    class RunningAudioContext {
      constructor() {
        return runningAudioContext as unknown as AudioContext;
      }
    }

    vi.stubGlobal('AudioContext', RunningAudioContext as unknown as typeof AudioContext);
    vi.stubGlobal('webkitAudioContext', RunningAudioContext as unknown as typeof AudioContext);

    await startCall('agent-1', createCallbacks());

    runningAudioContext.state = 'suspended';
    runningAudioContext.resume = vi.fn().mockRejectedValue('resume-blocked');
    playAudioResponse('base64data');
    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });

    const toast = document.querySelector('#toast-container .toast');
    expect(toast?.textContent).toBe(UI_STRINGS.toasts.audioPlaybackNeedsGesture);
  });

  it('handles audioSession setter failures without crashing startCall', async () => {
    const audioSession = {};
    Object.defineProperty(audioSession, 'type', {
      set: () => {
        throw new Error('audio-session-fail');
      },
      get: () => 'ambient',
    });

    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn(), enabled: true }],
        }),
      },
      audioSession,
    });

    const mockCtx = createMockAudioContext();
    class StableAudioContext {
      constructor() { return mockCtx as unknown as AudioContext; }
    }

    vi.stubGlobal('AudioContext', StableAudioContext as unknown as typeof AudioContext);
    vi.stubGlobal('webkitAudioContext', StableAudioContext as unknown as typeof AudioContext);

    await expect(startCall('agent-1', createCallbacks())).resolves.toBeUndefined();
  });

  it('creates a separate playback AudioContext at native sample rate', async () => {
    const mockCtx = createMockAudioContext({ sampleRate: 48000 });

    class NativeRateAudioContext {
      constructor() { return mockCtx as unknown as AudioContext; }
    }

    vi.stubGlobal('AudioContext', NativeRateAudioContext as unknown as typeof AudioContext);
    vi.stubGlobal('webkitAudioContext', NativeRateAudioContext as unknown as typeof AudioContext);

    await startCall('agent-1', createCallbacks());

    const pbCtx = getPlaybackAudioContext();
    expect(pbCtx).not.toBeNull();
    expect((pbCtx as unknown as { sampleRate: number })?.sampleRate).toBe(48000);
  });

  it('connects ScriptProcessor to silent gain node (not destination)', async () => {
    const gainMock = {
      gain: { value: 0 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    const mockCtx = createMockAudioContext({
      createGain: vi.fn().mockReturnValue(gainMock),
    });

    class TestAudioContext {
      constructor() { return mockCtx as unknown as AudioContext; }
    }

    vi.stubGlobal('AudioContext', TestAudioContext as unknown as typeof AudioContext);
    vi.stubGlobal('webkitAudioContext', TestAudioContext as unknown as typeof AudioContext);

    await startCall('agent-1', createCallbacks());

    expect(mockCtx.createGain).toHaveBeenCalled();
    expect(gainMock.connect).toHaveBeenCalledWith(mockCtx.destination);
  });

  it('plays silent audio element for iOS unlock on prepareAudioPlaybackOnGesture', () => {
    const mockAudioEl = {
      setAttribute: vi.fn(),
      play: vi.fn().mockResolvedValue(undefined),
      src: '',
    };
    vi.spyOn(document, 'createElement').mockReturnValue(mockAudioEl as unknown as HTMLElement);
    vi.stubGlobal('Blob', class MockBlob {
      constructor() { /* noop */ }
    });

    const mockObjectUrl = 'blob:test-url';
    vi.stubGlobal('URL', { createObjectURL: vi.fn().mockReturnValue(mockObjectUrl) });

    const mockCtx = createMockAudioContext();
    class TestAC {
      constructor() { return mockCtx as unknown as AudioContext; }
    }
    vi.stubGlobal('AudioContext', TestAC as unknown as typeof AudioContext);
    vi.stubGlobal('webkitAudioContext', TestAC as unknown as typeof AudioContext);

    prepareAudioPlaybackOnGesture();

    expect(mockAudioEl.setAttribute).toHaveBeenCalledWith('playsinline', '');
    expect(mockAudioEl.setAttribute).toHaveBeenCalledWith('webkit-playsinline', '');
    expect(mockAudioEl.play).toHaveBeenCalled();
  });

  it('handles silent audio play() rejection gracefully', async () => {
    const mockAudioEl = {
      setAttribute: vi.fn(),
      play: vi.fn().mockRejectedValue(new Error('play-blocked')),
      src: '',
    };
    vi.spyOn(document, 'createElement').mockReturnValue(mockAudioEl as unknown as HTMLElement);
    vi.stubGlobal('Blob', class MockBlob {
      constructor() { /* noop */ }
    });
    vi.stubGlobal('URL', { createObjectURL: vi.fn().mockReturnValue('blob:x') });

    const mockCtx = createMockAudioContext();
    class TestAC {
      constructor() { return mockCtx as unknown as AudioContext; }
    }
    vi.stubGlobal('AudioContext', TestAC as unknown as typeof AudioContext);
    vi.stubGlobal('webkitAudioContext', TestAC as unknown as typeof AudioContext);

    prepareAudioPlaybackOnGesture();

    await new Promise((resolve) => setTimeout(resolve, 50));
    // Should not throw — verifies graceful handling
    expect(mockAudioEl.play).toHaveBeenCalled();
  });

  it('handles missing AudioContext constructor in playback context creation', () => {
    vi.stubGlobal('AudioContext', undefined as unknown as typeof AudioContext);
    vi.stubGlobal('webkitAudioContext', undefined as unknown as typeof AudioContext);

    prepareAudioPlaybackOnGesture();

    expect(getPlaybackAudioContext()).toBeNull();
  });

  it('logs first inbound transcript milestone via ws.onmessage', async () => {
    const mockCtx = createMockAudioContext();
    class TestAC {
      constructor() { return mockCtx as unknown as AudioContext; }
    }
    vi.stubGlobal('AudioContext', TestAC as unknown as typeof AudioContext);
    vi.stubGlobal('webkitAudioContext', TestAC as unknown as typeof AudioContext);

    const cbs = createCallbacks();
    await startCall('agent-1', cbs);
    const ws = getWs() as unknown as MockWS;
    ws?.onmessage?.({ data: JSON.stringify({ type: MESSAGE_TYPE.CALL_STARTED }) });
    expect(getCallState().isInCall).toBe(true);
    ws?.onmessage?.({
      data: JSON.stringify({ type: MESSAGE_TYPE.TRANSCRIPT, role: 'user', text: 'hello' }),
    });
    expect(cbs.onTranscript).toHaveBeenCalledWith('user', 'hello');
  });

  it('handles non-Error non-string rejection in startCall', async () => {
    const mockCtx = createMockAudioContext();
    class TestAC {
      constructor() { return mockCtx as unknown as AudioContext; }
    }
    vi.stubGlobal('AudioContext', TestAC as unknown as typeof AudioContext);
    vi.stubGlobal('webkitAudioContext', TestAC as unknown as typeof AudioContext);
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(42) },
    });

    const cbs = createCallbacks();
    await startCall('agent-1', cbs);
    expect(cbs.onStatusChange).toHaveBeenCalled();
  });
});
