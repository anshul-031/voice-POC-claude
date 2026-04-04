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
      createBuffer: vi.fn().mockReturnValue({
        getChannelData: vi.fn().mockReturnValue(new Float32Array(8)),
      }),
      createBufferSource: vi.fn(),
    };

    await processAudioQueue(context as any, null);
    expect(getIsPlayingAudio()).toBe(false);
  });
});
