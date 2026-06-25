/**
 * Campaign panel logic for the dashboard.
 *
 * A campaign attaches a voice agent + telephony provider to a list of contacts
 * uploaded via spreadsheet. Each spreadsheet column (other than the phone number)
 * becomes a prompt variable substituted at call time.
 */
import { UI_STRINGS } from './constants/uiStrings.js';
import { CONFIG } from './constants/config.js';
import { api } from './api.js';
import { showToast, escapeHtml } from './utils.js';
import { CAMPAIGN_FORM_SCHEMA } from './constants/inputSchemas.js';

/** @type {any[]} */
let campaigns = [];
/** @type {string | null} */
let editingCampaignId = null;
let selectedFileBase64 = '';
let selectedFileName = '';

/**
 * Load all campaigns from the API.
 * @returns {Promise<void>}
 */
export async function loadCampaigns() {
  try {
    campaigns = await api('/campaigns');
    renderCampaignList();
  } catch (_err) {
    showToast(UI_STRINGS.toasts.campaignLoadFailed, 'error');
    campaigns = [];
    renderCampaignList();
  }
}

/**
 * @param {string} status
 * @returns {string}
 */
function statusLabel(status) {
  const map = /** @type {any} */ (UI_STRINGS.campaigns.status);
  return map[status] || status;
}

/**
 * Render the campaign cards list.
 * @returns {void}
 */
function renderCampaignList() {
  const list = document.getElementById('campaign-list');
  if (!list) return;

  if (campaigns.length === 0) {
    list.innerHTML = `
      <div class="telephony-empty">
        <h3>${UI_STRINGS.campaigns.emptyTitle}</h3>
        <p>${UI_STRINGS.campaigns.emptyDescription}</p>
      </div>`;
    return;
  }

  list.innerHTML = campaigns.map((c) => {
    const contactCount = c._count?.contacts ?? 0;
    const agentName = c.agent?.name || '';
    return `
      <div class="campaign-card telephony-card" data-id="${c.id}">
        <div class="telephony-card-header">
          <div class="telephony-card-title">
            <span class="telephony-card-name">${escapeHtml(c.name)}</span>
            <span class="telephony-badge ${c.status}">${statusLabel(c.status)}</span>
          </div>
        </div>
        <div class="telephony-card-meta">
          <span class="telephony-badge provider">${escapeHtml(agentName)}</span>
          <span class="campaign-contact-count">${UI_STRINGS.campaigns.card.contacts(contactCount)}</span>
        </div>
        <div class="telephony-card-actions">
          <button class="btn btn-primary btn-sm btn-trigger-campaign" data-id="${c.id}">
            ${UI_STRINGS.campaigns.card.trigger}
          </button>
          <button class="btn btn-outline btn-sm btn-edit-campaign" data-id="${c.id}">
            ${UI_STRINGS.campaigns.card.edit}
          </button>
          <button class="btn btn-danger btn-sm btn-delete-campaign" data-id="${c.id}">
            ${UI_STRINGS.campaigns.card.delete}
          </button>
        </div>
      </div>`;
  }).join('');

  list.querySelectorAll('.btn-trigger-campaign').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = /** @type {HTMLElement} */ (btn).dataset.id;
      if (id) triggerCampaign(id);
    });
  });
  list.querySelectorAll('.btn-edit-campaign').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = /** @type {HTMLElement} */ (btn).dataset.id;
      if (id) showAddCampaignForm(id);
    });
  });
  list.querySelectorAll('.btn-delete-campaign').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = /** @type {HTMLElement} */ (btn).dataset.id;
      if (id) deleteCampaign(id);
    });
  });
}

/**
 * Populate the agent and provider select dropdowns.
 * @returns {Promise<void>}
 */
