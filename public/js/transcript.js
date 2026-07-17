/**
 * Transcript rendering logic for the AnshulTheGreat.com frontend.
 */
import { UI_STRINGS } from './constants/uiStrings.js';
import { CONFIG } from './constants/config.js';
import { escapeHtml } from './utils.js';

/**
 * Joins incremental transcript chunks while preserving intended word boundaries.
 * @param {string} existingText
 * @param {string} incomingText
 * @returns {string}
 */
function mergeTranscriptText(existingText, incomingText) {
  if (!existingText) return incomingText;

  const endsWithWhitespace = /\s$/u.test(existingText);
  const startsWithWhitespace = /^\s/u.test(incomingText);
  const startsWithClosingPunctuation = /^[,.;:!?…)}\]।॥]/u.test(incomingText);
  const endsWithOpeningPunctuation = /[([{“‘]$/u.test(existingText);
  const shouldInsertSpace = !endsWithWhitespace
    && !startsWithWhitespace
    && !startsWithClosingPunctuation
    && !endsWithOpeningPunctuation;

  return shouldInsertSpace ? `${existingText} ${incomingText}` : `${existingText}${incomingText}`;
}

/**
 * @param {Element | null} lastMsg
 * @param {string} role
 * @param {string} text
 * @param {HTMLElement} body
 * @returns {boolean}
 */
function appendToExistingBubble(lastMsg, role, text, body) {
  if (!lastMsg?.classList.contains(role)) return false;

  const bubble = lastMsg.querySelector('.transcript-bubble');
  const timeEl = lastMsg.querySelector('.transcript-time');
  if (bubble) bubble.textContent = mergeTranscriptText(bubble.textContent || '', text);
  if (timeEl) timeEl.textContent = new Date().toLocaleTimeString();
  body.scrollTop = body.scrollHeight;
  return true;
}

/**
 * @param {HTMLElement} body
 * @param {string} role
 * @param {string} text
 * @returns {void}
 */
function createTranscriptBubble(body, role, text) {
  const roleLabel = role === 'user' ? UI_STRINGS.callPanel.roles.user : UI_STRINGS.callPanel.roles.agent;
  const msgDiv = document.createElement('div');
  msgDiv.className = `transcript-msg ${role}`;
  msgDiv.innerHTML = `
    <div class="transcript-role">${roleLabel}</div>
    <div class="transcript-bubble">${escapeHtml(text)}</div>
    <div class="transcript-time">${new Date().toLocaleTimeString()}</div>
  `;
  body.appendChild(msgDiv);
  body.scrollTop = body.scrollHeight;
}

/**
 * Appends or accumulates a transcript message in the transcript body.
 * If the last message is from the same role, appends text to it.
 * Otherwise, creates a new message bubble.
 * @param {string} role
 * @param {string} text
 * @returns {void}
 */
export function appendTranscript(role, text) {
  if (!text?.trim()) return;
  const body = document.getElementById('transcript-body');
  if (!body) return;

  const empty = body.querySelector('.transcript-empty');
  if (empty) empty.remove();

  // Append to existing bubble if same role is still speaking
  const lastMsg = body.querySelector('.transcript-msg:last-child');
  if (appendToExistingBubble(lastMsg, role, text, body)) return;

  createTranscriptBubble(body, role, text);
}

/**
 * Selects a voice radio button within the voice grid.
 * @param {string} voiceName
 * @returns {void}
 */
export function selectVoiceInGrid(voiceName) {
  const grid = document.getElementById('voice-grid');
  if (!grid) return;
  grid.querySelectorAll('.voice-option').forEach(opt => opt.classList.remove('selected'));
  const radio = /** @type {HTMLInputElement | null} */ (
    grid.querySelector(`input[name="voiceName"][value="${voiceName}"]`)
  );
  if (!radio) return;
  radio.checked = true;
  const label = radio.closest('.voice-option');
  if (label) label.classList.add('selected');
}

/**
 * @param {string} message
 * @param {'info' | 'warn' | 'error'} level
 * @returns {void}
 */
export function appendDebugLog(message, level = 'info') {
  if (!message?.trim()) return;
  const body = document.getElementById('debug-log-body');
  if (!body) return;

  const empty = body.querySelector('.debug-log-empty');
  if (empty) empty.remove();

  const entry = document.createElement('div');
  entry.className = `debug-log-item ${level}`;
  entry.innerHTML = `
    <div class="debug-log-time">${new Date().toLocaleTimeString()}</div>
    <div class="debug-log-message">${escapeHtml(message)}</div>
  `;

  body.appendChild(entry);

  while (body.children.length > CONFIG.DEBUG_LOG_MAX_ITEMS) {
    body.removeChild(/** @type {Element} */ (body.firstElementChild));
  }

  body.scrollTop = body.scrollHeight;
}

/**
 * @returns {void}
 */
export function clearDebugLogs() {
  const body = document.getElementById('debug-log-body');
  if (!body) return;
  body.innerHTML = `<div class="debug-log-empty">${UI_STRINGS.callPanel.debugEmpty}</div>`;
}

/**
 * @param {string} role 
 * @param {string} text 
 * @returns {void}
 */
export function updateTranscript(role, text) {
  const content = document.getElementById('transcript-content');
  const container = document.getElementById('transcript-container');
  if (!content) return;
  const div = document.createElement('div');
  div.className = `transcript-line ${role}`;
  div.textContent = `${role === 'user' ? 'You' : 'Agent'}: ${text}`;
  content.appendChild(div);
  if (container) container.scrollTo(0, container.scrollHeight);
}

/**
 * @returns {void}
 */
export function clearTranscript() {
  const content = document.getElementById('transcript-content');
  if (content) content.innerHTML = '';
}
