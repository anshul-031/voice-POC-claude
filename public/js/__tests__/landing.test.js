// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

class FakeObserver {
  /** @type {any[]} */
  static instances = [];

  /** @param {(entries: any[]) => void} callback */
  constructor(callback) {
    this.callback = callback;
    this.observe = vi.fn();
    this.unobserve = vi.fn();
    this.disconnect = vi.fn();
    FakeObserver.instances.push(this);
  }
}

const importLandingModule = async () => {
  await import('../landing.js');
};

describe('landing page module', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    FakeObserver.instances = [];
    vi.restoreAllMocks();
    vi.resetModules();
    vi.stubGlobal('IntersectionObserver', /** @type {any} */ (FakeObserver));
  });

  it('wires reveal observers and smooth scrolling', async () => {
    document.body.innerHTML = `
      <nav id="landing-nav"></nav>
      <a id="jump" href="#target">Jump</a>
      <section id="target"></section>
      <div class="reveal" id="r1"></div>
      <div class="reveal" id="r2"></div>
      <section class="stats-bar"></section>
      <div class="stat-number">150+</div>
      <div class="stat-number">24/7</div>
      <div class="stat-number"><100ms</div>
    `;

    const target = document.getElementById('target');
    if (!target) {
      throw new Error('Missing target section in test setup');
    }
    target.scrollIntoView = vi.fn();

    await importLandingModule();

    expect(FakeObserver.instances.length).toBe(2);
    const revealObserver = FakeObserver.instances[0];
    expect(revealObserver.observe).toHaveBeenCalledTimes(2);

    const firstReveal = document.getElementById('r1');
    if (!firstReveal) {
      throw new Error('Missing reveal element in test setup');
    }

    revealObserver.callback([{ isIntersecting: true, target: firstReveal }]);
    expect(firstReveal.classList.contains('visible')).toBe(true);
    expect(revealObserver.unobserve).toHaveBeenCalledWith(firstReveal);

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    document.getElementById('jump')?.dispatchEvent(clickEvent);
    expect(target.scrollIntoView).toHaveBeenCalled();

    const nav = document.getElementById('landing-nav');
    Object.defineProperty(window, 'scrollY', { value: 120, configurable: true });
    window.dispatchEvent(new Event('scroll'));
    expect(nav instanceof HTMLElement ? nav.style.boxShadow : '').toContain('0 4px');

    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    window.dispatchEvent(new Event('scroll'));
    expect(nav instanceof HTMLElement ? nav.style.boxShadow : '').toBe('none');
  });

  it('animates numeric counters when stats section becomes visible', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <section class="stats-bar"></section>
      <div class="stat-number">42+</div>
      <div class="reveal" id="only-reveal"></div>
    `;

    await importLandingModule();

    const statsObserver = FakeObserver.instances[1];
    const statsBar = document.querySelector('.stats-bar');
    if (!statsBar) {
      throw new Error('Missing stats section in test setup');
    }

    statsObserver.callback([{ isIntersecting: true, target: statsBar }]);
    vi.advanceTimersByTime(1500);

    expect(document.querySelector('.stat-number')?.textContent).toBe('42+');
    expect(statsObserver.disconnect).toHaveBeenCalled();
    vi.useRealTimers();
  });
});