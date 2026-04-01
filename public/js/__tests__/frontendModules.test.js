// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api, checkApiHealth } from '../api.js';
import { CONFIG } from '../constants/config.js';
import { UI_STRINGS } from '../constants/uiStrings.js';
import { renderAgentList, renderModelSelect, renderVoiceGrid } from '../render.js';
import { applyI18n, showPanel, updateCallUI } from '../ui.js';

describe('frontend modules coverage', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('validates API helper success and error paths', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const success = await api('/health');
    expect(success).toEqual({ ok: true });

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'boom' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await expect(api('/agents')).rejects.toThrow('boom');

    fetchMock.mockResolvedValueOnce(new Response('not-json', { status: 500 }));
    await expect(api('/agents')).rejects.toThrow(UI_STRINGS.api.errors.genericRequestFailed);

    await expect(api('bad-path')).rejects.toThrow(UI_STRINGS.api.errors.invalidInput);
  });

  it('updates API health indicator for connected and disconnected states', async () => {
    document.body.innerHTML = '<div id="api-status"></div><div id="api-status-text"></div>';
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await checkApiHealth();

    const dot = document.getElementById('api-status');
    const text = document.getElementById('api-status-text');
    expect(dot?.className).toBe('status-dot connected');
    expect(text?.textContent).toBe(UI_STRINGS.header.apiStatus.connected);

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'down' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await checkApiHealth();
    expect(dot?.className).toBe('status-dot error');
    expect(text?.textContent).toBe(UI_STRINGS.header.apiStatus.disconnected);
  });

  it('returns early from checkApiHealth when DOM elements are missing', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await checkApiHealth();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders voice and model controls and handles voice selection', () => {
    document.body.innerHTML = '<div id="voice-grid"></div><select id="form-model"></select>';

    renderVoiceGrid([
      { id: CONFIG.DEFAULT_VOICE, name: 'Default', description: 'Default voice' },
      { id: 'Zephyr', name: 'Zephyr', description: 'Alt voice' },
    ]);

    const options = document.querySelectorAll('.voice-option');
    expect(options.length).toBe(2);
    const zephyr = options[1];
    zephyr.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(zephyr.classList.contains('selected')).toBe(true);

    renderModelSelect([{ id: 'm1', name: 'Model 1', description: 'Desc' }]);
    const select = document.getElementById('form-model');
    expect(select?.innerHTML).toContain('Model 1');

    renderVoiceGrid([{ id: 'Only', name: 'Only', description: 'One' }]);
    renderModelSelect([{ id: 'm2', name: 'Model 2', description: 'Desc 2' }]);
  });

  it('returns early in render helpers when target containers are missing', () => {
    renderVoiceGrid([{ id: 'Puck', name: 'Puck', description: 'd' }]);
    renderModelSelect([{ id: 'm', name: 'Model', description: 'd' }]);
    renderAgentList([], null, vi.fn(), vi.fn(), vi.fn(), vi.fn());
    expect(document.body.innerHTML).toBe('');
  });

  it('renders agent list and wires callbacks for card actions', () => {
    document.body.innerHTML = '<div id="agent-list"></div>';

    const onSelect = vi.fn();
    const onTestCall = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    renderAgentList([], null, onSelect, onTestCall, onEdit, onDelete);
    expect(document.getElementById('agent-list')?.textContent).toContain(UI_STRINGS.agentList.empty.title);

    renderAgentList(
      [
        {
          id: 'a1',
          name: '<b>Alice</b>',
          voiceName: 'Puck',
          systemPrompt: '<img src=x onerror=1>',
        },
      ],
      'a1',
      onSelect,
      onTestCall,
      onEdit,
      onDelete,
    );

    const card = document.querySelector('.agent-card');
    expect(card?.classList.contains('active')).toBe(true);
    expect(document.querySelector('.agent-card-name b')).toBeNull();

    card?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.querySelector('.btn-test-call')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.querySelector('.btn-edit-agent')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.querySelector('.btn-delete-agent')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onSelect).toHaveBeenCalledWith('a1');
    expect(onTestCall).toHaveBeenCalledWith('a1');
    expect(onEdit).toHaveBeenCalledWith('a1');
    expect(onDelete).toHaveBeenCalledWith('a1');
  });

  it('skips renderAgentList callbacks when dataset id is missing', () => {
    document.body.innerHTML = '<div id="agent-list"></div>';
    const onSelect = vi.fn();
    const onTestCall = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    renderAgentList(
      [{ id: 'x1', name: 'Agent', voiceName: 'Puck', systemPrompt: 'Prompt' }],
      null,
      onSelect,
      onTestCall,
      onEdit,
      onDelete,
    );

    const card = document.querySelector('.agent-card');
    const testBtn = document.querySelector('.btn-test-call');
    const editBtn = document.querySelector('.btn-edit-agent');
    const deleteBtn = document.querySelector('.btn-delete-agent');

    card?.removeAttribute('data-id');
    testBtn?.removeAttribute('data-id');
    editBtn?.removeAttribute('data-id');
    deleteBtn?.removeAttribute('data-id');

    card?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    testBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    editBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    deleteBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onSelect).not.toHaveBeenCalled();
    expect(onTestCall).not.toHaveBeenCalled();
    expect(onEdit).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('applies i18n, switches panels, and updates call button UI', () => {
    const requireEl = (/** @type {string} */ id) => {
      const element = document.getElementById(id);
      if (!element) {
        throw new Error(`Missing test element: ${id}`);
      }
      return element;
    };

    document.body.innerHTML = `
      <h1 id="title" data-i18n="header.title"></h1>
      <input id="name" data-i18n-attr="placeholder:form.namePlaceholder">
      <div id="empty-state"></div>
      <div id="agent-form-container"></div>
      <div id="call-panel"></div>
      <button id="btn-call"></button>
      <span id="call-icon-start"></span>
      <span id="call-icon-end" class="hidden"></span>
    `;

    applyI18n();
    expect(requireEl('title').textContent).toBe(UI_STRINGS.header.title);
    expect(requireEl('name').getAttribute('placeholder')).toBe(UI_STRINGS.form.namePlaceholder);

    showPanel('form');
    expect(requireEl('agent-form-container').classList.contains('hidden')).toBe(false);
    showPanel('call');
    expect(requireEl('call-panel').classList.contains('hidden')).toBe(false);
    showPanel('empty');
    expect(requireEl('empty-state').classList.contains('hidden')).toBe(false);

    updateCallUI(true);
    expect(requireEl('btn-call').classList.contains('active')).toBe(true);
    expect(requireEl('call-icon-start').classList.contains('hidden')).toBe(true);
    expect(requireEl('call-icon-end').classList.contains('hidden')).toBe(false);

    updateCallUI(false);
    expect(requireEl('btn-call').classList.contains('active')).toBe(false);
    expect(requireEl('call-icon-start').classList.contains('hidden')).toBe(false);
    expect(requireEl('call-icon-end').classList.contains('hidden')).toBe(true);
  });

  it('handles missing UI elements for updateCallUI and showPanel safely', () => {
    showPanel('unknown');
    updateCallUI(true);
    expect(document.body.innerHTML).toBe('');
  });

  it('ignores empty and malformed i18n mappings', () => {
    document.body.innerHTML = `
      <div id="empty-key" data-i18n="">x</div>
      <input id="bad-attr" data-i18n-attr="invalidformat" value="x">
    `;

    applyI18n();

    expect(document.getElementById('empty-key')?.textContent).toBe('x');
    expect(document.getElementById('bad-attr')?.getAttribute('invalidformat')).toBeNull();
  });

  it('does not write i18n values when resolved value is not a string', () => {
    document.body.innerHTML = `
      <div id="fn-text" data-i18n="toasts.callStarted">keep</div>
      <div id="fn-attr" data-i18n-attr="title:toasts.callStarted"></div>
    `;

    applyI18n();

    expect(document.getElementById('fn-text')?.textContent).toBe('keep');
    expect(document.getElementById('fn-attr')?.getAttribute('title')).toBeNull();
  });

  it('handles missing panel elements and empty i18n-attr mappings', () => {
    document.body.innerHTML = `
      <div id="empty-state"></div>
      <div id="blank-attr" data-i18n-attr=""></div>
    `;

    applyI18n();
    showPanel('form');
    showPanel('call');

    expect(document.getElementById('blank-attr')?.attributes.length).toBe(2);
    expect(document.getElementById('empty-state')?.classList.contains('hidden')).toBe(true);
  });

});
