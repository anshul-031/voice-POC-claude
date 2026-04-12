/* eslint-disable max-lines */
import { CONFIG } from './constants/config.js';

/** @type {string[]} */
const audioQueue = [];
let isPlayingAudio = false;
/** @type {AudioBufferSourceNode | null} */
let currentPlaybackSource = null;
/** @type {GainNode | null} */
let playbackGainNode = null;
/** @type {AudioContext | null} */
let playbackGainNodeContext = null;
let speechFrameStreak = 0;
let lastBargeInAtMs = 0;
let adaptiveNoiseFloorRms = CONFIG.BARGE_IN_NOISE_FLOOR_INITIAL_RMS;

/** @param {string | undefined} base64Data @returns {void} */
function requeueChunkAndStop(base64Data) {
  if (base64Data) {
    audioQueue.unshift(base64Data);
  }
  isPlayingAudio = false;
  currentPlaybackSource = null;
}

/** @returns {void} */
function clearPlaybackState() {
  isPlayingAudio = false;
  currentPlaybackSource = null;
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
 * Linearly resample PCM Float32Array from one sample rate to another.
 * @param {Float32Array} input
 * @param {number} inputRate
 * @param {number} outputRate
 * @returns {Float32Array}
 */
export function resamplePcm(input, inputRate, outputRate) {
  if (inputRate === outputRate || input.length === 0) return input;
  const ratio = inputRate / outputRate;
  const outputLength = Math.ceil(input.length / ratio);
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const srcFloor = Math.floor(srcIndex);
    const srcCeil = Math.min(srcFloor + 1, input.length - 1);
    const fraction = srcIndex - srcFloor;
    output[i] = input[srcFloor] + fraction * (input[srcCeil] - input[srcFloor]);
  }
  return output;
}

/** @param {AudioContext} audioContext @param {Float32Array} float32 @returns {AudioBuffer} */
function createAudioBuffer(audioContext, float32) {
  const contextRate = audioContext.sampleRate || CONFIG.SAMPLE_RATE_OUTPUT;
  const resampled = resamplePcm(float32, CONFIG.SAMPLE_RATE_OUTPUT, contextRate);
  const audioBuffer = audioContext.createBuffer(1, resampled.length, contextRate);
  audioBuffer.getChannelData(0).set(resampled);
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
  return !!currentPlaybackSource || isPlayingAudio || audioQueue.length > 0;
}

/** @returns {void} */
function stopCurrentPlaybackSource() {
  if (!currentPlaybackSource) return;
  try {
    currentPlaybackSource.onended = null;
    currentPlaybackSource.stop();
    currentPlaybackSource.disconnect();
  } catch (_e) { /* ignore */ }
  currentPlaybackSource = null;
}

/** @returns {boolean} */
export function interruptModelPlayback() {
  const hadPlayback = hasModelPlayback();
  stopCurrentPlaybackSource();
  audioQueue.length = 0;
  isPlayingAudio = false;
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
  return true;
}

/** @returns {boolean} */
export function getIsPlayingAudio() {
  return isPlayingAudio;
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
  if (audioQueue.length === 0) {
    clearPlaybackState();
    return;
  }

  isPlayingAudio = true;
  const base64Data = dequeueChunk();

  try {
    const contextReady = await ensureAudioContextReady(audioContext, base64Data, {
      onResumeAttemptFailed: options.onContextResumeFailure,
    });
    if (!contextReady || !audioContext) return;

    const float32 = decodePcmBase64(base64Data);
    const audioBuffer = createAudioBuffer(audioContext, float32);
    const bufferSource = createPlaybackSource(audioContext, audioBuffer, analyserNode);

    currentPlaybackSource = bufferSource;
    bufferSource.onended = () => {
      if (currentPlaybackSource === bufferSource) {
        currentPlaybackSource = null;
      }
      processAudioQueue(audioContext, analyserNode, options);
    };
    if (options.onPlaybackStarted) {
      options.onPlaybackStarted();
    }
    bufferSource.start();
  } catch (_e) {
    currentPlaybackSource = null;
    processAudioQueue(audioContext, analyserNode, options);
  }
}

/** @returns {void} */
export function resetAudioPlaybackState() {
  interruptModelPlayback();
  resetPlaybackGainNode();
  speechFrameStreak = 0;
  lastBargeInAtMs = 0;
  adaptiveNoiseFloorRms = CONFIG.BARGE_IN_NOISE_FLOOR_INITIAL_RMS;
}
