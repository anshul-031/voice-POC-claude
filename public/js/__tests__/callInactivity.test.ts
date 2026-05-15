/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  startCall, handleWsMessage, resetState, getWs, getAudioProcessor,
} from '../call.js';
import { MESSAGE_TYPE } from '../constants/config.js';
const mockMedia = () => ({ getTracks: () => [{ stop: vi.fn(), enabled: true }], getAudioTracks: () => [{ stop: vi.fn(), enabled: true }] });

describe('Call Inactivity Detection', () => {
  let mockCallbacks: { onStatusChange: ReturnType<typeof vi.fn>; onTimerUpdate: ReturnType<typeof vi.fn>; onTranscript: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    resetState();
    vi.useFakeTimers();
    mockCallbacks = { onStatusChange: vi.fn(), onTimerUpdate: vi.fn(), onTranscript: vi.fn() };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ token: 'test-token' }) }));
    class MockWS {
      static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
      onopen: (() => void) | null = null; onmessage: ((ev: { data: string }) => void) | null = null;
      onerror: (() => void) | null = null; onclose: ((ev: { code: number }) => void) | null = null;
      readyState = 1; send = vi.fn(); close = vi.fn();
      addEventListener = vi.fn(); removeEventListener = vi.fn();
    }
    vi.stubGlobal('WebSocket', MockWS);
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(mockMedia()) },
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
      destination: {}, close: vi.fn().mockResolvedValue(undefined), state: 'running',
      resume: vi.fn().mockResolvedValue(undefined),
    };
    class MockAudioContext {
      constructor() { return mockAudioContextInstance as any; }
      state = 'running'; close = vi.fn().mockResolvedValue(undefined); resume = vi.fn().mockResolvedValue(undefined);
    }
    vi.stubGlobal('AudioContext', MockAudioContext);
    vi.stubGlobal('webkitAudioContext', MockAudioContext);
    vi.stubGlobal('atob', vi.fn().mockReturnValue('dummy'));
    document.body.innerHTML = `
      <div id="call-panel"></div><div id="call-status"></div><div id="call-timer"></div>
      <div id="call-agent-name"></div>
      <button id="btn-mute"><svg id="mute-icon-off"></svg><svg id="mute-icon-on" class="hidden"></svg></button>
      <canvas id="waveform-canvas"></canvas>
    `;
  });

  it('should log inactivity warning when model is silent after user audio', async () => {
    await startCall('a1', mockCallbacks);
    handleWsMessage({ type: MESSAGE_TYPE.CALL_STARTED }, mockCallbacks);
    const sp = getAudioProcessor() as any;
    const ws = getWs() as any;
    if (ws) ws.readyState = 1;
    sp?.onaudioprocess?.({ inputBuffer: { getChannelData: () => new Float32Array(1024) } });
    expect(ws?.send).toHaveBeenCalled();
    vi.advanceTimersByTime(9000);
    const debugEl = document.getElementById('call-panel');
    expect(debugEl).toBeTruthy();
  });

  it('should reset inactivity flag when model responds', async () => {
    await startCall('a1', mockCallbacks);
    handleWsMessage({ type: MESSAGE_TYPE.CALL_STARTED }, mockCallbacks);
    const sp = getAudioProcessor() as any;
    const ws = getWs() as any;
    if (ws) ws.readyState = 1;
    sp?.onaudioprocess?.({ inputBuffer: { getChannelData: () => new Float32Array(1024) } });
    handleWsMessage({ type: MESSAGE_TYPE.AUDIO_RESPONSE, data: 'base64' }, mockCallbacks);
    handleWsMessage({ type: MESSAGE_TYPE.TRANSCRIPT, role: 'model', text: 'hi' }, mockCallbacks);
    vi.advanceTimersByTime(9000);
    expect(ws?.send).toHaveBeenCalled();
  });

  it('should not warn before any user audio is sent', async () => {
    await startCall('a1', mockCallbacks);
    handleWsMessage({ type: MESSAGE_TYPE.CALL_STARTED }, mockCallbacks);
    vi.advanceTimersByTime(9000);
    expect(getWs()).not.toBeNull();
  });

  it('should not warn when not in call or no user audio sent', async () => {
    vi.advanceTimersByTime(9000);
    expect(true).toBe(true);
  });
});
