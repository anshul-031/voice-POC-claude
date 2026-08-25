/**
 * Inbound model audio: queueing, PCM decode, and local barge-in detection.
 * Placement of decoded audio on the output clock lives in audioScheduler.js.
 */
import { CONFIG } from './constants/config.js';
import { UI_STRINGS } from './constants/uiStrings.js';
import { appendDebugLog } from './transcript.js';
import {
  ensurePlaybackContextReady,
  hasScheduledPlayback,
  resetScheduler,
  scheduleSamples,
  setPlaybackRecordingDestination,
  stopScheduledPlayback,
} from './audioScheduler.js';

export { setPlaybackRecordingDestination };

/** @type {string[]} */
const audioQueue = [];
let pendingBase64Chars = 0;
let isProcessingQueue = false;
let speechFrameStreak = 0;
let lastBargeInAtMs = 0;
let adaptiveNoiseFloorRms = CONFIG.BARGE_IN_NOISE_FLOOR_INITIAL_RMS;
let decodedChunkCount = 0;
let decodedByteCount = 0;
let decodedSampleCount = 0;
let oddByteChunkCount = 0;
let decodeFailureCount = 0;
let coalescedBatchCount = 0;
let coalescedSourceChunkCount = 0;
let queueHighWatermark = 0;
let playbackDiscontinuityCount = 0;
let playbackScheduleFailureCount = 0;

/** @param {string} reason @returns {void} */
function logPlaybackSummary(reason) {
  if (
    decodedChunkCount === 0
    && decodeFailureCount === 0
    && queueHighWatermark === 0
    && playbackScheduleFailureCount === 0
  ) return;
  appendDebugLog(
    UI_STRINGS.signaling.logs.audioDiagnosticEvent('playback-summary', {
      reason,
      decodedChunks: decodedChunkCount,
      decodedBytes: decodedByteCount,
      decodedSamples: decodedSampleCount,
      oddByteChunks: oddByteChunkCount,
      decodeFailures: decodeFailureCount,
      coalescedBatches: coalescedBatchCount,
      coalescedSourceChunks: coalescedSourceChunkCount,
      queueHighWatermark,
      discontinuities: playbackDiscontinuityCount,
      scheduleFailures: playbackScheduleFailureCount,
    }),
    decodeFailureCount > 0 || playbackScheduleFailureCount > 0 ? 'warn' : 'info',
  );
}

/** @param {string} base64Data @returns {Float32Array} */
function decodePcmBase64(base64Data) {
  const binaryString = window.atob(base64Data);
  // Frames are 16-bit LE. A trailing odd byte would make the Int16Array view
  // throw, which used to cost the entire chunk and leave a hole in the stream.
  const usableBytes = binaryString.length - (binaryString.length % 2);
  const bytes = new Uint8Array(usableBytes);
  for (let i = 0; i < usableBytes; i++) bytes[i] = binaryString.charCodeAt(i);
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768.0;
  decodedChunkCount++;
  decodedByteCount += usableBytes;
  decodedSampleCount += int16.length;
  if (usableBytes !== binaryString.length) oddByteChunkCount++;
  return float32;
}

/**
 * True when audio was lost since the last scheduled block, so the next block
 * does not continue the previous waveform and has to be faded in.
 */
let pendingDiscontinuity = false;

/** @param {Float32Array[]} segments @param {number} totalSamples @returns {Float32Array} */
function mergeSegments(segments, totalSamples) {
  if (segments.length === 1) return segments[0];

  const merged = new Float32Array(totalSamples);
  let offset = 0;
  for (const segment of segments) {
    merged.set(segment, offset);
    offset += segment.length;
  }
  return merged;
}

/**
 * @typedef {Object} DrainedBatch
 * @property {Float32Array} samples
 * @property {boolean} startsDiscontinuity
 */

/**
 * Decode everything currently waiting and merge it into one contiguous block.
 * Gemini emits many short chunks, and one buffer per chunk means one scheduling
 * boundary per chunk; merging removes most of those boundaries outright.
 * @returns {DrainedBatch | null}
 */
