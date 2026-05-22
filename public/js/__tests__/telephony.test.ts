/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock api module
vi.mock('../api.js', () => ({
  api: vi.fn(),
}));

// Mock utils module
vi.mock('../utils.js', () => ({
  showToast: vi.fn(),
  escapeHtml: vi.fn((s) => s),
}));

import {
  loadTelephonyProviders,
  showAddProviderForm,
  hideTelephonyForm,
  handleTelephonySubmit,
  updateProviderFields,
  initTelephonyPanel,
} from '../telephony.js';
import { api } from '../api.js';
import { showToast } from '../utils.js';

function setupDOM() {
  document.body.innerHTML = `
    <div id="telephony-provider-list"></div>
    <div id="telephony-list-section"></div>
    <div id="telephony-form-container" class="hidden"></div>
    <h2 id="telephony-form-title"></h2>
    <span id="telephony-form-submit-text"></span>
    <form id="telephony-form"></form>
    <button id="btn-add-provider"></button>
    <button id="btn-cancel-telephony"></button>
    <input id="tel-name" value="">
    <select id="tel-provider">
      <option value="vobiz">Vobiz</option>
      <option value="twilio">Twilio</option>
    </select>
    <select id="tel-direction">
      <option value="outbound">Outbound</option>
    </select>
    <input id="tel-phone" value="">
    <input id="tel-sip-server" value="">
    <input id="tel-sip-username" value="">
    <input id="tel-sip-password" value="">
    <input id="tel-active" type="checkbox" checked>
    <div id="tel-sip-fields"></div>
    <div id="tel-api-fields" class="hidden"></div>
  `;
}

