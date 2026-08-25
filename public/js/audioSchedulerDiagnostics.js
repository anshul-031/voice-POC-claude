import { CONFIG } from './constants/config.js';
import { UI_STRINGS } from './constants/uiStrings.js';
import { appendDebugLog } from './transcript.js';

let underrunCount = 0;
let maxUnderrunSilenceMs = 0;
let totalUnderrunSilenceMs = 0;
let clockRebaseCount = 0;
let streamRestartCount = 0;
let scheduleFailureCount = 0;
let startFailureCount = 0;
let fadedBlockCount = 0;
let chunksPlayed = 0;
let scheduledSampleCount = 0;
let scheduledDurationMs = 0;
let maxClockSlipMs = 0;
let maxLeadMs = 0;

/** @param {unknown} error @returns {string} */
function getErrorName(error) {
  return error instanceof Error ? error.name : 'unknown';
}

/** @param {string} reason @param {number} activeSources @param {number | null} contextSampleRate @returns {void} */
function logSchedulerSummary(reason, activeSources, contextSampleRate) {
  if (chunksPlayed === 0 && underrunCount === 0 && scheduleFailureCount === 0 && startFailureCount === 0) return;
  appendDebugLog(
    UI_STRINGS.signaling.logs.audioDiagnosticEvent('scheduler-summary', {
      reason,
      chunksPlayed,
      underruns: underrunCount,
      // Individual gaps are logged sparsely, so the worst and cumulative
      // silence are reported here; a throttled run would otherwise leave no
      // record of how long the audible dropouts were. Slip alone understates
      // them, because a re-base also holds the stream for the fresh lead.
      maxUnderrunSilenceMs: Number(maxUnderrunSilenceMs.toFixed(2)),
      totalUnderrunSilenceMs: Number(totalUnderrunSilenceMs.toFixed(2)),
      clockRebases: clockRebaseCount,
      streamRestarts: streamRestartCount,
      scheduleFailures: scheduleFailureCount,
      startFailures: startFailureCount,
      fadedBlocks: fadedBlockCount,
      scheduledSamples: scheduledSampleCount,
      scheduledDurationMs: Number(scheduledDurationMs.toFixed(2)),
      maxClockSlipMs: Number(maxClockSlipMs.toFixed(2)),
      maxLeadMs: Number(maxLeadMs.toFixed(2)),
      activeSources,
      contextSampleRate,
    }),
    underrunCount > 0 || scheduleFailureCount > 0 || startFailureCount > 0 ? 'warn' : 'info',
  );
}

/**
 * Count every gap but write only a sample of them to the log pane. Appending a
 * node and scrolling the pane is synchronous main thread work, and doing it for
 * every gap competes with the decoding and scheduling that just fell behind,
 * which lengthens the very stretch being reported.
 *
 * The silence a listener hears is longer than the slip: the run resumes a fresh
 * lead after the re-base, so both are recorded. A run opening with a very short
 * block is held marginally longer still, which is not included here.
 * @param {number} slipMs
 * @returns {void}
 */
function recordUnderrun(slipMs) {
  const silenceMs = slipMs + CONFIG.AUDIO_JITTER_BUFFER_MS;
  underrunCount++;
  maxUnderrunSilenceMs = Math.max(maxUnderrunSilenceMs, silenceMs);
  totalUnderrunSilenceMs += silenceMs;
  if (underrunCount !== 1 && underrunCount % CONFIG.AUDIO_UNDERRUN_LOG_THROTTLE !== 1) return;

  appendDebugLog(UI_STRINGS.signaling.logs.audioPlaybackUnderrun(slipMs), 'warn');
  appendDebugLog(
    UI_STRINGS.signaling.logs.audioDiagnosticEvent('clock-gap', {
      slipMs: Number(slipMs.toFixed(2)),
      silenceMs: Number(silenceMs.toFixed(2)),
      gapEvents: underrunCount,
      maxSilenceMs: Number(maxUnderrunSilenceMs.toFixed(2)),
      totalSilenceMs: Number(totalUnderrunSilenceMs.toFixed(2)),
      thresholdMs: CONFIG.AUDIO_UNDERRUN_LOG_THRESHOLD_MS,
      // Slips at or past the turn-boundary threshold are classified as stream
      // restarts instead, so these counters only cover in-turn starvation.
      classifiedBelowMs: CONFIG.AUDIO_STREAM_RESTART_GAP_MS,
    }),
    'warn',
  );
}

/**
 * @param {number} now
 * @param {number} scheduledTime
 * @returns {{ nextPlaybackTime: number, startsNewRun: boolean }}
 */
export function alignPlaybackClock(now, scheduledTime) {
  if (scheduledTime > now) {
    return { nextPlaybackTime: scheduledTime, startsNewRun: false };
  }

  const slipMs = scheduledTime > 0
    ? (now - scheduledTime) * 1000
    : Number.POSITIVE_INFINITY;
  const isStreamRestart = slipMs >= CONFIG.AUDIO_STREAM_RESTART_GAP_MS;
  const finiteSlipMs = Number.isFinite(slipMs) ? slipMs : 0;
  maxClockSlipMs = Math.max(maxClockSlipMs, finiteSlipMs);
  clockRebaseCount++;

  if (isStreamRestart && Number.isFinite(slipMs)) {
    streamRestartCount++;
    appendDebugLog(
      UI_STRINGS.signaling.logs.audioDiagnosticEvent('stream-restart', {
        slipMs: Number(slipMs.toFixed(2)),
        streamRestarts: streamRestartCount,
      }),
      'info',
    );
  } else if (Number.isFinite(slipMs) && slipMs > CONFIG.AUDIO_UNDERRUN_LOG_THRESHOLD_MS) {
    recordUnderrun(slipMs);
  }

  return {
    nextPlaybackTime: now + (CONFIG.AUDIO_JITTER_BUFFER_MS / 1000),
    startsNewRun: true,
  };
}

