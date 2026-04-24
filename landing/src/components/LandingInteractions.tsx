'use client';

import { useEffect, useCallback } from 'react';

/**
 * Returns the nav scroll theme colors based on the current theme.
 */
function getNavScrollThemeColors(): {
  idleBackground: string;
  activeBackground: string;
  activeShadow: string;
} {
  const isLightTheme =
    document.documentElement.getAttribute('data-theme') === 'light';

  if (isLightTheme) {
    return {
      idleBackground: 'rgba(255, 255, 255, 0.78)',
      activeBackground: 'rgba(255, 255, 255, 0.92)',
      activeShadow: '0 4px 24px rgba(15, 23, 42, 0.12)',
    };
  }

  return {
    idleBackground: 'rgba(10, 10, 18, 0.7)',
    activeBackground: 'rgba(10, 10, 18, 0.92)',
    activeShadow: '0 4px 30px rgba(0, 0, 0, 0.3)',
  };
}

/**
 * Animates stat counter numbers by counting up from 0.
 */
function animateCounters(): void {
  const counters = document.querySelectorAll('.stat-number');
  counters.forEach((counter) => {
    const text = counter.textContent;
    if (!text) return;
    if (text.includes('/') || text.includes('<')) return;

    const target = parseInt(text, 10);
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

/**
 * Client component providing scroll reveal, smooth scrolling,
 * nav scroll effect, and animated stat counters for the landing page.
 */
export default function LandingInteractions(): null {
  const initScrollReveal = useCallback((): void => {
    if (typeof IntersectionObserver === 'undefined') {
      document
        .querySelectorAll('.reveal')
        .forEach((el) => el.classList.add('visible'));
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
      { threshold: 0.1, rootMargin: '0px 0px -60px 0px' }
    );

    revealElements.forEach((el) => revealObserver.observe(el));
  }, []);

  const initSmoothScrolling = useCallback((): void => {
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener('click', (e) => {
        e.preventDefault();
        const href = (anchor as HTMLAnchorElement).getAttribute('href');
        if (!href) return;
        const target = document.querySelector(href);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }, []);

  const initNavScrollEffect = useCallback((): void => {
    const nav = document.getElementById('landing-nav');
    if (!nav) return;

    window.addEventListener(
      'scroll',
      () => {
        const scrollY = window.scrollY;
        const navColors = getNavScrollThemeColors();
        if (scrollY > 80) {
          nav.style.background = navColors.activeBackground;
          nav.style.boxShadow = navColors.activeShadow;
        } else {
          nav.style.background = navColors.idleBackground;
          nav.style.boxShadow = 'none';
        }
      },
      { passive: true }
    );
  }, []);

  const initStatsAnimation = useCallback((): void => {
    const statsSection = document.querySelector('.stats-bar');
    if (!statsSection) return;

    const statsObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          animateCounters();
          statsObserver.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    statsObserver.observe(statsSection);
  }, []);

  useEffect(() => {
    initScrollReveal();
    initSmoothScrolling();
    initNavScrollEffect();
    initStatsAnimation();
  }, [
    initScrollReveal,
    initSmoothScrolling,
    initNavScrollEffect,
    initStatsAnimation,
  ]);

  return null;
}
