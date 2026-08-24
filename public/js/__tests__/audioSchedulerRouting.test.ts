/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../transcript.js', () => ({
  appendDebugLog: vi.fn(),
}));

import { CONFIG } from '../constants/config.js';
import {
  ensurePlaybackContextReady,
  hasScheduledPlayback,
  resetPlaybackRouting,
  resetScheduler,
  scheduleSamples,
  setPlaybackRecordingDestination,
  stopScheduledPlayback,
} from '../audioScheduler.js';
import { createMockContext, createMockGain, loudSamples } from './audioMocks.js';

const FADE_SECONDS = CONFIG.AUDIO_INTERRUPT_FADE_MS / 1000;

describe('audioScheduler interruption', () => {
  beforeEach(() => {
    resetScheduler();
    setPlaybackRecordingDestination(null);
  });

  it('ramps the output bus down before cutting sources', () => {
    const { context, sources, gains } = createMockContext({ currentTime: 2 });

    scheduleSamples(context, null, loudSamples(240));
    stopScheduledPlayback();

    expect(gains[0].gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, 2 + FADE_SECONDS);
    expect(gains[0].gain.setValueAtTime).toHaveBeenCalledWith(1, 2 + FADE_SECONDS);
    expect(sources[0].stop).toHaveBeenCalledWith(2 + FADE_SECONDS);
    expect(sources[0].disconnect).not.toHaveBeenCalled();
    expect(hasScheduledPlayback()).toBe(false);
  });

  it('hard-stops when the gain node has no automation', () => {
    const { context, sources } = createMockContext({ currentTime: 2 }, () => createMockGain(false));

    scheduleSamples(context, null, loudSamples(240));
    stopScheduledPlayback();

    expect(sources[0].stop).toHaveBeenCalledWith(0);
    expect(sources[0].disconnect).toHaveBeenCalled();
  });

  it('hard-stops when gain automation throws', () => {
    const { context, sources } = createMockContext({ currentTime: 2 }, () => {
      const node = createMockGain();
      node.gain.setValueAtTime = vi.fn(() => {
        throw new Error('automation unavailable');
      });
      return node;
    });

    scheduleSamples(context, null, loudSamples(240));
    stopScheduledPlayback();

    expect(sources[0].stop).toHaveBeenCalledWith(0);
  });

  it('ramps without cancelScheduledValues when it is unsupported', () => {
    const { context, gains } = createMockContext({ currentTime: 2 }, () => {
      const node = createMockGain();
      delete node.gain.cancelScheduledValues;
      return node;
    });

    scheduleSamples(context, null, loudSamples(240));
    stopScheduledPlayback();

    expect(gains[0].gain.linearRampToValueAtTime).toHaveBeenCalled();
  });

  it('ignores sources that refuse to stop', () => {
    const { context, sources } = createMockContext();

    scheduleSamples(context, null, loudSamples(240));
    sources[0].stop = vi.fn(() => {
      throw new Error('already stopped');
    });

    expect(() => stopScheduledPlayback()).not.toThrow();
    expect(hasScheduledPlayback()).toBe(false);
  });

  it('is a no-op before any routing exists', () => {
    expect(() => stopScheduledPlayback()).not.toThrow();
  });

  it('anchors a second interrupt at the level the ramp already reached', () => {
    const { context, gains } = createMockContext({ currentTime: 2 });

    scheduleSamples(context, null, loudSamples(240));
    stopScheduledPlayback();

    // Halfway through the ramp the bus is at 0.5; re-anchoring at unity here is
    // what would step the still-rendering tail back up.
    gains[0].gain.value = 0.5;
    context.currentTime = 2 + (FADE_SECONDS / 2);
    stopScheduledPlayback();

    expect(gains[0].gain.setValueAtTime).toHaveBeenCalledWith(0.5, 2 + (FADE_SECONDS / 2));
  });

  it('holds the in-flight ramp value when cancelAndHoldAtTime exists', () => {
    const { context, gains } = createMockContext({ currentTime: 2 }, () => {
      const node = createMockGain();
      node.gain.cancelAndHoldAtTime = vi.fn();
      return node;
    });

    scheduleSamples(context, null, loudSamples(240));
    stopScheduledPlayback();

    expect(gains[0].gain.cancelAndHoldAtTime).toHaveBeenCalledWith(2);
    expect(gains[0].gain.cancelScheduledValues).not.toHaveBeenCalled();
  });

  it('cuts without a doomed ramp when the bus is being torn down', () => {
    const { context, sources, gains } = createMockContext({ currentTime: 2 });

    scheduleSamples(context, null, loudSamples(240));
    resetScheduler();

    // resetPlaybackRouting disconnects the bus straight after, so a scheduled
    // ramp could never render.
    expect(gains[0].gain.linearRampToValueAtTime).not.toHaveBeenCalled();
    expect(sources[0].stop).toHaveBeenCalledWith(0);
    expect(gains[0].disconnect).toHaveBeenCalled();
  });

  it('re-bases and fades in the run that follows an interrupt', () => {
    const { context, sources, channels } = createMockContext({ currentTime: 2 });

    scheduleSamples(context, null, loudSamples(2400));
    stopScheduledPlayback();

    context.currentTime = 2.05;
    scheduleSamples(context, null, loudSamples(240));

    expect(sources[1].start).toHaveBeenCalledWith(2.05 + (CONFIG.AUDIO_JITTER_BUFFER_MS / 1000));
    expect(channels[1][0]).toBe(0);
  });
});

