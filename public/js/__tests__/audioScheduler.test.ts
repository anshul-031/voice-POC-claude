/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../transcript.js', () => ({
  appendDebugLog: vi.fn(),
}));

import { appendDebugLog } from '../transcript.js';
import { CONFIG } from '../constants/config.js';
import {
  hasScheduledPlayback,
  resetScheduler,
  scheduleSamples,
  setPlaybackRecordingDestination,
} from '../audioScheduler.js';
import { createMockContext, loudSamples } from './audioMocks.js';

const LEAD_SECONDS = CONFIG.AUDIO_JITTER_BUFFER_MS / 1000;

/**
 * Where the opening buffer of a run lands: the jitter buffer, widened when the
 * block is too short to keep the stream fed for a full jitter window.
 */
function openingStart(now: number, sampleCount: number): number {
  const runwaySeconds = CONFIG.AUDIO_NEW_RUN_MIN_RUNWAY_MS / 1000;
  const blockSeconds = sampleCount / CONFIG.SAMPLE_RATE_OUTPUT;
  return now + Math.max(LEAD_SECONDS, runwaySeconds - blockSeconds);
}

function loggedMessages(): string[] {
  return vi.mocked(appendDebugLog).mock.calls.map(([message]) => String(message));
}

function underrunLogCount(): number {
  return loggedMessages().filter(message => message.includes('underrun')).length;
}

function schedulerSummary(): string {
  const summary = loggedMessages().find(message => message.includes('scheduler-summary'));
  expect(summary).toBeDefined();
  return String(summary);
}

