/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  initSidebarNavigation, switchSection,
  resetSidebarState,
} from '../sidebar.js';

vi.mock('../telephony.js', () => ({
  loadTelephonyProviders: vi.fn(),
}));

vi.mock('../campaigns.js', () => ({
  loadCampaigns: vi.fn(),
}));

vi.mock('../callHistory.js', () => ({
  loadCallHistory: vi.fn(),
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

  it('lazy-loads campaigns and call history only once each', async () => {
    const { loadCampaigns } = await import('../campaigns.js');
    const { loadCallHistory } = await import('../callHistory.js');
    switchSection('campaigns');
    switchSection('call-history');
    expect(loadCampaigns).toHaveBeenCalledTimes(1);
    expect(loadCallHistory).toHaveBeenCalledTimes(1);
    switchSection('agents');
    switchSection('campaigns');
    switchSection('call-history');
    expect(loadCampaigns).toHaveBeenCalledTimes(1);
    expect(loadCallHistory).toHaveBeenCalledTimes(1);
  });

  it('handles missing section elements', () => {
    document.body.innerHTML = '';
    switchSection('agents');
    switchSection('nonexistent');
    // Should not throw
  });

  describe('Routing', () => {
    let originalPathname: string;
    
    beforeEach(() => {
      originalPathname = window.location.pathname;
      vi.spyOn(window.history, 'pushState');
      vi.spyOn(window.history, 'replaceState');
    });
    
    afterEach(() => {
      Object.defineProperty(window, 'location', {
        value: { pathname: originalPathname },
        writable: true,
      });
      vi.restoreAllMocks();
    });
    
    it('handleInitialRoute matches specific dashboard route', async () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/dashboard/telephony' },
        writable: true,
      });
      const { handleInitialRoute } = await import('../sidebar.js');
      handleInitialRoute();
      expect(window.history.replaceState).toHaveBeenCalledWith({ section: 'telephony' }, '', '/dashboard/telephony');
      expect(document.getElementById('section-telephony')?.classList.contains('hidden')).toBe(false);
    });

    it('handleInitialRoute defaults to agents on base dashboard path', async () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/dashboard' },
        writable: true,
      });
      const { handleInitialRoute } = await import('../sidebar.js');
      handleInitialRoute();
      expect(window.history.replaceState).toHaveBeenCalledWith({ section: 'agents' }, '', '/dashboard/agents');
    });

    it('switchSection uses pushState when requested', () => {
      switchSection('telephony', true);
      expect(window.history.pushState).toHaveBeenCalledWith({ section: 'telephony' }, '', '/dashboard/telephony');
    });

    it('handles popstate event with state', () => {
      initSidebarNavigation();
      const popStateEvent = new PopStateEvent('popstate', { state: { section: 'telephony' } });
      window.dispatchEvent(popStateEvent);
      expect(document.getElementById('section-telephony')?.classList.contains('hidden')).toBe(false);
    });

    it('handles popstate event without state', () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/dashboard/agents' },
        writable: true,
      });
      initSidebarNavigation();
      const popStateEvent = new PopStateEvent('popstate', { state: null });
      window.dispatchEvent(popStateEvent);
      expect(window.history.replaceState).toHaveBeenCalledWith({ section: 'agents' }, '', '/dashboard/agents');
    });
  });
});
