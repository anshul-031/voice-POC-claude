/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  showMessage, hideMessage, setLoading, apiPost, checkAuth, 
  evaluatePassword, updateStrengthIndicator, validateSignupData,
  initReset, initAuth,
} from '../auth.js';

describe('Auth Logic (auth.js) — 90%+ Exclusive Coverage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('location', { href: '', search: '' });
    
    document.body.innerHTML = `
      <div id="auth-message"></div>
      <form id="login-form">
        <input id="login-email" value="test@test.com" />
        <input id="login-password" value="password123" />
        <button id="login-btn">Login</button>
      </form>
      <form id="signup-form">
        <input id="signup-name" value="Test User" />
        <input id="signup-email" value="test@test.com" />
        <input id="signup-password" value="password123" />
        <input id="signup-confirm" value="password123" />
        <div id="strength-bar"></div>
        <div id="strength-text"></div>
        <button id="signup-btn">Signup</button>
      </form>
      <form id="forgot-form">
        <input id="forgot-email" value="test@test.com" />
        <button id="forgot-btn">Forgot</button>
      </form>
      <form id="reset-form">
        <input id="reset-password" value="newpassword123" />
        <input id="reset-confirm" value="newpassword123" />
        <button id="reset-btn">Reset</button>
      </form>
    `;
    initAuth();
  });

  describe('Utility/Visual Functions', () => {
    it('should show and hide messages with different types', () => {
      showMessage('Test Error', 'error');
      const el = document.getElementById('auth-message');
      expect(el?.className).toContain('error');
      expect(el?.textContent).toBe('Test Error');

      showMessage('Success', 'success');
      expect(el?.className).toContain('success');
      expect(el?.textContent).toBe('Success');

      hideMessage();
      expect(el?.className).toBe('auth-message');
      
      document.body.innerHTML = '';
      showMessage('no error path');
      hideMessage();
    });

    it('should handle setLoading for non-existent buttons', () => {
      setLoading('non-existent', true);
    });

    it('should setLoading correctly', () => {
      const btn = document.getElementById('login-btn') as HTMLButtonElement;
      setLoading('login-btn', true);
      expect(btn.classList.contains('loading')).toBe(true);
      expect(btn.disabled).toBe(true);
      
      setLoading('login-btn', false);
      expect(btn.classList.contains('loading')).toBe(false);
      expect(btn.disabled).toBe(false);
    });
  });

  describe('Password Strength & Validation', () => {
    it('should evaluate all levels of password strength', () => {
      expect(evaluatePassword('short').level).toBe('weak');
      expect(evaluatePassword('password').level).toBe('weak');
      expect(evaluatePassword('password123').level).toBe('fair');
      expect(evaluatePassword('Password123').level).toBe('good');
      expect(evaluatePassword('Password123!').level).toBe('strong');
    });

    it('should update indicators for empty and strong passwords', () => {
      updateStrengthIndicator('');
      expect(document.getElementById('strength-text')?.textContent).toBe('');
      
      updateStrengthIndicator('Password111!');
      expect(document.getElementById('strength-text')?.textContent).toBe('Strong password');
      
      document.body.innerHTML = '';
      updateStrengthIndicator('any');
    });

    it('should handle all signup validation branches', () => {
      expect(validateSignupData('', 'e', 'p', 'p')).toBe('Please fill in all fields');
      expect(validateSignupData('n', 'e', 'short', 'short')).toBe('Password must be at least 8 characters');
      expect(validateSignupData('n', 'e', 'longpassword', 'mismatch')).toBe('Passwords do not match');
      expect(validateSignupData('n', 'e', 'longpassword', 'longpassword')).toBe(null);
    });
  });

  describe('API Operations', () => {
    it('should handle checkAuth redirect and fail cases', async () => {
      vi.mocked(fetch).mockResolvedValue({ ok: true } as unknown as Response);
      await checkAuth();
      expect(window.location.href).toBe('/dashboard');
      
      vi.mocked(fetch).mockRejectedValue(new Error('Network fail'));
      const result = await checkAuth();
      expect(result).toBe(false);
    });

    it('should handle apiPost JSON errors', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Fail' }),
      } as unknown as Response);

      await expect(apiPost('/test', {})).rejects.toThrow('Fail');
    });

    it('should fallback to generic error in apiPost', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        json: async () => ({}),
      } as unknown as Response);

      await expect(apiPost('/test', {})).rejects.toThrow('Request failed');
    });
  });

  describe('Form Handlers & Initialization Logic', () => {
    it('should fail login if fields missing', async () => {
      (document.getElementById('login-email') as HTMLInputElement).value = '';
      document.getElementById('login-form')?.dispatchEvent(new Event('submit'));
      expect(document.getElementById('auth-message')?.textContent).toBe('Please fill in all fields');
    });

    it('should handle login error path', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Invalid creds' }),
      } as unknown as Response);
      
      document.getElementById('login-form')?.dispatchEvent(new Event('submit'));
      await vi.waitFor(() => {
        expect(document.getElementById('auth-message')?.textContent).toBe('Invalid creds');
      });
    });

    it('should handle login success path', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ message: 'ok' }),
      } as unknown as Response);
      
      document.getElementById('login-form')?.dispatchEvent(new Event('submit'));
      await vi.waitFor(() => {
        expect(window.location.href).toBe('/dashboard');
      });
    });

    it('should ignore init if forms are missing', () => {
      document.body.innerHTML = ''; // clear forms
      initAuth(); // Should gracefully return from initLogin, initSignup, etc.
    });

    it('should handle non-Error throw in login', async () => {
      vi.mocked(fetch).mockRejectedValue('string error');
      document.getElementById('login-form')?.dispatchEvent(new Event('submit'));
      await vi.waitFor(() => {
        expect(document.getElementById('auth-message')?.textContent).toBe('string error');
      });
    });

    it('should fail signup if fields missing', () => {
      (document.getElementById('signup-name') as HTMLInputElement).value = '';
      document.getElementById('signup-form')?.dispatchEvent(new Event('submit'));
      expect(document.getElementById('auth-message')?.textContent).toBe('Please fill in all fields');
    });

    it('should update strength indicator on signup password input', () => {
      const input = document.getElementById('signup-password') as HTMLInputElement;
      input.value = 'StrongPass123!';
      input.dispatchEvent(new Event('input'));
      expect(document.getElementById('strength-text')?.textContent).toBe('Strong password');
    });

    it('should handle signup error path', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Already exists' }),
      } as unknown as Response);
      
      (document.getElementById('signup-name') as HTMLInputElement).value = 'A';
      document.getElementById('signup-form')?.dispatchEvent(new Event('submit'));
      await vi.waitFor(() => {
        expect(document.getElementById('auth-message')?.textContent).toBe('Already exists');
      });
    });

    it('should handle non-Error throw in signup', async () => {
      vi.mocked(fetch).mockRejectedValue('string fail');
      (document.getElementById('signup-name') as HTMLInputElement).value = 'A';
      document.getElementById('signup-form')?.dispatchEvent(new Event('submit'));
      await vi.waitFor(() => {
        expect(document.getElementById('auth-message')?.textContent).toBe('string fail');
      });
    });

    it('should handle signup success path', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ message: 'ok' }),
      } as unknown as Response);
      
      document.getElementById('signup-form')?.dispatchEvent(new Event('submit'));
      await vi.waitFor(() => {
        expect(window.location.href).toBe('/dashboard');
      });
    });

    it('should fail forgot if email missing', async () => {
      (document.getElementById('forgot-email') as HTMLInputElement).value = '';
      document.getElementById('forgot-form')?.dispatchEvent(new Event('submit'));
      expect(document.getElementById('auth-message')?.textContent).toBe('Please enter your email address');
    });

    it('should handle forgot error path', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'No user' }),
      } as unknown as Response);
      
      document.getElementById('forgot-form')?.dispatchEvent(new Event('submit'));
      await vi.waitFor(() => {
        expect(document.getElementById('auth-message')?.textContent).toBe('No user');
      });
    });

    it('should handle forgot success path', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ message: 'Success sent' }),
      } as unknown as Response);
      
      document.getElementById('forgot-form')?.dispatchEvent(new Event('submit'));
      await vi.waitFor(() => {
        expect(document.getElementById('auth-message')?.textContent).toBe('Success sent');
      });
    });

    it('should fail reset if fields missing or mismatch', async () => {
      vi.stubGlobal('location', { search: '?token=tok', href: '' });
      initReset();
      (document.getElementById('reset-password') as HTMLInputElement).value = '';
      document.getElementById('reset-form')?.dispatchEvent(new Event('submit'));
      expect(document.getElementById('auth-message')?.textContent).toBe('Please fill in all fields');

      (document.getElementById('reset-password') as HTMLInputElement).value = 'short';
      document.getElementById('reset-form')?.dispatchEvent(new Event('submit'));
      expect(document.getElementById('auth-message')?.textContent).toBe('Password must be at least 8 characters');

      (document.getElementById('reset-password') as HTMLInputElement).value = 'longpassword';
      (document.getElementById('reset-confirm') as HTMLInputElement).value = 'mismatch';
      document.getElementById('reset-form')?.dispatchEvent(new Event('submit'));
      expect(document.getElementById('auth-message')?.textContent).toBe('Passwords do not match');
    });

    it('should update strength indicator on reset password input', () => {
      vi.stubGlobal('location', { search: '?token=tok', href: '' });
      initReset();
      const input = document.getElementById('reset-password') as HTMLInputElement;
      input.value = 'StrongPass123!';
      input.dispatchEvent(new Event('input'));
      expect(document.getElementById('strength-text')?.textContent).toBe('Strong password');
    });

    it('should handle reset API error path', async () => {
      vi.stubGlobal('location', { search: '?token=tok', href: '' });
      initReset();
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Token expired' }),
      } as unknown as Response);

      (document.getElementById('reset-password') as HTMLInputElement).value = 'longpassword';
      (document.getElementById('reset-confirm') as HTMLInputElement).value = 'longpassword';
      document.getElementById('reset-form')?.dispatchEvent(new Event('submit'));
      
      await vi.waitFor(() => {
        expect(document.getElementById('auth-message')?.textContent).toBe('Token expired');
      });
    });

    it('should handle reset missing token', async () => {
      vi.stubGlobal('location', { search: '', href: '' });
      initReset();
      expect(document.getElementById('auth-message')?.textContent).toContain('Invalid reset link');
    });

    it('should handle reset success with timer redirect', async () => {
      vi.stubGlobal('location', { search: '?token=tok', href: '' });
      initReset();
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ message: 'Success' }),
      } as unknown as Response);

      document.getElementById('reset-form')?.dispatchEvent(new Event('submit'));
      await vi.waitFor(() => {
        expect(document.getElementById('auth-message')?.textContent).toBe('Success');
      });

      vi.advanceTimersByTime(2500);
      expect(window.location.href).toBe('/login');
    });
  });
});
