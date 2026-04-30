/* eslint-disable max-lines */
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

/** @typedef {Window & { webkitAudioContext?: typeof AudioContext }} WindowWithWebkitAudio */
/** @typedef {Navigator & { audioSession?: { type?: string } }} NavigatorWithAudioSession */

/** @type {AudioContext | null} */ let audioContext = null;
/** @type {MediaStream | null} */ let mediaStream = null;
/** @type {ScriptProcessorNode | null} */ let audioProcessor = null;
/** @type {WebSocket | null} */ let ws = null;
/** @type {AnalyserNode | null} */ let analyserNode = null;
let hasPrimedAudioOutput = false;
let audioContextResumeFailures = 0;
let hasShownAudioRecoveryToast = false;

/**
 * @typedef {Object} CallCallbacks
 * @property {Function} onStatusChange
 * @property {Function} onTimerUpdate
 * @property {Function} [onTranscript]
 */

/**
 * @typedef {Object} StartupTrace
 * @property {string} runId
 * @property {number} startAt
 * @property {boolean} firstAudioRelayedLogged
 * @property {boolean} firstInboundAudioLogged
 * @property {boolean} firstInboundTranscriptLogged
 * @property {boolean} firstPlaybackLogged
 */

/**
 * @typedef {Object} StartupErrorInfo
 * @property {string} name
 * @property {string} message
 */

/** @type {StartupTrace | null} */
let startupTrace = null;

let isInCall = false;
let isMuted = false;
/** @type {number | null} */ let callTimer = null;
let callSeconds = 0;
let audioChunksSent = 0;

/** @returns {typeof AudioContext | null} */
function getAudioContextCtor() {
  const browserWindow = /** @type {WindowWithWebkitAudio} */ (window);
  const ContextCtor = globalThis.AudioContext || browserWindow.webkitAudioContext;
  return ContextCtor || null;
}

/** @returns {AudioContext | null} */
function getOrCreateAudioContext() {
  if (audioContext && audioContext.state !== 'closed') {
    return audioContext;
  }

  const ContextCtor = getAudioContextCtor();
  if (!ContextCtor) return null;

  audioContext = new ContextCtor({ sampleRate: CONFIG.SAMPLE_RATE_INPUT });
  hasPrimedAudioOutput = false;
  return audioContext;
}

/** @returns {Promise<void>} */
function waitForAudioContextResumeRetry() {
  return new Promise((resolve) => {
    window.setTimeout(resolve, CONFIG.AUDIO_CONTEXT_RESUME_RETRY_DELAY_MS);
  });
}

/** @param {unknown} error @returns {string} */
function getErrorMessage(error) {
  if (error instanceof Error) {
    return error.message || UI_STRINGS.toasts.connectionError;
  }

  if (typeof error === 'string') {
    return error;
  }

  return UI_STRINGS.toasts.connectionError;
}

/** @param {AudioContext} context @returns {boolean} */
function isAudioContextRunning(context) {
  return /** @type {string} */ (context.state) === 'running';
}

/** @param {AudioContext} context @returns {Promise<boolean>} */
async function resumeAudioContextWithRetries(context) {
  if (isAudioContextRunning(context)) {
    appendDebugLog(UI_STRINGS.signaling.logs.audioContextResumeSuccess(context.state), 'info');
    return true;
  }

  for (let attempt = 1; attempt <= CONFIG.AUDIO_CONTEXT_RESUME_MAX_ATTEMPTS; attempt++) {
    appendDebugLog(UI_STRINGS.signaling.logs.audioContextResumeAttempt(attempt), 'info');
    try {
      await context.resume();
      if (isAudioContextRunning(context)) {
        appendDebugLog(UI_STRINGS.signaling.logs.audioContextResumeSuccess(context.state), 'info');
        return true;
      }
      appendDebugLog(UI_STRINGS.signaling.logs.audioContextResumeFailed('AudioContext remained suspended'), 'warn');
    } catch (error) {
      appendDebugLog(UI_STRINGS.signaling.logs.audioContextResumeFailed(getErrorMessage(error)), 'warn');
    }

    if (attempt < CONFIG.AUDIO_CONTEXT_RESUME_MAX_ATTEMPTS) {
      await waitForAudioContextResumeRetry();
    }
  }

  return false;
}

