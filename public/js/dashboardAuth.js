import { CONFIG } from './constants/config.js';
import { renderWalletSummary } from './wallet.js';

/**
 * Authenticate the dashboard, render account data, then initialize the app.
 * @param {() => void} onAuthenticated
 */
export async function authenticateDashboard(onAuthenticated) {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (!res.ok) {
      window.location.href = CONFIG.PAGE_PATHS.LOGIN;
      return;
    }
    const data = await res.json();
    const menu = document.getElementById('user-menu');
    if (menu) menu.style.display = 'flex';
    const nameEl = document.getElementById('user-name');
    if (nameEl && data.user) nameEl.textContent = data.user.name;
    renderWalletSummary(data.user);
    onAuthenticated();
  } catch (_error) {
    window.location.href = CONFIG.PAGE_PATHS.LOGIN;
  }
}

/** End the authenticated browser session and return to login. */
export async function logoutDashboard() {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  } catch (_error) { /* Logout remains local when the request fails. */ }
  window.location.href = CONFIG.PAGE_PATHS.LOGIN;
}
