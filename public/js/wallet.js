import { UI_STRINGS } from './constants/uiStrings.js';
import { showToast } from './utils.js';

/** @param {any} user Render wallet balance and rate from the authenticated account payload. */
export function renderWalletSummary(user) {
  const summary = document.getElementById('wallet-summary');
  const balanceEl = document.getElementById('wallet-balance');
  const rateEl = document.getElementById('wallet-rate');
  if (!summary || !balanceEl || !rateEl) return;

  const balance = Number(user?.walletBalance);
  const rate = Number(user?.costPerMinute);
  balanceEl.textContent = Number.isFinite(balance)
    ? UI_STRINGS.header.wallet.balance(balance)
    : UI_STRINGS.header.wallet.unavailable;
  rateEl.textContent = Number.isFinite(rate) ? UI_STRINGS.header.wallet.rate(rate) : '';
  summary.classList.remove('hidden');
}

/** Refresh the visible wallet without re-initializing the dashboard. */
export async function refreshWalletSummary() {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (!res.ok) throw new Error(UI_STRINGS.toasts.walletLoadFailed);
    const data = await res.json();
    renderWalletSummary(data.user);
  } catch (_error) {
    showToast(UI_STRINGS.toasts.walletLoadFailed, 'error');
  }
}

/** Wire the wallet pill as an explicit refresh control. */
export function initWalletSummary() {
  document.getElementById('wallet-summary')?.addEventListener('click', refreshWalletSummary);
}