/** @returns {void} */
function configureAudioSessionForCall() {
  const browserNavigator = /** @type {NavigatorWithAudioSession} */ (navigator);
  if (!browserNavigator.audioSession) {
    return;
  }

  try {
    browserNavigator.audioSession.type = CONFIG.IOS_AUDIO_SESSION_TYPE;
    appendDebugLog(UI_STRINGS.signaling.logs.audioSessionConfigured(CONFIG.IOS_AUDIO_SESSION_TYPE), 'info');
  } catch (error) {
    appendDebugLog(UI_STRINGS.signaling.logs.audioSessionConfigFailed(getErrorMessage(error)), 'warn');
  }
}

/** @param {AudioContext} context @returns {void} */
function primeAudioOutput(context) {
  if (hasPrimedAudioOutput) return;

  try {
    const sampleRate = context.sampleRate || CONFIG.SAMPLE_RATE_INPUT;
    const unlockBuffer = context.createBuffer(1, CONFIG.AUDIO_UNLOCK_SILENT_FRAME_COUNT, sampleRate);
    const unlockSource = context.createBufferSource();
    unlockSource.buffer = unlockBuffer;
    unlockSource.connect(context.destination);
    unlockSource.onended = () => {
      try {
        unlockSource.disconnect();
      } catch (_e) { /* ignore */ }
    };
    unlockSource.start(0);
    hasPrimedAudioOutput = true;
  } catch (_e) { /* ignore */ }
}

/** @returns {void} */
function primeAudioOutputOnUserGesture() {
  const context = getOrCreateAudioContext();
  if (!context) return;

  appendDebugLog(UI_STRINGS.signaling.logs.audioContextInitState(context.state), 'info');
  void resumeAudioContextWithRetries(context);

  primeAudioOutput(context);
  appendDebugLog(UI_STRINGS.signaling.logs.audioOutputPrimed, 'info');
}

/** @returns {void} */
export function prepareAudioPlaybackOnGesture() {
  primeAudioOutputOnUserGesture();
}

/** @returns {string} */
function createRunId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** @returns {number} */
function getStartupElapsedMs() {
  if (!startupTrace) return 0;
  return Date.now() - startupTrace.startAt;
}

/** @template T @param {Promise<T>} promise @param {number} timeoutMs @param {Error} timeoutError @returns {Promise<T>} */
function withTimeout(promise, timeoutMs, timeoutError) {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(timeoutError), timeoutMs);
    promise
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

/** @type {Record<string, string>} */
const CALL_START_RECOVERY_BY_ERROR_NAME = {
  [CONFIG.CALL_START_ERROR_NAMES.PERMISSION_DENIED]: UI_STRINGS.signaling.recovery.permissionRequired,
  [CONFIG.CALL_START_ERROR_NAMES.PERMISSION_DISMISSED]: UI_STRINGS.signaling.recovery.permissionRequired,
  [CONFIG.CALL_START_ERROR_NAMES.DEVICE_NOT_FOUND]: UI_STRINGS.signaling.recovery.noMicrophone,
  [CONFIG.CALL_START_ERROR_NAMES.DEVICE_NOT_READABLE]: UI_STRINGS.signaling.recovery.microphoneBusy,
  [CONFIG.CALL_START_ERROR_NAMES.CONSTRAINT_FAILED]: UI_STRINGS.signaling.recovery.noMicrophone,
  [CONFIG.CALL_START_ERROR_NAMES.SECURITY]: UI_STRINGS.signaling.recovery.secureContextRequired,
  [CONFIG.CALL_START_ERROR_NAMES.UNSUPPORTED]: UI_STRINGS.signaling.recovery.browserUnsupported,
};

/** @type {Record<string, string>} */
const CALL_START_RECOVERY_BY_MESSAGE = {
  [UI_STRINGS.signaling.errors.wsConnectTimeout]: UI_STRINGS.signaling.recovery.networkIssue,
  [UI_STRINGS.toasts.connectionError]: UI_STRINGS.signaling.recovery.networkIssue,
  [UI_STRINGS.signaling.errors.micAccessTimeout]: UI_STRINGS.signaling.recovery.permissionRequired,
  [UI_STRINGS.signaling.errors.mediaDevicesUnsupported]: UI_STRINGS.signaling.recovery.browserUnsupported,
  [UI_STRINGS.signaling.errors.audioContextUnsupported]: UI_STRINGS.signaling.recovery.browserUnsupported,
};

