/**
 * Output-side scheduling for model audio.
 *
 * Gemini streams 24kHz PCM as a long run of variable-length chunks. Playback
 * quality depends almost entirely on where those chunks land on the
 * AudioContext clock: consecutive buffers must abut sample-exactly, and the
 * write head must stay far enough ahead of currentTime that network jitter
 * cannot push a buffer into the past. Everything else is audible as crackle.
 */
import { CONFIG } from './constants/config.js';
import { UI_STRINGS } from './constants/uiStrings.js';
import { appendDebugLog } from './transcript.js';

/** @type {Set<AudioBufferSourceNode>} */
const activePlaybackSources = new Set();
/** @type {GainNode | null} */
let playbackGainNode = null;
/** @type {AudioContext | null} */
let playbackGainNodeContext = null;
/** @type {AudioNode | null} */
let recordingDestinationNode = null;

/**
 * End of the audio already handed to the output device, on the AudioContext
 * clock. Buffers are appended from this mark so the stream stays contiguous.
 * Zero means no run is currently in flight.
 */
let nextPlaybackTime = 0;
let chunksPlayed = 0;
let underrunCount = 0;
/** @type {AudioContext | null} */
let lastScheduledContext = null;

/**
 * @typedef {Object} ScheduleOptions
 * @property {() => void} [onPlaybackStarted]
 * @property {number} [queueDepth]
 * @property {boolean} [startsDiscontinuity] Set when the samples immediately
 * before this block were lost, so the block needs a fade even though the clock
 * says it continues an existing run.
 */

/**
 * @typedef {Object} StopOptions
 * @property {boolean} [allowFade] Set false when the output bus is about to be
 * torn down: a ramp cannot render through a node that is already disconnected.
 */

/**
 * @typedef {Object} ContextReadyOptions
 * @property {(attempt: number, error: unknown) => void} [onResumeAttemptFailed]
 */

/**
 * Route model playback into the call recorder alongside the speakers.
 * @param {AudioNode | null} node
 * @returns {void}
 */
export function setPlaybackRecordingDestination(node) {
  recordingDestinationNode = node;
  if (playbackGainNode && node) {
    try {
      playbackGainNode.connect(node);
    } catch (_e) { /* ignore */ }
  }
}

/** @param {AudioContext} audioContext @returns {GainNode} */
function getOrCreatePlaybackGainNode(audioContext) {
  if (playbackGainNode && playbackGainNodeContext === audioContext) {
    return playbackGainNode;
  }

  if (playbackGainNode) {
    try {
      playbackGainNode.disconnect();
    } catch (_e) { /* ignore */ }
  }

  playbackGainNode = audioContext.createGain();
  playbackGainNode.gain.value = 1;
  playbackGainNode.connect(audioContext.destination);
  if (recordingDestinationNode) {
    try {
      playbackGainNode.connect(recordingDestinationNode);
    } catch (_e) { /* ignore */ }
  }
  playbackGainNodeContext = audioContext;

  return playbackGainNode;
}

/** @returns {void} */
export function resetPlaybackRouting() {
  if (playbackGainNode) {
    try {
      playbackGainNode.disconnect();
    } catch (_e) { /* ignore */ }
  }
  playbackGainNode = null;
  playbackGainNodeContext = null;
}

/** @returns {Promise<void>} */
function waitForResumeRetryDelay() {
  return new Promise((resolve) => {
    window.setTimeout(resolve, CONFIG.AUDIO_CONTEXT_RESUME_RETRY_DELAY_MS);
  });
}

/**
 * @param {ContextReadyOptions} options
 * @param {number} attempt
 * @param {unknown} error
 * @returns {void}
 */
function notifyResumeAttemptFailed(options, attempt, error) {
  if (options.onResumeAttemptFailed) {
    options.onResumeAttemptFailed(attempt, error);
  }
}

/**
 * @param {AudioContext} audioContext
 * @param {number} attempt
 * @param {ContextReadyOptions} options
 * @returns {Promise<boolean>}
 */
async function resumeAudioContextAttempt(audioContext, attempt, options) {
  try {
    await audioContext.resume();
    if (audioContext.state === 'running') {
      return true;
    }
    notifyResumeAttemptFailed(options, attempt, new Error('AudioContext remained suspended'));
  } catch (error) {
    notifyResumeAttemptFailed(options, attempt, error);
  }

  return false;
}

/**
 * Queued chunks are left untouched on failure so a later gesture can still play
 * them; only the clock is invalidated.
 * @param {AudioContext | null} audioContext
 * @param {ContextReadyOptions} [options]
 * @returns {Promise<boolean>}
 */
