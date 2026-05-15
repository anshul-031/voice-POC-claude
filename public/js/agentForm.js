/**
 * Agent form helpers for the frontend.
 */
import { UI_STRINGS } from './constants/uiStrings.js';
import { CONFIG } from './constants/config.js';
import { selectVoiceInGrid } from './transcript.js';

/**
 * @typedef {Object} AgentFormFields
 * @property {string=} id
 * @property {string=} name
 * @property {string=} systemPrompt
 * @property {string=} voiceName
 * @property {string=} modelName
 * @property {boolean=} publicPreviewEnabled
 * @property {number=} inactivityTimeoutMs
 * @property {number=} maxInactivityNudges
 * @property {number=} maxCallDurationSecs
 * @property {string=} title
 * @property {string=} submitText
 */

/**
 * @typedef {Object} AgentFormData
 * @property {string} id
 * @property {string} name
 * @property {string} systemPrompt
 * @property {string} voiceName
 * @property {string} modelName
 * @property {boolean} publicPreviewEnabled
 * @property {number} inactivityTimeoutMs
 * @property {number} maxInactivityNudges
 * @property {number} maxCallDurationSecs
 */

/** @param {string} elId @param {string} value @returns {void} */
function setInputValue(elId, value) {
  const el = /** @type {HTMLInputElement | null} */ (document.getElementById(elId));
  if (!el) return;
  el.value = value;
}

/** @param {string} elId @param {string} value @returns {void} */
function setTextValue(elId, value) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = value;
}

/** @param {string} elId @param {boolean} checked @returns {void} */
function setCheckboxValue(elId, checked) {
  const el = /** @type {HTMLInputElement | null} */ (document.getElementById(elId));
  if (!el) return;
  el.checked = checked;
}

/** @param {string} voiceName @returns {void} */
function selectVoiceIfPresent(voiceName) {
  if (voiceName) {
    selectVoiceInGrid(voiceName);
  }
}

/** @param {string | undefined} value @returns {string} */
function getStringOrEmpty(value) {
  return value || '';
}

/**
 * @param {number | undefined} value
 * @param {number} fallback
 * @returns {number}
 */
function getNumberOrFallback(value, fallback) {
  return value ?? fallback;
}

/** @param {string=} modelName @returns {void} */
function setOptionalModelName(modelName) {
  if (modelName) {
    setInputValue('form-model', modelName);
  }
}

/** @param {string} elId @returns {string} */
function getInputValue(elId) {
  const el = /** @type {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null} */ (
    document.getElementById(elId)
  );
  return el ? el.value : '';
}

/** @param {string} elId @returns {boolean} */
function isChecked(elId) {
  const el = /** @type {HTMLInputElement | null} */ (document.getElementById(elId));
  return !!el?.checked;
}

/**
 * @param {string} rawValue
 * @param {number} fallback
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clampInteger(rawValue, fallback, min, max) {
  const parsedValue = parseInt(rawValue || String(fallback), 10);
  return Math.max(min, Math.min(max, parsedValue));
}

/**
 * Populates the agent form fields.
 * @param {AgentFormFields} fields
 * @returns {void}
 */
export function populateForm(fields) {
  setInputValue('form-agent-id', getStringOrEmpty(fields.id));
  setInputValue('form-name', getStringOrEmpty(fields.name));
  setInputValue('form-prompt', getStringOrEmpty(fields.systemPrompt));

  const title = fields.title || UI_STRINGS.form.createTitle;
  const submitText = fields.submitText || UI_STRINGS.common.create;
  setTextValue('form-title', title);
  setTextValue('form-submit-text', submitText);

  setCheckboxValue('form-public-preview-enabled', !!fields.publicPreviewEnabled);
  selectVoiceIfPresent(fields.voiceName || '');
  setOptionalModelName(fields.modelName);

  const inactivityTimeoutMs = getNumberOrFallback(
    fields.inactivityTimeoutMs,
    CONFIG.DEFAULT_INACTIVITY_TIMEOUT_MS,
  );
  setInputValue('form-inactivity-timeout', String(Math.round(inactivityTimeoutMs / 1000)));
  setInputValue(
    'form-max-nudges',
    String(getNumberOrFallback(fields.maxInactivityNudges, CONFIG.DEFAULT_MAX_INACTIVITY_NUDGES)),
  );
  setInputValue(
    'form-max-call-duration',
    String(getNumberOrFallback(fields.maxCallDurationSecs, CONFIG.DEFAULT_MAX_CALL_DURATION_SECS)),
  );
}

/**
 * @returns {AgentFormData | null}
 */
export function getFormData() {
  const idEl = /** @type {HTMLInputElement | null} */ (document.getElementById('form-agent-id'));
  const nameEl = /** @type {HTMLInputElement | null} */ (document.getElementById('form-name'));
  const promptEl = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('form-prompt'));
  const modelEl = /** @type {HTMLSelectElement | null} */ (document.getElementById('form-model'));

  if (!idEl || !nameEl || !promptEl || !modelEl) {
    return null;
  }

  const voiceName = /** @type {HTMLInputElement | null} */ (
    document.querySelector('input[name="voiceName"]:checked')
  )?.value || CONFIG.DEFAULT_VOICE;
  const inactivityTimeoutSecs = clampInteger(getInputValue('form-inactivity-timeout'), 10, 3, 60);
  const maxNudges = clampInteger(getInputValue('form-max-nudges'), 3, 0, 10);
  const maxCallDurationSecs = clampInteger(getInputValue('form-max-call-duration'), 0, 0, 3600);

  return {
    id: idEl.value,
    name: nameEl.value.trim(),
    systemPrompt: promptEl.value.trim(),
    voiceName,
    modelName: modelEl.value,
    publicPreviewEnabled: isChecked('form-public-preview-enabled'),
    inactivityTimeoutMs: inactivityTimeoutSecs * 1000,
    maxInactivityNudges: maxNudges,
    maxCallDurationSecs,
  };
}