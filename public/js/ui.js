/**
 * UI and i18n logic for the frontend.
 */
import { UI_STRINGS } from './constants/uiStrings.js';

/**
 * @returns {void}
 */
export function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (!key) return;
    // @ts-ignore - Indexing UI_STRINGS with dynamic key
    const text = key.split('.').reduce((obj, k) => (obj ? obj[k] : undefined), UI_STRINGS);
    el.textContent = typeof text === 'string' ? text : key;
  });

  document.querySelectorAll('[data-i18n-attr]').forEach(el => {
    const attrMappingString = el.getAttribute('data-i18n-attr');
    if (!attrMappingString) return;
    attrMappingString.split(';').forEach(mapping => {
      const [attr, key] = mapping.split(':');
      if (!attr || !key) return;
      // @ts-ignore - Indexing UI_STRINGS with dynamic key
      const text = key.trim().split('.').reduce((obj, k) => (obj ? obj[k] : undefined), UI_STRINGS);
      if (typeof text === 'string') el.setAttribute(attr.trim(), text);
    });
  });
}

/**
 * @param {string} panel 
 * @returns {void}
 */
export function showPanel(panel) {
  const emptyState = document.getElementById('empty-state');
  const agentFormContainer = document.getElementById('agent-form-container');
  const callPanel = document.getElementById('call-panel');

  if (emptyState) emptyState.classList.add('hidden');
  if (agentFormContainer) agentFormContainer.classList.add('hidden');
  if (callPanel) callPanel.classList.add('hidden');

  switch (panel) {
    case 'empty':
      if (emptyState) emptyState.classList.remove('hidden');
      break;
    case 'form':
      if (agentFormContainer) agentFormContainer.classList.remove('hidden');
      break;
    case 'call':
      if (callPanel) callPanel.classList.remove('hidden');
      break;
  }
}

/**
 * @param {boolean} active 
 * @returns {void}
 */
export function updateCallUI(active) {
  const btnCall = document.getElementById('btn-call');
  const iconStart = document.getElementById('call-icon-start');
  const iconEnd = document.getElementById('call-icon-end');
  if (!btnCall || !iconStart || !iconEnd) return;

  if (active) {
    btnCall.classList.add('active');
    iconStart.classList.add('hidden');
    iconEnd.classList.remove('hidden');
  } else {
    btnCall.classList.remove('active');
    iconStart.classList.remove('hidden');
    iconEnd.classList.add('hidden');
  }
}
/**
 * @param {string[]} voices 
 * @returns {void}
 */
export function updateAgentVoices(voices) {
  const select = document.getElementById('voice-select');
  if (!select) return;
  if (!voices.length) {
    select.innerHTML = `<option>${UI_STRINGS.agentList.empty.title}</option>`;
    return;
  }
  select.innerHTML = voices.map(v => `<option value="${v}">${v}</option>`).join('');
}

/**
 * @returns {string}
 */
export function getSelectedVoice() {
  const select = /** @type {HTMLSelectElement} */ (document.getElementById('voice-select'));
  return select?.value || '';
}

/**
 * @param {string} text 
 * @param {string} [type]
 * @returns {void}
 */
export function setStatus(text, type = '') {
  const textEl = document.getElementById('status-text');
  const dotEl = document.getElementById('status-dot');
  if (textEl) textEl.textContent = text;
  if (dotEl) dotEl.className = `status-dot ${type}`;
}

/**
 * @param {string} time 
 * @returns {void}
 */
export function setTimer(time) {
  const el = document.getElementById('timer');
  if (el) el.textContent = time;
}
