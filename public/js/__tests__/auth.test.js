// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

/** @param {string} url */
const setLocation = (url) => {
  const location = new URL(url);
  Object.defineProperty(window, 'location', {
    value: {
      href: location.href,
      search: location.search,
    },
    configurable: true,
    writable: true,
  });
};

const importAuthModule = async () => {
  await import('../auth.js');
};

describe('auth page module smoke coverage', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('initializes login and signup flows without runtime errors', async () => {
    document.body.innerHTML = `
      <form id="login-form"></form>
      <input id="login-email">
      <input id="login-password" type="password">
      <button id="login-btn"></button>
      <form id="signup-form"></form>
      <input id="signup-name">
      <input id="signup-email">
      <input id="signup-password" type="password">
      <input id="signup-confirm" type="password">
      <button id="signup-btn"></button>
      <div id="auth-message"></div>
      <div id="strength-bar" class="password-strength-bar"></div>
      <div id="strength-text"></div>
    `;

    setLocation('https://example.com/login.html');
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await importAuthModule();
    document.dispatchEvent(new Event('DOMContentLoaded'));

    const passwordInput = /** @type {HTMLInputElement} */ (document.getElementById('signup-password'));
    passwordInput.value = 'Password123!';
    passwordInput.dispatchEvent(new Event('input', { bubbles: true }));

    document.getElementById('login-form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    document.getElementById('signup-form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalled();
  });

  it('initializes forgot and reset flows with and without token', async () => {
    document.body.innerHTML = `
      <form id="forgot-form"></form>
      <input id="forgot-email">
      <button id="forgot-btn"></button>
      <form id="reset-form"></form>
      <input id="reset-password" type="password">
      <input id="reset-confirm" type="password">
      <button id="reset-btn"></button>
      <div id="auth-message"></div>
      <div id="strength-bar" class="password-strength-bar"></div>
      <div id="strength-text"></div>
    `;

    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    setLocation('https://example.com/reset-password.html?token=abc123');
    await importAuthModule();
    document.dispatchEvent(new Event('DOMContentLoaded'));

    const forgotEmail = /** @type {HTMLInputElement} */ (document.getElementById('forgot-email'));
    const resetPassword = /** @type {HTMLInputElement} */ (document.getElementById('reset-password'));
    const resetConfirm = /** @type {HTMLInputElement} */ (document.getElementById('reset-confirm'));

    forgotEmail.value = 'user@example.com';
    resetPassword.value = 'Password123!';
    resetConfirm.value = 'Password123!';

    document.getElementById('forgot-form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    document.getElementById('reset-form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalled();

    vi.resetModules();
    setLocation('https://example.com/reset-password.html');
    await importAuthModule();
    document.dispatchEvent(new Event('DOMContentLoaded'));

    const resetButton = /** @type {HTMLButtonElement} */ (document.getElementById('reset-btn'));
    expect(resetButton.disabled).toBe(true);
  });
});