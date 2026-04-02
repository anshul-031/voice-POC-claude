/**
 * Landing page interactions — scroll reveals, smooth scrolling, nav scroll effect.
 */

// ── Scroll Reveal ──
export function initLanding() {
  if (typeof IntersectionObserver === 'undefined') {
    document.querySelectorAll('.reveal').forEach((el) => el.classList.add('visible'));
    return;
  }
  const revealElements = document.querySelectorAll('.reveal');
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -60px 0px' },
  );

  revealElements.forEach((el) => revealObserver.observe(el));

  // ── Smooth Scrolling for Anchor Links ──
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      e.preventDefault();
      const href = anchor.getAttribute('href');
      if (!href) return;
      const target = document.querySelector(href);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // ── Nav Background on Scroll ──
  const nav = document.getElementById('landing-nav');
  if (nav) {
    window.addEventListener('scroll', () => {
      const scrollY = window.scrollY;
      if (scrollY > 80) {
        nav.style.background = 'rgba(10, 10, 18, 0.92)';
        nav.style.boxShadow = '0 4px 30px rgba(0, 0, 0, 0.3)';
      } else {
        nav.style.background = 'rgba(10, 10, 18, 0.7)';
        nav.style.boxShadow = 'none';
      }
    }, { passive: true });
  }

  // ── Animated Counter Trigger ──
  const statsSection = document.querySelector('.stats-bar');
  if (statsSection) {
    const statsObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          animateCounters();
          statsObserver.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    statsObserver.observe(statsSection);
  }
}

// ── Animated Counter ──
export function animateCounters() {
  const counters = document.querySelectorAll('.stat-number');
  counters.forEach((counter) => {
    const text = counter.textContent;
    if (!text) return;
    // Skip non-numeric stats
    if (text.includes('/') || text.includes('<')) return;

    const target = parseInt(text);
    if (isNaN(target)) return;

    const suffix = text.replace(/[0-9]/g, '');
    let current = 0;
    const increment = target / 40;
    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        counter.textContent = text;
        clearInterval(timer);
      } else {
        counter.textContent = Math.floor(current) + suffix;
      }
    }, 30);
  });
}

// Auto-init on DOMContentLoaded
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', initLanding);
  if (document.readyState !== 'loading') {
    initLanding();
  }
}
