/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api.js', () => ({ api: vi.fn() }));
vi.mock('../utils.js', () => ({
  showToast: vi.fn(),
  escapeHtml: vi.fn((s: string) => s),
}));

import {
  loadTelephonyProviders, showAddProviderForm,
  hideTelephonyForm, handleTelephonySubmit,
  updateProviderFields, initTelephonyPanel,
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
    <select id="tel-provider"><option value="vobiz">Vobiz</option><option value="twilio">Twilio</option></select>
    <select id="tel-direction"><option value="outbound">Outbound</option></select>
    <input id="tel-phone" value="">
    <input id="tel-sip-server" value="">
    <input id="tel-sip-username" value="">
    <input id="tel-sip-password" value="">
    <input id="tel-active" type="checkbox" checked>
    <div id="tel-sip-fields"></div>
    <div id="tel-api-fields" class="hidden"></div>
  `;
}

describe('telephony.js — Branch Coverage', () => {
  beforeEach(() => { vi.clearAllMocks(); setupDOM(); });

  it('handles missing DOM elements', () => {
    document.body.innerHTML = '';
    showAddProviderForm();
    hideTelephonyForm();
    updateProviderFields();
    initTelephonyPanel();
  });

  it('form submit with all SIP fields', async () => {
    (api as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (document.getElementById('tel-name') as HTMLInputElement).value = 'SIP';
    (document.getElementById('tel-phone') as HTMLInputElement).value = '+91';
    (document.getElementById('tel-sip-server') as HTMLInputElement).value = 'sip.x';
    (document.getElementById('tel-sip-username') as HTMLInputElement).value = 'u1';
    (document.getElementById('tel-sip-password') as HTMLInputElement).value = 'p1';
    await handleTelephonySubmit({ preventDefault: vi.fn() } as any);
    const body = JSON.parse((api as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.sipPassword).toBe('p1');
  });

  it('form submit with non-Error throw', async () => {
    (api as ReturnType<typeof vi.fn>).mockRejectedValue('str');
    (document.getElementById('tel-name') as HTMLInputElement).value = 'T';
    await handleTelephonySubmit({ preventDefault: vi.fn() } as any);
    expect(showToast).toHaveBeenCalledWith('str', 'error');
  });

  it('renders inactive twilio provider', async () => {
    (api as ReturnType<typeof vi.fn>).mockResolvedValue([{
      id: 'in1', name: 'Inactive', provider: 'twilio',
      direction: 'inbound', isActive: false, phoneNumber: null, sipServer: null,
    }]);
    await loadTelephonyProviders();
    expect(document.getElementById('telephony-provider-list')?.innerHTML).toContain('Twilio');
  });

  it('covers empty form population branches', async () => {
    (api as ReturnType<typeof vi.fn>).mockResolvedValue([{
      id: 'p2', name: '', provider: '', direction: '',
      isActive: false, phoneNumber: null, sipServer: null, sipUsername: null,
    }]);
    await loadTelephonyProviders();
    showAddProviderForm('p2');
    expect((document.getElementById('tel-name') as HTMLInputElement).value).toBe('');
  });

  it('covers unknown provider/direction labels', async () => {
    (api as ReturnType<typeof vi.fn>).mockResolvedValue([{
      id: 'u1', name: 'U', provider: 'xyz', direction: 'abc',
      isActive: true, phoneNumber: '+1', sipServer: 'sip.x',
    }]);
    await loadTelephonyProviders();
    expect(document.getElementById('telephony-provider-list')?.innerHTML).toContain('xyz');
  });

  it('getVal empty for missing element', async () => {
    document.getElementById('tel-provider')?.remove();
    (document.getElementById('tel-name') as HTMLInputElement).value = 'T';
    await handleTelephonySubmit({ preventDefault: vi.fn() } as any);
    expect(showToast).toHaveBeenCalledWith('Provider name is required', 'error');
  });

  it('getChk returns false for missing element', () => {
    document.getElementById('tel-active')?.remove();
    showAddProviderForm();
  });

  it('setVal/setChk handle missing elements', () => {
    document.body.innerHTML = `
      <div id="telephony-form-container" class="hidden"></div>
      <div id="telephony-list-section"></div>
      <h2 id="telephony-form-title"></h2>
      <span id="telephony-form-submit-text"></span>
    `;
    showAddProviderForm();
  });

  it('submit with empty provider shows error', async () => {
    (document.getElementById('tel-name') as HTMLInputElement).value = 'T';
    (document.getElementById('tel-provider') as HTMLSelectElement).value = '';
    await handleTelephonySubmit({ preventDefault: vi.fn() } as any);
    expect(showToast).toHaveBeenCalledWith('Provider name is required', 'error');
  });

  it('delete non-Error rejection', async () => {
    (api as ReturnType<typeof vi.fn>).mockResolvedValue([{
      id: 'ne1', name: 'NE', provider: 'vobiz', direction: 'outbound', isActive: true,
    }]);
    await loadTelephonyProviders();
    vi.stubGlobal('confirm', vi.fn(() => true));
    (api as ReturnType<typeof vi.fn>).mockRejectedValue({ reason: 'obj' });
    document.querySelector('.btn-delete-provider[data-id="ne1"]')
      ?.dispatchEvent(new Event('click', { bubbles: true }));
    await new Promise((r) => { setTimeout(r, 50); });
    expect(showToast).toHaveBeenCalledWith('[object Object]', 'error');
    vi.unstubAllGlobals();
  });
});
