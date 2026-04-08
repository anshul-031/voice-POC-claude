import { CONFIG } from './constants/config.js';

/** @type {string[]} */
const audioQueue = [];
let isPlayingAudio = false;
/** @type {AudioBufferSourceNode | null} */
let currentPlaybackSource = null;
let speechFrameStreak = 0;
let lastBargeInAtMs = 0;

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

/** @param {AudioContext | null} audioContext @param {string} base64Data @returns {Promise<boolean>} */
async function ensureAudioContextReady(audioContext, base64Data) {
  if (!audioContext || audioContext.state === 'closed') {
    requeueChunkAndStop(base64Data);
    return false;
  }

  if (audioContext.state === 'running') {
    return true;
  }

  try {
    await audioContext.resume();
  } catch (_e) {
    requeueChunkAndStop(base64Data);
    return false;
  }

  return true;
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
  bufferSource.connect(audioContext.destination);
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

/** @param {Float32Array} inputData @returns {boolean} */
export function detectSpeechBargeIn(inputData) {
  let energy = 0;
  for (let i = 0; i < inputData.length; i++) {
    const sample = inputData[i];
    energy += sample * sample;
  }

  const rms = Math.sqrt(energy / inputData.length);
  speechFrameStreak = rms >= CONFIG.BARGE_IN_RMS_THRESHOLD ? speechFrameStreak + 1 : 0;

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
    const contextReady = await ensureAudioContextReady(audioContext, base64Data);
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
  speechFrameStreak = 0;
  lastBargeInAtMs = 0;
}