async function loadFormOptions() {
  const agentSelect = /** @type {HTMLSelectElement|null} */ (document.getElementById('campaign-agent'));
  const providerSelect = /** @type {HTMLSelectElement|null} */ (document.getElementById('campaign-provider'));

  try {
    const [agents, providers] = await Promise.all([api('/agents'), api('/telephony')]);

    if (agentSelect) {
      const placeholder = `<option value="">${UI_STRINGS.campaigns.form.agentPlaceholder}</option>`;
      agentSelect.innerHTML = placeholder + agents.map(
        (/** @type {any} */ a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`,
      ).join('');
    }
    if (providerSelect) {
      const none = `<option value="">${UI_STRINGS.campaigns.form.providerNone}</option>`;
      providerSelect.innerHTML = none + providers.map(
        (/** @type {any} */ p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`,
      ).join('');
    }
  } catch (_err) {
    showToast(UI_STRINGS.toasts.campaignLoadFailed, 'error');
  }
}

/**
 * Apply edit-mode state to the campaign form.
 * @param {any} campaign
 * @returns {void}
 */
function applyEditFormState(campaign) {
  const titleEl = document.getElementById('campaign-form-title');
  const submitEl = document.getElementById('campaign-form-submit-text');
  const fileGroup = document.getElementById('campaign-file-group');
  if (titleEl) titleEl.textContent = UI_STRINGS.campaigns.editTitle;
  if (submitEl) submitEl.textContent = UI_STRINGS.campaigns.form.updateBtn;
  if (fileGroup) fileGroup.classList.add('hidden');
  if (campaign) {
    setVal('campaign-name', campaign.name || '');
    setVal('campaign-agent', campaign.agentId || '');
    setVal('campaign-provider', campaign.providerId || '');
  }
}

/**
 * Apply create-mode (blank) state to the campaign form.
 * @returns {void}
 */
function applyCreateFormState() {
  const titleEl = document.getElementById('campaign-form-title');
  const submitEl = document.getElementById('campaign-form-submit-text');
  const fileGroup = document.getElementById('campaign-file-group');
  if (titleEl) titleEl.textContent = UI_STRINGS.campaigns.addTitle;
  if (submitEl) submitEl.textContent = UI_STRINGS.campaigns.form.saveBtn;
  if (fileGroup) fileGroup.classList.remove('hidden');
  setVal('campaign-name', '');
  setVal('campaign-agent', '');
  setVal('campaign-provider', '');
  const fileInput = /** @type {HTMLInputElement|null} */ (document.getElementById('campaign-file'));
  if (fileInput) fileInput.value = '';
}

/**
 * Show the add/edit campaign form.
 * @param {string | null} [campaignId]
 * @returns {Promise<void>}
 */
export async function showAddCampaignForm(campaignId = null) {
  editingCampaignId = campaignId;
  selectedFileBase64 = '';
  selectedFileName = '';

  const form = document.getElementById('campaign-form-container');
  const listSection = document.getElementById('campaign-list-section');
  if (!form || !listSection) return;

  listSection.classList.add('hidden');
  form.classList.remove('hidden');

  await loadFormOptions();

  if (campaignId) {
    applyEditFormState(campaigns.find((c) => c.id === campaignId));
  } else {
    applyCreateFormState();
  }
}

/**
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Read the chosen spreadsheet file into a base64 string.
 * @param {Event} event
 * @returns {Promise<void>}
 */
export async function handleFileChange(event) {
  const input = /** @type {HTMLInputElement} */ (event.target);
  const file = input.files?.[0];
  if (!file) {
    selectedFileBase64 = '';
    selectedFileName = '';
    return;
  }
  selectedFileName = file.name;
  const buffer = await file.arrayBuffer();
  selectedFileBase64 = arrayBufferToBase64(buffer);
}

/**
 * Handle campaign form submission (create or update).
 * @param {Event} event
 * @returns {Promise<void>}
 */
export async function handleCampaignSubmit(event) {
  event.preventDefault();

  const name = getVal('campaign-name');
  const agentId = getVal('campaign-agent');
  const providerId = getVal('campaign-provider') || undefined;

  if (editingCampaignId) {
    if (!name || !agentId) {
      showToast(UI_STRINGS.toasts.campaignFormInvalid, 'error');
      return;
    }
    await submitCampaignUpdate(name, agentId, providerId);
    return;
  }

  const formData = {
    name,
    agentId,
    ...(providerId && { providerId }),
    fileName: selectedFileName || undefined,
    fileBase64: selectedFileBase64,
  };
  const parseResult = CAMPAIGN_FORM_SCHEMA.safeParse(formData);
  if (!parseResult.success) {
    showToast(UI_STRINGS.toasts.campaignFormInvalid, 'error');
    return;
  }

  try {
    await api('/campaigns', {
      method: 'POST',
      body: JSON.stringify(parseResult.data),
    });
    showToast(UI_STRINGS.toasts.campaignCreated, 'success');
    hideCampaignForm();
    await loadCampaigns();
  } catch (err) {
    showToast(err instanceof Error ? err.message : String(err), 'error');
  }
}

/**
 * @param {string} name
 * @param {string} agentId
 * @param {string | undefined} providerId
 * @returns {Promise<void>}
 */
async function submitCampaignUpdate(name, agentId, providerId) {
  try {
    await api(`/campaigns/${editingCampaignId}`, {
      method: 'PUT',
      body: JSON.stringify({ name, agentId, providerId: providerId ?? null }),
    });
    showToast(UI_STRINGS.toasts.campaignUpdated, 'success');
    hideCampaignForm();
    await loadCampaigns();
  } catch (err) {
    showToast(err instanceof Error ? err.message : String(err), 'error');
  }
}

/**
 * Trigger calls for all pending contacts in a campaign.
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function triggerCampaign(id) {
  if (!confirm(UI_STRINGS.campaigns.confirmTrigger)) return;
  try {
    const result = await api(`/campaigns/${id}/trigger`, { method: 'POST' });
    showToast(UI_STRINGS.toasts.campaignTriggered(result.initiated ?? 0), 'success');
    await loadCampaigns();
  } catch (err) {
    showToast(err instanceof Error ? err.message : String(err), 'error');
  }
}

/**
 * @param {string} id
 * @returns {Promise<void>}
 */
async function deleteCampaign(id) {
  if (!confirm(UI_STRINGS.common.confirmDelete)) return;
  try {
    await api(`/campaigns/${id}`, { method: 'DELETE' });
    showToast(UI_STRINGS.toasts.campaignDeleted, 'success');
    await loadCampaigns();
  } catch (err) {
    showToast(err instanceof Error ? err.message : String(err), 'error');
  }
}

/**
 * Hide the form and show the campaign list.
 * @returns {void}
 */
export function hideCampaignForm() {
  const form = document.getElementById('campaign-form-container');
  const listSection = document.getElementById('campaign-list-section');
  if (form) form.classList.add('hidden');
  if (listSection) listSection.classList.remove('hidden');
  editingCampaignId = null;
}

/** @param {string} id @returns {string} */
function getVal(id) {
  const el = /** @type {HTMLInputElement|HTMLSelectElement|null} */ (document.getElementById(id));
  return el ? el.value.trim() : '';
}

/** @param {string} id @param {string} val */
function setVal(id, val) {
  const el = /** @type {HTMLInputElement|HTMLSelectElement|null} */ (document.getElementById(id));
  if (el) el.value = val;
}

/**
 * Download the sample contacts template for the currently selected agent.
 * The template includes the phone column plus every variable the agent's prompt needs.
 * @returns {void}
 */
export function handleDownloadTemplate() {
  const agentId = getVal('campaign-agent');
  if (!agentId) {
    showToast(UI_STRINGS.toasts.campaignSelectAgentFirst, 'error');
    return;
  }
  const anchor = document.createElement('a');
  anchor.href = `${CONFIG.API_PREFIX}/campaigns/template/${encodeURIComponent(agentId)}`;
  anchor.download = 'campaign-template.xlsx';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/**
 * Initialize campaign panel event listeners.
 * @returns {void}
 */
export function initCampaignPanel() {
  document.getElementById('btn-add-campaign')
    ?.addEventListener('click', () => showAddCampaignForm());
  document.getElementById('campaign-form')
    ?.addEventListener('submit', handleCampaignSubmit);
  document.getElementById('btn-cancel-campaign')
    ?.addEventListener('click', hideCampaignForm);
  document.getElementById('campaign-file')
    ?.addEventListener('change', handleFileChange);
  document.getElementById('btn-download-template')
    ?.addEventListener('click', handleDownloadTemplate);
}

/**
 * Reset module state (for testing).
 * @returns {void}
 * @internal
 */
export function resetCampaignState() {
  campaigns = [];
  editingCampaignId = null;
  selectedFileBase64 = '';
  selectedFileName = '';
}