export async function ensurePlaybackContextReady(audioContext, options = {}) {
  if (!audioContext || audioContext.state === 'closed') {
    nextPlaybackTime = 0;
    return false;
  }

  if (audioContext.state === 'running') {
    return true;
  }

  for (let attempt = 1; attempt <= CONFIG.AUDIO_CONTEXT_RESUME_MAX_ATTEMPTS; attempt++) {
    const isReady = await resumeAudioContextAttempt(audioContext, attempt, options);
    if (isReady) return true;

    if (attempt < CONFIG.AUDIO_CONTEXT_RESUME_MAX_ATTEMPTS) {
      await waitForResumeRetryDelay();
    }
  }

  nextPlaybackTime = 0;
  return false;
}

/**
 * Ramp the opening samples of a run up from silence. Only a buffer that follows
 * a gap needs this; applying it mid-run is what notches the waveform.
 * @param {Float32Array} samples
 * @returns {Float32Array}
 */
function applyLeadInFade(samples) {
  const fadeLength = Math.min(CONFIG.AUDIO_LEAD_IN_FADE_SAMPLES, samples.length);
  for (let i = 0; i < fadeLength; i++) {
    samples[i] *= i / fadeLength;
  }
  return samples;
}

/**
 * Position the write head for the next buffer. Returns true when the clock had
 * to be re-based, meaning this buffer opens a new stretch of audio rather than
 * continuing one.
 * @param {number} now
 * @returns {boolean}
 */
function alignPlaybackClock(now) {
  if (nextPlaybackTime > now) return false;

  const slipMs = nextPlaybackTime > 0
    ? (now - nextPlaybackTime) * 1000
    : Number.POSITIVE_INFINITY;
  const isStreamRestart = slipMs >= CONFIG.AUDIO_STREAM_RESTART_GAP_MS;

  if (!isStreamRestart && slipMs > CONFIG.AUDIO_UNDERRUN_LOG_THRESHOLD_MS) {
    underrunCount++;
    appendDebugLog(UI_STRINGS.signaling.logs.audioPlaybackUnderrun(slipMs), 'warn');
  }

  nextPlaybackTime = now + (CONFIG.AUDIO_JITTER_BUFFER_MS / 1000);
  return true;
}

/** @param {AudioContext} audioContext @param {Float32Array} samples @returns {AudioBuffer} */
function createAudioBuffer(audioContext, samples) {
  const audioBuffer = audioContext.createBuffer(1, samples.length, CONFIG.SAMPLE_RATE_OUTPUT);
  audioBuffer.getChannelData(0).set(samples);
  return audioBuffer;
}

/**
 * @param {AudioContext} audioContext
 * @param {AudioBuffer} audioBuffer
 * @param {AnalyserNode | null} analyserNode
 * @returns {AudioBufferSourceNode}
 */
function createPlaybackSource(audioContext, audioBuffer, analyserNode) {
  const bufferSource = audioContext.createBufferSource();
  bufferSource.buffer = audioBuffer;
  const gainNode = getOrCreatePlaybackGainNode(audioContext);
  bufferSource.connect(gainNode);
  if (analyserNode) bufferSource.connect(analyserNode);
  return bufferSource;
}

/**
 * @param {number} scheduledTime
 * @param {number} chunkDuration
 * @param {number} queueDepth
 * @returns {void}
 */
function logPlaybackDiagnostics(scheduledTime, chunkDuration, queueDepth) {
  if (chunksPlayed % CONFIG.AUDIO_DIAG_LOG_INTERVAL_CHUNKS !== 0) return;
  appendDebugLog(
    UI_STRINGS.signaling.logs.audioPlaybackScheduled(scheduledTime, chunkDuration),
    'info',
  );
  appendDebugLog(
    UI_STRINGS.signaling.logs.audioPlaybackStats(chunksPlayed, underrunCount, queueDepth),
    'info',
  );
}

/**
 * Buffers declared at the stream rate are resampled one buffer at a time when
 * the context runs at a different rate, and the resampler carries no state
 * across buffers, so every boundary becomes an artifact again.
 * @param {AudioContext} audioContext
 * @returns {void}
 */
function warnOnOutputRateMismatch(audioContext) {
  const contextRate = audioContext.sampleRate;
  if (!contextRate || contextRate === CONFIG.SAMPLE_RATE_OUTPUT) return;
  appendDebugLog(
    UI_STRINGS.signaling.logs.audioOutputRateMismatch(contextRate, CONFIG.SAMPLE_RATE_OUTPUT),
    'warn',
  );
}

/**
 * A fresh context starts its own clock near zero, so a write head inherited
 * from the previous one looks healthy while pointing far into the future, and
 * playback would park in silence until the clock caught up.
 * @param {AudioContext} audioContext
 * @returns {void}
 */
function adoptContext(audioContext) {
  if (lastScheduledContext === audioContext) return;
  lastScheduledContext = audioContext;
  nextPlaybackTime = 0;
  warnOnOutputRateMismatch(audioContext);
}

