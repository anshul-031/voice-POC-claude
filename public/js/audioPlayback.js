import { CONFIG } from './constants/config.js';
import { UI_STRINGS } from './constants/uiStrings.js';
import { appendDebugLog } from './transcript.js';

/** @type {string[]} */
const audioQueue = [];
let isProcessingQueue = false;
/** @type {Set<AudioBufferSourceNode>} */
const activePlaybackSources = new Set();
/** @type {GainNode | null} */
let playbackGainNode = null;
/** @type {AudioContext | null} */
let playbackGainNodeContext = null;
let speechFrameStreak = 0;
let lastBargeInAtMs = 0;
let adaptiveNoiseFloorRms = CONFIG.BARGE_IN_NOISE_FLOOR_INITIAL_RMS;

let nextPlaybackTime = 0;
let chunksPlayed = 0;
let underrunCount = 0;

/** @param {string | undefined} base64Data @returns {void} */
function requeueChunkAndStop(base64Data) {
  if (base64Data) {
    audioQueue.unshift(base64Data);
  }
  nextPlaybackTime = 0;
}

/** @returns {void} */
function clearPlaybackState() {
  nextPlaybackTime = 0;
}

/** @returns {string} */
function dequeueChunk() {
  return /** @type {string} */ (audioQueue.shift());
}

/** @returns {Promise<void>} */
function waitForResumeRetryDelay() {
  return new Promise((resolve) => {
    window.setTimeout(resolve, CONFIG.AUDIO_CONTEXT_RESUME_RETRY_DELAY_MS);
  });
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
  playbackGainNodeContext = audioContext;

  return playbackGainNode;
}

/** @returns {void} */
function resetPlaybackGainNode() {
  if (playbackGainNode) {
    try {
      playbackGainNode.disconnect();
    } catch (_e) { /* ignore */ }
  }
  playbackGainNode = null;
  playbackGainNodeContext = null;
}

/**
 * @typedef {Object} AudioContextReadyOptions
 * @property {(attempt: number, error: unknown) => void} [onResumeAttemptFailed]
 */

/**
 * @param {AudioContextReadyOptions} options
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
 * @param {AudioContextReadyOptions} options
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
 * @param {AudioContext | null} audioContext
 * @param {string} base64Data
 * @param {AudioContextReadyOptions} [options]
 * @returns {Promise<boolean>}
 */
