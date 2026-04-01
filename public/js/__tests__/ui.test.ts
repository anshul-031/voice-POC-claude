/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { 
  applyI18n, showPanel, updateCallUI, 
  setStatus, setTimer, updateAgentVoices, getSelectedVoice
} from '../ui.js';

describe('UI Logic (ui.js) — 90%+ Exclusive Coverage', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div data-i18n="common.save"></div>
      <input data-i18n-attr="placeholder:common.save; title:common.cancel" />
      <div id="empty-state"></div>
      <div id="agent-form-container"></div>
      <div id="call-panel"></div>
      <button id="btn-call">
        <span id="call-icon-start"></span>
        <span id="call-icon-end"></span>
      </button>
      <div id="status-text"></div>
      <div id="status-dot"></div>
      <div id="timer"></div>
      <select id="voice-select"></select>
    `;
  });

  describe('Voice Selection', () => {
    it('should update agent voices and handle empty', () => {
      // Missing DOM
      document.getElementById('voice-select')?.remove();
      updateAgentVoices(['Voice1', 'Voice2']);
      expect(getSelectedVoice()).toBe('');
      
      // Setup DOM
      document.body.insertAdjacentHTML('beforeend', '<select id="voice-select"></select>');
      
      // Empty voices
      updateAgentVoices([]);
      expect(document.getElementById('voice-select')?.innerHTML).toContain('agent');
      
      // Populated voices
      updateAgentVoices(['Alice', 'Bob']);
      const select = document.getElementById('voice-select') as HTMLSelectElement;
      expect(select.children.length).toBe(2);
      expect(select.options[0].value).toBe('Alice');
      
      // Test getter
      select.value = 'Bob';
      expect(getSelectedVoice()).toBe('Bob');
    });
  });

  describe('i18n', () => {
    it('should apply translations and attributes including multiple mappings', () => {
      applyI18n();
      const saveEl = document.querySelector('[data-i18n="common.save"]');
      expect(saveEl?.textContent).toBe('Save Changes');

      const input = document.querySelector('[data-i18n-attr]') as HTMLInputElement;
      expect(input.placeholder).toBe('Save Changes');
      expect(input.title).toBe('Cancel');
    });

    it('should handle missing i18n keys and attributes safely', () => {
      document.body.innerHTML = `
        <div data-i18n="non.existent"></div>
        <div data-i18n-attr="title:non.existent"></div>
        <div data-i18n=""></div>
        <div data-i18n-attr=""></div>
        <div data-i18n-attr="title:"></div>
        <div data-i18n-attr=":non.existent"></div>
      `;
      // Run applyI18n on essentially broken HTML attributes
      applyI18n();
      const el = document.querySelector('[data-i18n="non.existent"]');
      expect(el?.textContent).toBe('non.existent');
    });
  });

  describe('Panel Switching', () => {
    it('should show panels correctly', () => {
      showPanel('form');
      expect(document.getElementById('agent-form-container')?.classList.contains('hidden')).toBe(false);
      showPanel('call');
      expect(document.getElementById('call-panel')?.classList.contains('hidden')).toBe(false);
      showPanel('empty');
      expect(document.getElementById('empty-state')?.classList.contains('hidden')).toBe(false);
      
      // unknown panel
      showPanel('unknown');

      // missing elements
      document.getElementById('agent-form-container')?.remove();
      document.getElementById('call-panel')?.remove();
      document.getElementById('empty-state')?.remove();
      showPanel('form');
      showPanel('call');
      showPanel('empty');
    });
  });

  describe('Call UI State', () => {
    it('should update session state', () => {
      updateCallUI(true);
      expect(document.getElementById('btn-call')?.classList.contains('active')).toBe(true);
      updateCallUI(false);
      expect(document.getElementById('btn-call')?.classList.contains('active')).toBe(false);
      
      document.getElementById('call-icon-start')?.remove();
      updateCallUI(true); // branch missing icon
    });
  });

  describe('Status & Timer', () => {
    it('should set status and timer text', () => {
      setStatus('Ready', 'ready');
      expect(document.getElementById('status-text')?.textContent).toBe('Ready');
      setTimer('05:00');
      expect(document.getElementById('timer')?.textContent).toBe('05:00');

      document.getElementById('status-text')?.remove();
      document.getElementById('status-dot')?.remove();
      document.getElementById('timer')?.remove();
      setStatus('Ready', 'ready');
      setTimer('05:00');
    });
  });
});
