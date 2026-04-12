/**
 * @vitest-environment jsdom
 */
/* eslint-disable max-lines */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  toggleCall, getCallState, toggleMute, handleWsMessage, startTimer, stopTimer, playAudioResponse, startCall, resetState, getWs, getAudioProcessor, getAudioContext, processAudioQueue,
} from '../call.js';
import { MESSAGE_TYPE } from '../constants/config.js';

describe('Call Logic (call.js) — 90%+ Exclusive Coverage', () => {
  let mockCallbacks: {
    onStatusChange: ReturnType<typeof vi.fn>;
    onTimerUpdate: ReturnType<typeof vi.fn>;
    onTranscript: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
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
      addEventListener = vi.fn();
      removeEventListener = vi.fn();
    }
    vi.stubGlobal('WebSocket', MockWS);

    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn(), enabled: true }],
        }),
      },
    });

    const mockAudioContextInstance = {
      createMediaStreamSource: vi.fn().mockReturnValue({ connect: vi.fn() }),
      createGain: vi.fn().mockReturnValue({ gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() }),
      createBiquadFilter: vi.fn().mockReturnValue({
        type: 'highpass',
        frequency: { value: 0 },
        Q: { value: 0 },
        connect: vi.fn(),
      }),
      createAnalyser: vi.fn().mockReturnValue({ connect: vi.fn(), fftSize: 256 }),
      createScriptProcessor: vi.fn().mockReturnValue({ 
        connect: vi.fn(), 
        onaudioprocess: null,
        disconnect: vi.fn(),
      }),
      createBuffer: vi.fn().mockReturnValue({
        getChannelData: vi.fn().mockReturnValue(new Float32Array(1024)),
      }),
      createBufferSource: vi.fn().mockReturnValue({
        buffer: null,
        connect: vi.fn(),
        start: vi.fn(),
        onended: null,
        disconnect: vi.fn(),
        stop: vi.fn(),
      }),
      destination: {},
      close: vi.fn().mockResolvedValue(undefined),
      state: 'running',
      resume: vi.fn().mockResolvedValue(undefined),
    };

    class MockAudioContext {
      constructor() { return mockAudioContextInstance as any; }
      state = 'running';
      close = vi.fn().mockResolvedValue(undefined);
      resume = vi.fn().mockResolvedValue(undefined);
    }
    vi.stubGlobal('AudioContext', MockAudioContext);
    vi.stubGlobal('webkitAudioContext', MockAudioContext);
    vi.stubGlobal('atob', vi.fn().mockReturnValue('dummy'));

    document.body.innerHTML = `
      <div id="call-panel"></div>
      <div id="call-status"></div>
      <div id="call-timer"></div>
      <div id="call-agent-name"></div>
      <button id="btn-mute"></button>
      <canvas id="waveform-canvas"></canvas>
    `;
  });

  describe('Internal Event Handlers (Deep Coverage)', () => {
    it('should handle ws.onopen', async () => {
      await startCall('a1', mockCallbacks);
      const ws = getWs() as any; ws?.onopen?.();
      expect(ws?.send).toHaveBeenCalled();
    });

    it('should handle ws.onmessage success and parse fail', async () => {
      await startCall('a1', mockCallbacks);
      const ws = getWs() as any;
      ws?.onmessage?.({ data: JSON.stringify({ type: MESSAGE_TYPE.AUDIO_RESPONSE, data: 'audio' }) });
      ws?.onmessage?.({ data: JSON.stringify({ type: MESSAGE_TYPE.CALL_STARTED }) });
      expect(getCallState().isInCall).toBe(true);
      ws?.onmessage?.({ data: JSON.stringify({ unknown: true }) });
      ws?.onmessage?.({ data: 'invalid-json' });
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
        mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn(), enabled: true }] }) }
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
        mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn(), enabled: true }] }) },
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
        destination = {};
        close = vi.fn().mockResolvedValue(undefined);
        state = 'suspended';
        resume = vi.fn().mockImplementation(async () => {
          this.state = 'running';
        });
      }
      vi.stubGlobal('AudioContext', SuspendedAudioContext as unknown as typeof AudioContext);
      vi.stubGlobal('navigator', {
        mediaDevices: {
          getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn(), enabled: true }] }),
        },
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
  });
});
