/**
 * Main entry point for the AnshulTheGreat.com frontend.
 */
import { UI_STRINGS } from './constants/uiStrings.js';
import { CONFIG } from './constants/config.js';
import { applyI18n, showPanel } from './ui.js';
import { api, checkApiHealth } from './api.js';
import { initWaveform } from './waveform.js';
import {
  toggleCall, endCall,
  toggleMute as callToggleMute,
  prepareAudioPlaybackOnGesture,
} from './call.js';
import { showToast, whitelabelModelName } from './utils.js';
import { appendTranscript, clearDebugLogs } from './transcript.js';
import { AGENT_FORM_SCHEMA, OUTBOUND_CALL_INPUT_SCHEMA } from './constants/inputSchemas.js';
import { renderVoiceGrid, renderModelSelect, renderAgentList } from './render.js';
import {
  copyPreviewUrl as copyPreviewUrlToClipboard,
  togglePublicPreview as togglePublicPreviewRequest,
} from './previewLinks.js';
import { renderCallPanelTemplate } from './components/callPanel.js';
import { renderCallVariableInputs, collectCallVariableValues } from './components/callVariables.js';
import { getFormData, populateForm } from './agentForm.js';
import { initTelephonyPanel } from './telephony.js';
import { initCampaignPanel } from './campaigns.js';
import { initCallHistoryPanel } from './callHistory.js';
import { initSidebarNavigation, switchSection } from './sidebar.js';

/** @type {any[]} */ let agents = [];
/** @type {any[]} */ let voices = [];
/** @type {any[]} */ let models = [];
/** @type {string|null} */ let selectedAgentId = null;
/** @type {string|null} */ let currentCallAgentId = null;

// ── Auth Check ──
export async function checkAuthAndInit() {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (!res.ok) { window.location.href = CONFIG.PAGE_PATHS.LOGIN; return; }
    const data = await res.json();
    const menu = document.getElementById('user-menu');
    if (menu) menu.style.display = 'flex';
    const nameEl = document.getElementById('user-name');
    if (nameEl && data.user) nameEl.textContent = data.user.name;
  } catch (_e) {
    window.location.href = CONFIG.PAGE_PATHS.LOGIN;
    return;
  }
  initApp();
}

export async function handleLogout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  } catch (_e) { /* ignore */ }
  window.location.href = CONFIG.PAGE_PATHS.LOGIN;
}

// ── Init ──
export function initDashboard() { checkAuthAndInit(); }

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', initDashboard);
}

export function initApp() {
  applyI18n();
  loadVoices();
  loadModels();
  loadAgents();
  checkApiHealth();
  const callPanelContainer = document.getElementById('call-panel');
  if (callPanelContainer) {
    callPanelContainer.innerHTML = renderCallPanelTemplate({ hideDetails: false });
  }
  initWaveform();
  initSidebarNavigation();
  initTelephonyPanel();
  initCampaignPanel();
  initCallHistoryPanel();
  initEventListeners();
}

function initEventListeners() {
  document.getElementById('btn-new-agent')?.addEventListener('click', showCreateForm);
  document.getElementById('agent-form')?.addEventListener('submit', handleSubmit);
  document.getElementById('btn-mute')?.addEventListener('click', toggleMute);
  const btnCall = document.getElementById('btn-call');
  if (btnCall) {
    const primeAudio = () => prepareAudioPlaybackOnGesture();
    btnCall.addEventListener('pointerdown', primeAudio);
    btnCall.addEventListener('touchstart', primeAudio, { passive: true });
    btnCall.addEventListener('mousedown', primeAudio);
    btnCall.addEventListener('click', () => {
      primeAudio();
      if (currentCallAgentId) toggleCall(currentCallAgentId, callCallbacks, collectCallVariableValues());
    });
  }
  document.getElementById('btn-back-call')?.addEventListener('click', hideCallPanel);
  document.getElementById('btn-cancel-form')?.addEventListener('click', hideForm);
  document.getElementById('btn-close-form')?.addEventListener('click', hideForm);
  document.getElementById('btn-logout')?.addEventListener('click', handleLogout);
  document.getElementById('btn-outbound-call')?.addEventListener('click', handleOutboundCall);
}

