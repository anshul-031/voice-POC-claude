/**
 * Telephony panel logic for the dashboard.
 */
import { UI_STRINGS } from './constants/uiStrings.js';
import { CONFIG } from './constants/config.js';
import { TELEPHONY_CONCURRENCY_SCHEMA } from './constants/inputSchemas.js';
import { api } from './api.js';
import { showToast, escapeHtml } from './utils.js';

/** @type {any[]} */
let providers = [];
/** @type {string | null} */
let editingProviderId = null;

/**
 * Load all telephony providers from the API.
 * @returns {Promise<void>}
 */
export async function loadTelephonyProviders() {
  try {
    providers = await api('/telephony');
    renderProviderList();
  } catch (_err) {
    showToast(
      UI_STRINGS.toasts.telephonyLoadFailed,
      'error',
    );
    providers = [];
    renderProviderList();
  }
}

/**
 * Render the list of telephony provider cards.
 * @returns {void}
 */
function renderProviderList() {
  const list = document.getElementById('telephony-provider-list');
  if (!list) return;

  if (providers.length === 0) {
    list.innerHTML = `
      <div class="telephony-empty">
        <div class="telephony-empty-icon">
          <svg width="48" height="48" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="1"
            stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2
              19.79 19.79 0 0 1-8.63-3.07
              19.5 19.5 0 0 1-6-6
              19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72
              12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27
              a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
        </div>
        <h3>${UI_STRINGS.telephony.emptyTitle}</h3>
        <p>${UI_STRINGS.telephony.emptyDescription}</p>
      </div>`;
    return;
  }

  list.innerHTML = providers.map((p) => {
    const providersMap = /** @type {any} */ (UI_STRINGS.telephony.providers);
    const directionsMap = /** @type {any} */ (UI_STRINGS.telephony.directions);
    const providerLabel = providersMap[p.provider] || p.provider;
    const dirLabel = directionsMap[p.direction] || p.direction;
    const statusClass = p.isActive ? 'active' : 'inactive';
    const statusLabel = p.isActive
      ? UI_STRINGS.telephony.card.active
      : UI_STRINGS.telephony.card.inactive;

    return `
      <div class="telephony-card" data-id="${p.id}">
        <div class="telephony-card-header">
          <div class="telephony-card-title">
            <span class="telephony-card-name">${escapeHtml(p.name)}</span>
            <span class="telephony-badge provider">${providerLabel}</span>
          </div>
          <span class="telephony-badge ${statusClass}">${statusLabel}</span>
        </div>
        <div class="telephony-card-meta">
          <span class="telephony-badge direction">${dirLabel}</span>
          ${p.phoneNumber ? `<span class="telephony-phone">${escapeHtml(p.phoneNumber)}</span>` : ''}
          ${p.sipServer ? `<span class="telephony-sip">${escapeHtml(p.sipServer)}</span>` : ''}
          <span class="telephony-concurrency">${UI_STRINGS.telephony.card.concurrency(
            p.concurrencyLimit || CONFIG.DEFAULT_CALL_CONCURRENCY,
          )}</span>
        </div>
        <div class="telephony-card-actions">
          <button class="btn btn-outline btn-sm btn-edit-provider" data-id="${p.id}">
            ${UI_STRINGS.telephony.card.edit}
          </button>
          <button class="btn btn-danger btn-sm btn-delete-provider" data-id="${p.id}">
            ${UI_STRINGS.telephony.card.delete}
          </button>
        </div>
      </div>`;
  }).join('');

  // Attach event listeners
  list.querySelectorAll('.btn-edit-provider').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = /** @type {HTMLElement} */ (btn).dataset.id;
      if (id) showEditProviderForm(id);
    });
  });

  list.querySelectorAll('.btn-delete-provider').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = /** @type {HTMLElement} */ (btn).dataset.id;
      if (id) deleteProvider(id);
    });
  });
}

/**
 * Show the add/edit provider form.
 * @param {string | null} [providerId]
 * @returns {void}
 */
export function showAddProviderForm(providerId = null) {
  editingProviderId = providerId;
  const form = document.getElementById('telephony-form-container');
  const listSection = document.getElementById('telephony-list-section');
  if (!form || !listSection) return;

  listSection.classList.add('hidden');
  form.classList.remove('hidden');

  const titleEl = document.getElementById('telephony-form-title');
  const submitEl = document.getElementById('telephony-form-submit-text');

  if (providerId) {
    const provider = providers.find((p) => p.id === providerId);
    if (!provider) return;
    if (titleEl) titleEl.textContent = UI_STRINGS.telephony.editProvider;
    if (submitEl) submitEl.textContent = UI_STRINGS.telephony.form.updateBtn;
    populateTelephonyForm(provider);
  } else {
    if (titleEl) titleEl.textContent = UI_STRINGS.telephony.addProvider;
    if (submitEl) submitEl.textContent = UI_STRINGS.telephony.form.saveBtn;
    resetTelephonyForm();
  }
}

/**
 * @param {string} providerId
 * @returns {void}
 */
function showEditProviderForm(providerId) {
  showAddProviderForm(providerId);
}

/**
 * Populate the telephony form with provider data.
 * @param {any} provider
 * @returns {void}
 */
function populateTelephonyForm(provider) {
  setVal('tel-name', provider.name || '');
  setVal('tel-provider', provider.provider || 'vobiz');
  setVal('tel-direction', provider.direction || 'outbound');
  setVal('tel-phone', provider.phoneNumber || '');
  setVal('tel-concurrency', String(provider.concurrencyLimit || CONFIG.DEFAULT_CALL_CONCURRENCY));
  setVal('tel-sip-server', provider.sipServer || '');
  setVal('tel-sip-username', provider.sipUsername || '');
  setVal('tel-sip-password', '');
  setChk('tel-active', provider.isActive !== false);
  updateProviderFields();
}