describe('audioScheduler routing', () => {
  beforeEach(() => {
    resetScheduler();
    setPlaybackRecordingDestination(null);
  });

  it('connects a recording destination attached after the gain node exists', () => {
    const { context, gains } = createMockContext();
    scheduleSamples(context, null, loudSamples(240));

    const recorder = {} as any;
    setPlaybackRecordingDestination(recorder);

    expect(gains[0].connect).toHaveBeenCalledWith(recorder);
  });

  it('connects a recording destination attached before the gain node exists', () => {
    const recorder = {} as any;
    setPlaybackRecordingDestination(recorder);

    const { context, gains } = createMockContext();
    scheduleSamples(context, null, loudSamples(240));

    expect(gains[0].connect).toHaveBeenCalledWith(recorder);
  });

  it('survives a recording destination that refuses connections', () => {
    const { context } = createMockContext({}, () => {
      const node = createMockGain();
      node.connect = vi.fn((target: unknown) => {
        if (target) throw new Error('connect refused');
      });
      return node;
    });
    scheduleSamples(context, null, loudSamples(240));

    expect(() => setPlaybackRecordingDestination({} as any)).not.toThrow();
  });

  it('reuses the gain node for the same context and replaces it for a new one', () => {
    const first = createMockContext();
    scheduleSamples(first.context, null, loudSamples(240));
    scheduleSamples(first.context, null, loudSamples(240));
    expect(first.context.createGain).toHaveBeenCalledTimes(1);

    const second = createMockContext();
    scheduleSamples(second.context, null, loudSamples(240));

    expect(first.gains[0].disconnect).toHaveBeenCalled();
    expect(second.context.createGain).toHaveBeenCalledTimes(1);
  });

  it('tolerates a gain node that cannot be disconnected', () => {
    const { context } = createMockContext({}, () => {
      const node = createMockGain();
      node.disconnect = vi.fn(() => {
        throw new Error('disconnect refused');
      });
      return node;
    });
    scheduleSamples(context, null, loudSamples(240));

    expect(() => resetPlaybackRouting()).not.toThrow();
  });

  it('resetPlaybackRouting is safe with no gain node', () => {
    expect(() => resetPlaybackRouting()).not.toThrow();
  });
});

describe('audioScheduler context readiness', () => {
  beforeEach(() => {
    resetScheduler();
  });

  it('rejects a missing or closed context', async () => {
    await expect(ensurePlaybackContextReady(null)).resolves.toBe(false);
    const { context } = createMockContext({ state: 'closed' });
    await expect(ensurePlaybackContextReady(context)).resolves.toBe(false);
  });

  it('accepts a running context without resuming', async () => {
    const { context } = createMockContext();
    await expect(ensurePlaybackContextReady(context)).resolves.toBe(true);
    expect(context.resume).not.toHaveBeenCalled();
  });

  it('resumes a suspended context', async () => {
    const { context } = createMockContext({ state: 'suspended' });
    await expect(ensurePlaybackContextReady(context)).resolves.toBe(true);
    expect(context.resume).toHaveBeenCalledTimes(1);
  });

  it('reports every failed attempt when resume rejects', async () => {
    const onResumeAttemptFailed = vi.fn();
    const { context } = createMockContext({
      state: 'suspended',
      resume: vi.fn().mockRejectedValue(new Error('gesture required')),
    });

    await expect(ensurePlaybackContextReady(context, { onResumeAttemptFailed })).resolves.toBe(false);
    expect(onResumeAttemptFailed).toHaveBeenCalledTimes(CONFIG.AUDIO_CONTEXT_RESUME_MAX_ATTEMPTS);
  });

  it('gives up when resume succeeds but the context stays suspended', async () => {
    const { context } = createMockContext({
      state: 'suspended',
      resume: vi.fn().mockResolvedValue(undefined),
    });

    await expect(ensurePlaybackContextReady(context)).resolves.toBe(false);
    expect(context.resume).toHaveBeenCalledTimes(CONFIG.AUDIO_CONTEXT_RESUME_MAX_ATTEMPTS);
  });
});