async function ensureAudioContextReady(audioContext, base64Data, options = {}) {
  if (!audioContext || audioContext.state === 'closed') {
    requeueChunkAndStop(base64Data);
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

  requeueChunkAndStop(base64Data);
  return false;
}

/** @param {string} base64Data @returns {Float32Array} */
function decodePcmBase64(base64Data) {
  const binaryString = window.atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768.0;
  return float32;
}

/**
 * Apply a short cross-fade ramp at the start of a chunk to avoid click artifacts.
 * @param {Float32Array} samples
 * @returns {Float32Array}
 */
function applyCrossfadeRamp(samples) {
  const fadeLen = Math.min(CONFIG.AUDIO_CROSSFADE_SAMPLES, samples.length);
  for (let i = 0; i < fadeLen; i++) {
    samples[i] *= i / fadeLen;
  }
  return samples;
}

/** @param {AudioContext} audioContext @param {Float32Array} float32 @returns {AudioBuffer} */
function createAudioBuffer(audioContext, float32) {
  const audioBuffer = audioContext.createBuffer(1, float32.length, CONFIG.SAMPLE_RATE_OUTPUT);
  audioBuffer.getChannelData(0).set(float32);
  return audioBuffer;
}

/** @param {AudioContext} audioContext @param {AudioBuffer} audioBuffer @param {AnalyserNode | null} analyserNode @returns {AudioBufferSourceNode} */
function createPlaybackSource(audioContext, audioBuffer, analyserNode) {
  const bufferSource = audioContext.createBufferSource();
  bufferSource.buffer = audioBuffer;
  const gainNode = getOrCreatePlaybackGainNode(audioContext);
  bufferSource.connect(gainNode);
  if (analyserNode) bufferSource.connect(analyserNode);
  return bufferSource;
}

/** @returns {boolean} */
export function hasModelPlayback() {
  return activePlaybackSources.size > 0 || audioQueue.length > 0 || isProcessingQueue;
}

/** @returns {void} */
function stopActivePlaybackSources() {
  activePlaybackSources.forEach(source => {
    try {
      source.onended = null;
      source.stop();
      source.disconnect();
    } catch (_e) { /* ignore */ }
  });
  activePlaybackSources.clear();
}

/** @returns {boolean} */
export function interruptModelPlayback() {
  const hadPlayback = hasModelPlayback();
  stopActivePlaybackSources();
  audioQueue.length = 0;
  nextPlaybackTime = 0;
  return hadPlayback;
}

/** @param {Float32Array} inputData @returns {number} */
function calculateRms(inputData) {
  let energy = 0;
  for (let i = 0; i < inputData.length; i++) {
    const sample = inputData[i];
    energy += sample * sample;
  }
  return Math.sqrt(energy / inputData.length);
}

/** @returns {number} */
function getAdaptiveBargeInThreshold() {
  return Math.max(
    CONFIG.BARGE_IN_RMS_THRESHOLD,
    CONFIG.BARGE_IN_MIN_INTERRUPT_RMS,
    adaptiveNoiseFloorRms * CONFIG.BARGE_IN_DYNAMIC_THRESHOLD_MULTIPLIER,
  );
}

/** @param {number} rms @returns {void} */
function updateAdaptiveNoiseFloor(rms) {
  const smoothing = CONFIG.BARGE_IN_NOISE_FLOOR_SMOOTHING;
  adaptiveNoiseFloorRms = ((1 - smoothing) * adaptiveNoiseFloorRms) + (smoothing * rms);
}

/** @param {Float32Array} inputData @returns {boolean} */
export function detectSpeechBargeIn(inputData) {
  const rms = calculateRms(inputData);
  const threshold = getAdaptiveBargeInThreshold();
  if (rms < threshold) {
    updateAdaptiveNoiseFloor(rms);
  }
  speechFrameStreak = rms >= threshold ? speechFrameStreak + 1 : 0;

  const cooldownElapsed = Date.now() - lastBargeInAtMs >= CONFIG.BARGE_IN_COOLDOWN_MS;
  const shouldInterrupt = cooldownElapsed
    && speechFrameStreak >= CONFIG.BARGE_IN_MIN_FRAMES
    && hasModelPlayback();

  if (!shouldInterrupt) return false;

  lastBargeInAtMs = Date.now();
  speechFrameStreak = 0;
  return interruptModelPlayback();
}

/** @param {string} base64Data @returns {boolean} */
export function enqueueAudio(base64Data) {
  if (!base64Data) return false;
  audioQueue.push(base64Data);

  const sampleEstimate = Math.floor((base64Data.length * 3) / 4 / 2);

  const depth = audioQueue.length;
  if (depth % CONFIG.AUDIO_DIAG_LOG_INTERVAL_CHUNKS === 0) {
    appendDebugLog(UI_STRINGS.signaling.logs.audioChunkEnqueued(sampleEstimate, depth), 'info');
  }
  if (depth >= CONFIG.AUDIO_QUEUE_DEPTH_WARN && depth % CONFIG.AUDIO_DIAG_LOG_INTERVAL_CHUNKS === 0) {
    appendDebugLog(UI_STRINGS.signaling.logs.audioQueueDepthWarn(depth), 'warn');
  }

  return true;
}

/** @returns {boolean} */
export function getIsPlayingAudio() {
  return activePlaybackSources.size > 0 || isProcessingQueue;
}

/**
 * Detect and log playback underrun if the schedule has fallen behind.
 * @param {number} now
 * @returns {void}
 */
function detectPlaybackUnderrun(now) {
  if (nextPlaybackTime > 0 && chunksPlayed > 0) {
    const gapMs = (now - nextPlaybackTime) * 1000;
    if (gapMs > 2) {
      underrunCount++;
      appendDebugLog(UI_STRINGS.signaling.logs.audioPlaybackUnderrun(gapMs), 'warn');
    }
  }
  nextPlaybackTime = now;
}

/**
 * Log periodic playback diagnostics.
 * @param {number} scheduledTime
 * @param {number} chunkDuration
 * @returns {void}
 */
function logPlaybackDiagnostics(scheduledTime, chunkDuration) {
  if (chunksPlayed % CONFIG.AUDIO_DIAG_LOG_INTERVAL_CHUNKS !== 0) return;
  appendDebugLog(
    UI_STRINGS.signaling.logs.audioPlaybackScheduled(scheduledTime, chunkDuration),
    'info',
  );
  appendDebugLog(
    UI_STRINGS.signaling.logs.audioPlaybackStats(chunksPlayed, underrunCount, audioQueue.length),
    'info',
  );
}

/**
 * @typedef {Object} PlaybackQueueOptions
 * @property {() => void} [onPlaybackStarted]
 * @property {(attempt: number, error: unknown) => void} [onContextResumeFailure]
 */

/**
 * @param {AudioContext | null} audioContext
 * @param {AnalyserNode | null} analyserNode
 * @param {PlaybackQueueOptions} [options]
 * @returns {Promise<void>}
 */
export async function processAudioQueue(audioContext, analyserNode, options = {}) {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  try {
    while (audioQueue.length > 0) {
      const base64Data = dequeueChunk();

      try {
        const contextReady = await ensureAudioContextReady(audioContext, base64Data, {
          onResumeAttemptFailed: options.onContextResumeFailure,
        });
        if (!contextReady || !audioContext) break;

        const float32 = decodePcmBase64(base64Data);
        const fadedSamples = applyCrossfadeRamp(float32);
        const audioBuffer = createAudioBuffer(audioContext, fadedSamples);
        const bufferSource = createPlaybackSource(audioContext, audioBuffer, analyserNode);

        const chunkDuration = float32.length / CONFIG.SAMPLE_RATE_OUTPUT;
        const now = audioContext.currentTime;

        if (nextPlaybackTime <= now) {
          detectPlaybackUnderrun(now);
        }

        activePlaybackSources.add(bufferSource);

        bufferSource.onended = () => {
          activePlaybackSources.delete(bufferSource);
          if (activePlaybackSources.size === 0 && audioQueue.length === 0) {
            clearPlaybackState();
          }
        };

        if (options.onPlaybackStarted && chunksPlayed === 0) {
          options.onPlaybackStarted();
        }

        bufferSource.start(nextPlaybackTime);
        chunksPlayed++;
        logPlaybackDiagnostics(nextPlaybackTime, chunkDuration);
        nextPlaybackTime += chunkDuration;
      } catch (_e) {
        // Skip chunk on decode failure and continue to next chunk
      }
    }
  } finally {
    isProcessingQueue = false;
  }
}

/** @returns {void} */
export function resetAudioPlaybackState() {
  interruptModelPlayback();
  resetPlaybackGainNode();
  speechFrameStreak = 0;
  lastBargeInAtMs = 0;
  adaptiveNoiseFloorRms = CONFIG.BARGE_IN_NOISE_FLOOR_INITIAL_RMS;
  nextPlaybackTime = 0;
  chunksPlayed = 0;
  underrunCount = 0;
}
