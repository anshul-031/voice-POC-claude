/**
 * Integrations panel logic for the dashboard.
 *
 * Manages the Sales Analyser connection (account-level credentials used to send
 * completed call recordings for analysis). Talks to /api/integration/sales-analyser.
 */
import { UI_STRINGS } from './constants/uiStrings.js';
import { api } from './api.js';
import { showToast } from './utils.js';

/** @param {string} id @returns {HTMLElement | null} */
function el(id) {
  return document.getElementById(id);
}

/** @param {string} id @returns {string} */
function getVal(id) {
  const node = /** @type {HTMLInputElement | null} */ (document.getElementById(id));
  return node ? node.value.trim() : '';
}

/** @param {string} id @param {string} value */
function setVal(id, value) {
  const node = /** @type {HTMLInputElement | null} */ (document.getElementById(id));
  if (node) node.value = value;
}

/**
 * Reflect the current connection status in the UI.
 * @param {{ available?: boolean, connected?: boolean, email?: string | null }} status
 * @returns {void}
 */
function renderStatus(status) {
  const strings = UI_STRINGS.integrations.salesAnalyser;
  const badge = el('integration-status');
  const disconnectBtn = el('btn-disconnect-integration');
  const unavailable = el('integration-unavailable');

  if (badge) {
    const connected = !!status.connected;
    badge.textContent = connected && status.email
      ? strings.connected(status.email)
      : strings.notConnected;
    badge.className = `telephony-badge ${connected ? 'active' : 'inactive'}`;
  }

  if (disconnectBtn) {
    disconnectBtn.classList.toggle('hidden', !status.connected);
  }

  if (unavailable) {
    unavailable.classList.toggle('hidden', status.available !== false);
  }

  setVal('integration-email', status.email || '');
  setVal('integration-password', '');
}

/**
 * Load the current Sales Analyser connection status.
 * @returns {Promise<void>}
 */
export async function loadIntegrationStatus() {
  try {
    const status = await api('/integration/sales-analyser');
    renderStatus(status);
  } catch (_err) {
    showToast(UI_STRINGS.toasts.integrationLoadFailed, 'error');
    renderStatus({ available: true, connected: false, email: null });
  }
}

/**
 * Handle the save/connect form submission.
 * @param {Event} event
 * @returns {Promise<void>}
 */
export async function handleIntegrationSubmit(event) {
  event.preventDefault();
  const email = getVal('integration-email');
  const password = getVal('integration-password');
  if (!email || !password) {
    showToast(UI_STRINGS.toasts.integrationSaveFailed, 'error');
    return;
  }

  try {
    const status = await api('/integration/sales-analyser', {
      method: 'PUT',
      body: JSON.stringify({ email, password }),
    });
    showToast(UI_STRINGS.toasts.integrationSaved, 'success');
    renderStatus({ available: true, connected: true, email: status.email || email });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    showToast(errMsg || UI_STRINGS.toasts.integrationSaveFailed, 'error');
  }
}

/**
 * Disconnect the Sales Analyser integration.
 * @returns {Promise<void>}
 */
export async function handleIntegrationDisconnect() {
  if (!confirm(UI_STRINGS.common.confirmDelete)) return;
  try {
    await api('/integration/sales-analyser', { method: 'DELETE' });
    showToast(UI_STRINGS.toasts.integrationCleared, 'success');
    renderStatus({ available: true, connected: false, email: null });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    showToast(errMsg, 'error');
  }
}

/**
 * Initialize the integrations panel events.
 * @returns {void}
 */
export function initIntegrationsPanel() {
  el('integration-form')?.addEventListener('submit', handleIntegrationSubmit);
  el('btn-disconnect-integration')?.addEventListener('click', handleIntegrationDisconnect);
}
