/* eslint-disable max-lines */
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
import { CAMPAIGN_FORM_SCHEMA, CAMPAIGN_SCHEDULE_SCHEMA } from './constants/inputSchemas.js';

/** @type {any[]} */
let campaigns = [];
/** @type {string | null} */
let editingCampaignId = null;
/** @type {string | null} */
let schedulingCampaignId = null;
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
          ${renderScheduleMeta(c)}
        </div>
        <div class="telephony-card-actions">
          ${renderCampaignActions(c)}
        </div>
      </div>`;
  }).join('');

  wireCardButtons(list, '.btn-trigger-campaign', triggerCampaign);
  wireCardButtons(list, '.btn-retrigger-campaign', retriggerCampaign);
  wireCardButtons(list, '.btn-schedule-campaign', showScheduleForm);
  wireCardButtons(list, '.btn-pause-campaign', pauseCampaign);
  wireCardButtons(list, '.btn-resume-campaign', resumeCampaign);
  wireCardButtons(list, '.btn-view-campaign', viewCampaignStatus);
  wireCardButtons(list, '.btn-edit-campaign', showAddCampaignForm);
  wireCardButtons(list, '.btn-delete-campaign', deleteCampaign);
}

/**
 * Attach a click handler to every matching card button.
 * @param {HTMLElement} list
 * @param {string} selector
 * @param {(id: string) => void} handler
 * @returns {void}
 */
function wireCardButtons(list, selector, handler) {
  list.querySelectorAll(selector).forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = /** @type {HTMLElement} */ (btn).dataset.id;
      if (id) handler(id);
    });
  });
}

/**
 * Build a single action button.
 * @param {string} cls
 * @param {string} id
 * @param {string} label
 * @param {string} variant
 * @returns {string}
 */
function actionButton(cls, id, label, variant) {
  return `<button class="btn ${variant} btn-sm ${cls}" data-id="${id}">${label}</button>`;
}

/**
 * Render status-appropriate action buttons for a campaign card.
 * @param {any} c
 * @returns {string}
 */
function renderCampaignActions(c) {
  const S = UI_STRINGS.campaigns.card;
  const status = c.status;
  const buttons = [];

  if (status === 'draft') {
    buttons.push(actionButton('btn-trigger-campaign', c.id, S.trigger, 'btn-primary'));
    buttons.push(actionButton('btn-schedule-campaign', c.id, S.schedule, 'btn-outline'));
  }
  if (status === 'completed' || status === 'failed') {
    buttons.push(actionButton('btn-retrigger-campaign', c.id, S.retrigger, 'btn-primary'));
    buttons.push(actionButton('btn-schedule-campaign', c.id, S.schedule, 'btn-outline'));
  }
  if (status === 'scheduled' || status === 'running') {
    buttons.push(actionButton('btn-pause-campaign', c.id, S.pause, 'btn-outline'));
  }
  if (status === 'paused') {
    buttons.push(actionButton('btn-resume-campaign', c.id, S.resume, 'btn-primary'));
  }

  buttons.push(actionButton('btn-view-campaign', c.id, S.viewStatus, 'btn-outline'));
  if (status === 'draft') {
    buttons.push(actionButton('btn-edit-campaign', c.id, S.edit, 'btn-outline'));
  }
  buttons.push(actionButton('btn-delete-campaign', c.id, S.delete, 'btn-danger'));
  return buttons.join('\n');
}

/**
 * Render a compact summary of a campaign's schedule + call window.
 * @param {any} c
 * @returns {string}
 */
function renderScheduleMeta(c) {
  const parts = [];
  if (c.scheduledAt) {
    parts.push(new Date(c.scheduledAt).toLocaleString());
  }
  if (c.windowStart && c.windowEnd) {
    parts.push(`${c.windowStart}–${c.windowEnd}`);
  }
  if (parts.length === 0) return '';
  return `<span class="campaign-schedule-meta">${escapeHtml(parts.join(' · '))}</span>`;
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
 * Reset every contact to pending and dial the campaign again.
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function retriggerCampaign(id) {
  if (!confirm(UI_STRINGS.campaigns.confirmRetrigger)) return;
  try {
    const result = await api(`/campaigns/${id}/retrigger`, { method: 'POST' });
    showToast(UI_STRINGS.toasts.campaignTriggered(result.initiated ?? 0), 'success');
    await loadCampaigns();
  } catch (err) {
    showToast(err instanceof Error ? err.message : String(err), 'error');
  }
}

/**
 * Convert an ISO timestamp to a value usable by a datetime-local input.
 * @param {string | null | undefined} iso
 * @returns {string}
 */
function toLocalDateTimeInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    + `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Open the scheduling form for a campaign, pre-filled with its current values.
 * @param {string} id
 * @returns {void}
 */