/**
 * Hand one contiguous block of samples to the output device, appended directly
 * to the end of whatever is already scheduled.
 * @param {AudioContext} audioContext
 * @param {AnalyserNode | null} analyserNode
 * @param {Float32Array} samples
 * @param {ScheduleOptions} [options]
 * @returns {boolean}
 */
export function scheduleSamples(audioContext, analyserNode, samples, options = {}) {
  adoptContext(audioContext);

  const previousPlaybackTime = nextPlaybackTime;
  const startsNewRun = alignPlaybackClock(audioContext.currentTime);
  const needsFade = startsNewRun || options.startsDiscontinuity === true;
  const playableSamples = needsFade ? applyLeadInFade(samples) : samples;

  /** @type {AudioBufferSourceNode} */
  let bufferSource;
  try {
    const audioBuffer = createAudioBuffer(audioContext, playableSamples);
    bufferSource = createPlaybackSource(audioContext, audioBuffer, analyserNode);
  } catch (_e) {
    // Nothing was handed to the device, so leave the write head where it was
    // rather than pointing at a stretch of time holding no audio.
    nextPlaybackTime = previousPlaybackTime;
    return false;
  }

  activePlaybackSources.add(bufferSource);
  bufferSource.onended = () => {
    activePlaybackSources.delete(bufferSource);
  };

  if (options.onPlaybackStarted && chunksPlayed === 0) {
    options.onPlaybackStarted();
  }

  const chunkDuration = playableSamples.length / CONFIG.SAMPLE_RATE_OUTPUT;
  bufferSource.start(nextPlaybackTime);
  chunksPlayed++;
  logPlaybackDiagnostics(nextPlaybackTime, chunkDuration, options.queueDepth || 0);
  nextPlaybackTime += chunkDuration;
  return true;
}

/**
 * Pin the parameter to the level it is actually at right now. The live value
 * has to be read before cancelling, because cancelling an in-flight ramp
 * reverts the parameter to its pre-ramp level: a second interrupt arriving
 * inside the fade window would otherwise re-anchor at unity and step the
 * still-rendering tail back up, which is the pop the fade exists to remove.
 * @param {AudioParam} gain
 * @param {number} startAt
 * @returns {void}
 */
function anchorGainAtCurrentValue(gain, startAt) {
  const heldValue = gain.value;

  if (typeof gain.cancelAndHoldAtTime === 'function') {
    gain.cancelAndHoldAtTime(startAt);
    return;
  }

  if (typeof gain.cancelScheduledValues === 'function') {
    gain.cancelScheduledValues(startAt);
  }
  gain.setValueAtTime(heldValue, startAt);
}

/**
 * Fade the output bus to silence so sources can be cut without a step
 * discontinuity, then restore unity gain for the next run.
 * @param {AudioContext} context
 * @param {GainNode} gainNode
 * @returns {boolean}
 */
function rampDownPlaybackGain(context, gainNode) {
  const gain = gainNode.gain;
  if (typeof gain.linearRampToValueAtTime !== 'function' || typeof gain.setValueAtTime !== 'function') {
    return false;
  }

  const fadeSeconds = CONFIG.AUDIO_INTERRUPT_FADE_MS / 1000;
  const startAt = context.currentTime;
  try {
    anchorGainAtCurrentValue(gain, startAt);
    gain.linearRampToValueAtTime(0, startAt + fadeSeconds);
    gain.setValueAtTime(1, startAt + fadeSeconds);
  } catch (_e) {
    return false;
  }

  return true;
}

/** @param {StopOptions} [options] @returns {void} */
export function stopScheduledPlayback(options = {}) {
  const context = playbackGainNodeContext;
  const gainNode = playbackGainNode;
  const didRamp = options.allowFade !== false
    && Boolean(context && gainNode)
    && rampDownPlaybackGain(/** @type {AudioContext} */ (context), /** @type {GainNode} */ (gainNode));
  const stopAt = didRamp && context
    ? context.currentTime + (CONFIG.AUDIO_INTERRUPT_FADE_MS / 1000)
    : 0;

  activePlaybackSources.forEach(source => {
    try {
      source.onended = null;
      source.stop(stopAt);
      if (!didRamp) source.disconnect();
    } catch (_e) { /* ignore */ }
  });
  activePlaybackSources.clear();
  nextPlaybackTime = 0;
}

/** @returns {boolean} */
export function hasScheduledPlayback() {
  return activePlaybackSources.size > 0;
}

/** @returns {void} */
export function resetScheduler() {
  // The bus is disconnected immediately below and the context is usually closed
  // right after, so a scheduled ramp would never render. Cut cleanly instead of
  // pretending to fade.
  stopScheduledPlayback({ allowFade: false });
  resetPlaybackRouting();
  nextPlaybackTime = 0;
  chunksPlayed = 0;
  underrunCount = 0;
  lastScheduledContext = null;
}
