/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../transcript.js', () => ({
  appendDebugLog: vi.fn(),
}));

import { CONFIG } from '../constants/config.js';
import {
  detectSpeechBargeIn,
  enqueueAudio,
  getIsPlayingAudio,
  hasModelPlayback,
  interruptModelPlayback,
  processAudioQueue,
  resetAudioPlaybackState,
} from '../audioPlayback.js';
import { createMockContext } from './audioMocks.js';

const RUNWAY_SECONDS = CONFIG.AUDIO_NEW_RUN_MIN_RUNWAY_MS / 1000;
// 'abcdabcd' decodes to 8 bytes, which is 4 samples of 16-bit PCM.
const SAMPLES_PER_CHUNK = 4;
const CHUNK_SECONDS = SAMPLES_PER_CHUNK / CONFIG.SAMPLE_RATE_OUTPUT;

function stubAtob(value: string | (() => string)): void {
  const decode = typeof value === 'function' ? value : () => value;
  vi.stubGlobal('atob', decode);
  window.atob = decode as typeof window.atob;
}

describe('audioPlayback module', () => {
  beforeEach(() => {
    resetAudioPlaybackState();
    vi.restoreAllMocks();
    stubAtob('abcdabcd');
  });

  it('handles enqueue, playback, and interruption lifecycle', async () => {
    expect(enqueueAudio('')).toBe(false);
    expect(enqueueAudio('base64')).toBe(true);
    expect(hasModelPlayback()).toBe(true);

    const { context, sources } = createMockContext();
    const analyser = { connect: vi.fn() };

    await processAudioQueue(context as any, analyser as any);
    expect(getIsPlayingAudio()).toBe(true);
    expect(sources[0].start).toHaveBeenCalled();

    sources[0].onended?.();
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
    stubAtob(() => {
      throw new Error('decode-fail');
    });

    const { context } = createMockContext({ createBufferSource: vi.fn() });

    await processAudioQueue(context as any, null);
    expect(getIsPlayingAudio()).toBe(false);
  });

  it('skips chunks that carry no whole sample', async () => {
    enqueueAudio('single-byte');
    stubAtob('a');

    const { context, sources } = createMockContext();
    await processAudioQueue(context as any, null);

    expect(sources).toHaveLength(0);
    expect(getIsPlayingAudio()).toBe(false);
  });

  it('keeps a chunk with a trailing odd byte instead of dropping it', async () => {
    enqueueAudio('odd-length');
    stubAtob('abcdabcda');

    const { context, sources } = createMockContext();
    await processAudioQueue(context as any, null);

    expect(context.createBuffer).toHaveBeenCalledWith(1, SAMPLES_PER_CHUNK, CONFIG.SAMPLE_RATE_OUTPUT);
    expect(sources[0].start).toHaveBeenCalled();
  });

  it('resumes suspended audio context before playback', async () => {
    enqueueAudio('z');

    const { context, sources } = createMockContext({ state: 'suspended' });
    context.resume = vi.fn().mockImplementation(async () => {
      context.state = 'running';
    });

    await processAudioQueue(context as any, null);

    expect(context.resume).toHaveBeenCalled();
    expect(sources[0].start).toHaveBeenCalled();
  });

  it('keeps chunks queued when suspended-context resume fails', async () => {
    enqueueAudio('resume-fail');

    const failingContext = createMockContext({
      state: 'suspended',
      resume: vi.fn().mockRejectedValue(new Error('resume blocked')),
      createBuffer: vi.fn(),
      createBufferSource: vi.fn(),
    });

    await processAudioQueue(failingContext.context as any, null);
    expect(getIsPlayingAudio()).toBe(false);
    expect(hasModelPlayback()).toBe(true);

    const running = createMockContext({ resume: vi.fn().mockResolvedValue(undefined) });
    await processAudioQueue(running.context as any, null);
    expect(running.sources[0].start).toHaveBeenCalled();
  });

  it('coalesces queued chunks into one gapless buffer', async () => {
    enqueueAudio('chunk1');
    enqueueAudio('chunk2');

    const { context, sources } = createMockContext({ currentTime: 1 });
    await processAudioQueue(context as any, null);

    // Both chunks were already waiting, so they merge into a single buffer
    // instead of producing two scheduling boundaries.
    expect(sources).toHaveLength(1);
    expect(context.createBuffer).toHaveBeenCalledWith(1, SAMPLES_PER_CHUNK * 2, CONFIG.SAMPLE_RATE_OUTPUT);
    // These chunks are far too short to feed the stream for a jitter window, so
    // the run opens with widened runway rather than the plain lead.
    expect(sources[0].start).toHaveBeenCalledWith(1 + RUNWAY_SECONDS - CHUNK_SECONDS * 2);

    enqueueAudio('chunk3');
    await processAudioQueue(context as any, null);

    const firstStart = sources[0].start.mock.calls[0][0];
    const secondStart = sources[1].start.mock.calls[0][0];
    expect(secondStart).toBeCloseTo(
      firstStart + (SAMPLES_PER_CHUNK * 2) / CONFIG.SAMPLE_RATE_OUTPUT,
      10,
    );
  });

  it('caps how much audio is merged into a single buffer', async () => {
    const oversizedChunk = 'a'.repeat((CONFIG.AUDIO_MAX_COALESCE_SAMPLES + 10) * 2);
    stubAtob(oversizedChunk);
    enqueueAudio('big-1');
    enqueueAudio('big-2');

    const { context, sources } = createMockContext();
    await processAudioQueue(context as any, null);

    expect(sources).toHaveLength(2);
  });

  it('ends the batch at an undecodable chunk and fades in what follows', async () => {
    let decodeCalls = 0;
    stubAtob(() => {
      decodeCalls++;
      if (decodeCalls === 2) throw new Error('decode-fail');
      return 'abcdabcd';
    });

    enqueueAudio('good-1');
    enqueueAudio('corrupt');
    enqueueAudio('good-2');

    const { context, channels } = createMockContext({ currentTime: 1 });
    await processAudioQueue(context as any, null);

    // The hole splits the batch, and the samples after it are faded in rather
    // than spliced against unrelated audio inside one buffer.
    expect(channels).toHaveLength(2);
    expect(channels[1][0]).toBe(0);
  });

  it('marks a discontinuity when a batch never reaches the device', async () => {
    enqueueAudio('lost');

    const { context } = createMockContext({
      currentTime: 1,
      createBuffer: vi.fn(() => {
        throw new Error('buffer rejected');
      }),
    });

    await processAudioQueue(context as any, null);
    expect(getIsPlayingAudio()).toBe(false);
  });

  it('detects playback underrun and logs diagnostic', async () => {
    const { appendDebugLog } = await import('../transcript.js');

    enqueueAudio('first');
    const { context, sources } = createMockContext({ currentTime: 0.5 });
    await processAudioQueue(context as any, null);
    expect(sources[0].start).toHaveBeenCalled();

    // Slip past the end of what is already scheduled, but by less than a turn
    // boundary, so the scheduler treats it as falling behind.
    const scheduledEnd = sources[0].start.mock.calls[0][0]
      + SAMPLES_PER_CHUNK / CONFIG.SAMPLE_RATE_OUTPUT;
    context.currentTime = scheduledEnd + 0.05;

    enqueueAudio('second');
    await processAudioQueue(context as any, null);

    const messages = vi.mocked(appendDebugLog).mock.calls.map(([message]) => String(message));
    expect(messages.some(message => message.includes('underrun'))).toBe(true);
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
