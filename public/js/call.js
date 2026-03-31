/**
 * Voice call and WebSocket logic for the frontend.
 */
import { CONFIG, MESSAGE_TYPE } from './constants/config.js';
import { UI_STRINGS } from './constants/uiStrings.js';
import { showToast, uint8ToBase64 } from './utils.js';
import { updateCallUI } from './ui.js';
import { startWaveformAnimation, stopWaveformAnimation } from './waveform.js';

/** @type {AudioContext | null} */
let audioContext = null;
/** @type {MediaStream | null} */
let mediaStream = null;
/** @type {ScriptProcessorNode | null} */
let audioProcessor = null;
/** @type {WebSocket | null} */
let ws = null;
/** @type {AnalyserNode | null} */
let analyserNode = null;
let isInCall = false;
let isMuted = false;
/** @type {number | null} */
let callTimer = null;
let callSeconds = 0;
/** @type {string[]} */
const audioQueue = [];
let isPlayingAudio = false;

/**
 * @returns {{isInCall: boolean, isMuted: boolean, callSeconds: number}}
 */
export function getCallState() {
  return { isInCall, isMuted, callSeconds };
}

/**
 * @param {string | null} agentId 
 * @param {any} callbacks 
 * @returns {Promise<void>}
 */
export async function toggleCall(agentId, callbacks) {
  if (isInCall) {
    await endCall();
  } else {
    await startCall(agentId, callbacks);
  }
}

/**
 * @param {string | null} agentId 
 * @param {any} callbacks 
 * @returns {Promise<void>}
 */
async function startCall(agentId, callbacks) {
  if (!agentId) return;
  const idValue = String(agentId);

  const { onStatusChange } = callbacks;
  onStatusChange(UI_STRINGS.callPanel.connecting, 'connecting');

  try {
    const context = new (window.AudioContext || 
      /** @type {any} */ (window).webkitAudioContext)({
      sampleRate: CONFIG.SAMPLE_RATE_INPUT,
    });
    audioContext = context;
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: CONFIG.SAMPLE_RATE_INPUT,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    const source = audioContext.createMediaStreamSource(mediaStream);
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 256;
    source.connect(analyserNode);
    startWaveformAnimation(analyserNode);

    audioProcessor = audioContext.createScriptProcessor(4096, 1, 1);
    source.connect(audioProcessor);
    audioProcessor.connect(audioContext.destination);

    audioProcessor.onaudioprocess = (event) => {
      if (!isInCall || isMuted) return;
      const inputData = event.inputBuffer.getChannelData(0);
      const pcm16 = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      const uint8 = new Uint8Array(pcm16.buffer);
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: MESSAGE_TYPE.AUDIO_DATA, data: uint8ToBase64(uint8) }));
      }
    };

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${wsProtocol}//${window.location.host}${CONFIG.WS_PATH}`);

    ws.onopen = () => {
      ws?.send(JSON.stringify({ type: MESSAGE_TYPE.START_CALL, agentId: idValue }));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleWsMessage(message, callbacks);
      } catch {
        // Ignore parse errors
      }
    };

    ws.onerror = () => {
      showToast(UI_STRINGS.toasts.connectionError, 'error');
      endCall();
    };

    ws.onclose = () => {
      if (isInCall) endCall();
    };

  } catch (_err) {
    const errMsg = _err instanceof Error ? _err.message : String(_err);
    showToast(`Failed to start call: ${errMsg}`, 'error');
    endCall();
  }
}

/**
 * @param {any} message 
 * @param {any} callbacks 
 * @returns {void}
 */
function handleWsMessage(message, callbacks) {
  const { onStatusChange, onTranscript = () => {} } = callbacks;

  switch (message.type) {
    case MESSAGE_TYPE.CALL_STARTED:
      isInCall = true;
      updateCallUI(true);
      onStatusChange(UI_STRINGS.callPanel.connected, 'active');
      startTimer(callbacks.onTimerUpdate);
      if (message.agentName) {
        showToast(UI_STRINGS.toasts.callStarted(message.agentName), 'success');
      }
      break;

    case MESSAGE_TYPE.AUDIO_RESPONSE:
      playAudioResponse(message.data);
      break;

    case MESSAGE_TYPE.TRANSCRIPT:
      onTranscript(message.role, message.text);
      break;

    case MESSAGE_TYPE.CALL_ENDED:
      showToast(message.reason || UI_STRINGS.callPanel.ended, 'success');
      endCall();
      break;

    case MESSAGE_TYPE.ERROR:
      showToast(message.message, 'error');
      endCall();
      break;
  }
}

/**
 * @param {string} base64Data 
 * @returns {void}
 */
function playAudioResponse(base64Data) {
  if (!base64Data) return;
  audioQueue.push(base64Data);
  if (!isPlayingAudio) processAudioQueue();
}

/**
 * @returns {Promise<void>}
 */
async function processAudioQueue() {
  if (audioQueue.length === 0) {
    isPlayingAudio = false;
    return;
  }
  isPlayingAudio = true;
  const base64Data = audioQueue.shift();
  if (!base64Data) {
    processAudioQueue();
    return;
  }
  try {
    if (!audioContext || audioContext.state === 'closed') return;
    const binaryString = window.atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768.0;
    const audioBuffer = audioContext.createBuffer(1, float32.length, CONFIG.SAMPLE_RATE_OUTPUT);
    audioBuffer.getChannelData(0).set(float32);
    const bufferSource = audioContext.createBufferSource();
    bufferSource.buffer = audioBuffer;
    bufferSource.connect(audioContext.destination);
    if (analyserNode) bufferSource.connect(analyserNode);
    bufferSource.onended = () => processAudioQueue();
    bufferSource.start();
  } catch (_e) {
    processAudioQueue();
  }
}

/**
 * @returns {Promise<void>}
 */
export async function endCall() {
  isInCall = false;
  if (ws?.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify({ type: MESSAGE_TYPE.END_CALL }));
      ws.close();
    } catch (_e) { /* ignore */ }
  }
  ws = null;
  if (audioProcessor) {
    try { audioProcessor.disconnect(); } catch (_e) { /* ignore */ }
  }
  audioProcessor = null;
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
  if (audioContext && audioContext.state !== 'closed') {
    try { await audioContext.close(); } catch (_e) { /* ignore */ }
  }
  audioContext = null;
  analyserNode = null;
  audioQueue.length = 0;
  isPlayingAudio = false;
  stopTimer();
  updateCallUI(false);
  stopWaveformAnimation();
  isMuted = false;
}

/**
 * @returns {boolean}
 */
export function toggleMute() {
  isMuted = !isMuted;
  return isMuted;
}

/**
 * @param {function(number):void} onTimerUpdate 
 * @returns {void}
 */
function startTimer(onTimerUpdate) {
  callSeconds = 0;
  onTimerUpdate(callSeconds);
  callTimer = /** @type {any} */ (window.setInterval(() => {
    callSeconds++;
    onTimerUpdate(callSeconds);
  }, 1000));
}

/**
 * @returns {void}
 */
function stopTimer() {
  if (callTimer) {
    clearInterval(callTimer);
    callTimer = null;
  }
}
