/**
 * Sidebar navigation module for the dashboard.
 */
import { loadTelephonyProviders } from './telephony.js';

/** @type {boolean} */
let telephonyLoaded = false;

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
      switchSection(section);
    });
  });
}

/**
 * Switch between dashboard sections.
 * @param {string} sectionName
 * @returns {void}
 */
export function switchSection(sectionName) {
  // Update sidebar active state
  document.querySelectorAll('.sidebar-item').forEach((item) => {
    item.classList.toggle(
      'active',
      /** @type {HTMLElement} */ (item).dataset.section === sectionName,
    );
  });

  // Hide all sections
  const sections = ['agents', 'telephony', 'call-history', 'campaigns'];
  sections.forEach((s) => {
    const el = document.getElementById(`section-${s}`);
    if (el) el.classList.add('hidden');
  });

  // Show selected section
  const target = document.getElementById(`section-${sectionName}`);
  if (target) target.classList.remove('hidden');

  // Lazy-load telephony data on first visit
  if (sectionName === 'telephony' && !telephonyLoaded) {
    telephonyLoaded = true;
    loadTelephonyProviders();
  }
}

/**
 * Reset telephony loaded state (for testing).
 * @returns {void}
 * @internal
 */
export function resetSidebarState() {
  telephonyLoaded = false;
}
