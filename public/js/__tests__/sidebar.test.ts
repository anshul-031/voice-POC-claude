/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  initSidebarNavigation, switchSection,
  resetSidebarState,
} from '../sidebar.js';

vi.mock('../telephony.js', () => ({
  loadTelephonyProviders: vi.fn(),
}));

describe('Sidebar Navigation (sidebar.js)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSidebarState();
    document.body.innerHTML = `
      <button class="sidebar-item" data-section="agents"></button>
      <button class="sidebar-item" data-section="telephony"></button>
      <button class="sidebar-item disabled" data-section="call-history"></button>
      <div id="section-agents"></div>
      <div id="section-telephony" class="hidden"></div>
      <div id="section-call-history" class="hidden"></div>
      <div id="section-campaigns" class="hidden"></div>
    `;
  });

  it('switchSection toggles visibility', () => {
    switchSection('telephony');
    expect(document.getElementById('section-agents')?.classList.contains('hidden')).toBe(true);
    expect(document.getElementById('section-telephony')?.classList.contains('hidden')).toBe(false);

    const telNav = document.querySelector('[data-section="telephony"]');
    expect(telNav?.classList.contains('active')).toBe(true);

    switchSection('agents');
    expect(document.getElementById('section-agents')?.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('section-telephony')?.classList.contains('hidden')).toBe(true);
  });

  it('initSidebarNavigation adds click handlers', () => {
    initSidebarNavigation();
    const telBtn = document.querySelector('.sidebar-item[data-section="telephony"]') as HTMLElement;
    telBtn?.click();
    expect(document.getElementById('section-telephony')?.classList.contains('hidden')).toBe(false);
  });

  it('handles sidebar item without data-section', () => {
    document.body.innerHTML += '<button class="sidebar-item"></button>';
    initSidebarNavigation();
    const btn = document.querySelector('.sidebar-item:not([data-section])') as HTMLElement;
    btn?.click();
    // Should not throw
  });

  it('lazy-loads telephony only once', async () => {
    const { loadTelephonyProviders } = await import('../telephony.js');
    switchSection('telephony');
    expect(loadTelephonyProviders).toHaveBeenCalledTimes(1);
    switchSection('agents');
    switchSection('telephony');
    expect(loadTelephonyProviders).toHaveBeenCalledTimes(1);
  });

  it('handles missing section elements', () => {
    document.body.innerHTML = '';
    switchSection('agents');
    switchSection('nonexistent');
    // Should not throw
  });
});