export function showScheduleForm(id) {
  const container = document.getElementById('campaign-schedule-container');
  const listSection = document.getElementById('campaign-list-section');
  if (!container || !listSection) return;

  schedulingCampaignId = id;
  const campaign = campaigns.find((c) => c.id === id);
  setVal('campaign-scheduled-at', toLocalDateTimeInput(campaign?.scheduledAt));
  setVal('campaign-window-start', campaign?.windowStart || '');
  setVal('campaign-window-end', campaign?.windowEnd || '');

  listSection.classList.add('hidden');
  container.classList.remove('hidden');
}

/**
 * Hide the scheduling form and return to the list.
 * @returns {void}
 */
export function hideScheduleForm() {
  const container = document.getElementById('campaign-schedule-container');
  const listSection = document.getElementById('campaign-list-section');
  if (container) container.classList.add('hidden');
  if (listSection) listSection.classList.remove('hidden');
  schedulingCampaignId = null;
}

/**
 * Submit the scheduling form (start time + call window).
 * @param {Event} event
 * @returns {Promise<void>}
 */
export async function handleScheduleSubmit(event) {
  event.preventDefault();
  if (!schedulingCampaignId) return;

  const scheduledAtRaw = getVal('campaign-scheduled-at');
  const windowStart = getVal('campaign-window-start');
  const windowEnd = getVal('campaign-window-end');

  const payload = {
    scheduledAt: scheduledAtRaw ? new Date(scheduledAtRaw).toISOString() : null,
    windowStart: windowStart || null,
    windowEnd: windowEnd || null,
  };
  const parseResult = CAMPAIGN_SCHEDULE_SCHEMA.safeParse(payload);
  if (!parseResult.success) {
    showToast(UI_STRINGS.toasts.campaignScheduleInvalid, 'error');
    return;
  }

  try {
    await api(`/campaigns/${schedulingCampaignId}/schedule`, {
      method: 'POST',
      body: JSON.stringify(parseResult.data),
    });
    showToast(UI_STRINGS.toasts.campaignScheduled, 'success');
    hideScheduleForm();
    await loadCampaigns();
  } catch (err) {
    showToast(err instanceof Error ? err.message : String(err), 'error');
  }
}

/**
 * Pause a scheduled/running campaign.
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function pauseCampaign(id) {
  if (!confirm(UI_STRINGS.campaigns.confirmPause)) return;
  try {
    await api(`/campaigns/${id}/pause`, { method: 'POST' });
    showToast(UI_STRINGS.toasts.campaignPaused, 'success');
    await loadCampaigns();
  } catch (err) {
    showToast(err instanceof Error ? err.message : String(err), 'error');
  }
}

/**
 * Resume a paused campaign.
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function resumeCampaign(id) {
  try {
    await api(`/campaigns/${id}/resume`, { method: 'POST' });
    showToast(UI_STRINGS.toasts.campaignResumed, 'success');
    await loadCampaigns();
  } catch (err) {
    showToast(err instanceof Error ? err.message : String(err), 'error');
  }
}

/**
 * @param {string} status
 * @returns {string}
 */
function contactStatusLabel(status) {
  const map = /** @type {any} */ (UI_STRINGS.campaigns.contactStatus);
  return map[status] || status;
}

/**
 * Tally contacts by status.
 * @param {any[]} contacts
 * @returns {{ total: number, pending: number, calling: number, completed: number, failed: number }}
 */
function tallyContactStatus(contacts) {
  const counts = { total: contacts.length, pending: 0, calling: 0, completed: 0, failed: 0 };
  for (const ct of contacts) {
    if (ct.status === 'pending') counts.pending += 1;
    else if (ct.status === 'calling') counts.calling += 1;
    else if (ct.status === 'completed') counts.completed += 1;
    else if (ct.status === 'failed') counts.failed += 1;
  }
  return counts;
}

/**
 * Build the summary chips + progress bar for the status view.
 * @param {ReturnType<typeof tallyContactStatus>} counts
 * @returns {string}
 */
