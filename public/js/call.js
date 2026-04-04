import { CONFIG, MESSAGE_TYPE } from './constants/config.js';
import { UI_STRINGS } from './constants/uiStrings.js';
import { showToast, uint8ToBase64 } from './utils.js';
import { updateCallUI } from './ui.js';
import { startWaveformAnimation, stopWaveformAnimation } from './waveform.js';
import { START_CALL_INPUT_SCHEMA, WS_INBOUND_MESSAGE_SCHEMA } from './constants/inputSchemas.js';
import { appendDebugLog } from './transcript.js';
import {
  detectSpeechBargeIn,
  enqueueAudio,
  getIsPlayingAudio,
  interruptModelPlayback,
  processAudioQueue as processPlaybackQueue,
  resetAudioPlaybackState,
} from './audioPlayback.js';

/** @type {AudioContext | null} */ let audioContext = null;
/** @type {MediaStream | null} */ let mediaStream = null;
/** @type {ScriptProcessorNode | null} */ let audioProcessor = null;
/** @type {WebSocket | null} */ let ws = null;
/** @type {AnalyserNode | null} */ let analyserNode = null;
let isInCall = false;
let isMuted = false;
/** @type {number | null} */ let callTimer = null;
let callSeconds = 0;
let audioChunksSent = 0;

/** @returns {{isInCall: boolean, isMuted: boolean, callSeconds: number}} */
export function getCallState() {
  return { isInCall, isMuted, callSeconds };
}

/** @param {string | null} agentId @param {any} callbacks @returns {Promise<void>} */
export async function toggleCall(agentId, callbacks) {
  if (isInCall) await endCall();
  else await startCall(agentId, callbacks);
}

/** @param {Float32Array} inputData @returns {void} */
function relayAudioChunk(inputData) {
  const pcm16 = new Int16Array(inputData.length);
  for (let i = 0; i < inputData.length; i++) {
    const sample = Math.max(-1, Math.min(1, inputData[i]));
    pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
  }
  if (ws?.readyState !== WebSocket.OPEN) return;
  audioChunksSent++;
  if (audioChunksSent % CONFIG.AUDIO_LOG_THROTTLE === 1) {
    appendDebugLog(UI_STRINGS.signaling.logs.audioRelay(audioChunksSent), 'info');
  }
  ws.send(JSON.stringify({ type: MESSAGE_TYPE.AUDIO_DATA, data: uint8ToBase64(new Uint8Array(pcm16.buffer)) }));
}

/** @returns {void} */
function setupAudioGraph() {
  if (!audioContext || !mediaStream) {
    return;
  }
  const source = audioContext.createMediaStreamSource(mediaStream);
  analyserNode = audioContext.createAnalyser();
  analyserNode.fftSize = 256;
  source.connect(analyserNode);
  startWaveformAnimation(analyserNode);

  audioProcessor = audioContext.createScriptProcessor(4096, 1, 1);
  source.connect(audioProcessor);
  audioProcessor.connect(audioContext.destination);
  audioProcessor.onaudioprocess = (/** @type {AudioProcessingEvent} */ event) => {
    if (!isInCall || isMuted) return;
    const inputData = event.inputBuffer.getChannelData(0);
    if (detectSpeechBargeIn(inputData)) {
      appendDebugLog(UI_STRINGS.signaling.logs.bargeInDetected, 'warn');
    }
    relayAudioChunk(inputData);
  };
}

/** @param {string} agentId @param {any} callbacks @returns {void} */
function setupSocket(agentId, callbacks) {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  appendDebugLog(UI_STRINGS.signaling.logs.wsConnecting, 'info');
  ws = new WebSocket(`${wsProtocol}//${window.location.host}${CONFIG.WS_PATH}`);

  ws.onopen = () => {
    appendDebugLog(UI_STRINGS.signaling.logs.wsOpen, 'info');
    appendDebugLog(UI_STRINGS.signaling.logs.sendingStart(agentId), 'info');
    ws?.send(JSON.stringify({ type: MESSAGE_TYPE.START_CALL, agentId }));
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      const messageParse = WS_INBOUND_MESSAGE_SCHEMA.safeParse(message);
      if (!messageParse.success) {
        showToast(UI_STRINGS.signaling.errors.invalidMessageFormat, 'error');
        appendDebugLog(UI_STRINGS.signaling.logs.inboundValidationFailed, 'error');
        return;
      }
      appendDebugLog(UI_STRINGS.signaling.logs.recvType(messageParse.data.type), 'info');
      handleWsMessage(messageParse.data, callbacks);
    } catch {
      appendDebugLog(UI_STRINGS.signaling.logs.inboundParseFailed, 'error');
    }
  };

  ws.onerror = () => {
    showToast(UI_STRINGS.toasts.connectionError, 'error');
    appendDebugLog(UI_STRINGS.signaling.logs.wsError, 'error');
    endCall();
  };

  ws.onclose = (event) => {
    appendDebugLog(UI_STRINGS.signaling.logs.wsClosed(event.code), 'warn');
    if (isInCall) endCall();
  };
}