/** @param {number} leadMs @returns {void} */
export function recordScheduledLead(leadMs) {
  maxLeadMs = Math.max(maxLeadMs, leadMs);
}

/** @returns {void} */
export function recordFadedBlock() {
  fadedBlockCount++;
}

/** @param {unknown} error @param {number} sampleCount @returns {void} */
export function recordBufferCreationFailure(error, sampleCount) {
  scheduleFailureCount++;
  appendDebugLog(
    UI_STRINGS.signaling.logs.audioDiagnosticEvent('buffer-creation-failure', {
      failures: scheduleFailureCount,
      samples: sampleCount,
      error: getErrorName(error),
    }),
    'warn',
  );
}

/** @param {unknown} error @param {number} scheduledTime @returns {void} */
export function recordSourceStartFailure(error, scheduledTime) {
  startFailureCount++;
  appendDebugLog(
    UI_STRINGS.signaling.logs.audioDiagnosticEvent('source-start-failure', {
      failures: startFailureCount,
      scheduledTime,
      error: getErrorName(error),
    }),
    'warn',
  );
}

/**
 * @param {number} scheduledTime
 * @param {number} chunkDuration
 * @param {number} sampleCount
 * @param {number} queueDepth
 * @param {number} activeSources
 * @param {AudioContext | null} context
 * @returns {boolean}
 */
export function recordScheduledChunk(
  scheduledTime,
  chunkDuration,
  sampleCount,
  queueDepth,
  activeSources,
  context,
) {
  const isFirstChunk = chunksPlayed === 0;
  chunksPlayed++;
  scheduledSampleCount += sampleCount;
  scheduledDurationMs += chunkDuration * 1000;
  logPlaybackDiagnostics(scheduledTime, chunkDuration, queueDepth, activeSources, context);
  return isFirstChunk;
}

/**
 * @param {number} scheduledTime
 * @param {number} chunkDuration
 * @param {number} queueDepth
 * @param {number} activeSources
 * @param {AudioContext | null} context
 * @returns {void}
 */
function logPlaybackDiagnostics(scheduledTime, chunkDuration, queueDepth, activeSources, context) {
  if (chunksPlayed % CONFIG.AUDIO_DIAG_LOG_INTERVAL_CHUNKS !== 0) return;
  appendDebugLog(
    UI_STRINGS.signaling.logs.audioPlaybackScheduled(scheduledTime, chunkDuration),
    'info',
  );
  appendDebugLog(
    UI_STRINGS.signaling.logs.audioPlaybackStats(chunksPlayed, underrunCount, queueDepth),
    'info',
  );
  appendDebugLog(
    UI_STRINGS.signaling.logs.audioDiagnosticEvent('scheduler', {
      chunksPlayed,
      scheduledTime: Number(scheduledTime.toFixed(3)),
      chunkDurationMs: Number((chunkDuration * 1000).toFixed(2)),
      queueDepth,
      currentTime: context?.currentTime ?? null,
      leadMs: context
        ? Number(((scheduledTime - context.currentTime) * 1000).toFixed(2))
        : null,
      underruns: underrunCount,
      clockRebases: clockRebaseCount,
      activeSources,
    }),
    'info',
  );
}

/** @param {AudioContext} audioContext @returns {void} */
export function warnOnOutputRateMismatch(audioContext) {
  const contextRate = audioContext.sampleRate;
  if (!contextRate || contextRate === CONFIG.SAMPLE_RATE_OUTPUT) return;
  appendDebugLog(
    UI_STRINGS.signaling.logs.audioOutputRateMismatch(contextRate, CONFIG.SAMPLE_RATE_OUTPUT),
    'warn',
  );
  appendDebugLog(
    UI_STRINGS.signaling.logs.audioDiagnosticEvent('output-rate-mismatch', {
      contextRate,
      streamRate: CONFIG.SAMPLE_RATE_OUTPUT,
      baseLatency: audioContext.baseLatency ?? null,
      outputLatency: audioContext.outputLatency ?? null,
    }),
    'warn',
  );
}

/** @param {number} sourceCount @param {boolean} didRamp @param {number} stopAt @param {boolean} allowFade @returns {void} */
export function logPlaybackStop(sourceCount, didRamp, stopAt, allowFade) {
  if (sourceCount === 0) return;
  appendDebugLog(
    UI_STRINGS.signaling.logs.audioDiagnosticEvent('playback-stop', {
      sourceCount,
      didRamp,
      stopAt,
      allowFade,
    }),
    'info',
  );
}

/** @param {string} reason @param {number} activeSources @param {number | null} contextSampleRate @returns {void} */
export function resetSchedulerDiagnostics(reason, activeSources, contextSampleRate) {
  logSchedulerSummary(reason, activeSources, contextSampleRate);
  underrunCount = 0;
  maxUnderrunSilenceMs = 0;
  totalUnderrunSilenceMs = 0;
  clockRebaseCount = 0;
  streamRestartCount = 0;
  scheduleFailureCount = 0;
  startFailureCount = 0;
  fadedBlockCount = 0;
  chunksPlayed = 0;
  scheduledSampleCount = 0;
  scheduledDurationMs = 0;
  maxClockSlipMs = 0;
  maxLeadMs = 0;
}