describe('telephony.js', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDOM();
  });

  it('loadTelephonyProviders renders empty', async () => {
    const apiMock = api as any;
    apiMock.mockResolvedValue([]);
    await loadTelephonyProviders();
    const list = document.getElementById('telephony-provider-list');
    expect(list?.innerHTML).toContain('No telephony providers');
  });

  it('loadTelephonyProviders renders cards', async () => {
    const apiMock = api as any;
    apiMock.mockResolvedValue([{
      id: '1',
      name: 'Test Line',
      provider: 'vobiz',
      direction: 'outbound',
      isActive: true,
      phoneNumber: '+91123',
      sipServer: 'sip.test.com',
    }]);
    await loadTelephonyProviders();
    const list = document.getElementById('telephony-provider-list');
    expect(list?.innerHTML).toContain('Test Line');
    expect(list?.innerHTML).toContain('Vobiz');
  });

  it('loadTelephonyProviders handles error', async () => {
    const apiMock = api as any;
    apiMock.mockRejectedValue(new Error('fail'));
    await loadTelephonyProviders();
    expect(showToast).toHaveBeenCalled();
  });

  it('showAddProviderForm shows form', () => {
    showAddProviderForm();
    const form = document.getElementById('telephony-form-container');
    const list = document.getElementById('telephony-list-section');
    expect(form?.classList.contains('hidden')).toBe(false);
    expect(list?.classList.contains('hidden')).toBe(true);
  });

  it('showAddProviderForm with edit populates', async () => {
    const apiMock = api as any;
    apiMock.mockResolvedValue([{
      id: 'p1',
      name: 'Edit Me',
      provider: 'vobiz',
      direction: 'outbound',
      isActive: true,
      phoneNumber: '+91',
      sipServer: 'sip.x.com',
      sipUsername: 'user1',
    }]);
    await loadTelephonyProviders();
    showAddProviderForm('p1');
    const nameInput = document.getElementById('tel-name') as HTMLInputElement;
    expect(nameInput.value).toBe('Edit Me');
  });

  it('showAddProviderForm with missing id does nothing', async () => {
    const apiMock = api as any;
    apiMock.mockResolvedValue([]);
    await loadTelephonyProviders();
    showAddProviderForm('nonexistent');
    // should not crash
  });

  it('hideTelephonyForm hides form', () => {
    showAddProviderForm();
    hideTelephonyForm();
    const form = document.getElementById('telephony-form-container');
    const list = document.getElementById('telephony-list-section');
    expect(form?.classList.contains('hidden')).toBe(true);
    expect(list?.classList.contains('hidden')).toBe(false);
  });

  it('updateProviderFields shows SIP for vobiz', () => {
    const select = document.getElementById('tel-provider') as HTMLSelectElement;
    select.value = 'vobiz';
    updateProviderFields();
    const sipFields = document.getElementById('tel-sip-fields');
    const apiFields = document.getElementById('tel-api-fields');
    expect(sipFields?.classList.contains('hidden')).toBe(false);
    expect(apiFields?.classList.contains('hidden')).toBe(true);
  });

  it('updateProviderFields hides SIP for twilio', () => {
    const select = document.getElementById('tel-provider') as HTMLSelectElement;
    select.value = 'twilio';
    updateProviderFields();
    const sipFields = document.getElementById('tel-sip-fields');
    const apiFields = document.getElementById('tel-api-fields');
    expect(sipFields?.classList.contains('hidden')).toBe(true);
    expect(apiFields?.classList.contains('hidden')).toBe(false);
  });

  it('handleTelephonySubmit validates name', async () => {
    const event = { preventDefault: vi.fn() } as any;
    await handleTelephonySubmit(event);
    expect(showToast).toHaveBeenCalledWith(
      'Provider name is required',
      'error',
    );
  });

  it('handleTelephonySubmit creates provider', async () => {
    const apiMock = api as any;
    apiMock.mockResolvedValue({});

    const nameInput = document.getElementById('tel-name') as HTMLInputElement;
    nameInput.value = 'New Provider';

    const event = { preventDefault: vi.fn() } as any;
    await handleTelephonySubmit(event);
    expect(apiMock).toHaveBeenCalledWith(
      '/telephony',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining('added'),
      'success',
    );
  });

  it('handleTelephonySubmit updates provider', async () => {
    const apiMock = api as any;
    apiMock.mockResolvedValue([{
      id: 'p1',
      name: 'E',
      provider: 'vobiz',
      direction: 'outbound',
      isActive: true,
    }]);
    await loadTelephonyProviders();
    showAddProviderForm('p1');

    const nameInput = document.getElementById('tel-name') as HTMLInputElement;
    nameInput.value = 'Updated';

    apiMock.mockResolvedValue({});
    const event = { preventDefault: vi.fn() } as any;
    await handleTelephonySubmit(event);
    expect(apiMock).toHaveBeenCalledWith(
      '/telephony/p1',
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('handleTelephonySubmit handles error', async () => {
    const apiMock = api as any;
    apiMock.mockRejectedValue(new Error('fail'));

    const nameInput = document.getElementById('tel-name') as HTMLInputElement;
    nameInput.value = 'New';

    const event = { preventDefault: vi.fn() } as any;
    await handleTelephonySubmit(event);
    expect(showToast).toHaveBeenCalledWith('fail', 'error');
  });

  it('initTelephonyPanel attaches listeners', () => {
    initTelephonyPanel();
    // Should not throw
    const addBtn = document.getElementById('btn-add-provider');
    expect(addBtn).toBeTruthy();
  });

  it('edit and delete buttons work via card', async () => {
    const apiMock = api as any;
    apiMock.mockResolvedValue([{
      id: 'del1',
      name: 'Delete Me',
      provider: 'vobiz',
      direction: 'outbound',
      isActive: false,
      phoneNumber: null,
      sipServer: null,
    }]);
    await loadTelephonyProviders();

    // Test edit button
    const editBtn = document.querySelector(
      '.btn-edit-provider[data-id="del1"]',
    );
    expect(editBtn).toBeTruthy();
    editBtn?.dispatchEvent(new Event('click', { bubbles: true }));

    // Test delete button (confirm = false)
    vi.stubGlobal('confirm', vi.fn(() => false));
    const deleteBtn = document.querySelector(
      '.btn-delete-provider[data-id="del1"]',
    );
    expect(deleteBtn).toBeTruthy();
    deleteBtn?.dispatchEvent(new Event('click', { bubbles: true }));

    // Test delete button (confirm = true)
    vi.stubGlobal('confirm', vi.fn(() => true));
    apiMock.mockResolvedValueOnce(undefined);
    apiMock.mockResolvedValueOnce([]);
    deleteBtn?.dispatchEvent(new Event('click', { bubbles: true }));
    vi.unstubAllGlobals();
  });

  it('delete handles API error', async () => {
    const apiMock = api as any;
    apiMock.mockResolvedValue([{
      id: 'err1',
      name: 'Error',
      provider: 'vobiz',
      direction: 'outbound',
      isActive: true,
    }]);
    await loadTelephonyProviders();

    vi.stubGlobal('confirm', vi.fn(() => true));
    apiMock.mockRejectedValue(new Error('del fail'));

    const deleteBtn = document.querySelector(
      '.btn-delete-provider[data-id="err1"]',
    );
    deleteBtn?.dispatchEvent(new Event('click', { bubbles: true }));

    // Wait for async
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    expect(showToast).toHaveBeenCalledWith('del fail', 'error');
    vi.unstubAllGlobals();
  });
});