/** @param {unknown} error @returns {StartupErrorInfo} */
function normalizeStartupError(error) {
  if (error instanceof Error) {
    return {
      name: error.name || '',
      message: error.message || UI_STRINGS.toasts.connectionError,
    };
  }

  if (typeof error === 'string') {
    return { name: '', message: error };
  }

  return { name: '', message: UI_STRINGS.toasts.connectionError };
}

/** @param {StartupErrorInfo} errorInfo @returns {string} */
function getCallStartRecoveryHint(errorInfo) {
  return CALL_START_RECOVERY_BY_ERROR_NAME[errorInfo.name]
    || CALL_START_RECOVERY_BY_MESSAGE[errorInfo.message]
    || UI_STRINGS.signaling.recovery.generic;
}

/** @param {unknown} error @param {CallCallbacks} callbacks @returns {void} */
function handleCallStartFailure(error, callbacks) {
  const errorInfo = normalizeStartupError(error);
  const recoveryHint = getCallStartRecoveryHint(errorInfo);

  appendDebugLog(UI_STRINGS.signaling.logs.startupFailed(getStartupElapsedMs()), 'error');
  appendDebugLog(UI_STRINGS.signaling.logs.startCallFailed(errorInfo.message), 'error');
  appendDebugLog(UI_STRINGS.signaling.logs.startCallRecoveryHint(recoveryHint), 'warn');
  callbacks.onStatusChange(UI_STRINGS.toasts.callStartFailed(recoveryHint), 'error');
  showToast(UI_STRINGS.toasts.callStartFailed(recoveryHint), 'error');
}

/** @returns {{isInCall: boolean, isMuted: boolean, callSeconds: number}} */
export function getCallState() {
  return { isInCall, isMuted, callSeconds };
}

