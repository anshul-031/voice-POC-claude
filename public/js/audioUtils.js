/**
 * Audio processing utilities for voice calls
 */

/**
 * Calculate RMS (Root Mean Square) energy for voice activity detection
 * @param {Float32Array} inputData
 * @returns {number}
 */
export function calculateRMS(inputData) {
  let sumSquares = 0;
  for (let i = 0; i < inputData.length; i++) {
    sumSquares += inputData[i] * inputData[i];
  }
  return Math.sqrt(sumSquares / inputData.length);
}

/**
 * Convert float32 audio to PCM16 format
 * @param {Float32Array} inputData
 * @returns {Uint8Array}
 */
export function convertToPCM16(inputData) {
  const pcm16 = new Int16Array(inputData.length);
  for (let i = 0; i < inputData.length; i++) {
    const s = Math.max(-1, Math.min(1, inputData[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return new Uint8Array(pcm16.buffer);
}

/**
 * Convert base64 PCM16 audio to AudioBuffer
 * @param {string} base64Data
 * @param {AudioContext} audioContext
 * @param {number} sampleRate
 * @returns {AudioBuffer}
 */
export function decodeAudioChunk(base64Data, audioContext, sampleRate) {
  const binaryString = window.atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768.0;
  const audioBuffer = audioContext.createBuffer(1, float32.length, sampleRate);
  audioBuffer.getChannelData(0).set(float32);
  return audioBuffer;
}