function renderStatusSummary(counts) {
  const CS = UI_STRINGS.campaigns.contactStatus;
  const done = counts.completed + counts.failed;
  const pct = counts.total > 0 ? Math.round((done / counts.total) * 100) : 0;
  const chip = (/** @type {string} */ key, /** @type {number} */ n, /** @type {string} */ label) =>
    `<div class="campaign-stat campaign-stat-${key}"><span class="campaign-stat-num">${n}</span>`
    + `<span class="campaign-stat-label">${label}</span></div>`;

  return `
    <div class="campaign-status-summary">
      ${chip('total', counts.total, CS.total)}
      ${chip('pending', counts.pending, CS.pending)}
      ${chip('calling', counts.calling, CS.calling)}
      ${chip('completed', counts.completed, CS.completed)}
      ${chip('failed', counts.failed, CS.failed)}
    </div>
    <div class="campaign-progress">
      <div class="campaign-progress-track">
        <div class="campaign-progress-bar" style="width:${pct}%"></div>
      </div>
      <span class="campaign-progress-label">${CS.progress(done, counts.total)} · ${pct}%</span>
    </div>`;
}

/**
 * Build a single contact row.
 * @param {any} ct
 * @returns {string}
 */
function renderContactRow(ct) {
  return `
        <tr>
          <td class="campaign-status-phone">${escapeHtml(ct.phoneNumber || '')}</td>
          <td><span class="telephony-badge ${ct.status}">${contactStatusLabel(ct.status)}</span></td>
          <td class="campaign-status-detail">${escapeHtml(ct.errorMessage || '—')}</td>
        </tr>`;
}

/**
 * Render the per-number status view for a campaign.
 * @param {HTMLElement} container
 * @param {any} campaign
 * @returns {void}
 */
function renderContactStatus(container, campaign) {
  const CS = UI_STRINGS.campaigns.contactStatus;
  const contacts = Array.isArray(campaign.contacts) ? campaign.contacts : [];
  const counts = tallyContactStatus(contacts);

  const rows = contacts.length === 0
    ? `<tr><td colspan="3" class="campaign-status-empty">${CS.empty}</td></tr>`
    : contacts.map(renderContactRow).join('');

  container.innerHTML = `
    <div class="panel-header">
      <h2>${escapeHtml(campaign.name || '')} — ${CS.title}</h2>
      <div class="campaign-status-actions">
        <button type="button" class="btn btn-outline btn-sm" id="btn-refresh-campaign-status">${CS.refresh}</button>
        <button type="button" class="btn btn-primary btn-sm" id="btn-retrigger-campaign-status">${CS.retrigger}</button>
        <button type="button" class="btn btn-ghost btn-sm" id="btn-close-campaign-status">${CS.close}</button>
      </div>
    </div>
    ${renderStatusSummary(counts)}
    <div class="campaign-status-table-wrap">
      <table class="campaign-status-table">
        <thead>
          <tr>
            <th>${CS.phoneHeader}</th>
            <th>${CS.statusHeader}</th>
            <th>${CS.detailHeader}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  container.querySelector('#btn-close-campaign-status')
    ?.addEventListener('click', hideStatusView);
  container.querySelector('#btn-refresh-campaign-status')
    ?.addEventListener('click', () => { void viewCampaignStatus(campaign.id); });
  container.querySelector('#btn-retrigger-campaign-status')
    ?.addEventListener('click', () => { void retriggerCampaign(campaign.id); });
}

/**
 * Fetch a campaign's contacts and display their per-number status.
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function viewCampaignStatus(id) {
  const container = document.getElementById('campaign-status-container');
  const listSection = document.getElementById('campaign-list-section');
  if (!container || !listSection) return;

  try {
    const campaign = await api(`/campaigns/${id}`);
    renderContactStatus(container, campaign);
    listSection.classList.add('hidden');
    container.classList.remove('hidden');
  } catch (err) {
    showToast(err instanceof Error ? err.message : String(err), 'error');
  }
}

/**
 * Hide the per-number status view and return to the list.
 * @returns {void}
 */
export function hideStatusView() {
  const container = document.getElementById('campaign-status-container');
  const listSection = document.getElementById('campaign-list-section');
  if (container) container.classList.add('hidden');
  if (listSection) listSection.classList.remove('hidden');
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
  document.getElementById('campaign-schedule-form')
    ?.addEventListener('submit', handleScheduleSubmit);
  document.getElementById('btn-cancel-schedule')
    ?.addEventListener('click', hideScheduleForm);
}

/**
 * Reset module state (for testing).
 * @returns {void}
 * @internal
 */
export function resetCampaignState() {
  campaigns = [];
  editingCampaignId = null;
  schedulingCampaignId = null;
  selectedFileBase64 = '';
  selectedFileName = '';
}