// ── API Operations ──
export async function loadVoices() {
  try { voices = await api('/voices'); renderVoiceGrid(voices); }
  catch (err) { console.error('Failed to load voices:', err); }
}

export async function loadModels() {
  try { models = await api('/models'); renderModelSelect(models); }
  catch (err) { console.error('Failed to load models:', err); }
}

function reRenderAgentList() {
  renderAgentList(agents, selectedAgentId, selectAgent, showCallPanel,
    editAgent, deleteAgent, copyPreviewUrl, togglePublicPreview);
}

export async function loadAgents() {
  try {
    agents = await api('/agents');
    reRenderAgentList();
  } catch (_err) {
    showToast(UI_STRINGS.toasts.loadAgentsFailed, 'error');
    agents = [];
    reRenderAgentList();
  }
}

// ── Callbacks for call.js ──
export const callCallbacks = {
  /** @param {string} text @param {string} className */
  onStatusChange: (text, className) => {
    const el = document.getElementById('call-status');
    if (el) { el.textContent = text; el.className = `call-status ${className}`; }
  },
  /** @param {number} seconds */
  onTimerUpdate: (seconds) => {
    const el = document.getElementById('call-timer');
    if (!el) return;
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    el.textContent = `${mins}:${secs}`;
    el.classList.remove('hidden');
  },
  /** @param {string} role @param {string} text */
  onTranscript: (role, text) => appendTranscript(role, text),
};

// ── Event Handlers ──
/** @param {string} id */
export const selectAgent = (id) => {
  selectedAgentId = id;
  reRenderAgentList();
  editAgent(id);
};
/** @type {any} */ (window).selectAgent = selectAgent;

export const showCreateForm = () => {
  populateForm({});
  showPanel('form');
};

/** @param {string} id */
export function editAgent(id) {
  const agent = agents.find(a => a.id === id);
  if (!agent) return;
  populateForm({
    id: agent.id, name: agent.name,
    systemPrompt: agent.systemPrompt,
    voiceName: agent.voiceName, modelName: agent.modelName,
    publicPreviewEnabled: agent.publicPreviewEnabled,
    inactivityTimeoutMs: agent.inactivityTimeoutMs,
    maxInactivityNudges: agent.maxInactivityNudges,
    maxCallDurationSecs: agent.maxCallDurationSecs,
    title: UI_STRINGS.form.editTitle || 'Edit Agent',
    submitText: UI_STRINGS.common.save || 'Save Changes',
  });
  showPanel('form');
}

/** @param {Event} event */
export async function handleSubmit(event) {
  event.preventDefault();
  const data = getFormData();
  if (!data) return;
  const parseResult = AGENT_FORM_SCHEMA.safeParse(data);
  if (!parseResult.success) {
    showToast(UI_STRINGS.form.validation.requiredFields, 'error');
    return;
  }
  const {
    id, name, systemPrompt, voiceName, modelName,
    publicPreviewEnabled, inactivityTimeoutMs,
    maxInactivityNudges, maxCallDurationSecs,
  } = parseResult.data;
  try {
    await api(id ? `/agents/${id}` : '/agents', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify({
        name, systemPrompt, voiceName, modelName,
        publicPreviewEnabled, inactivityTimeoutMs,
        maxInactivityNudges, maxCallDurationSecs,
      }),
    });
    showToast(id ? UI_STRINGS.toasts.agentUpdated : UI_STRINGS.toasts.agentCreated, 'success');
    await loadAgents();
    showPanel('empty');
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    showToast(errMsg, 'error');
  }
}

/** @param {string} id */
export async function copyPreviewUrl(id) { await copyPreviewUrlToClipboard(id); }

/** @param {string} id @param {boolean} enabled */
export async function togglePublicPreview(id, enabled) {
  try { await togglePublicPreviewRequest(id, enabled); await loadAgents(); }
  catch (_err) { await loadAgents(); }
}

/** @param {string} id */
export async function deleteAgent(id) {
  if (!confirm(UI_STRINGS.common.confirmDelete)) return;
  try {
    await api(`/agents/${id}`, { method: 'DELETE' });
    showToast(UI_STRINGS.toasts.agentDeleted, 'success');
    await loadAgents();
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    showToast(errMsg, 'error');
  }
}

