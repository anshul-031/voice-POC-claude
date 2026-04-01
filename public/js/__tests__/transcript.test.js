// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../constants/config.js';
import { UI_STRINGS } from '../constants/uiStrings.js';
import { escapeHtml, showToast, uint8ToBase64 } from '../utils.js';
import {
  appendDebugLog,
  appendTranscript,
  clearDebugLogs,
  selectVoiceInGrid,
} from '../transcript.js';

describe('frontend transcript utilities', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.spyOn(Date.prototype, 'toLocaleTimeString').mockReturnValue('10:00:00 AM');
  });

  it('creates and appends transcript message with escaped content', () => {
    document.body.innerHTML = `
      <div id="transcript-body">
        <div class="transcript-empty">placeholder</div>
      </div>
    `;

    appendTranscript('user', '<img src=x onerror=alert(1)>hello');

    const body = document.getElementById('transcript-body');
    expect(body).not.toBeNull();
    if (!body) {
      throw new Error('Missing transcript body in test setup');
    }

    const messages = body.querySelectorAll('.transcript-msg');
    expect(messages.length).toBe(1);
    expect(body.querySelector('.transcript-empty')).toBeNull();

    const role = body.querySelector('.transcript-role')?.textContent;
    expect(role).toBe(UI_STRINGS.callPanel.roles.user);

    const bubble = body.querySelector('.transcript-bubble');
    expect(bubble?.querySelector('img')).toBeNull();
    expect(bubble?.textContent).toContain('<img src=x onerror=alert(1)>hello');
    expect(body.querySelector('.transcript-time')?.textContent).toBe('10:00:00 AM');
  });

  it('appends to the last bubble when role is unchanged', () => {
    document.body.innerHTML = '<div id="transcript-body"></div>';

    appendTranscript('agent', 'first ');
    appendTranscript('agent', 'second');

    const body = document.getElementById('transcript-body');
    const messages = body?.querySelectorAll('.transcript-msg');
    expect(messages?.length).toBe(1);
    expect(body?.querySelector('.transcript-bubble')?.textContent).toBe('first second');
  });

  it('handles same-role append when bubble or time elements are missing', () => {
    document.body.innerHTML = `
      <div id="transcript-body">
        <div class="transcript-msg user"></div>
      </div>
    `;

    appendTranscript('user', 'safe update');

    const messages = document.querySelectorAll('.transcript-msg');
    expect(messages.length).toBe(1);
  });

  it('returns early for empty transcript input or missing body', () => {
    appendTranscript('user', '');
    appendTranscript('user', '   ');
    appendTranscript('user', 'value');
    expect(document.querySelector('.transcript-msg')).toBeNull();
  });

  it('selects a matching voice in the voice grid', () => {
    document.body.innerHTML = `
      <div id="voice-grid">
        <label class="voice-option selected"><input type="radio" name="voiceName" value="Puck"></label>
        <label class="voice-option"><input type="radio" name="voiceName" value="Zephyr"></label>
      </div>
    `;

    selectVoiceInGrid('Zephyr');

    const puckLabel = document.querySelector('input[value="Puck"]')?.closest('.voice-option');
    const zephyrInput = /** @type {HTMLInputElement | null} */ (document.querySelector('input[value="Zephyr"]'));
    const zephyrLabel = zephyrInput?.closest('.voice-option');

    expect(puckLabel?.classList.contains('selected')).toBe(false);
    expect(zephyrInput?.checked).toBe(true);
    expect(zephyrLabel?.classList.contains('selected')).toBe(true);
  });

  it('returns early when voice grid is absent or selected voice is unknown', () => {
    selectVoiceInGrid('Any');
    expect(document.querySelector('.voice-option')).toBeNull();

    document.body.innerHTML = `
      <div id="voice-grid">
        <label class="voice-option"><input type="radio" name="voiceName" value="Puck"></label>
      </div>
    `;

    selectVoiceInGrid('Unknown');

    const puckInput = /** @type {HTMLInputElement | null} */ (document.querySelector('input[value="Puck"]'));
    expect(puckInput?.checked).toBe(false);
  });

  it('returns early when matching radio is not wrapped by a voice-option label', () => {
    document.body.innerHTML = `
      <div id="voice-grid">
        <input type="radio" name="voiceName" value="Puck">
      </div>
    `;

    selectVoiceInGrid('Puck');

    const radio = /** @type {HTMLInputElement | null} */ (document.querySelector('input[value="Puck"]'));
    expect(radio?.checked).toBe(true);
  });

  it('appends debug logs and enforces maximum log length', () => {
    document.body.innerHTML = `
      <div id="debug-log-body">
        <div class="debug-log-empty">placeholder</div>
      </div>
    `;

    const previousMax = CONFIG.DEBUG_LOG_MAX_ITEMS;
    CONFIG.DEBUG_LOG_MAX_ITEMS = 2;

    appendDebugLog('first', 'info');
    appendDebugLog('second', 'warn');
    appendDebugLog('third', 'error');

    const body = document.getElementById('debug-log-body');
    const items = body?.querySelectorAll('.debug-log-item');
    expect(body?.querySelector('.debug-log-empty')).toBeNull();
    expect(items?.length).toBe(2);
    expect(items?.[0].textContent).toContain('second');
    expect(items?.[1].textContent).toContain('third');

    CONFIG.DEBUG_LOG_MAX_ITEMS = previousMax;
  });

  it('returns early when debug message is blank or debug body is missing', () => {
    appendDebugLog('', 'info');
    appendDebugLog('   ', 'warn');
    appendDebugLog('value', 'error');
    expect(document.querySelector('.debug-log-item')).toBeNull();
  });

  it('escapes debug log message content', () => {
    document.body.innerHTML = '<div id="debug-log-body"></div>';

    appendDebugLog('<b>danger</b>', 'warn');

    const message = document.querySelector('.debug-log-message');
    expect(message?.querySelector('b')).toBeNull();
    expect(message?.textContent).toContain('<b>danger</b>');
  });

  it('clears debug logs and restores empty state content', () => {
    document.body.innerHTML = `
      <div id="debug-log-body">
        <div class="debug-log-item info">existing</div>
      </div>
    `;

    clearDebugLogs();

    expect(document.querySelector('.debug-log-item')).toBeNull();
    expect(document.querySelector('.debug-log-empty')?.textContent).toBe(UI_STRINGS.callPanel.debugEmpty);
  });

  it('escapes html through utility helper', () => {
    const escaped = escapeHtml('<script>alert(1)</script>');
    expect(escaped).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('creates and removes toast notification', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="toast-container"></div>';

    showToast('hello', 'info');

    const toast = document.querySelector('.toast');
    expect(toast?.textContent).toBe('hello');

    vi.advanceTimersByTime(3000);
    expect((toast instanceof HTMLElement ? toast.style.animation : '')).toContain('slideOutRight');

    vi.advanceTimersByTime(300);
    expect(document.querySelector('.toast')).toBeNull();

    vi.useRealTimers();
  });

  it('returns early when toast container is missing', () => {
    showToast('hello', 'info');
    expect(document.querySelector('.toast')).toBeNull();
  });

  it('converts Uint8Array to base64', () => {
    const result = uint8ToBase64(new Uint8Array([72, 105]));
    expect(result).toBe('SGk=');
  });
});
