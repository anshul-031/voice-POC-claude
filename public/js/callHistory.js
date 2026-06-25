/**
 * Call History panel logic for the dashboard.
 *
 * Lists every call (preview, test, telephony) for the authenticated user and
 * lets them open a detail view with the recording player and transcript.
 */
import { UI_STRINGS } from './constants/uiStrings.js';
import { api } from './api.js';
import { showToast, escapeHtml } from './utils.js';

/** @type {any[]} */
let calls = [];

/**
 * Load all call history records from the API.
 * @returns {Promise<void>}
 */
export async function loadCallHistory() {
  try {
    calls = await api('/call-history');
    renderCallHistoryList();
  } catch (_err) {
    showToast(UI_STRINGS.toasts.callHistoryLoadFailed, 'error');
    calls = [];
    renderCallHistoryList();
  }
}

/** @param {string} value @returns {string} */
function typeLabel(value) {
  const map = /** @type {any} */ (UI_STRINGS.callHistory.types);
  return map[value] || value;
}

/** @param {string} value @returns {string} */
function statusLabel(value) {
  const map = /** @type {any} */ (UI_STRINGS.callHistory.statuses);
  return map[value] || value;
}

/** @param {any} call @returns {string} */
function renderCallCard(call) {
  const agentName = call.agent?.name || call.agentName || '';
  const recording = call.recordingKey
    ? UI_STRINGS.callHistory.card.hasRecording
    : UI_STRINGS.callHistory.card.noRecording;
  return `
    <div class="campaign-card telephony-card" data-id="${call.id}">
      <div class="telephony-card-header">
        <div class="telephony-card-title">
          <span class="telephony-card-name">${escapeHtml(agentName)}</span>
          <span class="telephony-badge ${call.status}">${statusLabel(call.status)}</span>
        </div>
      </div>
      <div class="telephony-card-meta">
        <span class="telephony-badge provider">${typeLabel(call.callType)}</span>
        <span class="campaign-contact-count">${UI_STRINGS.callHistory.duration(call.durationSecs || 0)}</span>
        <span class="campaign-contact-count">${recording}</span>
        <span class="campaign-contact-count">${UI_STRINGS.callHistory.startedAt(call.startedAt)}</span>
      </div>
      <div class="telephony-card-actions">
        <button class="btn btn-primary btn-sm btn-view-call" data-id="${call.id}">
          ${UI_STRINGS.callHistory.card.view}
        </button>
        <button class="btn btn-danger btn-sm btn-delete-call" data-id="${call.id}">
          ${UI_STRINGS.callHistory.card.delete}
        </button>
      </div>
    </div>`;
}

/**
 * Render the call history cards list.
 * @returns {void}
 */
export function renderCallHistoryList() {
  const list = document.getElementById('call-history-list');
  if (!list) return;

  if (calls.length === 0) {
    list.innerHTML = `
      <div class="telephony-empty">
        <h3>${UI_STRINGS.callHistory.emptyTitle}</h3>
        <p>${UI_STRINGS.callHistory.emptyDescription}</p>
      </div>`;
    return;
  }

  list.innerHTML = calls.map(renderCallCard).join('');

  list.querySelectorAll('.btn-view-call').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = /** @type {HTMLElement} */ (btn).dataset.id;
      if (id) viewCallDetail(id);
    });
  });
  list.querySelectorAll('.btn-delete-call').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = /** @type {HTMLElement} */ (btn).dataset.id;
      if (id) deleteCallRecord(id);
    });
  });
}

/** @param {any[]} transcript @returns {string} */
function renderTranscript(transcript) {
  if (!Array.isArray(transcript) || transcript.length === 0) {
    return `<p class="form-hint">${UI_STRINGS.callHistory.transcriptEmpty}</p>`;
  }
  return transcript.map((entry) => {
    const role = entry?.role === 'model'
      ? UI_STRINGS.callPanel.roles.agent
      : UI_STRINGS.callPanel.roles.user;
    return `<div class="transcript-line"><strong>${role}:</strong> ${escapeHtml(entry?.text || '')}</div>`;
  }).join('');
}

