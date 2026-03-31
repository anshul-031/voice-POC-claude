/**
 * Main entry point for the VoiceForge frontend.
 */
import { UI_STRINGS } from './constants/uiStrings.js';
import { CONFIG } from './constants/config.js';
import { applyI18n, showPanel } from './ui.js';
import { api, checkApiHealth } from './api.js';
import { initWaveform } from './waveform.js';
import { toggleCall, endCall, toggleMute as callToggleMute } from './call.js';
import { showToast, escapeHtml } from './utils.js';
import { appendTranscript, selectVoiceInGrid, clearDebugLogs } from './transcript.js';
import { AGENT_FORM_SCHEMA } from './constants/inputSchemas.js';

/** @type {any[]} */
let agents = [];
/** @type {any[]} */
let voices = [];
/** @type {any[]} */
let models = [];
/** @type {string | null} */
let selectedAgentId = null;
/** @type {string | null} */
let currentCallAgentId = null;

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  applyI18n();
  loadVoices();
  loadModels();
  loadAgents();
  checkApiHealth();
  initWaveform();
  
  // Set up event listeners
  document.getElementById('btn-new-agent')?.addEventListener('click', showCreateForm);
  document.getElementById('agent-form')?.addEventListener('submit', handleSubmit);
  document.getElementById('btn-mute')?.addEventListener('click', toggleMute);
  document.getElementById('btn-call')?.addEventListener('click', () => {
    if (currentCallAgentId) {
      toggleCall(currentCallAgentId, callCallbacks);
    }
  });
  document.getElementById('btn-back-call')?.addEventListener('click', hideCallPanel);
  document.getElementById('btn-cancel-form')?.addEventListener('click', hideForm);
  document.getElementById('btn-close-form')?.addEventListener('click', hideForm);
});

// ── API Operations ──
async function loadVoices() {
  try {
    voices = await api('/voices');
    renderVoiceGrid();
  } catch (err) {
    console.error('Failed to load voices:', err);
  }
}

async function loadModels() {
  try {
    models = await api('/models');
    renderModelSelect();
  } catch (err) {
    console.error('Failed to load models:', err);
  }
}

async function loadAgents() {
  try {
    agents = await api('/agents');
    renderAgentList();
  } catch (_err) {
    showToast(UI_STRINGS.toasts.loadAgentsFailed, 'error');
    agents = [];
    renderAgentList();
  }
}

