/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { animateCounters, initLanding } from '../landing.js';

describe('Landing Page Logic (landing.js) — 90%+ Exclusive Coverage', () => {
  let observerCallbacks: any[] = [];
  let mockObserve: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockObserve = vi.fn();
    observerCallbacks = [];
    
    class MockObserver {
      constructor(cb: any) {
        observerCallbacks.push(cb);
      }
      observe = mockObserve;
      unobserve = vi.fn();
      disconnect = vi.fn();
    }
    vi.stubGlobal('IntersectionObserver', MockObserver);

    document.body.innerHTML = `
      <div id="landing-nav" style="background: rgba(10, 10, 18, 0.7)"></div>
      <section class="stats-bar">
        <div class="stat-number">100</div>
        <div class="stat-number">50%</div>
        <div class="stat-number">Non-numeric string</div>
        <div class="stat-number"></div>
        <div class="stat-number">10/10</div>
        <div class="stat-number">&lt;span&gt;10&lt;/span&gt;</div>
      </section>
      <a href="#test-section">Anchor</a>
      <a id="no-href-anchor">No Href</a>
      <div id="test-section"></div>
      <div class="reveal">Reveal Item</div>
    `;
  });

  describe('Scroll Reveal & Initialization', () => {
    it('should initialize and observe elements', () => {
      initLanding();
      expect(mockObserve).toHaveBeenCalled();
      
      const revealEl = document.querySelector('.reveal') as HTMLElement;
      
      // Trigger callbacks
      observerCallbacks.forEach(cb => {
        cb([{ isIntersecting: true, target: revealEl }]);
        cb([{ isIntersecting: false, target: revealEl }]);
      });
      
      expect(revealEl.classList.contains('visible')).toBe(true);
    });

    it('should handle missing nav and stats bar', () => {
      document.getElementById('landing-nav')?.remove();
      document.querySelector('.stats-bar')?.remove();
      initLanding(); 
    });

    it('should execute init on DOMContentLoaded', () => {
      document.dispatchEvent(new Event('DOMContentLoaded'));
      expect(mockObserve).toHaveBeenCalled();
    });
  });

  describe('Counter Animation', () => {
    it('should animate numeric counters and suffixes', () => {
      animateCounters();
      const stats = document.querySelectorAll('.stat-number');
      vi.advanceTimersByTime(2000);
      expect(stats[0].textContent).toBe('100');
      expect(stats[1].textContent).toBe('50%');
    });
  });

  describe('Scroll & Click Interactions', () => {
    it('should trigger scroll background changes', () => {
      initLanding();
      const nav = document.getElementById('landing-nav');
      if (nav) {
        vi.stubGlobal('scrollY', 100);
        window.dispatchEvent(new Event('scroll'));
        expect(nav.style.background).toContain('rgba(10, 10, 18, 0.92)');
        
        vi.stubGlobal('scrollY', 0);
        window.dispatchEvent(new Event('scroll'));
        expect(nav.style.background).toContain('rgba(10, 10, 18, 0.7)');
      }
    });

    it('should use light nav colors when data-theme is light', () => {
      document.documentElement.setAttribute('data-theme', 'light');
      initLanding();

      const nav = document.getElementById('landing-nav');
      if (nav) {
        vi.stubGlobal('scrollY', 100);
        window.dispatchEvent(new Event('scroll'));
        expect(nav.style.background).toContain('rgba(255, 255, 255, 0.92)');

        vi.stubGlobal('scrollY', 0);
        window.dispatchEvent(new Event('scroll'));
        expect(nav.style.background).toContain('rgba(255, 255, 255, 0.78)');
      }
    });

    it('should handle smooth scrolling clicks', () => {
      initLanding();
      const anchor = document.querySelector('a[href="#test-section"]') as HTMLAnchorElement;
      const target = document.getElementById('test-section');
      if (target) target.scrollIntoView = vi.fn();
      
      anchor.click();
      expect(target?.scrollIntoView).toHaveBeenCalled();

      target?.remove();
      anchor.click(); 

      // Anchor without href
      const noHrefAnchor = document.getElementById('no-href-anchor') as HTMLAnchorElement;
      noHrefAnchor.addEventListener('click', (e) => e.preventDefault());
      noHrefAnchor.click();
    });
  });
});
