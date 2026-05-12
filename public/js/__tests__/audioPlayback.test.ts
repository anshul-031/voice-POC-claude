/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../transcript.js', () => ({
  appendDebugLog: vi.fn(),
}));

import {
  detectSpeechBargeIn,
  enqueueAudio,
  getIsPlayingAudio,
  hasModelPlayback,
  interruptModelPlayback,
  processAudioQueue,
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
      currentTime: 0,
      destination: {},
      sampleRate: 24000,
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
      currentTime: 0,
      destination: {},
      sampleRate: 24000,
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
      currentTime: 0,
      destination: {},
      sampleRate: 24000,
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
      currentTime: 0,
      destination: {},
      sampleRate: 24000,
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
      currentTime: 0,
      destination: {},
      sampleRate: 24000,
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

  it('schedules gapless playback with nextPlaybackTime', async () => {
    enqueueAudio('chunk1');
    enqueueAudio('chunk2');

    const sources: any[] = [];
    const context = {
      state: 'running',
      currentTime: 1.0,
      destination: {},
      sampleRate: 24000,
      createGain: vi.fn().mockReturnValue({
        gain: { value: 0 },
        connect: vi.fn(),
        disconnect: vi.fn(),
      }),
      createBuffer: vi.fn().mockReturnValue({
        getChannelData: vi.fn().mockReturnValue(new Float32Array(8)),
        length: 8,
      }),
      createBufferSource: vi.fn().mockImplementation(() => {
        const node: any = {
          buffer: null,
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
          disconnect: vi.fn(),
          onended: null,
        };
        sources.push(node);
        return node;
      }),
    };

    await processAudioQueue(context as any, null);
    expect(sources[0].start).toHaveBeenCalledWith(1.0);

    sources[0].onended?.();
    await Promise.resolve();

    expect(sources.length).toBe(2);
    const secondStartTime = sources[1].start.mock.calls[0][0];
    expect(secondStartTime).toBeGreaterThan(1.0);
  });

  it('detects playback underrun and logs diagnostic', async () => {
    const { appendDebugLog } = await import('../transcript.js');

    enqueueAudio('first');

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
      currentTime: 0.5,
      destination: {},
      sampleRate: 24000,
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

    await processAudioQueue(context as any, null);
    expect(sourceNode.start).toHaveBeenCalled();

    enqueueAudio('second');
    context.currentTime = 2.0;
    await processAudioQueue(context as any, null);
    await Promise.resolve();

    expect(appendDebugLog).toHaveBeenCalled();
  });

  it('logs queue depth warning when queue is deep', () => {
    for (let i = 0; i < 50; i++) {
      enqueueAudio(`chunk-${i}`);
    }
    expect(hasModelPlayback()).toBe(true);
    interruptModelPlayback();
    expect(hasModelPlayback()).toBe(false);
  });

});