// ── Rendering ──
function renderVoiceGrid() {
  const grid = document.getElementById('voice-grid');
  if (!grid) return;
  grid.innerHTML = voices.map(v => `
    <label class="voice-option${v.id === CONFIG.DEFAULT_VOICE ? ' selected' : ''}" data-voice="${v.id}">
      <input type="radio" name="voiceName" value="${v.id}" ${v.id === CONFIG.DEFAULT_VOICE ? 'checked' : ''}>
      <div class="voice-option-name">${v.name}</div>
      <div class="voice-option-desc">${v.description}</div>
    </label>
  `).join('');

  grid.querySelectorAll('.voice-option').forEach(opt => {
    opt.addEventListener('click', () => {
      grid.querySelectorAll('.voice-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      const input = opt.querySelector('input');
      if (input) input.checked = true;
    });
  });
}

function renderModelSelect() {
  const select = /** @type {HTMLSelectElement} */ (document.getElementById('form-model'));
  if (!select) return;
  select.innerHTML = models.map(m => `<option value="${m.id}">${m.name} — ${m.description}</option>`).join('');
}

function renderAgentList() {
  const list = document.getElementById('agent-list');
  if (!list) return;
  if (agents.length === 0) {
    list.innerHTML = `<div class="agent-list-empty"><p>${UI_STRINGS.agentList.empty.title} ...</p></div>`;
    return;
  }

  list.innerHTML = agents.map(agent => `
    <div class="agent-card${agent.id === selectedAgentId ? ' active' : ''}" data-id="${agent.id}">
      <div class="agent-card-header">
        <span class="agent-card-name">${escapeHtml(agent.name)}</span>
        <span class="agent-card-voice">${escapeHtml(agent.voiceName)}</span>
      </div>
      <div class="agent-card-prompt">${escapeHtml(agent.systemPrompt)}</div>
      <div class="agent-card-actions">
        <button class="btn btn-outline btn-sm btn-test-call" data-id="${agent.id}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 ..."/>
          </svg>
          ${UI_STRINGS.agentList.card.testCall}
        </button>
        <button class="btn btn-outline btn-sm btn-edit-agent" data-id="${agent.id}">
          ${UI_STRINGS.common.edit}
        </button>
        <button class="btn btn-danger btn-sm btn-delete-agent" data-id="${agent.id}">
          ${UI_STRINGS.common.delete}
        </button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.agent-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = /** @type {HTMLElement} */ (card).dataset.id;
      if (id) selectAgent(id);
    });
  });

  list.querySelectorAll('.btn-test-call').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = /** @type {HTMLElement} */ (btn).dataset.id;
      if (id) showCallPanel(id);
    });
  });

  list.querySelectorAll('.btn-edit-agent').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = /** @type {HTMLElement} */ (btn).dataset.id;
      if (id) editAgent(id);
    });
  });
  list.querySelectorAll('.btn-delete-agent').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = /** @type {HTMLElement} */ (btn).dataset.id;
      if (id) deleteAgent(id);
    });
  });
}

// ── Callbacks for call.js ──
const callCallbacks = {
  /**
   * @param {string} text 
   * @param {string} className 
   * @returns {void}
   */
  onStatusChange: (text, className) => {
    const el = document.getElementById('call-status');
    if (el) {
      el.textContent = text;
      el.className = `call-status ${className}`;
    }
  },
  /**
   * @param {number} seconds 
   * @returns {void}
   */
  onTimerUpdate: (seconds) => {
    const el = document.getElementById('call-timer');
    if (!el) return;
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    el.textContent = `${mins}:${secs}`;
    el.classList.remove('hidden');
  },
  /**
   * @param {string} role 
   * @param {string} text 
   * @returns {void}
   */
  onTranscript: (role, text) => appendTranscript(role, text),
};

// ── Event Handlers ──
/**
 * @param {string} id 
 * @returns {void}
 */
const selectAgent = (id) => {
  selectedAgentId = id;
  renderAgentList();
  editAgent(id);
};

/** @type {any} */ (window).selectAgent = selectAgent;

/**
 * Sets the value or textContent of a DOM element by ID.
 * @param {string} elId
 * @param {string} value
 * @param {'value' | 'text'} mode
 * @returns {void}
 */
function setFormField(elId, value, mode = 'value') {
  const el = document.getElementById(elId);
  if (!el) return;
  if (mode === 'text') { el.textContent = value; }
  else { /** @type {HTMLInputElement} */ (el).value = value; }
}

/**
 * Populates the agent form fields.
 * @param {{id?: string, name?: string, systemPrompt?: string, voiceName?: string, modelName?: string, title?: string, submitText?: string}} fields
 * @returns {void}
 */
function populateForm(fields) {
  setFormField('form-agent-id', fields.id || '');
  setFormField('form-name', fields.name || '');
  setFormField('form-prompt', fields.systemPrompt || '');
  setFormField('form-title', fields.title || UI_STRINGS.form.createTitle, 'text');
  setFormField('form-submit-text', fields.submitText || UI_STRINGS.common.create, 'text');
  if (fields.modelName) setFormField('form-model', fields.modelName);
  if (fields.voiceName) selectVoiceInGrid(fields.voiceName);
}

/**
 * @returns {void}
 */
const showCreateForm = () => {
  populateForm({});
  showPanel('form');
};

/**
 * @param {string} id 
 * @returns {void}
 */
function editAgent(id) {
  const agent = agents.find(a => a.id === id);
  if (!agent) return;
  populateForm({
    id: agent.id,
    name: agent.name,
    systemPrompt: agent.systemPrompt,
    voiceName: agent.voiceName,
    modelName: agent.modelName,
    title: UI_STRINGS.form.editTitle || 'Edit Agent',
    submitText: UI_STRINGS.common.save || 'Save Changes',
  });
  showPanel('form');
}

/**
 * @returns {{id: string, name: string, systemPrompt: string, voiceName: string, modelName: string} | null}
 */
function getFormData() {
  const idEl = /** @type {HTMLInputElement} */ (document.getElementById('form-agent-id'));
  const nameEl = /** @type {HTMLInputElement} */ (document.getElementById('form-name'));
  const promptEl = /** @type {HTMLTextAreaElement} */ (document.getElementById('form-prompt'));
  const modelEl = /** @type {HTMLSelectElement} */ (document.getElementById('form-model'));
  
  if (!idEl || !nameEl || !promptEl || !modelEl) return null;

  const voiceName = /** @type {HTMLInputElement | null} */ (
    document.querySelector('input[name="voiceName"]:checked')
  )?.value || CONFIG.DEFAULT_VOICE;

  return {
    id: idEl.value,
    name: nameEl.value.trim(),
    systemPrompt: promptEl.value.trim(),
    voiceName,
    modelName: modelEl.value,
  };
}

/**
 * @param {Event} event 
 * @returns {Promise<void>}
 */
async function handleSubmit(event) {
  event.preventDefault();
  const data = getFormData();
  if (!data) return;

  const parseResult = AGENT_FORM_SCHEMA.safeParse(data);
  if (!parseResult.success) {
    showToast(UI_STRINGS.form.validation.requiredFields, 'error');
    return;
  }

  const { id, name, systemPrompt, voiceName, modelName } = parseResult.data;

  try {
    await api(id ? `/agents/${id}` : '/agents', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify({ name, systemPrompt, voiceName, modelName }),
    });
    showToast(id ? UI_STRINGS.toasts.agentUpdated : UI_STRINGS.toasts.agentCreated, 'success');
    await loadAgents();
    showPanel('empty');
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    showToast(errMsg, 'error');
  }
}

/**
 * @param {string} id 
 * @returns {Promise<void>}
 */
async function deleteAgent(id) {
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

/**
 * @param {string} agentId 
 * @returns {void}
 */
function showCallPanel(agentId) {
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
    modelBadge.textContent = model ? model.name : agent.modelName || '';
  }
  const bodyEl = document.getElementById('transcript-body');
  if (bodyEl) bodyEl.innerHTML = '';
  clearDebugLogs();
  showPanel('call');
}

/** @type {any} */ (window).showCallPanel = showCallPanel;

/**
 * @returns {void}
 */
function hideCallPanel() {
  endCall();
  showPanel('empty');
}

/**
 * @returns {void}
 */
function hideForm() {
  showPanel('empty');
}

/**
 * @returns {void}
 */
function toggleMute() {
  const isMuted = callToggleMute();
  const btn = document.getElementById('btn-mute');
  if (btn) btn.classList.toggle('muted', isMuted);
  const iconOff = document.getElementById('mute-icon-off');
  if (iconOff) iconOff.classList.toggle('hidden', isMuted);
  const iconOn = document.getElementById('mute-icon-on');
  if (iconOn) iconOn.classList.toggle('hidden', !isMuted);
}
