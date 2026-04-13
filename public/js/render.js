/**
 * Rendering logic for AnshulTheGreat.com dashboard.
 */
import { UI_STRINGS } from './constants/uiStrings.js';
import { CONFIG } from './constants/config.js';
import { escapeHtml } from './utils.js';

/**
 * @param {any[]} voices
 * @returns {void}
 */
export function renderVoiceGrid(voices) {
  const grid = document.getElementById('voice-grid');
  if (!grid) return;
  grid.innerHTML = voices.map(v => `
    <label class="voice-option${v.id === CONFIG.DEFAULT_VOICE ? ' selected' : ''}" data-voice="${v.id}">
      <input type="radio" name="voiceName" value="${v.id}" ${v.id === CONFIG.DEFAULT_VOICE ? 'checked' : ''}>
      <div class="voice-option-name">${v.name}</div>
      <div class="voice-option-desc">${v.description}</div>
    </label>
  `).join('');

  grid.querySelectorAll('.voice-option').forEach(opt => {
    opt.addEventListener('click', () => {
      grid.querySelectorAll('.voice-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      const input = opt.querySelector('input');
      if (input) input.checked = true;
    });
  });
}

/**
 * @param {any[]} models
 * @returns {void}
 */
export function renderModelSelect(models) {
  const select = /** @type {HTMLSelectElement} */ (document.getElementById('form-model'));
  if (!select) return;
  select.innerHTML = models.map(m => `<option value="${m.id}">${m.name} — ${m.description}</option>`).join('');
}

/**
 * @param {any[]} agents
 * @param {string | null} selectedAgentId
 * @param {{ (id: string): void }} onSelect
 * @param {{ (id: string): void }} onTestCall
 * @param {{ (id: string): void }} onEdit
 * @param {{ (id: string): void }} onDelete
 * @param {{ (id: string): void }} onCopyPreviewUrl
 * @param {{ (id: string, enabled: boolean): void }} onTogglePublicPreview
 * @returns {void}
 */
export function renderAgentList(
  agents,
  selectedAgentId,
  onSelect,
  onTestCall,
  onEdit,
  onDelete,
  onCopyPreviewUrl,
  onTogglePublicPreview,
) {
  const list = document.getElementById('agent-list');
  if (!list) return;
  if (agents.length === 0) {
    list.innerHTML = `<div class="agent-list-empty"><p>${UI_STRINGS.agentList.empty.title} ...</p></div>`;
    return;
  }

  list.innerHTML = agents.map(agent => `
    <div class="agent-card${agent.id === selectedAgentId ? ' active' : ''}" data-id="${agent.id}">
      <div class="agent-card-header">
        <span class="agent-card-name">${escapeHtml(agent.name)}</span>
        <span class="agent-card-visibility ${agent.publicPreviewEnabled ? 'public' : 'private'}">
          ${agent.publicPreviewEnabled ? UI_STRINGS.agentList.card.publicBadge : UI_STRINGS.agentList.card.privateBadge}
        </span>
      </div>
      <div class="agent-card-prompt">${escapeHtml(agent.systemPrompt)}</div>
      <div class="agent-card-meta">${escapeHtml(agent.voiceName)}</div>
      <label class="agent-public-toggle" data-id="${agent.id}">
        <input type="checkbox" class="agent-public-toggle-input" data-id="${agent.id}" ${agent.publicPreviewEnabled ? 'checked' : ''}>
        <span>${UI_STRINGS.agentList.card.publicPreviewEnabled}</span>
      </label>
      <div class="agent-card-actions">
        <button class="btn btn-outline btn-sm btn-test-call" data-id="${agent.id}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6"/>
            <path d="M14.05 2a9 9 0 0 1 7.95 7.95M16 2a5 5 0 0 1 4 4"/>
          </svg>
          ${UI_STRINGS.agentList.card.testCall}
        </button>
        <button class="btn btn-outline btn-sm btn-edit-agent" data-id="${agent.id}">
          ${UI_STRINGS.common.edit}
        </button>
        <button class="btn btn-outline btn-sm btn-copy-preview ${agent.publicPreviewEnabled ? '' : 'hidden'}" data-id="${agent.id}">
          ${UI_STRINGS.agentList.card.copyPreviewUrl}
        </button>
        <button class="btn btn-danger btn-sm btn-delete-agent" data-id="${agent.id}">
          ${UI_STRINGS.common.delete}
        </button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.agent-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = /** @type {HTMLElement} */ (card).dataset.id;
      if (id) onSelect(id);
    });
  });

  list.querySelectorAll('.btn-test-call').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = /** @type {HTMLElement} */ (btn).dataset.id;
      if (id) onTestCall(id);
    });
  });

  list.querySelectorAll('.btn-edit-agent').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = /** @type {HTMLElement} */ (btn).dataset.id;
      if (id) onEdit(id);
    });
  });
  list.querySelectorAll('.btn-delete-agent').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = /** @type {HTMLElement} */ (btn).dataset.id;
      if (id) onDelete(id);
    });
  });

  list.querySelectorAll('.btn-copy-preview').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = /** @type {HTMLElement} */ (btn).dataset.id;
      if (id) onCopyPreviewUrl(id);
    });
  });

  list.querySelectorAll('.agent-public-toggle-input').forEach(toggle => {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    toggle.addEventListener('change', (e) => {
      e.stopPropagation();
      const input = /** @type {HTMLInputElement} */ (toggle);
      const id = input.dataset.id;
      if (id) onTogglePublicPreview(id, input.checked);
    });
  });
}

/**
 * @param {string} role 
 * @param {string} content 
 * @returns {void}
 */
export function renderMessage(role, content) {
  const container = document.getElementById('messages');
  if (!container) return;
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.innerHTML = `<div class="content">${escapeHtml(content)}</div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

/**
 * @returns {void}
 */
export function clearMessages() {
  const container = document.getElementById('messages');
  if (container) container.innerHTML = '';
}
