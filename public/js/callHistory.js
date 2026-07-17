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

/** @param {unknown} value @returns {string} */
function formatCurrency(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? `₹${amount.toFixed(2)}` : UI_STRINGS.callHistory.card.notBilled;
}

/** @param {string} existingText @param {string} incomingText @returns {string} */
function mergeTranscriptText(existingText, incomingText) {
  const endsWithWhitespace = /\s$/u.test(existingText);
  const startsWithWhitespace = /^\s/u.test(incomingText);
  const startsWithClosingPunctuation = /^[,.;:!?…)}\]।॥]/u.test(incomingText);
  const endsWithOpeningPunctuation = /[([{“‘]$/u.test(existingText);
  const shouldInsertSpace = !endsWithWhitespace
    && !startsWithWhitespace
    && !startsWithClosingPunctuation
    && !endsWithOpeningPunctuation;
  return shouldInsertSpace ? `${existingText} ${incomingText}` : `${existingText}${incomingText}`;
}

/** Merge adjacent same-speaker chunks from legacy call records. @param {any[]} transcript @returns {any[]} */
function normalizeTranscript(transcript) {
  if (!Array.isArray(transcript)) return [];

  return transcript.reduce((entries, entry) => {
    const text = typeof entry?.text === 'string' ? entry.text : '';
    if (!text.trim()) return entries;

    const role = entry?.role === 'model' ? 'model' : 'user';
    const previous = entries[entries.length - 1];
    if (previous?.role === role) {
      previous.text = mergeTranscriptText(previous.text, text);
    } else {
      entries.push({ role, text });
    }
    return entries;
  }, []);
}

/** @param {any[]} transcript @returns {string} */
function renderTranscriptPreview(transcript) {
  const normalizedTranscript = normalizeTranscript(transcript);
  if (normalizedTranscript.length === 0) return '';
  const preview = normalizedTranscript
    .slice(0, 2)
    .map((entry) => escapeHtml(entry.text))
    .join(' · ');
  return `
    <div class="call-history-preview">
      <span>${UI_STRINGS.callHistory.card.transcriptPreview}</span>
      <p>${preview}</p>
    </div>`;
}

/** @param {any} call @returns {string} */
function renderCallCard(call) {
  const agentName = call.agent?.name || call.agentName || '';
  const recording = call.recordingKey
    ? UI_STRINGS.callHistory.card.hasRecording
    : UI_STRINGS.callHistory.card.noRecording;
  const billedCost = call.billedAt
    ? formatCurrency(call.billedAmount)
    : UI_STRINGS.callHistory.card.notBilled;
  const rate = call.billingRate == null ? '—' : `${formatCurrency(call.billingRate)}/min`;
  const phone = call.phoneNumber || UI_STRINGS.callHistory.card.noPhone;
  const id = escapeHtml(call.id || '');

  return `
    <article class="call-history-card" data-id="${id}">
      <div class="call-history-card-header">
        <div>
          <div class="call-history-title-row">
            <span class="call-history-agent">${escapeHtml(agentName)}</span>
            <span class="telephony-badge ${call.status}">${statusLabel(call.status)}</span>
            <span class="telephony-badge provider">${typeLabel(call.callType)}</span>
          </div>
          <time class="call-history-started">${UI_STRINGS.callHistory.startedAt(call.startedAt)}</time>
        </div>
        <div class="call-history-card-actions">
          <button class="btn btn-outline btn-sm btn-view-call" data-id="${id}" aria-expanded="false">
            ${UI_STRINGS.callHistory.card.view}
          </button>
          <button class="btn btn-danger btn-sm btn-delete-call" data-id="${id}">
            ${UI_STRINGS.callHistory.card.delete}
          </button>
        </div>
      </div>
      <div class="call-history-facts">
        <div>
          <span>${UI_STRINGS.callHistory.fields.duration}</span>
          <strong>${UI_STRINGS.callHistory.duration(call.durationSecs || 0)}</strong>
        </div>
        <div><span>${UI_STRINGS.callHistory.fields.phone}</span><strong>${escapeHtml(phone)}</strong></div>
        <div><span>${UI_STRINGS.callHistory.fields.cost}</span><strong>${billedCost}</strong></div>
        <div><span>${UI_STRINGS.callHistory.fields.rate}</span><strong>${rate}</strong></div>
        <div><span>${UI_STRINGS.callHistory.recordingTitle}</span><strong>${recording}</strong></div>
      </div>
      ${renderTranscriptPreview(call.transcript)}
      <div class="call-history-inline-detail hidden" data-call-detail="${id}"></div>
    </article>`;
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
  const normalizedTranscript = normalizeTranscript(transcript);
  if (normalizedTranscript.length === 0) {
    return `<p class="form-hint">${UI_STRINGS.callHistory.transcriptEmpty}</p>`;
  }
  return normalizedTranscript.map((entry) => {
    const role = entry.role === 'model'
      ? UI_STRINGS.callPanel.roles.agent
      : UI_STRINGS.callPanel.roles.user;
    return `<div class="transcript-line"><strong>${role}:</strong> ${escapeHtml(entry.text)}</div>`;
  }).join('');
}

/** @param {any} call @returns {string} */
function renderRecording(call) {
  if (!call.recordingUrl) {
    return `<p class="form-hint">${UI_STRINGS.callHistory.recordingUnavailable}</p>`;
  }
  // The src is assigned via the DOM (see viewCallDetail) rather than interpolated
  // here, so the already-encoded signed URL is never mangled by HTML escaping.
  return '<audio class="call-recording-audio" controls preload="none"></audio>';
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
      <div>
        <strong>${f.cost}:</strong>
        ${call.billedAt ? formatCurrency(call.billedAmount) : UI_STRINGS.callHistory.card.notBilled}
      </div>
      <div>
        <strong>${f.rate}:</strong>
        ${call.billingRate == null ? '—' : `${formatCurrency(call.billingRate)}/min`}
      </div>
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

/** @param {string} id @returns {any} */
function getDetailContext(id) {
  const card = Array.from(document.querySelectorAll('.call-history-card'))
    .find((item) => /** @type {HTMLElement} */ (item).dataset.id === id);
  const inlineDetail = card?.querySelector('.call-history-inline-detail');
  return {
    inlineDetail,
    detail: inlineDetail || document.getElementById('call-history-detail'),
    detailSection: document.getElementById('call-history-detail-section'),
    button: card?.querySelector('.btn-view-call'),
  };
}

/** @param {Element|null|undefined} element @param {boolean} visible */
function setElementVisible(element, visible) {
  if (!element) return;
  element.classList.toggle('hidden', !visible);
}

/** @param {Element|null|undefined} button @param {boolean} expanded */
function setDetailButtonState(button, expanded) {
  if (!button) return;
  button.setAttribute('aria-expanded', String(expanded));
  button.textContent = expanded
    ? UI_STRINGS.callHistory.card.hide
    : UI_STRINGS.callHistory.card.view;
}

/** @param {Element|null|undefined} inlineDetail @param {Element|null|undefined} button */
function collapseInlineDetail(inlineDetail, button) {
  if (!inlineDetail || inlineDetail.classList.contains('hidden')) return false;
  setElementVisible(inlineDetail, false);
  setDetailButtonState(button, false);
  return true;
}

/** @param {Element} detail @param {any} call */
function renderLoadedDetail(detail, call) {
  detail.innerHTML = renderDetail(call);
  const audioEl = /** @type {HTMLAudioElement|null} */ (detail.querySelector('.call-recording-audio'));
  if (audioEl && call.recordingUrl) audioEl.src = call.recordingUrl;
}

/**
 * Fetch and display the detail of a single call.
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function viewCallDetail(id) {
  const context = getDetailContext(id);
  if (!context.detail || collapseInlineDetail(context.inlineDetail, context.button)) return;

  context.detail.innerHTML = `<p class="form-hint">${UI_STRINGS.callHistory.card.loading}</p>`;
  setElementVisible(context.inlineDetail, true);
  try {
    const call = await api(`/call-history/${id}`);
    renderLoadedDetail(context.detail, call);
    setElementVisible(context.inlineDetail, true);
    setElementVisible(context.detailSection, true);
    setDetailButtonState(context.button, true);
  } catch (_err) {
    setElementVisible(context.inlineDetail, false);
    context.detail.innerHTML = '';
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
