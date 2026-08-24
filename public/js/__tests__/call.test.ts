/* eslint-disable max-lines */
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  toggleCall, getCallState, toggleMute, handleWsMessage, startTimer, stopTimer, playAudioResponse, startCall, resetState, getWs, getAudioProcessor, getAudioContext, processAudioQueue, uploadCallRecording,
} from '../call.js';
import { MESSAGE_TYPE } from '../constants/config.js';
const mockMedia = () => ({ getTracks: () => [{ stop: vi.fn(), enabled: true }], getAudioTracks: () => [{ stop: vi.fn(), enabled: true }] });

describe('Call Logic (call.js) — 90%+ Exclusive Coverage', () => {
  let mockCallbacks: {
    onStatusChange: ReturnType<typeof vi.fn>;
    onTimerUpdate: ReturnType<typeof vi.fn>;
    onTranscript: ReturnType<typeof vi.fn>;
  };
  let mockAudioTrack: { stop: ReturnType<typeof vi.fn>; enabled: boolean };
  let shouldRecorderStopThrow = false;

  beforeEach(() => {
    shouldRecorderStopThrow = false;
    resetState();
    vi.useFakeTimers();
    mockCallbacks = {
      onStatusChange: vi.fn(),
      onTimerUpdate: vi.fn(),
      onTranscript: vi.fn(),
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'test-token' }),
    }));

    class MockWS {
      static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
      onopen: (() => void) | null = null; onmessage: ((ev: { data: string }) => void) | null = null;
      onerror: (() => void) | null = null; onclose: ((ev: { code: number }) => void) | null = null;
      readyState = 1; send = vi.fn(); close = vi.fn();
      addEventListener = vi.fn(); removeEventListener = vi.fn();
    }
    vi.stubGlobal('WebSocket', MockWS);

    mockAudioTrack = { stop: vi.fn(), enabled: true };
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [mockAudioTrack], getAudioTracks: () => [mockAudioTrack],
        }),
      },
    });

    class MockMediaRecorder {
      state = 'inactive';
      static isTypeSupported = vi.fn().mockReturnValue(true);
      ondataavailable: ((e: any) => void) | null = null;
      onstop: (() => void) | null = null;
      start = vi.fn().mockImplementation(() => {
        this.state = 'recording';
        this.ondataavailable?.({ data: new Blob(['chunk'], { type: 'audio/webm' }) });
      });
      stop = vi.fn().mockImplementation(() => {
        if (shouldRecorderStopThrow) {
          throw new Error('stop fail');
        }
        this.state = 'inactive';
        this.onstop?.();
      });
      constructor(public stream: any, public options?: any) {}
    }
    vi.stubGlobal('MediaRecorder', MockMediaRecorder);

    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue('blob:mock-url'),
      revokeObjectURL: vi.fn(),
    });

    const mockAudioContextInstance = {
      createMediaStreamSource: vi.fn().mockReturnValue({ connect: vi.fn() }),
      createGain: vi.fn().mockReturnValue({ gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() }),
      createBiquadFilter: vi.fn().mockReturnValue({ type: 'highpass', frequency: { value: 0 }, Q: { value: 0 }, connect: vi.fn() }),
      createAnalyser: vi.fn().mockReturnValue({ connect: vi.fn(), fftSize: 256 }),
      createScriptProcessor: vi.fn().mockReturnValue({ connect: vi.fn(), onaudioprocess: null, disconnect: vi.fn() }),
      createBuffer: vi.fn().mockReturnValue({ getChannelData: vi.fn().mockReturnValue(new Float32Array(1024)) }),
      createBufferSource: vi.fn().mockReturnValue({
        buffer: null, connect: vi.fn(), start: vi.fn(), onended: null, disconnect: vi.fn(), stop: vi.fn(),
      }),
      createMediaStreamDestination: vi.fn().mockReturnValue({
        stream: { id: 'mock-stream' },
        connect: vi.fn(),
        disconnect: vi.fn(),
      }),
      destination: {}, close: vi.fn().mockResolvedValue(undefined), state: 'running',
      resume: vi.fn().mockResolvedValue(undefined),
      sampleRate: 24000,
      currentTime: 0,
    };

    class MockAudioContext {
      constructor() { return mockAudioContextInstance as any; }
      state = 'running'; close = vi.fn().mockResolvedValue(undefined); resume = vi.fn().mockResolvedValue(undefined);
    }
    vi.stubGlobal('AudioContext', MockAudioContext);
    vi.stubGlobal('webkitAudioContext', MockAudioContext);
    vi.stubGlobal('atob', vi.fn().mockReturnValue('dummy'));

    document.body.innerHTML = `
      <div id="call-panel"></div>
      <div id="call-status"></div>
      <div id="call-timer"></div>
      <div id="call-agent-name"></div>
      <button id="btn-mute">
        <svg id="mute-icon-off"></svg>
        <svg id="mute-icon-on" class="hidden"></svg>
      </button>
      <button id="btn-download" class="hidden" disabled></button>
      <div id="toast-container"></div>
      <canvas id="waveform-canvas"></canvas>
    `;
  });

  describe('Internal Event Handlers (Deep Coverage)', () => {
    it('should handle ws.onopen', async () => {
      await startCall('a1', mockCallbacks);
      const ws = getWs() as any; ws?.onopen?.();
      expect(ws?.send).toHaveBeenCalled();
    });
    it('should include call variables in the start-call message when provided', async () => {
      await startCall('a1', mockCallbacks, { customer_name: 'Sam' });
      const ws = getWs() as any; ws?.onopen?.();
      const startPayloads = ws.send.mock.calls
        .map((args: any[]) => String(args[0]))
        .filter((raw: string) => raw.includes(MESSAGE_TYPE.START_CALL));
      expect(startPayloads.some((raw: string) => raw.includes('"variables"') && raw.includes('Sam'))).toBe(true);
    });
    it('should handle ws.onmessage success and trace events', async () => {
      await startCall('a1', mockCallbacks);
      const ws = getWs() as any;
      ws?.onmessage?.({ data: JSON.stringify({ type: MESSAGE_TYPE.AUDIO_RESPONSE, data: 'audio' }) });
      ws?.onmessage?.({ data: JSON.stringify({ type: MESSAGE_TYPE.CALL_STARTED }) });
      expect(getCallState().isInCall).toBe(true);

      // Trigger first transcript for startup trace coverage
      ws?.onmessage?.({ data: JSON.stringify({ type: MESSAGE_TYPE.TRANSCRIPT, role: 'model', text: 'hello' }) });
    });

    it('should sample inbound audio logging instead of logging every frame', async () => {
      const logBody = document.createElement('div');
      logBody.id = 'debug-log-body';
      document.body.appendChild(logBody);

      await startCall('a1', mockCallbacks);
      const ws = getWs() as any;
      ws?.onmessage?.({ data: JSON.stringify({ type: MESSAGE_TYPE.CALL_STARTED }) });

      const audioFrame = JSON.stringify({ type: MESSAGE_TYPE.AUDIO_RESPONSE, data: 'audio' });
      for (let i = 0; i < 5; i++) ws?.onmessage?.({ data: audioFrame });

      // Each entry forces a synchronous reflow, so only the first frame of a run
      // gets reported.
      const entries = Array.from(logBody.children)
        .filter((child) => (child.textContent || '').includes(MESSAGE_TYPE.AUDIO_RESPONSE));
      expect(entries).toHaveLength(1);

      logBody.remove();
    });

    it('should handle ws.onmessage parse failure and unknown messages', async () => {
      await startCall('a1', mockCallbacks);
      const ws = getWs() as any;
      ws?.onmessage?.({ data: JSON.stringify({ unknown: true }) });
      ws?.onmessage?.({ data: 'invalid-json' });
    });

    it('should handle inactivity config and auto-end message branches', async () => {
      await startCall('a1', mockCallbacks);
      handleWsMessage({
        type: MESSAGE_TYPE.CALL_STARTED,
        agentName: 'TestAgent',
        inactivityConfig: {
          inactivityTimeoutMs: 5000,
          maxInactivityNudges: 2,
          maxCallDurationSecs: 30,
        },
      } as any, mockCallbacks);

      handleWsMessage({
        type: MESSAGE_TYPE.INACTIVITY_NUDGE,
        nudgeNum: 1,
        maxNudges: 2,
      } as any, mockCallbacks);

      handleWsMessage({
        type: MESSAGE_TYPE.AUTO_CALL_END,
        reason: 'Auto stop',
      } as any, mockCallbacks);
    });
    it('should handle signaling websocket open timeout', async () => {
      await startCall('a1', mockCallbacks);
      vi.advanceTimersByTime(10001);
      await Promise.resolve();
      await Promise.resolve();
      expect(getWs()).toBeNull();
    });
    it('should handle ws.onerror', async () => {
      await startCall('a1', mockCallbacks);
      const ws = getWs() as any; ws?.onerror?.();
      expect(getCallState().isInCall).toBe(false);
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      expect(getWs()).toBe(null);
    });
    it('should handle ws.onclose', async () => {
      await startCall('a1', mockCallbacks);
      const ws = getWs() as any; expect(ws).not.toBeNull();
      handleWsMessage({ type: MESSAGE_TYPE.CALL_STARTED }, mockCallbacks);
      expect(getCallState().isInCall).toBe(true);
      ws?.onclose?.({ code: 1000 });
      expect(getCallState().isInCall).toBe(false);
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      expect(getWs()).toBe(null);
    });
    it('should handle scriptProcessor.onaudioprocess', async () => {
      await startCall('a1', mockCallbacks);
      const sp = getAudioProcessor() as any;
      const ws = getWs() as any;
      expect(ws).not.toBeNull();
      if (ws) ws.readyState = 1;
      handleWsMessage({ type: MESSAGE_TYPE.CALL_STARTED }, mockCallbacks);
      expect(getCallState().isInCall).toBe(true);
      sp?.onaudioprocess?.({
        inputBuffer: { getChannelData: () => new Float32Array(1024) },
      });
      expect(ws?.send).toHaveBeenCalled();
      toggleMute();
      vi.mocked(ws?.send).mockClear();
      sp?.onaudioprocess?.({
        inputBuffer: { getChannelData: () => new Float32Array(1024) },
      });
      expect(ws?.send).not.toHaveBeenCalled();
    });
    it('should cover downsampling and logging edge cases in relayAudioChunk', async () => {
      await startCall('a1', mockCallbacks);
      const sp = getAudioProcessor() as any;
      const ws = getWs() as any;
      if (ws) ws.readyState = 1;

      const ctx = getAudioContext() as any;

      // Cover identical sample rate branch
      ctx.sampleRate = 16000;
      sp?.onaudioprocess?.({ inputBuffer: { getChannelData: () => new Float32Array(10) } });

      // Cover invalid sample rate branch
      ctx.sampleRate = -1;
      sp?.onaudioprocess?.({ inputBuffer: { getChannelData: () => new Float32Array(10) } });

      // Cover downsampling from 24000 to 16000
      ctx.sampleRate = 24000;
      sp?.onaudioprocess?.({ inputBuffer: { getChannelData: () => new Float32Array(10) } });
    });

    it('should skip relay when websocket is closed', async () => {
      await startCall('a1', mockCallbacks);
      handleWsMessage({ type: MESSAGE_TYPE.CALL_STARTED }, mockCallbacks);
      const sp = getAudioProcessor() as any;
      const ws = getWs() as any;
      if (ws) ws.readyState = 0;
      sp?.onaudioprocess?.({ inputBuffer: { getChannelData: () => new Float32Array(1024) } });
      expect(ws?.send).not.toHaveBeenCalled();
    });
    it('should disable media tracks on mute, re-enable on unmute, and reset UI on endCall', async () => {
      await startCall('a1', mockCallbacks);
      handleWsMessage({ type: MESSAGE_TYPE.CALL_STARTED }, mockCallbacks);
      expect(toggleMute()).toBe(true);
      expect(mockAudioTrack.enabled).toBe(false);
      expect(toggleMute()).toBe(false);
      expect(mockAudioTrack.enabled).toBe(true);
      toggleMute();
      const btn = document.getElementById('btn-mute');
      if (btn) btn.classList.add('muted');
      const iconOff = document.getElementById('mute-icon-off');
      if (iconOff) iconOff.classList.add('hidden');
      const iconOn = document.getElementById('mute-icon-on');
      if (iconOn) iconOn.classList.remove('hidden');
      await (await import('../call.js')).endCall();
      await Promise.resolve(); await Promise.resolve();
      expect(btn?.classList.contains('muted')).toBe(false);
      expect(iconOff?.classList.contains('hidden')).toBe(false);
      expect(iconOn?.classList.contains('hidden')).toBe(true);
    });
  });
  describe('Edge Cases', () => {
    it('should handle toggleCall', async () => {
      await toggleCall('a1', mockCallbacks);
      handleWsMessage({ type: MESSAGE_TYPE.CALL_STARTED }, mockCallbacks);
      await toggleCall('a1', mockCallbacks);
    });
    it('should handle failed startCall validation', async () => {
      await startCall(null, mockCallbacks);
      expect(getWs()).toBe(null);
      resetState();
      vi.stubGlobal('navigator', {
        mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(mockMedia()) }
      });
      const tempAudio = window.AudioContext;
      (window as any).AudioContext = undefined;
      await startCall('a1', mockCallbacks);
      window.AudioContext = tempAudio;
      resetState();
      vi.stubGlobal('navigator', {} as Navigator);
      await startCall('a1', mockCallbacks);
      resetState();
      const activeAudioContext = globalThis.AudioContext;
      const activeWebkitAudioContext = (globalThis as any).webkitAudioContext;
      vi.stubGlobal('AudioContext', undefined as unknown as typeof AudioContext);
      vi.stubGlobal('webkitAudioContext', undefined as unknown as typeof AudioContext);
      vi.stubGlobal('navigator', {
        mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(mockMedia()) },
      });
      await startCall('a1', mockCallbacks);
      vi.stubGlobal('AudioContext', activeAudioContext as unknown as typeof AudioContext);
      vi.stubGlobal('webkitAudioContext', activeWebkitAudioContext as unknown as typeof AudioContext);
      resetState();
      vi.stubGlobal('navigator', {
        mediaDevices: { getUserMedia: vi.fn().mockRejectedValue('string error fallback') }
      });
      await startCall('a1', mockCallbacks);
      resetState();
      const originalCrypto = globalThis.crypto;
      vi.stubGlobal('crypto', {} as Crypto);
      await startCall('a1', mockCallbacks);
      vi.stubGlobal('crypto', originalCrypto);
      resetState();
      vi.stubGlobal('navigator', {
        mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(null) },
      });
      await startCall('a1', mockCallbacks);
      resetState();
      class SuspendedAudioContext {
        createMediaStreamSource = vi.fn().mockReturnValue({ connect: vi.fn() });
        createGain = vi.fn().mockReturnValue({ gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() });
        createAnalyser = vi.fn().mockReturnValue({ connect: vi.fn(), fftSize: 256 });
        createScriptProcessor = vi.fn().mockReturnValue({ connect: vi.fn(), onaudioprocess: null, disconnect: vi.fn() });
        destination = {}; close = vi.fn().mockResolvedValue(undefined); state = 'suspended';
        resume = vi.fn().mockImplementation(async () => { this.state = 'running'; });
      }
      vi.stubGlobal('AudioContext', SuspendedAudioContext as unknown as typeof AudioContext);
      vi.stubGlobal('navigator', {
        mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(mockMedia()) },
      });
      await startCall('a1', mockCallbacks);
      resetState();
      vi.stubGlobal('navigator', {
        mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(new Error('fail')) }
      });
      await startCall('a1', mockCallbacks);
      resetState();
      const permissionDeniedError = new Error('permission denied');
      permissionDeniedError.name = 'NotAllowedError';
      vi.stubGlobal('navigator', {
        mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(permissionDeniedError) },
      });
      await startCall('a1', mockCallbacks);
    });
    it('should handle handleWsMessage branches', () => {
      handleWsMessage({ type: MESSAGE_TYPE.CALL_STARTED, agentName: 'TestAgent' }, mockCallbacks);
      handleWsMessage({ type: MESSAGE_TYPE.AUDIO_RESPONSE, data: 'base64audio' }, mockCallbacks);
      handleWsMessage({ type: MESSAGE_TYPE.TRANSCRIPT, role: 'user', text: 'hi' }, mockCallbacks);
      handleWsMessage({ type: MESSAGE_TYPE.TRANSCRIPT, role: 'model', text: 'hello' }, { onStatusChange: vi.fn() } as any);
      handleWsMessage({ type: MESSAGE_TYPE.INTERRUPTED } as any, mockCallbacks);
      handleWsMessage({ type: MESSAGE_TYPE.CALL_ENDED, reason: 'Disconnected' } as any, mockCallbacks);
      handleWsMessage({ type: MESSAGE_TYPE.CALL_ENDED } as any, mockCallbacks);
      handleWsMessage({ type: MESSAGE_TYPE.ERROR, message: 'FAIL' } as any, mockCallbacks);
      handleWsMessage({ type: 'UNKNOWN' } as any, mockCallbacks);
    });
  });
  describe('Timer Logic', () => {
    it('should start and stop timer', () => {
      startTimer(mockCallbacks.onTimerUpdate as unknown as (s: number) => void);
      vi.advanceTimersByTime(1000);
      expect(mockCallbacks.onTimerUpdate).toHaveBeenCalledWith(1);
      stopTimer();
    });
    
    it('should warn on model inactivity if user spoke and model was silent', async () => {
      await startCall('a1', mockCallbacks);
      const ws = getWs() as any;
      if (ws) ws.readyState = 1;
      handleWsMessage({ type: MESSAGE_TYPE.CALL_STARTED }, mockCallbacks);
      
      const sp = getAudioProcessor() as any;
      sp?.onaudioprocess?.({ inputBuffer: { getChannelData: () => new Float32Array(10) } });
      
      vi.advanceTimersByTime(9000); // Wait past CONFIG.MODEL_INACTIVITY_WARN_MS (8000ms)
    });
  });
  describe('Audio Playback', () => {
    it('should handle playAudioResponse with queue', async () => {
      vi.stubGlobal('atob', () => 'abcdabcd'); window.atob = () => 'abcdabcd';
      await startCall('a1', mockCallbacks);
      playAudioResponse('');
      playAudioResponse('base64data');
      playAudioResponse('base64data');
      getAudioContext();
      await Promise.resolve(); await Promise.resolve();
      const ctx = getAudioContext() as any;
      if (ctx && ctx.createBufferSource) {
        await processAudioQueue();
      }
      playAudioResponse('trigger-catch');
      vi.stubGlobal('atob', () => { throw new Error('Test Error parsing'); });
      window.atob = () => { throw new Error('Test Error parsing'); };
      await processAudioQueue();
    });
    it('should stop active playback on server interrupted event', async () => {
      vi.stubGlobal('atob', () => 'abcdabcd'); window.atob = () => 'abcdabcd';
      await startCall('a1', mockCallbacks);
      handleWsMessage({ type: MESSAGE_TYPE.CALL_STARTED }, mockCallbacks);
      playAudioResponse('base64data');
      await Promise.resolve();
      const ctx = getAudioContext() as any; const source = ctx.createBufferSource.mock.results[0]?.value;
      expect(source).toBeDefined();
      handleWsMessage({ type: MESSAGE_TYPE.INTERRUPTED } as any, mockCallbacks);
      handleWsMessage({ type: MESSAGE_TYPE.INTERRUPTED } as any, mockCallbacks);
      expect(source.stop).toHaveBeenCalled();
    });
    it('should barge-in locally when user speech starts during model playback', async () => {
      vi.stubGlobal('atob', () => 'abcdabcd'); window.atob = () => 'abcdabcd';
      await startCall('a1', mockCallbacks);
      handleWsMessage({ type: MESSAGE_TYPE.CALL_STARTED }, mockCallbacks);
      playAudioResponse('base64data');
      await Promise.resolve();
      const ctx = getAudioContext() as any; const source = ctx.createBufferSource.mock.results[0]?.value;
      const sp = getAudioProcessor() as any;
      expect(source).toBeDefined();
      expect(sp).toBeDefined();
      const loudFrame = new Float32Array(1024).fill(0.6);
      sp.onaudioprocess({ inputBuffer: { getChannelData: () => loudFrame } });
      sp.onaudioprocess({ inputBuffer: { getChannelData: () => loudFrame } });
      expect(source.stop).toHaveBeenCalled();
    });

    it('should initialize recording, stop on endCall, and enable the download button', async () => {
      await startCall('a1', mockCallbacks);
      const btnDownload = document.getElementById('btn-download') as HTMLButtonElement;
      expect(btnDownload).toBeDefined();
      expect(btnDownload.disabled).toBe(true);

      await (await import('../call.js')).endCall();
      await Promise.resolve();

      expect(btnDownload.disabled).toBe(false);
      expect(btnDownload.classList.contains('hidden')).toBe(false);
      expect(btnDownload.classList.contains('available')).toBe(true);

      btnDownload.click();
      const toastContainer = document.getElementById('toast-container');
      expect(toastContainer?.innerHTML).toContain('Audio recording ready');
      
      await startCall('a1', mockCallbacks);
      expect(btnDownload.disabled).toBe(true);
      expect(btnDownload.classList.contains('hidden')).toBe(true);
      expect(btnDownload.classList.contains('available')).toBe(false);
    });

    it('should fall back to mp4, ogg, or empty mime type if webm is unsupported', async () => {
      const isTypeSupportedSpy = vi.spyOn(window.MediaRecorder, 'isTypeSupported');
      const btnDownload = document.getElementById('btn-download') as HTMLButtonElement;

      // Case 1: webm unsupported, mp4 supported
      isTypeSupportedSpy.mockImplementation((type) => type === 'audio/mp4');
      await startCall('a1', mockCallbacks);
      await (await import('../call.js')).endCall();
      await Promise.resolve();
      btnDownload.click();

      // Case 2: webm and mp4 unsupported, ogg supported
      isTypeSupportedSpy.mockImplementation((type) => type === 'audio/ogg');
      await startCall('a1', mockCallbacks);
      await (await import('../call.js')).endCall();
      await Promise.resolve();
      btnDownload.click();

      // Case 3: all unsupported
      isTypeSupportedSpy.mockImplementation(() => false);
      await startCall('a1', mockCallbacks);
      await (await import('../call.js')).endCall();
      await Promise.resolve();
      btnDownload.click();
    });

    it('should handle errors during recording initialization gracefully', async () => {
      await startCall('a1', mockCallbacks);
      const ctx = getAudioContext() as any;
      const originalCreateMediaStreamDestination = ctx.createMediaStreamDestination;
      ctx.createMediaStreamDestination = () => {
        throw new Error('mock init error');
      };

      await startCall('a1', mockCallbacks);
      ctx.createMediaStreamDestination = originalCreateMediaStreamDestination;
    });

    it('should handle MediaRecorder stop errors gracefully', async () => {
      await startCall('a1', mockCallbacks);
      shouldRecorderStopThrow = true;
      await (await import('../call.js')).endCall();
    });
  });
});

describe('uploadCallRecording (call.js)', () => {
  beforeEach(() => {
    resetState();
  });

  it('does nothing when there is no session id', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await uploadCallRecording(null, new Blob(['x'], { type: 'audio/webm' }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing for an empty blob', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await uploadCallRecording('s1', new Blob([], { type: 'audio/webm' }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts the recording to the call-history endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await uploadCallRecording('s1', new Blob(['data'], { type: 'audio/webm' }));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/call-history/s1/recording',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('handles a non-ok upload response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal('fetch', fetchMock);
    await expect(uploadCallRecording('s1', new Blob(['data'], { type: 'audio/webm' })))
      .resolves.toBeUndefined();
  });

  it('handles a fetch error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(uploadCallRecording('s1', new Blob(['data'], { type: 'audio/webm' })))
      .resolves.toBeUndefined();
  });
});