/** @param {string} agentId */
export function showCallPanel(agentId) {
  const agent = agents.find(a => a.id === agentId);
  if (!agent) return;
  currentCallAgentId = agentId;
  const nameEl = document.getElementById('call-agent-name');
  if (nameEl) nameEl.textContent = agent.name;
  const voiceEl = document.getElementById('call-voice-name');
  if (voiceEl) voiceEl.textContent = agent.voiceName || CONFIG.DEFAULT_VOICE;
  const modelBadge = document.getElementById('call-model-badge');
  if (modelBadge) {
    const model = models.find(m => m.id === agent.modelName);
    const modelDisplayName = model ? model.name : agent.modelName || '';
    const websiteName = UI_STRINGS.header.title || CONFIG.DEFAULT_WEBSITE_NAME;
    modelBadge.textContent = whitelabelModelName(modelDisplayName, websiteName);
  }
  const bodyEl = document.getElementById('transcript-body');
  if (bodyEl) bodyEl.innerHTML = '';
  renderCallVariableInputs(agent.systemPrompt);
  clearDebugLogs();
  showPanel('call');
}
/** @type {any} */ (window).showCallPanel = showCallPanel;

/**
 * @param {boolean} isCalling 
 */
function setOutboundCallBtnState(isCalling) {
  const btn = document.getElementById('btn-outbound-call');
  const btnText = document.getElementById('outbound-call-btn-text');
  if (btn) {
    if (isCalling) {
      btn.classList.add('calling');
      btn.setAttribute('disabled', 'true');
    } else {
      btn.classList.remove('calling');
      btn.removeAttribute('disabled');
    }
  }
  if (btnText) {
    btnText.textContent = isCalling 
      ? UI_STRINGS.callPanel.outbound.calling 
      : UI_STRINGS.callPanel.outbound.callBtn;
  }
}

/**
 * @param {string} message 
 * @param {boolean} isSuccess 
 */
function showOutboundCallStatus(message, isSuccess) {
  const statusEl = document.getElementById('outbound-call-status');
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.className = isSuccess ? 'outbound-call-status success' : 'outbound-call-status error';
    statusEl.classList.remove('hidden');
  }
}

/** @returns {Promise<void>} */
export async function handleOutboundCall() {
  if (!currentCallAgentId) return;

  const phoneInput = /** @type {HTMLInputElement | null} */ (
    document.getElementById('outbound-phone-number')
  );
  const phoneNumber = phoneInput?.value?.trim() || '';

  const inputParse = OUTBOUND_CALL_INPUT_SCHEMA.safeParse({
    agentId: currentCallAgentId,
    phoneNumber,
  });
  if (!inputParse.success) {
    showToast(UI_STRINGS.callPanel.outbound.failed, 'error');
    return;
  }

  setOutboundCallBtnState(true);

  try {
    const result = await api('/outbound-call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: currentCallAgentId, phoneNumber }),
    });

    showToast(UI_STRINGS.toasts.outboundCallInitiated(phoneNumber), 'success');
    showOutboundCallStatus(`${UI_STRINGS.callPanel.outbound.initiated} — Call ID: ${result.callId || 'N/A'}`, true);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    showToast(UI_STRINGS.toasts.outboundCallFailed(errMsg), 'error');
    showOutboundCallStatus(`${UI_STRINGS.callPanel.outbound.failed}: ${errMsg}`, false);
  } finally {
    setOutboundCallBtnState(false);
  }
}

export function hideCallPanel() { endCall(); showPanel('empty'); }
export function hideForm() { showPanel('empty'); }

export function toggleMute() {
  const isMuted = callToggleMute();
  const btn = document.getElementById('btn-mute');
  if (btn) btn.classList.toggle('muted', isMuted);
  const iconOff = document.getElementById('mute-icon-off');
  if (iconOff) iconOff.classList.toggle('hidden', isMuted);
  const iconOn = document.getElementById('mute-icon-on');
  if (iconOn) iconOn.classList.toggle('hidden', !isMuted);
}

/** @internal (For testing) */
export function resetMainState() {
  agents = []; voices = []; models = [];
  selectedAgentId = null; currentCallAgentId = null;
}

export { initSidebarNavigation, switchSection };
