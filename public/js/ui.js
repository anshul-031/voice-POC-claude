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
    const text = key.split('.').reduce((obj, k) => obj[k], UI_STRINGS);
    if (typeof text === 'string') el.textContent = text;
  });

  document.querySelectorAll('[data-i18n-attr]').forEach(el => {
    const attrMapping = el.getAttribute('data-i18n-attr');
    if (!attrMapping) return;
    const [attr, key] = attrMapping.split(':');
    if (!attr || !key) return;
    // @ts-ignore - Indexing UI_STRINGS with dynamic key
    const text = key.split('.').reduce((obj, k) => obj[k], UI_STRINGS);
    if (typeof text === 'string') el.setAttribute(attr, text);
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
