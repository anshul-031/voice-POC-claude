/**
 * Public preview page logic for an agent web call.
 */
import { UI_STRINGS } from './constants/uiStrings.js';
import { applyI18n } from './ui.js';
import { api } from './api.js';
import { initWaveform } from './waveform.js';
import { toggleCall, endCall, toggleMute as callToggleMute } from './call.js';
import { showToast } from './utils.js';
import { appendTranscript, clearDebugLogs } from './transcript.js';

/** @type {string | null} */
let previewAgentId = null;

/**
 * @returns {string | null}
 */
function getAgentIdFromUrl() {
  const match = window.location.pathname.match(/^\/preview\/([^/]+)$/);
  if (match?.[1]) {
    return decodeURIComponent(match[1]);
  }

  const fromQuery = new URLSearchParams(window.location.search).get('agentId');
  return fromQuery?.trim() || null;
}

/**
 * @param {string} text
 * @param {string} className
 * @returns {void}
 */
function updateStatus(text, className) {
  const statusEl = document.getElementById('call-status');
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.className = `call-status ${className}`;
}

/**
 * @param {number} seconds
 * @returns {void}
 */
function updateTimer(seconds) {
  const timerEl = document.getElementById('call-timer');
  if (!timerEl) return;
  const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secs = (seconds % 60).toString().padStart(2, '0');
  timerEl.textContent = `${mins}:${secs}`;
  timerEl.classList.remove('hidden');
}

const callCallbacks = {
  onStatusChange: updateStatus,
  onTimerUpdate: updateTimer,
  /**
   * @param {'user' | 'model'} role
   * @param {string} text
   * @returns {void}
   */
  onTranscript: (role, text) => appendTranscript(role, text),
};

/**
 * @returns {Promise<void>}
 */
async function loadPreviewAgent() {
  if (!previewAgentId) {
    showToast(UI_STRINGS.preview.unavailable, 'error');
    return;
  }

  try {
    const data = await api(`/public/agents/${encodeURIComponent(previewAgentId)}/preview`);
    const titleEl = document.getElementById('call-agent-name');
    if (titleEl) titleEl.textContent = data.name;
  } catch {
    showToast(UI_STRINGS.preview.unavailable, 'error');
    const btnCall = document.getElementById('btn-call');
    if (btnCall) {
      btnCall.setAttribute('disabled', 'true');
    }
  }
}

/**
 * @returns {void}
 */
function toggleMute() {
  const isMuted = callToggleMute();
  const btn = document.getElementById('btn-mute');
  /* c8 ignore next */
  if (btn) btn.classList.toggle('muted', isMuted);
  const iconOff = document.getElementById('mute-icon-off');
  /* c8 ignore next */
  if (iconOff) iconOff.classList.toggle('hidden', isMuted);
  const iconOn = document.getElementById('mute-icon-on');
  /* c8 ignore next */
  if (iconOn) iconOn.classList.toggle('hidden', !isMuted);
}

/**
 * @returns {void}
 */
function initPreviewPage() {
  applyI18n();
  initWaveform();
  clearDebugLogs();

  previewAgentId = getAgentIdFromUrl();

  document.getElementById('btn-call')?.addEventListener('click', () => {
    if (!previewAgentId) return;
    toggleCall(previewAgentId, callCallbacks);
  });

  document.getElementById('btn-mute')?.addEventListener('click', toggleMute);

  document.getElementById('btn-back-call')?.addEventListener('click', async () => {
    await endCall();
    window.location.href = '/landing.html';
  });

  window.addEventListener('beforeunload', () => {
    endCall();
  });

  loadPreviewAgent();
}

document.addEventListener('DOMContentLoaded', initPreviewPage);