function drainQueueIntoSamples() {
  /** @type {Float32Array[]} */
  const segments = [];
  let totalSamples = 0;
  let droppedChunk = false;
  let sourceChunkCount = 0;

  while (audioQueue.length > 0 && totalSamples < CONFIG.AUDIO_MAX_COALESCE_SAMPLES) {
    const base64Data = /** @type {string} */ (audioQueue.shift());
    pendingBase64Chars = Math.max(0, pendingBase64Chars - base64Data.length);
    sourceChunkCount++;
    try {
      const samples = decodePcmBase64(base64Data);
      if (samples.length === 0) continue;
      segments.push(samples);
      totalSamples += samples.length;
    } catch (_e) {
      decodeFailureCount++;
      // End the batch at the hole. Merging across it would splice two unrelated
      // waveforms inside one buffer, where neither a fade nor a scheduling
      // boundary can smooth the step.
      droppedChunk = true;
      appendDebugLog(
        UI_STRINGS.signaling.logs.audioDiagnosticEvent('decode-failure', {
          decodeFailures: decodeFailureCount,
          queueDepth: audioQueue.length,
          sourceChunkCount,
        }),
        'warn',
      );
      break;
    }
  }

  if (sourceChunkCount > 0) {
    coalescedBatchCount++;
    coalescedSourceChunkCount += sourceChunkCount;
  }

  const startsDiscontinuity = pendingDiscontinuity;
  pendingDiscontinuity = droppedChunk;
  if (startsDiscontinuity || droppedChunk) playbackDiscontinuityCount++;

  if (totalSamples === 0) {
    pendingDiscontinuity = pendingDiscontinuity || startsDiscontinuity;
    return null;
  }

  return { samples: mergeSegments(segments, totalSamples), startsDiscontinuity };
}

/** @returns {boolean} */
export function hasModelPlayback() {
  return hasScheduledPlayback() || audioQueue.length > 0 || isProcessingQueue;
}

/** @returns {boolean} */
export function interruptModelPlayback() {
  const hadPlayback = hasModelPlayback();
  stopScheduledPlayback();
  audioQueue.length = 0;
  pendingBase64Chars = 0;
  // The clock is re-based on the next block anyway, which already fades it in.
  pendingDiscontinuity = false;
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
  pendingBase64Chars += base64Data.length;

  const sampleEstimate = Math.floor((base64Data.length * 3) / 4 / 2);

  const depth = audioQueue.length;
  queueHighWatermark = Math.max(queueHighWatermark, depth);
  if (depth % CONFIG.AUDIO_DIAG_LOG_INTERVAL_CHUNKS === 0) {
    appendDebugLog(UI_STRINGS.signaling.logs.audioChunkEnqueued(sampleEstimate, depth), 'info');
    appendDebugLog(
      UI_STRINGS.signaling.logs.audioDiagnosticEvent('queue', {
        depth,
        queueHighWatermark,
        pendingBase64Chars,
        decodedBytes: decodedByteCount,
        decodedSamples: decodedSampleCount,
      }),
      'info',
    );
  }
  if (depth >= CONFIG.AUDIO_QUEUE_DEPTH_WARN && depth % CONFIG.AUDIO_DIAG_LOG_INTERVAL_CHUNKS === 0) {
    appendDebugLog(UI_STRINGS.signaling.logs.audioQueueDepthWarn(depth), 'warn');
  }

  return true;
}

/** @returns {boolean} */
export function getIsPlayingAudio() {
  return hasScheduledPlayback() || isProcessingQueue;
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
      const contextReady = await ensurePlaybackContextReady(audioContext, {
        onResumeAttemptFailed: options.onContextResumeFailure,
      });
      if (!contextReady || !audioContext) break;

      const batch = drainQueueIntoSamples();
      if (!batch) continue;

      const scheduled = scheduleSamples(audioContext, analyserNode, batch.samples, {
        onPlaybackStarted: options.onPlaybackStarted,
        queueDepth: audioQueue.length,
        startsDiscontinuity: batch.startsDiscontinuity,
      });
      if (!scheduled) {
        playbackScheduleFailureCount++;
        // The batch is already off the queue and never reached the device.
        pendingDiscontinuity = true;
        appendDebugLog(
          UI_STRINGS.signaling.logs.audioDiagnosticEvent('schedule-failure', {
            failures: playbackScheduleFailureCount,
            queueDepth: audioQueue.length,
            decodedBytes: decodedByteCount,
            decodedSamples: decodedSampleCount,
          }),
          'warn',
        );
        break;
      }
    }
  } finally {
    isProcessingQueue = false;
  }
}

/** @returns {void} */
export function resetAudioPlaybackState() {
  logPlaybackSummary('reset');
  audioQueue.length = 0;
  pendingBase64Chars = 0;
  resetScheduler();
  pendingDiscontinuity = false;
  speechFrameStreak = 0;
  lastBargeInAtMs = 0;
  adaptiveNoiseFloorRms = CONFIG.BARGE_IN_NOISE_FLOOR_INITIAL_RMS;
  decodedChunkCount = 0;
  decodedByteCount = 0;
  decodedSampleCount = 0;
  oddByteChunkCount = 0;
  decodeFailureCount = 0;
  coalescedBatchCount = 0;
  coalescedSourceChunkCount = 0;
  queueHighWatermark = 0;
  playbackDiscontinuityCount = 0;
  playbackScheduleFailureCount = 0;
}
