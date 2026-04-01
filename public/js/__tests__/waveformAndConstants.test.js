// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CONFIG, MESSAGE_TYPE } from '../constants/config.js';
import {
  AGENT_FORM_SCHEMA,
  API_REQUEST_SCHEMA,
  START_CALL_INPUT_SCHEMA,
  WS_INBOUND_MESSAGE_SCHEMA,
} from '../constants/inputSchemas.js';
import { UI_STRINGS } from '../constants/uiStrings.js';
import {
  drawIdleWaveform,
  initWaveform,
  startWaveformAnimation,
  stopWaveformAnimation,
} from '../waveform.js';

function createCanvasContextMock() {
  const gradientMock = { addColorStop: vi.fn() };
  return {
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    closePath: vi.fn(),
    createLinearGradient: vi.fn(() => gradientMock),
    createRadialGradient: vi.fn(() => gradientMock),
    fillRect: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    set fillStyle(/** @type {string | CanvasGradient | CanvasPattern} */ _value) {},
    set lineWidth(/** @type {number} */ _value) {},
    set shadowBlur(/** @type {number} */ _value) {},
    set shadowColor(/** @type {string} */ _value) {},
    set strokeStyle(/** @type {string | CanvasGradient | CanvasPattern} */ _value) {},
    stroke: vi.fn(),
  };
}

describe('waveform and frontend constants coverage', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('initializes waveform and animates frequency data safely', () => {
    const canvasContext = createCanvasContextMock();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      /** @type {any} */ (canvasContext),
    );

    /** @type {FrameRequestCallback | undefined} */
    let rafCallback;
    const raf = vi.fn((callback) => {
      rafCallback = callback;
      return 7;
    });
    const caf = vi.fn();
    vi.stubGlobal('requestAnimationFrame', raf);
    vi.stubGlobal('cancelAnimationFrame', caf);

    document.body.innerHTML = '<canvas id="waveform-canvas" width="200" height="100"></canvas>';

    initWaveform();
    drawIdleWaveform();

    const analyserNode = {
      frequencyBinCount: 8,
      getByteFrequencyData: (/** @type {Uint8Array} */ arr) => {
        arr.fill(200);
      },
    };

    startWaveformAnimation(/** @type {any} */ (analyserNode));
    expect(canvasContext.clearRect).toHaveBeenCalled();
    expect(raf).toHaveBeenCalled();

    if (typeof rafCallback === 'function') {
      rafCallback(0);
    }

    stopWaveformAnimation();
    expect(caf).toHaveBeenCalledWith(7);
  });

  it('covers low-volume waveform branch and delayed idle draw', () => {
    vi.useFakeTimers();
    const canvasContext = createCanvasContextMock();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      /** @type {any} */ (canvasContext),
    );

    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    document.body.innerHTML = '<canvas id="waveform-canvas" width="220" height="120"></canvas>';
    initWaveform();

    const analyserNode = {
      frequencyBinCount: 8,
      getByteFrequencyData: (/** @type {Uint8Array} */ arr) => {
        arr.fill(10);
      },
    };

    startWaveformAnimation(/** @type {any} */ (analyserNode));
    stopWaveformAnimation();
    vi.advanceTimersByTime(120);
    expect(canvasContext.stroke).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('returns early in waveform helpers when canvas is unavailable', () => {
    document.body.innerHTML = '';
    initWaveform();
    drawIdleWaveform();
    startWaveformAnimation(/** @type {any} */ (null));
    stopWaveformAnimation();
    expect(document.querySelector('canvas')).toBeNull();
  });

  it('covers frontend constants and schema validation', () => {
    expect(CONFIG.API_PREFIX).toBe('/api');
    expect(MESSAGE_TYPE.START_CALL).toBe('start-call');
    expect(UI_STRINGS.toasts.callStarted('X')).toContain('X');

    expect(API_REQUEST_SCHEMA.safeParse({ path: '/valid_path', options: {} }).success).toBe(true);
    expect(API_REQUEST_SCHEMA.safeParse({ path: 'invalid' }).success).toBe(false);

    expect(
      AGENT_FORM_SCHEMA.safeParse({
        id: '',
        name: 'n',
        systemPrompt: 's',
        voiceName: 'v',
        modelName: 'm',
      }).success,
    ).toBe(true);

    expect(START_CALL_INPUT_SCHEMA.safeParse({ agentId: 'a1' }).success).toBe(true);
    expect(START_CALL_INPUT_SCHEMA.safeParse({ agentId: '' }).success).toBe(false);

    expect(
      WS_INBOUND_MESSAGE_SCHEMA.safeParse({
        type: MESSAGE_TYPE.TRANSCRIPT,
        role: 'user',
        text: 'hello',
      }).success,
    ).toBe(true);

    expect(WS_INBOUND_MESSAGE_SCHEMA.safeParse({ type: 'bad' }).success).toBe(false);
  });

  it('covers UI string formatter functions', () => {
    expect(UI_STRINGS.agentList.card.createdAt('2026-01-01').length).toBeGreaterThan(0);
    expect(UI_STRINGS.toasts.callStarted('Agent')).toContain('Agent');
    expect(UI_STRINGS.signaling.errors.unknownMessageType('x')).toContain('x');
    expect(UI_STRINGS.signaling.logs.wsClosed(1000)).toContain('1000');
    expect(UI_STRINGS.signaling.logs.sendingStart('id-1')).toContain('id-1');
    expect(UI_STRINGS.signaling.logs.recvType('call-started')).toContain('call-started');
    expect(UI_STRINGS.signaling.logs.audioRelay(3)).toContain('3');
    expect(UI_STRINGS.signaling.logs.callEndCleanup.length).toBeGreaterThan(0);
    expect(UI_STRINGS.signaling.logs.callEndComplete.length).toBeGreaterThan(0);
    expect(UI_STRINGS.signaling.logs.startCallFailed('fail')).toContain('fail');
    expect(UI_STRINGS.signaling.logs.callEnded('done')).toContain('done');
    expect(UI_STRINGS.signaling.logs.callError('err')).toContain('err');
    expect(UI_STRINGS.signaling.logs.transcriptUser(7)).toContain('7');
    expect(UI_STRINGS.signaling.logs.transcriptModel(8)).toContain('8');
    expect(UI_STRINGS.signaling.logs.unknownType('bad')).toContain('bad');
  });
});
