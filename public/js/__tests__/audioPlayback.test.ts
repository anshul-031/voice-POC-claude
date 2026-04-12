/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  detectSpeechBargeIn,
  enqueueAudio,
  getIsPlayingAudio,
  hasModelPlayback,
  interruptModelPlayback,
  processAudioQueue,
  resamplePcm,
  resetAudioPlaybackState,
} from '../audioPlayback.js';

describe('audioPlayback module', () => {
  beforeEach(() => {
    resetAudioPlaybackState();
    vi.restoreAllMocks();
    vi.stubGlobal('atob', () => 'abcdabcd');
    window.atob = () => 'abcdabcd';
  });

  it('handles enqueue, playback, and interruption lifecycle', async () => {
    expect(enqueueAudio('')).toBe(false);
    expect(enqueueAudio('base64')).toBe(true);
    expect(hasModelPlayback()).toBe(true);

    const sourceNode: any = {
      buffer: null,
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      disconnect: vi.fn(),
      onended: null,
    };
    const context = {
      state: 'running',
      destination: {},
      createGain: vi.fn().mockReturnValue({
        gain: { value: 0 },
        connect: vi.fn(),
        disconnect: vi.fn(),
      }),
      createBuffer: vi.fn().mockReturnValue({
        getChannelData: vi.fn().mockReturnValue(new Float32Array(8)),
      }),
      createBufferSource: vi.fn().mockReturnValue(sourceNode),
    };
    const analyser = { connect: vi.fn() };

    await processAudioQueue(context as any, analyser as any);
    expect(getIsPlayingAudio()).toBe(true);
    expect(sourceNode.start).toHaveBeenCalled();

    sourceNode.onended?.();
    await Promise.resolve();
    expect(getIsPlayingAudio()).toBe(false);

    expect(interruptModelPlayback()).toBe(false);
  });

  it('supports local barge-in detection and cooldown behavior', () => {
    expect(enqueueAudio('pending-audio')).toBe(true);
    const loudFrame = new Float32Array(1024).fill(0.8);

    expect(detectSpeechBargeIn(loudFrame)).toBe(false);
    expect(detectSpeechBargeIn(loudFrame)).toBe(true);
    expect(hasModelPlayback()).toBe(false);

    expect(enqueueAudio('pending-audio-2')).toBe(true);
    expect(detectSpeechBargeIn(loudFrame)).toBe(false);

    const quietFrame = new Float32Array(1024).fill(0.001);
    expect(detectSpeechBargeIn(quietFrame)).toBe(false);
  });

  it('adapts barge-in threshold against steady background noise', () => {
    expect(enqueueAudio('steady-noise-audio')).toBe(true);

    const noisyBaselineFrame = new Float32Array(1024).fill(0.04);
    for (let i = 0; i < 10; i++) {
      expect(detectSpeechBargeIn(noisyBaselineFrame)).toBe(false);
    }

    const realSpeechFrame = new Float32Array(1024).fill(0.12);
    expect(detectSpeechBargeIn(realSpeechFrame)).toBe(false);
    expect(detectSpeechBargeIn(realSpeechFrame)).toBe(true);
  });

  it('covers null-context early return and decoder catch path', async () => {
    enqueueAudio('x');
    await processAudioQueue(null, null);
    expect(getIsPlayingAudio()).toBe(false);

    enqueueAudio('y');
    vi.stubGlobal('atob', () => {
      throw new Error('decode-fail');
    });
    window.atob = () => {
      throw new Error('decode-fail');
    };

    const context = {
      state: 'running',
      destination: {},
      createGain: vi.fn().mockReturnValue({
        gain: { value: 0 },
        connect: vi.fn(),
        disconnect: vi.fn(),
      }),
      createBuffer: vi.fn().mockReturnValue({
        getChannelData: vi.fn().mockReturnValue(new Float32Array(8)),
      }),
      createBufferSource: vi.fn(),
    };

    await processAudioQueue(context as any, null);
    expect(getIsPlayingAudio()).toBe(false);
  });

  it('resumes suspended audio context before playback', async () => {
    enqueueAudio('z');

    const sourceNode: any = {
      buffer: null,
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      disconnect: vi.fn(),
      onended: null,
    };

    const context = {
      state: 'suspended',
      destination: {},
      createGain: vi.fn().mockReturnValue({
        gain: { value: 0 },
        connect: vi.fn(),
        disconnect: vi.fn(),
      }),
      resume: vi.fn().mockImplementation(async () => {
        context.state = 'running';
      }),
      createBuffer: vi.fn().mockReturnValue({
        getChannelData: vi.fn().mockReturnValue(new Float32Array(8)),
      }),
      createBufferSource: vi.fn().mockReturnValue(sourceNode),
    };

    await processAudioQueue(context as any, null);

    expect(context.resume).toHaveBeenCalled();
    expect(sourceNode.start).toHaveBeenCalled();
  });

  it('requeues chunk when suspended-context resume fails', async () => {
    enqueueAudio('resume-fail');

    const failingContext = {
      state: 'suspended',
      destination: {},
      createGain: vi.fn().mockReturnValue({
        gain: { value: 0 },
        connect: vi.fn(),
        disconnect: vi.fn(),
      }),
      resume: vi.fn().mockRejectedValue(new Error('resume blocked')),
      createBuffer: vi.fn(),
      createBufferSource: vi.fn(),
    };

    await processAudioQueue(failingContext as any, null);
    expect(getIsPlayingAudio()).toBe(false);

    const sourceNode: any = {
      buffer: null,
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      disconnect: vi.fn(),
      onended: null,
    };
    const runningContext = {
      state: 'running',
      sampleRate: 24000,
      destination: {},
      createGain: vi.fn().mockReturnValue({
        gain: { value: 0 },
        connect: vi.fn(),
        disconnect: vi.fn(),
      }),
      resume: vi.fn().mockResolvedValue(undefined),
      createBuffer: vi.fn().mockReturnValue({
        getChannelData: vi.fn().mockReturnValue(new Float32Array(8)),
      }),
      createBufferSource: vi.fn().mockReturnValue(sourceNode),
    };

    await processAudioQueue(runningContext as any, null);
    expect(sourceNode.start).toHaveBeenCalled();
  });

  describe('resamplePcm', () => {
    it('returns same array when rates match', () => {
      const input = new Float32Array([0.1, 0.2, 0.3, 0.4]);
      const result = resamplePcm(input, 24000, 24000);
      expect(result).toBe(input);
    });

    it('returns same array for empty input', () => {
      const input = new Float32Array([]);
      const result = resamplePcm(input, 24000, 48000);
      expect(result).toBe(input);
    });

    it('upsamples from 24kHz to 48kHz', () => {
      const input = new Float32Array([0.0, 1.0]);
      const result = resamplePcm(input, 24000, 48000);
      expect(result.length).toBe(4);
      expect(result[0]).toBeCloseTo(0.0, 5);
      expect(result[1]).toBeCloseTo(0.5, 5);
      expect(result[2]).toBeCloseTo(1.0, 5);
    });

    it('downsamples from 48kHz to 24kHz', () => {
      const input = new Float32Array([0.0, 0.25, 0.5, 0.75]);
      const result = resamplePcm(input, 48000, 24000);
      expect(result.length).toBe(2);
      expect(result[0]).toBeCloseTo(0.0, 5);
      expect(result[1]).toBeCloseTo(0.5, 5);
    });
  });

  it('creates audio buffer using context sampleRate with resampling', async () => {
    enqueueAudio('test-resample');

    const sourceNode: any = {
      buffer: null,
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      disconnect: vi.fn(),
      onended: null,
    };
    const context = {
      state: 'running',
      sampleRate: 48000,
      destination: {},
      createGain: vi.fn().mockReturnValue({
        gain: { value: 0 },
        connect: vi.fn(),
        disconnect: vi.fn(),
      }),
      createBuffer: vi.fn().mockReturnValue({
        getChannelData: vi.fn().mockReturnValue(new Float32Array(16)),
      }),
      createBufferSource: vi.fn().mockReturnValue(sourceNode),
    };

    await processAudioQueue(context as any, null);
    expect(context.createBuffer).toHaveBeenCalled();
    const callArgs = context.createBuffer.mock.calls[0];
    expect(callArgs[2]).toBe(48000);
  });

});
