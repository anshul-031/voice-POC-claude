/**
 * API helper functions for the frontend.
 */
import { CONFIG } from './constants/config.js';
import { UI_STRINGS } from './constants/uiStrings.js';

/**
 * @param {string} path 
 * @param {RequestInit} options 
 * @returns {Promise<any>}
 */
export async function api(path, options = {}) {
  const res = await fetch(`${CONFIG.API_PREFIX}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: UI_STRINGS.api.errors.genericRequestFailed }));
    throw new Error(err.error || UI_STRINGS.api.errors.genericRequestFailed);
  }
  return res.json();
}

/**
 * @returns {Promise<void>}
 */
export async function checkApiHealth() {
  const dot = document.getElementById('api-status');
  const text = document.getElementById('api-status-text');
  if (!dot || !text) return;
  
  try {
    await api('/health');
    dot.className = 'status-dot connected';
    text.textContent = UI_STRINGS.header.apiStatus.connected;
  } catch {
    dot.className = 'status-dot error';
    text.textContent = UI_STRINGS.header.apiStatus.disconnected;
  }
}
