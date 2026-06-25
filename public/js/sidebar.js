/**
 * Sidebar navigation module for the dashboard.
 */
import { loadTelephonyProviders } from './telephony.js';
import { loadCampaigns } from './campaigns.js';
import { loadCallHistory } from './callHistory.js';

/** @type {boolean} */
let telephonyLoaded = false;
/** @type {boolean} */
let campaignsLoaded = false;
/** @type {boolean} */
let callHistoryLoaded = false;

const VALID_SECTIONS = ['agents', 'telephony', 'call-history', 'campaigns'];

/**
 * Handle initial route based on URL path.
 * @returns {void}
 */
export function handleInitialRoute() {
  const path = window.location.pathname || '';
  const match = path.match(/^\/dashboard\/([^/]+)/);
  let section = 'agents';
  
  if (match?.[1] && VALID_SECTIONS.includes(match[1])) {
    section = match[1];
    window.history.replaceState({ section }, '', path);
  } else {
    // Default to /dashboard/agents if /dashboard is visited or invalid section
    if (path === '/dashboard' || path === '/dashboard/') {
      window.history.replaceState({ section }, '', `/dashboard/${section}`);
    }
  }
  
  switchSection(section, false);
}

/**
 * Initialize sidebar navigation.
 * @returns {void}
 */
export function initSidebarNavigation() {
  const navItems = document.querySelectorAll('.sidebar-item:not(.disabled)');
  navItems.forEach((item) => {
    item.addEventListener('click', () => {
      const section = /** @type {HTMLElement} */ (item).dataset.section;
      if (!section) return;
      switchSection(section, true);
    });
  });

  window.addEventListener('popstate', (event) => {
    if (event.state?.section) {
      switchSection(event.state.section, false);
    } else {
      handleInitialRoute();
    }
  });

  handleInitialRoute();
}

/**
 * Switch between dashboard sections.
 * @param {string} sectionName
 * @param {boolean} [pushState=false]
 * @returns {void}
 */
export function switchSection(sectionName, pushState = false) {
  if (pushState && VALID_SECTIONS.includes(sectionName)) {
    window.history.pushState({ section: sectionName }, '', `/dashboard/${sectionName}`);
  }

  // Update sidebar active state
  document.querySelectorAll('.sidebar-item').forEach((item) => {
    item.classList.toggle(
      'active',
      /** @type {HTMLElement} */ (item).dataset.section === sectionName,
    );
  });

  // Hide all sections
  VALID_SECTIONS.forEach((s) => {
    const el = document.getElementById(`section-${s}`);
    if (el) el.classList.add('hidden');
  });

  // Show selected section
  const target = document.getElementById(`section-${sectionName}`);
  if (target) target.classList.remove('hidden');

  lazyLoadSection(sectionName);
}

/**
 * Lazy-load a section's data on first visit.
 * @param {string} sectionName
 * @returns {void}
 */
function lazyLoadSection(sectionName) {
  if (sectionName === 'telephony' && !telephonyLoaded) {
    telephonyLoaded = true;
    loadTelephonyProviders();
  }
  if (sectionName === 'campaigns' && !campaignsLoaded) {
    campaignsLoaded = true;
    loadCampaigns();
  }
  if (sectionName === 'call-history' && !callHistoryLoaded) {
    callHistoryLoaded = true;
    loadCallHistory();
  }
}

/**
 * Reset telephony loaded state (for testing).
 * @returns {void}
 * @internal
 */
export function resetSidebarState() {
  telephonyLoaded = false;
  campaignsLoaded = false;
  callHistoryLoaded = false;
}