/**
 * Reset telephony form to defaults.
 * @returns {void}
 */
function resetTelephonyForm() {
  setVal('tel-name', '');
  setVal('tel-provider', 'vobiz');
  setVal('tel-direction', 'outbound');
  setVal('tel-phone', '');
  setVal('tel-concurrency', String(CONFIG.DEFAULT_CALL_CONCURRENCY));
  setVal('tel-sip-server', '');
  setVal('tel-sip-username', '');
  setVal('tel-sip-password', '');
  setChk('tel-active', true);
  updateProviderFields();
}

/** @param {string} id @param {string} val */
function setVal(id, val) {
  const el = /** @type {HTMLInputElement|HTMLSelectElement|null} */ (
    document.getElementById(id)
  );
  if (el) el.value = val;
}

/** @param {string} id @param {boolean} checked */
function setChk(id, checked) {
  const el = /** @type {HTMLInputElement|null} */ (
    document.getElementById(id)
  );
  if (el) el.checked = checked;
}

/**
 * Show/hide provider-specific credential fields
 * based on the selected provider.
 * @returns {void}
 */
export function updateProviderFields() {
  const providerSelect = /** @type {HTMLSelectElement|null} */ (
    document.getElementById('tel-provider')
  );
  if (!providerSelect) return;

  const provider = providerSelect.value;
  const sipFields = document.getElementById('tel-sip-fields');
  const apiFields = document.getElementById('tel-api-fields');

  if (sipFields) {
    sipFields.classList.toggle(
      'hidden',
      provider !== 'vobiz',
    );
  }
  if (apiFields) {
    apiFields.classList.toggle(
      'hidden',
      provider === 'vobiz',
    );
  }
}

/**
 * Build request body from form values.
 * @returns {Record<string, unknown>}
 */
function buildProviderBody() {
  const name = getVal('tel-name');
  const provider = getVal('tel-provider');
  const direction = getVal('tel-direction');
  const phoneNumber = getVal('tel-phone') || undefined;
  const sipServer = getVal('tel-sip-server') || undefined;
  const sipUsername = getVal('tel-sip-username') || undefined;
  const sipPassword = getVal('tel-sip-password') || undefined;
  const isActive = getChk('tel-active');

  return {
    name,
    provider,
    direction,
    isActive,
    concurrencyLimit: readConcurrencyLimit(),
    ...(phoneNumber && { phoneNumber }),
    ...(sipServer && { sipServer }),
    ...(sipUsername && { sipUsername }),
    ...(sipPassword && { sipPassword }),
  };
}

/**
 * Read the concurrency field as a validated integer. The server rejects the
 * whole request on an out-of-range value, so an unusable entry falls back to
 * the default rather than losing the rest of the form.
 * @returns {number}
 */
function readConcurrencyLimit() {
  const parsed = TELEPHONY_CONCURRENCY_SCHEMA.safeParse(Number(getVal('tel-concurrency')));
  return parsed.success ? parsed.data : CONFIG.DEFAULT_CALL_CONCURRENCY;
}

/**
 * Handle telephony form submit.
 * @param {Event} event
 * @returns {Promise<void>}
 */
export async function handleTelephonySubmit(event) {
  event.preventDefault();

  const body = buildProviderBody();

  if (!body.name || !body.provider) {
    showToast('Provider name is required', 'error');
    return;
  }

  try {
    if (editingProviderId) {
      await api(`/telephony/${editingProviderId}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      showToast(UI_STRINGS.toasts.telephonyUpdated, 'success');
    } else {
      await api('/telephony', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      showToast(UI_STRINGS.toasts.telephonyCreated, 'success');
    }
    hideTelephonyForm();
    await loadTelephonyProviders();
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    showToast(errMsg, 'error');
  }
}

/**
 * @param {string} id
 * @returns {Promise<void>}
 */
async function deleteProvider(id) {
  if (!confirm(UI_STRINGS.common.confirmDelete)) return;
  try {
    await api(`/telephony/${id}`, { method: 'DELETE' });
    showToast(UI_STRINGS.toasts.telephonyDeleted, 'success');
    await loadTelephonyProviders();
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    showToast(errMsg, 'error');
  }
}

/**
 * Hide the form and show the list.
 * @returns {void}
 */
export function hideTelephonyForm() {
  const form = document.getElementById('telephony-form-container');
  const listSection = document.getElementById('telephony-list-section');
  if (form) form.classList.add('hidden');
  if (listSection) listSection.classList.remove('hidden');
  editingProviderId = null;
}

/** @param {string} id @returns {string} */
function getVal(id) {
  const el = /** @type {HTMLInputElement|HTMLSelectElement|null} */ (
    document.getElementById(id)
  );
  return el ? el.value.trim() : '';
}

/** @param {string} id @returns {boolean} */
function getChk(id) {
  const el = /** @type {HTMLInputElement|null} */ (
    document.getElementById(id)
  );
  return !!el?.checked;
}

/**
 * Initialize telephony panel events.
 * @returns {void}
 */
export function initTelephonyPanel() {
  document.getElementById('btn-add-provider')
    ?.addEventListener('click', () => showAddProviderForm());

  document.getElementById('telephony-form')
    ?.addEventListener('submit', handleTelephonySubmit);

  document.getElementById('btn-cancel-telephony')
    ?.addEventListener('click', hideTelephonyForm);

  document.getElementById('tel-provider')
    ?.addEventListener('change', updateProviderFields);
}