describe('audioScheduler scheduling', () => {
  beforeEach(() => {
    resetScheduler();
    setPlaybackRecordingDestination(null);
    vi.mocked(appendDebugLog).mockClear();
  });

  it('places the opening buffer a jitter buffer ahead of the clock', () => {
    const { context, sources } = createMockContext({ currentTime: 1 });
    // Long enough to cover the runway on its own, so the plain lead applies.
    const longBlock = CONFIG.SAMPLE_RATE_OUTPUT / 2;

    expect(scheduleSamples(context, null, loudSamples(longBlock))).toBe(true);

    expect(sources[0].start).toHaveBeenCalledWith(1 + LEAD_SECONDS);
    expect(hasScheduledPlayback()).toBe(true);
  });

  it('gives a run that opens with a tiny block a full jitter window of runway', () => {
    const { context, sources } = createMockContext({ currentTime: 1 });

    // A single sample is what Gemini actually sent at the start of a turn that
    // then crackled: scheduling it at the plain lead leaves the stream starved
    // 0.04ms later.
    scheduleSamples(context, null, loudSamples(1));

    const startAt = sources[0].start.mock.calls[0][0];
    const runwayMs = (startAt + 1 / CONFIG.SAMPLE_RATE_OUTPUT - context.currentTime) * 1000;
    expect(runwayMs).toBeCloseTo(CONFIG.AUDIO_NEW_RUN_MIN_RUNWAY_MS, 6);
    expect(runwayMs).toBeGreaterThan(CONFIG.AUDIO_JITTER_BUFFER_MS);
  });

  it('does not delay a run whose opening block already covers the runway', () => {
    const { context, sources } = createMockContext({ currentTime: 1 });
    const longBlock = CONFIG.SAMPLE_RATE_OUTPUT;

    scheduleSamples(context, null, loudSamples(longBlock));

    expect(sources[0].start).toHaveBeenCalledWith(1 + LEAD_SECONDS);
  });

  it('appends later buffers sample-contiguously instead of re-basing to now', () => {
    const { context, sources } = createMockContext({ currentTime: 1 });

    scheduleSamples(context, null, loudSamples(240));
    scheduleSamples(context, null, loudSamples(480));

    const firstStart = sources[0].start.mock.calls[0][0];
    const secondStart = sources[1].start.mock.calls[0][0];
    expect(secondStart).toBeCloseTo(firstStart + 240 / CONFIG.SAMPLE_RATE_OUTPUT, 10);
  });

  it('fades in only the buffer that opens a run', () => {
    const { context, channels } = createMockContext({ currentTime: 1 });

    scheduleSamples(context, null, loudSamples(240));
    scheduleSamples(context, null, loudSamples(240));

    // Opening buffer ramps up from silence.
    expect(channels[0][0]).toBe(0);
    expect(channels[0][CONFIG.AUDIO_LEAD_IN_FADE_SAMPLES - 1]).toBeLessThan(1);
    expect(channels[0][CONFIG.AUDIO_LEAD_IN_FADE_SAMPLES]).toBe(1);
    // Continuation buffer is untouched, so there is no notch at the boundary.
    expect(channels[1][0]).toBe(1);
  });

  it('fades no further than the buffer length for very short chunks', () => {
    const { context, channels } = createMockContext({ currentTime: 1 });

    scheduleSamples(context, null, loudSamples(4));

    expect(channels[0][0]).toBe(0);
    expect(channels[0][3]).toBeCloseTo(0.75, 10);
  });

  it('connects to the analyser when one is supplied', () => {
    const { context, sources } = createMockContext();
    const analyser = { connect: vi.fn() } as any;

    scheduleSamples(context, analyser, loudSamples(240));

    expect(sources[0].connect).toHaveBeenCalledTimes(2);
  });

  it('drops the source from the active set when it ends', () => {
    const { context, sources } = createMockContext();

    scheduleSamples(context, null, loudSamples(240));
    expect(hasScheduledPlayback()).toBe(true);

    sources[0].onended();
    expect(hasScheduledPlayback()).toBe(false);
  });

  it('reports failure when the context refuses to build a buffer', () => {
    const { context } = createMockContext({
      createBuffer: vi.fn(() => {
        throw new Error('buffer rejected');
      }),
    });

    expect(scheduleSamples(context, null, loudSamples(240))).toBe(false);
    expect(hasScheduledPlayback()).toBe(false);
  });

  it('leaves the write head untouched when scheduling fails', () => {
    const { context, sources } = createMockContext({ currentTime: 1 });
    scheduleSamples(context, null, loudSamples(240));
    const scheduledEnd = sources[0].start.mock.calls[0][0] + 240 / CONFIG.SAMPLE_RATE_OUTPUT;

    let shouldFail = true;
    const realCreateBuffer = context.createBuffer;
    context.createBuffer = vi.fn((...args: any[]) => {
      if (shouldFail) throw new Error('buffer rejected');
      return realCreateBuffer(...args);
    });
    expect(scheduleSamples(context, null, loudSamples(240))).toBe(false);

    shouldFail = false;
    scheduleSamples(context, null, loudSamples(240));
    expect(sources[1].start).toHaveBeenCalledWith(scheduledEnd);
  });

  it('restarts the clock and reports the rate when the context changes', () => {
    const first = createMockContext({ currentTime: 10 });
    scheduleSamples(first.context, null, loudSamples(240));

    const second = createMockContext({ currentTime: 0, sampleRate: 48000 });
    scheduleSamples(second.context, null, loudSamples(240));

    // A write head inherited from the old clock would park playback ~10s out.
    expect(second.sources[0].start).toHaveBeenCalledWith(openingStart(0, 240));
    expect(loggedMessages().some(message => message.includes('48000Hz'))).toBe(true);
  });

  it('fades in a block whose predecessor was lost', () => {
    const { context, channels } = createMockContext({ currentTime: 1 });

    scheduleSamples(context, null, loudSamples(240));
    scheduleSamples(context, null, loudSamples(240), { startsDiscontinuity: true });

    expect(channels[1][0]).toBe(0);
  });

  it('signals first playback exactly once', () => {
    const { context } = createMockContext();
    const onPlaybackStarted = vi.fn();

    scheduleSamples(context, null, loudSamples(240), { onPlaybackStarted });
    scheduleSamples(context, null, loudSamples(240), { onPlaybackStarted });

    expect(onPlaybackStarted).toHaveBeenCalledTimes(1);
  });

  it('emits playback diagnostics on the configured interval', () => {
    const { context } = createMockContext();

    for (let i = 0; i < CONFIG.AUDIO_DIAG_LOG_INTERVAL_CHUNKS; i++) {
      scheduleSamples(context, null, loudSamples(240), { queueDepth: i });
    }

    expect(loggedMessages().some(message => message.includes('Playback scheduled'))).toBe(true);
    expect(loggedMessages().some(message => message.includes('Audio stats'))).toBe(true);
  });

  it('warns when the schedule slips mid-run', () => {
    const { context, sources } = createMockContext({ currentTime: 1 });

    scheduleSamples(context, null, loudSamples(240));
    const scheduledEnd = sources[0].start.mock.calls[0][0] + 240 / CONFIG.SAMPLE_RATE_OUTPUT;
    context.currentTime = scheduledEnd + 0.05;
    scheduleSamples(context, null, loudSamples(240));

    expect(underrunLogCount()).toBe(1);
  });

  it('treats render-quantum rounding as normal', () => {
    const { context, sources } = createMockContext({ currentTime: 1 });

    scheduleSamples(context, null, loudSamples(240));
    const scheduledEnd = sources[0].start.mock.calls[0][0] + 240 / CONFIG.SAMPLE_RATE_OUTPUT;
    context.currentTime = scheduledEnd + 0.001;
    scheduleSamples(context, null, loudSamples(240));

    expect(underrunLogCount()).toBe(0);
  });

  it('treats a long silence as the model pausing, not an underrun', () => {
    const { context, sources } = createMockContext({ currentTime: 1 });

    scheduleSamples(context, null, loudSamples(240));
    const scheduledEnd = sources[0].start.mock.calls[0][0] + 240 / CONFIG.SAMPLE_RATE_OUTPUT;
    context.currentTime = scheduledEnd + (CONFIG.AUDIO_STREAM_RESTART_GAP_MS / 1000) + 1;
    scheduleSamples(context, null, loudSamples(240));

    expect(underrunLogCount()).toBe(0);
    expect(sources[1].start).toHaveBeenCalledWith(openingStart(context.currentTime, 240));
  });

  it('counts every gap but logs only a sample of them', () => {
    const { context, sources } = createMockContext({ currentTime: 1 });
    const blockSeconds = 240 / CONFIG.SAMPLE_RATE_OUTPUT;

    // Each pass is moved just past the end of the block it scheduled, which is a
    // real gap but small enough to stay under the turn-boundary threshold. The
    // first pass has nothing scheduled yet, so it opens the run without a gap.
    const gapCount = CONFIG.AUDIO_UNDERRUN_LOG_THROTTLE + 1;
    for (let i = 0; i <= gapCount; i++) {
      scheduleSamples(context, null, loudSamples(240));
      const scheduledEnd = sources[i].start.mock.calls[0][0] + blockSeconds;
      context.currentTime = scheduledEnd + 0.05;
    }

    // The first gap and then one per throttle interval: enough to see the
    // problem live without logging through every gap of a bad stretch.
    expect(underrunLogCount()).toBe(2);

    // Throttling the log must not throttle the count, or a bad stretch would
    // under-report itself in the summary.
    resetScheduler();
    expect(schedulerSummary()).toContain(`"underruns":${gapCount}`);
  });

  it('reports the silence a listener heard, not just the clock slip', () => {
    const { context, sources } = createMockContext({ currentTime: 1 });
    const slipSeconds = 0.05;

    scheduleSamples(context, null, loudSamples(240));
    const scheduledEnd = sources[0].start.mock.calls[0][0] + 240 / CONFIG.SAMPLE_RATE_OUTPUT;
    context.currentTime = scheduledEnd + slipSeconds;
    scheduleSamples(context, null, loudSamples(240));

    resetScheduler();

    // The stream stalled for the slip and then waited out a fresh lead before
    // resuming, so reporting the slip alone would understate the dropout.
    const expectedSilence = (slipSeconds * 1000) + CONFIG.AUDIO_JITTER_BUFFER_MS;
    const summary = schedulerSummary();
    expect(summary).toContain(`"maxUnderrunSilenceMs":${expectedSilence}`);
    expect(summary).toContain(`"totalUnderrunSilenceMs":${expectedSilence}`);
  });

  it('clears gap counters between calls', () => {
    const { context, sources } = createMockContext({ currentTime: 1 });

    scheduleSamples(context, null, loudSamples(240));
    const scheduledEnd = sources[0].start.mock.calls[0][0] + 240 / CONFIG.SAMPLE_RATE_OUTPUT;
    context.currentTime = scheduledEnd + 0.05;
    scheduleSamples(context, null, loudSamples(240));
    resetScheduler();

    vi.mocked(appendDebugLog).mockClear();
    const next = createMockContext({ currentTime: 1 });
    scheduleSamples(next.context, null, loudSamples(240));
    resetScheduler();

    // A fresh call must not inherit the previous call's dropouts.
    const summary = schedulerSummary();
    expect(summary).toContain('"underruns":0');
    expect(summary).toContain('"maxUnderrunSilenceMs":0');
    expect(summary).toContain('"totalUnderrunSilenceMs":0');
  });
});
