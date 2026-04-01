/**
 * @vitest-environment jsdom
 */
/* eslint-disable complexity */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  renderVoiceGrid, renderModelSelect, renderAgentList,
  renderMessage, clearMessages
} from '../render.js';
import { CONFIG } from '../constants/config.js';

describe('Render Logic (render.js) — 90%+ Exclusive Coverage', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="voice-grid"></div>
      <select id="form-model"></select>
      <div id="agent-list"></div>
      <div id="messages"></div>
    `;
  });

  describe('Voice Grid Rendering', () => {
    it('should render voices with names and descriptions', () => {
      const voices = [
        { id: 'v1', name: 'Voice 1', description: 'Desc 1' },
        { id: CONFIG.DEFAULT_VOICE, name: 'Default Voice', description: 'Desc 2' },
      ];
      renderVoiceGrid(voices);
      const options = document.querySelectorAll('.voice-option');
      expect(options.length).toBe(2);
      expect(options[0].querySelector('.voice-option-name')?.textContent).toBe('Voice 1');
      expect(options[1].querySelector('.voice-option-name')?.textContent).toBe('Default Voice');
      
      // Hit click listener branches
      options[1].dispatchEvent(new Event('click', { bubbles: true }));
      expect(options[1].classList.contains('selected')).toBe(true);

      // Hit branch where opt.querySelector('input') is null
      options[0].querySelector('input')?.remove();
      options[0].dispatchEvent(new Event('click', { bubbles: true }));
    });

    it('should handle missing grid', () => {
      document.getElementById('voice-grid')?.remove();
      renderVoiceGrid([{ id: 'v1', name: 'v', description: 'd' }]);
    });

    it('should handle empty voice list', () => {
      renderVoiceGrid([]);
      expect(document.getElementById('voice-grid')?.innerHTML).toBe('');
    });
  });

  describe('Model Select Rendering', () => {
    it('should render models and handle missing select', () => {
      const models = [{ id: 'm1', name: 'Model 1', description: 'Desc 1' }];
      renderModelSelect(models);
      const select = document.getElementById('form-model') as HTMLSelectElement;
      expect(select.options.length).toBe(1);
      expect(select.options[0].textContent).toContain('Model 1');

      document.getElementById('form-model')?.remove();
      renderModelSelect(models); 
    });
  });

  describe('Agent List Rendering', () => {
    const mockAgents = [
      {
        id: 'a1',
        name: 'Agent 1',
        systemPrompt: 'p1',
        voiceName: 'v1',
        modelName: 'm1',
        publicPreviewEnabled: true,
        createdAt: new Date(),
      },
      {
        id: 'a2',
        name: 'Agent 2',
        systemPrompt: 'p2',
        voiceName: 'v2',
        modelName: 'm2',
        publicPreviewEnabled: false,
        createdAt: new Date(),
      },
    ];
    const mockCallbacks = {
      onSelect: vi.fn(),
      onCall: vi.fn(),
      onEdit: vi.fn(),
      onDelete: vi.fn(),
      onCopyPreviewUrl: vi.fn(),
      onTogglePublicPreview: vi.fn(),
    };

    it('should render agent cards with active class and attach listeners', () => {
      renderAgentList(
        mockAgents, 
        'a1', 
        mockCallbacks.onSelect, 
        mockCallbacks.onCall, 
        mockCallbacks.onEdit, 
        mockCallbacks.onDelete,
        mockCallbacks.onCopyPreviewUrl,
        mockCallbacks.onTogglePublicPreview,
      );
      
      const card = document.querySelector('.agent-card');
      expect(card?.classList.contains('active')).toBe(true);
      expect(card?.innerHTML).toContain('Agent 1');

      card?.querySelector('.btn-test-call')?.dispatchEvent(new Event('click', { bubbles: true }));
      expect(mockCallbacks.onCall).toHaveBeenCalledWith('a1');

      card?.querySelector('.btn-edit-agent')?.dispatchEvent(new Event('click', { bubbles: true }));
      expect(mockCallbacks.onEdit).toHaveBeenCalledWith('a1');

      card?.querySelector('.btn-delete-agent')?.dispatchEvent(new Event('click', { bubbles: true }));
      expect(mockCallbacks.onDelete).toHaveBeenCalledWith('a1');

      card?.querySelector('.btn-copy-preview')?.dispatchEvent(new Event('click', { bubbles: true }));
      expect(mockCallbacks.onCopyPreviewUrl).toHaveBeenCalledWith('a1');

      const toggle = card?.querySelector('.agent-public-toggle-input');
      toggle?.dispatchEvent(new Event('change', { bubbles: true }));
      expect(mockCallbacks.onTogglePublicPreview).toHaveBeenCalled();

      card?.dispatchEvent(new Event('click', { bubbles: true }));
      expect(mockCallbacks.onSelect).toHaveBeenCalledWith('a1');
    });

    it('should handle missing data-id gracefully when interacting with logic listeners', () => {
      renderAgentList(
        mockAgents, 
        'a1', 
        mockCallbacks.onSelect, 
        mockCallbacks.onCall, 
        mockCallbacks.onEdit, 
        mockCallbacks.onDelete,
        mockCallbacks.onCopyPreviewUrl,
        mockCallbacks.onTogglePublicPreview,
      );
      const card = document.querySelector('.agent-card');

      // hit missing dataset id branches
      const card2 = document.querySelectorAll('.agent-card')[1] as HTMLElement;
      card2.dataset.id = '';
      card2.dispatchEvent(new Event('click', { bubbles: true }));

      const btnEdit = card?.querySelector('.btn-edit-agent') as HTMLElement;
      btnEdit.dataset.id = '';
      btnEdit.dispatchEvent(new Event('click', { bubbles: true }));
      
      const btnCall = card?.querySelector('.btn-test-call') as HTMLElement;
      btnCall.dataset.id = '';
      btnCall.dispatchEvent(new Event('click', { bubbles: true }));

      const btnDelete = card?.querySelector('.btn-delete-agent') as HTMLElement;
      btnDelete.dataset.id = '';
      btnDelete.dispatchEvent(new Event('click', { bubbles: true }));

      const btnCopy = card?.querySelector('.btn-copy-preview') as HTMLElement;
      btnCopy.dataset.id = '';
      btnCopy.dispatchEvent(new Event('click', { bubbles: true }));

      const toggle = card?.querySelector('.agent-public-toggle-input') as HTMLInputElement;
      toggle.dataset.id = '';
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
    });

    it('should handle empty agent list', () => {
      renderAgentList([], null, vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn());
      expect(document.getElementById('agent-list')?.innerHTML).toContain('No agents yet');

      document.getElementById('agent-list')?.remove();
      renderAgentList([], null, vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn()); // missing container branch
    });
  });

  describe('Message Rendering', () => {
    it('should render messages', () => {
      renderMessage('user', 'Testing Message');
      expect(document.getElementById('messages')?.innerHTML).toContain('Testing Message');
      
      clearMessages();
      expect(document.getElementById('messages')?.innerHTML).toBe('');
      
      document.getElementById('messages')?.remove();
      renderMessage('error', 'fail');
      clearMessages();
    });
  });
});
