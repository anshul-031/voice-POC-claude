/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UI_STRINGS } from '../constants/uiStrings.js';
import {
  getAudioContext,
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

describe('call.js iOS audio hardening branches', () => {
  beforeEach(() => {
    resetState();
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
    const runningAudioContext = {
      state: 'running',
      sampleRate: 16000,
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
    };

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

    class StableAudioContext {
      state = 'running';
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
      createScriptProcessor = vi.fn().mockReturnValue({
        connect: vi.fn(),
        disconnect: vi.fn(),
        onaudioprocess: null,
      });
    }

    vi.stubGlobal('AudioContext', StableAudioContext as unknown as typeof AudioContext);
    vi.stubGlobal('webkitAudioContext', StableAudioContext as unknown as typeof AudioContext);

    await expect(startCall('agent-1', createCallbacks())).resolves.toBeUndefined();
  });

  it('handles non-Error microphone failures with a generic startup error', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockRejectedValue({ reason: 'plain-object' }),
      },
    });

    await startCall('agent-1', createCallbacks());
    await Promise.resolve();
    await Promise.resolve();

    expect(getAudioContext()).toBeNull();
  });

  it('times out microphone access when getUserMedia never resolves', async () => {
    vi.useFakeTimers();
    const pendingPromise = new Promise<void>(() => {});

    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockReturnValue(pendingPromise),
      },
    });

    const startupPromise = startCall('agent-1', createCallbacks());
    await vi.advanceTimersByTimeAsync(15000);
    await startupPromise;

    expect(getAudioContext()).toBeNull();
    vi.useRealTimers();
  });

  it('ignores unlock source disconnect failures', () => {
    class ThrowingAudioContext {
      state = 'running';
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
        onended: null as (() => void) | null,
        disconnect: vi.fn(() => { throw new Error('disconnect-failed'); }),
      });
      createMediaStreamSource = vi.fn().mockReturnValue({ connect: vi.fn() });
      createAnalyser = vi.fn().mockReturnValue({ connect: vi.fn(), fftSize: 256 });
      createScriptProcessor = vi.fn().mockReturnValue({
        connect: vi.fn(),
        disconnect: vi.fn(),
        onaudioprocess: null,
      });
    }

    vi.stubGlobal('AudioContext', ThrowingAudioContext as unknown as typeof AudioContext);
    vi.stubGlobal('webkitAudioContext', ThrowingAudioContext as unknown as typeof AudioContext);

    prepareAudioPlaybackOnGesture();

    const context = getAudioContext() as unknown as {
      createBufferSource: { mock: { results: Array<{ value: { onended: (() => void) | null } }> } };
    };
    const source = context.createBufferSource.mock.results[0]?.value;
    source?.onended?.();
    expect(source).toBeDefined();
  });
});
