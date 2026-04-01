/**
 * Auth page handler — login, signup, forgot-password, reset-password.
 * Detects which form is present on the page and wires up the appropriate handler.
 */

const API_BASE = '/api/auth';

/**
 * @param {string} text 
 * @param {'error' | 'success'} type 
 */
function showMessage(text, type = 'error') {
  const el = document.getElementById('auth-message');
  if (!el) return;
  el.textContent = text;
  el.className = `auth-message visible ${type}`;
}

function hideMessage() {
  const el = document.getElementById('auth-message');
  if (el) el.className = 'auth-message';
}

/**
 * @param {string} btnId 
 * @param {boolean} loading 
 */
function setLoading(btnId, loading) {
  const btn = /** @type {HTMLButtonElement | null} */ (document.getElementById(btnId));
  if (!btn) return;
  if (loading) {
    btn.classList.add('loading');
    btn.disabled = true;
  } else {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

/**
 * @param {string} endpoint 
 * @param {object} body 
 */
async function apiPost(endpoint, body) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ── Check if already logged in ──
async function checkAuth() {
  try {
    const res = await fetch(`${API_BASE}/me`, { credentials: 'same-origin' });
    if (res.ok) {
      // Already authenticated — redirect to dashboard
      window.location.href = '/index.html';
      return true;
    }
  } catch (_e) { /* not logged in */ }
  return false;
}

// ── Password Strength ──
/** @param {string} password */
function evaluatePassword(password) {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { level: 'weak', text: 'Weak password' };
  if (score <= 2) return { level: 'fair', text: 'Fair password' };
  if (score <= 3) return { level: 'good', text: 'Good password' };
  return { level: 'strong', text: 'Strong password' };
}

/** @param {string} password */
function updateStrengthIndicator(password) {
  const bar = document.getElementById('strength-bar');
  const text = document.getElementById('strength-text');
  if (!bar || !text) return;

  if (!password) {
    bar.className = 'password-strength-bar';
    text.textContent = '';
    return;
  }

  const { level, text: label } = evaluatePassword(password);
  bar.className = `password-strength-bar ${level}`;
  text.textContent = label;
}

// ── Login ──
function initLogin() {
  const form = document.getElementById('login-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideMessage();
    setLoading('login-btn', true);

    const email = /** @type {HTMLInputElement | null} */ (document.getElementById('login-email'))?.value?.trim();
    const password = /** @type {HTMLInputElement | null} */ (document.getElementById('login-password'))?.value;

    if (!email || !password) {
      showMessage('Please fill in all fields');
      setLoading('login-btn', false);
      return;
    }

    try {
      await apiPost('/login', { email, password });
      window.location.href = '/index.html';
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      showMessage(errMsg);
      setLoading('login-btn', false);
    }
  });
}

/**
 * @param {string | undefined} name 
 * @param {string | undefined} email 
 * @param {string | undefined} password 
 * @param {string | undefined} confirm 
 */
function validateSignupData(name, email, password, confirm) {
  if (!name || !email || !password || !confirm) {
    return 'Please fill in all fields';
  }
  if (password.length < 8) {
    return 'Password must be at least 8 characters';
  }
  if (password !== confirm) {
    return 'Passwords do not match';
  }
  return null;
}

// ── Signup ──
function initSignup() {
  const form = document.getElementById('signup-form');
  if (!form) return;

  const passwordInput = document.getElementById('signup-password');
  if (passwordInput) {
    passwordInput.addEventListener('input', (e) => {
      const target = /** @type {HTMLInputElement | null} */ (e.target);
      if (target) updateStrengthIndicator(target.value);
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideMessage();
    setLoading('signup-btn', true);

    const name = /** @type {HTMLInputElement | null} */ (document.getElementById('signup-name'))?.value?.trim();
    const email = /** @type {HTMLInputElement | null} */ (document.getElementById('signup-email'))?.value?.trim();
    const password = /** @type {HTMLInputElement | null} */ (document.getElementById('signup-password'))?.value;
    const confirm = /** @type {HTMLInputElement | null} */ (document.getElementById('signup-confirm'))?.value;

    const error = validateSignupData(name, email, password, confirm);
    if (error) {
      showMessage(error);
      setLoading('signup-btn', false);
      return;
    }

    try {
      await apiPost('/signup', { name, email, password });
      window.location.href = '/index.html';
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      showMessage(errMsg);
      setLoading('signup-btn', false);
    }
  });
}

// ── Forgot Password ──
function initForgot() {
  const form = document.getElementById('forgot-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideMessage();
    setLoading('forgot-btn', true);

    const email = /** @type {HTMLInputElement | null} */ (document.getElementById('forgot-email'))?.value?.trim();
    if (!email) {
      showMessage('Please enter your email address');
      setLoading('forgot-btn', false);
      return;
    }

    try {
      const data = await apiPost('/forgot-password', { email });
      showMessage(data.message, 'success');
      /** @type {HTMLFormElement} */ (form).reset();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      showMessage(errMsg);
    } finally {
      setLoading('forgot-btn', false);
    }
  });
}

// ── Reset Password ──
function initReset() {
  const form = document.getElementById('reset-form');
  if (!form) return;

  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  if (!token) {
    showMessage('Invalid reset link. Please request a new one.');
    const btn = /** @type {HTMLButtonElement | null} */ (document.getElementById('reset-btn'));
    if (btn) btn.disabled = true;
    return;
  }

  const passwordInput = document.getElementById('reset-password');
  if (passwordInput) {
    passwordInput.addEventListener('input', (e) => {
      const target = /** @type {HTMLInputElement | null} */ (e.target);
      if (target) updateStrengthIndicator(target.value);
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideMessage();
    setLoading('reset-btn', true);

    const password = /** @type {HTMLInputElement | null} */ (document.getElementById('reset-password'))?.value;
    const confirm = /** @type {HTMLInputElement | null} */ (document.getElementById('reset-confirm'))?.value;

    if (!password || !confirm) {
      showMessage('Please fill in all fields');
      setLoading('reset-btn', false);
      return;
    }

    if (password.length < 8) {
      showMessage('Password must be at least 8 characters');
      setLoading('reset-btn', false);
      return;
    }

    if (password !== confirm) {
      showMessage('Passwords do not match');
      setLoading('reset-btn', false);
      return;
    }

    try {
      const data = await apiPost('/reset-password', { token, password });
      showMessage(data.message, 'success');
      setTimeout(() => { window.location.href = '/login.html'; }, 2000);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      showMessage(errMsg);
      setLoading('reset-btn', false);
    }
  });
}

// ── Init ──
document.addEventListener('DOMContentLoaded', async () => {
  // If on login/signup page and already authenticated, redirect
  const isAuthPage = document.getElementById('login-form') || document.getElementById('signup-form');
  if (isAuthPage) {
    const alreadyAuth = await checkAuth();
    if (alreadyAuth) return;
  }

  initLogin();
  initSignup();
  initForgot();
  initReset();
});