/** @param {any} call @returns {string} */
function renderRecording(call) {
  if (!call.recordingUrl) {
    return `<p class="form-hint">${UI_STRINGS.callHistory.recordingUnavailable}</p>`;
  }
  // The src is assigned via the DOM (see viewCallDetail) rather than interpolated
  // here, so the already-encoded signed URL is never mangled by HTML escaping.
  return '<audio id="call-recording-audio" controls preload="none"></audio>';
}

/** @param {any} call @returns {string} */
function renderDetail(call) {
  const f = UI_STRINGS.callHistory.fields;
  const agentName = call.agent?.name || call.agentName || '';
  return `
    <div class="call-detail-meta">
      <div><strong>${f.agent}:</strong> ${escapeHtml(agentName)}</div>
      <div><strong>${f.type}:</strong> ${typeLabel(call.callType)}</div>
      <div><strong>${f.status}:</strong> ${statusLabel(call.status)}</div>
      <div><strong>${f.duration}:</strong> ${UI_STRINGS.callHistory.duration(call.durationSecs || 0)}</div>
      <div><strong>${f.started}:</strong> ${UI_STRINGS.callHistory.startedAt(call.startedAt)}</div>
      ${call.phoneNumber ? `<div><strong>${f.phone}:</strong> ${escapeHtml(call.phoneNumber)}</div>` : ''}
    </div>
    <div class="call-detail-section">
      <h3>${UI_STRINGS.callHistory.recordingTitle}</h3>
      ${renderRecording(call)}
    </div>
    <div class="call-detail-section">
      <h3>${UI_STRINGS.callHistory.transcriptTitle}</h3>
      ${renderTranscript(call.transcript)}
    </div>`;
}

/** Show the list view and hide the detail view. @returns {void} */
function showListView() {
  document.getElementById('call-history-list-section')?.classList.remove('hidden');
  document.getElementById('call-history-detail-section')?.classList.add('hidden');
}

/**
 * Fetch and display the detail of a single call.
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function viewCallDetail(id) {
  try {
    const call = await api(`/call-history/${id}`);
    const detail = document.getElementById('call-history-detail');
    const listSection = document.getElementById('call-history-list-section');
    const detailSection = document.getElementById('call-history-detail-section');
    if (!detail || !listSection || !detailSection) return;

    detail.innerHTML = renderDetail(call);
    const audioEl = /** @type {HTMLAudioElement|null} */ (document.getElementById('call-recording-audio'));
    if (audioEl && call.recordingUrl) {
      audioEl.src = call.recordingUrl;
    }
    listSection.classList.add('hidden');
    detailSection.classList.remove('hidden');
  } catch (_err) {
    showToast(UI_STRINGS.toasts.callHistoryDetailFailed, 'error');
  }
}

/**
 * Delete a call record.
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteCallRecord(id) {
  if (!confirm(UI_STRINGS.common.confirmDelete)) return;
  try {
    await api(`/call-history/${id}`, { method: 'DELETE' });
    showToast(UI_STRINGS.toasts.callHistoryDeleted, 'success');
    await loadCallHistory();
  } catch (err) {
    showToast(err instanceof Error ? err.message : UI_STRINGS.toasts.callHistoryDeleteFailed, 'error');
  }
}

/**
 * Initialize the call history panel event listeners.
 * @returns {void}
 */
export function initCallHistoryPanel() {
  document.getElementById('btn-refresh-call-history')
    ?.addEventListener('click', () => loadCallHistory());
  document.getElementById('btn-back-call-history')
    ?.addEventListener('click', showListView);
}

/**
 * Reset module state (for testing).
 * @returns {void}
 * @internal
 */
export function resetCallHistoryState() {
  calls = [];
}