/** @param {string | null} agentId @param {any} callbacks @returns {Promise<void>} */
export async function startCall(agentId, callbacks) {
  appendDebugLog(UI_STRINGS.signaling.logs.callInit, 'info');
  const callInputParse = START_CALL_INPUT_SCHEMA.safeParse({ agentId });
  if (!callInputParse.success) {
    showToast(UI_STRINGS.api.errors.invalidInput, 'error');
    appendDebugLog(UI_STRINGS.api.errors.invalidInput, 'error');
    return;
  }

  callbacks.onStatusChange(UI_STRINGS.callPanel.connecting, 'connecting');

  try {
    const ContextCtor = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
    audioContext = new ContextCtor({ sampleRate: CONFIG.SAMPLE_RATE_INPUT });
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: CONFIG.SAMPLE_RATE_INPUT,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    appendDebugLog(UI_STRINGS.signaling.logs.micReady, 'info');
    setupAudioGraph();
    setupSocket(callInputParse.data.agentId, callbacks);
  } catch (_err) {
    const errMsg = _err instanceof Error ? _err.message : String(_err);
    showToast(`Failed to start call: ${errMsg}`, 'error');
    appendDebugLog(UI_STRINGS.signaling.logs.startCallFailed(errMsg), 'error');
    endCall();
  }
}

/** @param {any} message @param {any} callbacks @returns {void} */
export function handleWsMessage(message, callbacks) {
  const { onStatusChange, onTranscript = () => {} } = callbacks;
  const handlers = {
    [MESSAGE_TYPE.CALL_STARTED]: () => {
      isInCall = true;
      audioChunksSent = 0;
      updateCallUI(true);
      onStatusChange(UI_STRINGS.callPanel.connected, 'active');
      startTimer(callbacks.onTimerUpdate);
      appendDebugLog(UI_STRINGS.signaling.logs.callStarted, 'info');
      if (message.agentName) showToast(UI_STRINGS.toasts.callStarted(message.agentName), 'success');
    },
    [MESSAGE_TYPE.AUDIO_RESPONSE]: () => playAudioResponse(message.data),
    [MESSAGE_TYPE.TRANSCRIPT]: () => {
      onTranscript(message.role, message.text);
      if (message.role === 'user') appendDebugLog(UI_STRINGS.signaling.logs.transcriptUser(message.text.length), 'info');
      if (message.role === 'model') appendDebugLog(UI_STRINGS.signaling.logs.transcriptModel(message.text.length), 'info');
    },
    [MESSAGE_TYPE.INTERRUPTED]: () => {
      appendDebugLog(UI_STRINGS.signaling.logs.interrupted, 'warn');
      interruptModelPlayback();
    },
    [MESSAGE_TYPE.CALL_ENDED]: () => {
      showToast(message.reason || UI_STRINGS.callPanel.ended, 'success');
      appendDebugLog(UI_STRINGS.signaling.logs.callEnded(message.reason || UI_STRINGS.callPanel.ended), 'warn');
      endCall();
    },
    [MESSAGE_TYPE.ERROR]: () => {
      showToast(message.message, 'error');
      appendDebugLog(UI_STRINGS.signaling.logs.callError(message.message), 'error');
      endCall();
    },
  };

  const handler = handlers[message.type];
  if (!handler) {
    appendDebugLog(UI_STRINGS.signaling.logs.unknownType(String(message.type)), 'warn');
    return;
  }
  handler();
}

/** @param {string} base64Data @returns {void} */
export function playAudioResponse(base64Data) {
  if (!enqueueAudio(base64Data) || getIsPlayingAudio()) return;
  processAudioQueue();
}

/** @returns {Promise<void>} */
export async function processAudioQueue() {
  await processPlaybackQueue(audioContext, analyserNode);
}

/** @returns {Promise<void>} */
async function closeAudioContextIfNeeded() {
  if (!audioContext || audioContext.state === 'closed') return;
  try {
    await audioContext.close();
  } catch (_e) { /* ignore */ }
}

/** @returns {Promise<void>} */
export async function endCall() {
  appendDebugLog(UI_STRINGS.signaling.logs.callEndCleanup, 'info');
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
  resetAudioPlaybackState();
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
  await closeAudioContextIfNeeded();
  audioContext = null;
  analyserNode = null;
  audioChunksSent = 0;
  stopTimer();
  updateCallUI(false);
  stopWaveformAnimation();
  isMuted = false;
  appendDebugLog(UI_STRINGS.signaling.logs.callEndComplete, 'info');
}

/** @returns {boolean} */
export function toggleMute() {
  isMuted = !isMuted;
  return isMuted;
}

/** @param {function(number): void} onTimerUpdate @returns {void} */
export function startTimer(onTimerUpdate) {
  callSeconds = 0;
  onTimerUpdate(callSeconds);
  callTimer = window.setInterval(() => {
    callSeconds++;
    onTimerUpdate(callSeconds);
  }, 1000);
}

/** @returns {void} */
export function stopTimer() {
  if (!callTimer) return;
  clearInterval(callTimer);
  callTimer = null;
}

/** @returns {void} */
export function resetState() {
  isInCall = false;
  isMuted = false;
  callSeconds = 0;
  audioChunksSent = 0;
  resetAudioPlaybackState();
  ws = null;
  audioContext = null;
  audioProcessor = null;
  mediaStream = null;
  analyserNode = null;
  if (callTimer) {
    clearInterval(callTimer);
    callTimer = null;
  }
}

/** @returns {WebSocket | null} */
export function getWs() { return ws; }
/** @returns {AudioContext | null} */
export function getAudioContext() { return audioContext; }
/** @returns {ScriptProcessorNode | null} */
export function getAudioProcessor() { return audioProcessor; }
