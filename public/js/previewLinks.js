/**
 * Public preview URL helpers for dashboard agents.
 */
import { CONFIG } from './constants/config.js';
import { UI_STRINGS } from './constants/uiStrings.js';
import { showToast } from './utils.js';
import { api } from './api.js';

/**
 * @param {string} agentId
 * @returns {string}
 */
export function buildPreviewUrl(agentId) {
  return `${window.location.origin}${CONFIG.PREVIEW_PATH}/${encodeURIComponent(agentId)}`;
}

/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function copyPreviewUrl(id) {
  const url = buildPreviewUrl(id);
  try {
    await navigator.clipboard.writeText(url);
    showToast(UI_STRINGS.toasts.previewUrlCopied, 'success');
  } catch {
    showToast(url, 'info');
  }
}

/**
 * @param {string} id
 * @param {boolean} enabled
 * @returns {Promise<void>}
 */
export async function togglePublicPreview(id, enabled) {
  try {
    await api(`/agents/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ publicPreviewEnabled: enabled }),
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    showToast(errMsg, 'error');
    throw err;
  }
}