/** @param {string | null} agentId @param {CallCallbacks} callbacks @returns {Promise<void>} */
export async function toggleCall(agentId, callbacks) {
  if (isInCall) await endCall();
  else {
    prepareAudioPlaybackOnGesture();
    await startCall(agentId, callbacks);
  }
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
  if (audioChunksSent === 1 && startupTrace && !startupTrace.firstAudioRelayedLogged) {
    startupTrace.firstAudioRelayedLogged = true;
    appendDebugLog(UI_STRINGS.signaling.logs.firstAudioRelayElapsed(getStartupElapsedMs()), 'info');
  }
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
  /** @type {AudioNode} */
  let processedSource = source;

  if (typeof audioContext.createBiquadFilter === 'function') {
    const highPassFilter = audioContext.createBiquadFilter();
    highPassFilter.type = 'highpass';
    highPassFilter.frequency.value = CONFIG.MIC_HIGHPASS_FREQUENCY_HZ;
    highPassFilter.Q.value = CONFIG.MIC_HIGHPASS_Q;
    source.connect(highPassFilter);
    processedSource = highPassFilter;
  }

  analyserNode = audioContext.createAnalyser();
  analyserNode.fftSize = 256;
  processedSource.connect(analyserNode);
  startWaveformAnimation(analyserNode);

  audioProcessor = audioContext.createScriptProcessor(4096, 1, 1);
  processedSource.connect(audioProcessor);
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

/** @returns {void} */
function resetMuteButtonUI() {
  const btn = document.getElementById('btn-mute');
  if (btn) btn.classList.remove('muted');
  const iconOff = document.getElementById('mute-icon-off');
  if (iconOff) iconOff.classList.remove('hidden');
  const iconOn = document.getElementById('mute-icon-on');
  if (iconOn) iconOn.classList.add('hidden');
}


/** @param {string} agentId @param {CallCallbacks} callbacks @returns {Promise<void>} */
function setupSocket(agentId, callbacks) {
  const wsConnectStart = Date.now();
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  appendDebugLog(UI_STRINGS.signaling.logs.wsConnecting, 'info');
  const socket = new WebSocket(`${wsProtocol}//${window.location.host}${CONFIG.WS_PATH}`);
  ws = socket;

  return new Promise((resolve, reject) => {
    let didResolveOpen = false;
    const timeoutId = window.setTimeout(() => {
      appendDebugLog(UI_STRINGS.signaling.logs.wsTimeout(CONFIG.WS_CONNECT_TIMEOUT_MS), 'error');
      reject(new Error(UI_STRINGS.signaling.errors.wsConnectTimeout));
      try {
        ws?.close();
      } catch (_e) { /* ignore */ }
    }, CONFIG.WS_CONNECT_TIMEOUT_MS);

    socket.onopen = () => {
      clearTimeout(timeoutId);
      didResolveOpen = true;
      appendDebugLog(UI_STRINGS.signaling.logs.wsOpen, 'info');
      appendDebugLog(UI_STRINGS.signaling.logs.wsOpenElapsed(Date.now() - wsConnectStart), 'info');
      appendDebugLog(UI_STRINGS.signaling.logs.sendingStart(agentId), 'info');
      socket.send(JSON.stringify({ type: MESSAGE_TYPE.START_CALL, agentId }));
      appendDebugLog(UI_STRINGS.signaling.logs.startSentElapsed(getStartupElapsedMs()), 'info');
      appendDebugLog(UI_STRINGS.signaling.logs.startupComplete(getStartupElapsedMs()), 'info');
      resolve();
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const messageParse = WS_INBOUND_MESSAGE_SCHEMA.safeParse(message);
        if (!messageParse.success) {
          showToast(UI_STRINGS.signaling.errors.invalidMessageFormat, 'error');
          appendDebugLog(UI_STRINGS.signaling.logs.inboundValidationFailed, 'error');
          return;
        }
        if (
          messageParse.data.type === MESSAGE_TYPE.AUDIO_RESPONSE
          && startupTrace
          && !startupTrace.firstInboundAudioLogged
        ) {
          startupTrace.firstInboundAudioLogged = true;
          appendDebugLog(UI_STRINGS.signaling.logs.firstInboundAudioElapsed(getStartupElapsedMs()), 'info');
        }
        if (
          messageParse.data.type === MESSAGE_TYPE.TRANSCRIPT
          && startupTrace
          && !startupTrace.firstInboundTranscriptLogged
        ) {
          startupTrace.firstInboundTranscriptLogged = true;
          appendDebugLog(UI_STRINGS.signaling.logs.firstInboundTranscriptElapsed(getStartupElapsedMs()), 'info');
        }
        appendDebugLog(UI_STRINGS.signaling.logs.recvType(messageParse.data.type), 'info');
        handleWsMessage(messageParse.data, callbacks);
      } catch {
        appendDebugLog(UI_STRINGS.signaling.logs.inboundParseFailed, 'error');
      }
    };

    socket.onerror = () => {
      clearTimeout(timeoutId);
      showToast(UI_STRINGS.toasts.connectionError, 'error');
      appendDebugLog(UI_STRINGS.signaling.logs.wsError, 'error');
      if (!didResolveOpen) {
        reject(new Error(UI_STRINGS.toasts.connectionError));
      }
      endCall();
    };

    socket.onclose = (event) => {
      clearTimeout(timeoutId);
      appendDebugLog(UI_STRINGS.signaling.logs.wsClosed(event.code), 'warn');
      if (isInCall) endCall();
    };
  });
}

