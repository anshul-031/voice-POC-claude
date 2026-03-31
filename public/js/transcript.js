/**
 * Transcript rendering logic for the VoiceForge frontend.
 */
import { UI_STRINGS } from './constants/uiStrings.js';
import { escapeHtml } from './utils.js';

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
  if (lastMsg?.classList.contains(role)) {
    const bubble = lastMsg.querySelector('.transcript-bubble');
    const timeEl = lastMsg.querySelector('.transcript-time');
    if (bubble) bubble.textContent += text;
    if (timeEl) timeEl.textContent = new Date().toLocaleTimeString();
    body.scrollTop = body.scrollHeight;
    return;
  }

  const msgDiv = document.createElement('div');
  msgDiv.className = `transcript-msg ${role}`;
  msgDiv.innerHTML = `
    <div class="transcript-role">${role === 'user' ? UI_STRINGS.callPanel.roles.user : UI_STRINGS.callPanel.roles.agent}</div>
    <div class="transcript-bubble">${escapeHtml(text)}</div>
    <div class="transcript-time">${new Date().toLocaleTimeString()}</div>
  `;
  body.appendChild(msgDiv);
  body.scrollTop = body.scrollHeight;
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