/** @param {string | null} agentId @param {CallCallbacks} callbacks @returns {Promise<void>} */
export async function startCall(agentId, callbacks) {
  const runId = createRunId();
  startupTrace = {
    runId,
    startAt: Date.now(),
    firstAudioRelayedLogged: false,
    firstInboundAudioLogged: false,
    firstInboundTranscriptLogged: false,
    firstPlaybackLogged: false,
  };
  appendDebugLog(UI_STRINGS.signaling.logs.callInit, 'info');
  appendDebugLog(UI_STRINGS.signaling.logs.callRunId(runId), 'info');
  appendDebugLog(UI_STRINGS.signaling.logs.startupBegin, 'info');

  const callInputParse = START_CALL_INPUT_SCHEMA.safeParse({ agentId });
  if (!callInputParse.success) {
    showToast(UI_STRINGS.api.errors.invalidInput, 'error');
    appendDebugLog(UI_STRINGS.api.errors.invalidInput, 'error');
    startupTrace = null;
    return;
  }

  callbacks.onStatusChange(UI_STRINGS.callPanel.connecting, 'connecting');
  audioContextResumeFailures = 0;
  hasShownAudioRecoveryToast = false;

  try {
    audioContext = getOrCreateAudioContext();
    if (!audioContext) {
      throw new Error(UI_STRINGS.signaling.errors.audioContextUnsupported);
    }
    appendDebugLog(UI_STRINGS.signaling.logs.audioContextInitState(audioContext.state), 'info');
    configureAudioSessionForCall();
    const contextRunning = await resumeAudioContextWithRetries(audioContext);
    if (!contextRunning) {
      appendDebugLog(UI_STRINGS.signaling.logs.playbackResumeBlocked, 'warn');
    }
    primeAudioOutput(audioContext);
    appendDebugLog(UI_STRINGS.signaling.logs.audioOutputPrimed, 'info');
    appendDebugLog(UI_STRINGS.signaling.logs.micRequesting, 'info');

    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      throw new Error(UI_STRINGS.signaling.errors.mediaDevicesUnsupported);
    }

    const micReadyStart = Date.now();
    const mediaPromise = withTimeout(
      navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: CONFIG.SAMPLE_RATE_INPUT,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      }),
      CONFIG.MEDIA_ACCESS_TIMEOUT_MS,
      new Error(UI_STRINGS.signaling.errors.micAccessTimeout),
    );
    const socketPromise = setupSocket(callInputParse.data.agentId, callbacks);
    socketPromise.catch((socketError) => {
      handleCallStartFailure(socketError, callbacks);
      endCall();
    });

    mediaStream = await mediaPromise;
    appendDebugLog(UI_STRINGS.signaling.logs.micReady, 'info');
    appendDebugLog(UI_STRINGS.signaling.logs.micReadyElapsed(Date.now() - micReadyStart), 'info');
    setupAudioGraph();
  } catch (_err) {
    handleCallStartFailure(_err, callbacks);
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
  await processPlaybackQueue(audioContext, analyserNode, {
    onPlaybackStarted: () => {
      audioContextResumeFailures = 0;
      hasShownAudioRecoveryToast = false;
      if (!startupTrace || startupTrace.firstPlaybackLogged) return;
      startupTrace.firstPlaybackLogged = true;
      appendDebugLog(UI_STRINGS.signaling.logs.firstPlaybackElapsed(getStartupElapsedMs()), 'info');
    },
    onContextResumeFailure: (attempt, error) => {
      audioContextResumeFailures++;
      appendDebugLog(UI_STRINGS.signaling.logs.audioContextResumeAttempt(attempt), 'warn');
      appendDebugLog(UI_STRINGS.signaling.logs.audioContextResumeFailed(getErrorMessage(error)), 'warn');

      if (
        hasShownAudioRecoveryToast
        || audioContextResumeFailures < CONFIG.AUDIO_CONTEXT_FAILURE_TOAST_THRESHOLD
      ) {
        return;
      }

      hasShownAudioRecoveryToast = true;
      appendDebugLog(UI_STRINGS.signaling.logs.playbackResumeBlocked, 'warn');
      appendDebugLog(
        UI_STRINGS.signaling.logs.startCallRecoveryHint(UI_STRINGS.signaling.recovery.tapCallToEnableAudio),
        'warn',
      );
      showToast(UI_STRINGS.toasts.audioPlaybackNeedsGesture, 'info');
    },
  });
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
  hasPrimedAudioOutput = false;
  audioContextResumeFailures = 0;
  hasShownAudioRecoveryToast = false;
  analyserNode = null;
  audioChunksSent = 0;
  stopTimer();
  updateCallUI(false);
  stopWaveformAnimation();
  setMediaStreamTracksEnabled(true);
  isMuted = false;
  resetMuteButtonUI();
  startupTrace = null;
  appendDebugLog(UI_STRINGS.signaling.logs.callEndComplete, 'info');
}

/** @param {boolean} enabled @returns {void} */
function setMediaStreamTracksEnabled(enabled) {
  if (!mediaStream) return;
  mediaStream.getAudioTracks().forEach((track) => {
    track.enabled = enabled;
  });
}

/** @returns {boolean} */
export function toggleMute() {
  isMuted = !isMuted;
  setMediaStreamTracksEnabled(!isMuted);
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
  hasPrimedAudioOutput = false;
  audioContextResumeFailures = 0;
  hasShownAudioRecoveryToast = false;
  audioProcessor = null;
  mediaStream = null;
  analyserNode = null;
  startupTrace = null;
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
