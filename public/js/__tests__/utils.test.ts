/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { escapeHtml, showToast, uint8ToBase64, whitelabelModelName } from '../utils.js';

describe('Frontend Utils', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });

  describe('escapeHtml', () => {
    it('should escape HTML special characters', () => {
      const input = '<script>alert("xss")</script> & "quote"';
      const expected = '&lt;script&gt;alert("xss")&lt;/script&gt; &amp; "quote"';
      expect(escapeHtml(input)).toBe(expected);
    });
  });

  describe('showToast', () => {
    it('should create and append a toast element', () => {
      document.body.innerHTML = '<div id="toast-container"></div>';
      showToast('test message', 'success');
      
      const toast = document.querySelector('.toast.success');
      expect(toast).not.toBeNull();
      expect(toast?.textContent).toBe('test message');
    });

    it('should remove the toast after timeout', () => {
      document.body.innerHTML = '<div id="toast-container"></div>';
      showToast('test message');
      
      const toast = document.querySelector('.toast');
      expect(toast).not.toBeNull();
      
      vi.advanceTimersByTime(3300); // 3000ms + 300ms animation
      expect(document.querySelector('.toast')).toBeNull();
    });

    it('should do nothing if container is missing', () => {
      showToast('no container');
      expect(document.querySelector('.toast')).toBeNull();
    });
  });

  describe('uint8ToBase64', () => {
    it('should convert Uint8Array to base64 string', () => {
      const input = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      const expected = btoa('Hello');
      expect(uint8ToBase64(input)).toBe(expected);
    });
  });

  describe('whitelabelModelName', () => {
    it('should replace gemini prefix in display names and ids', () => {
      expect(whitelabelModelName('Gemini 3.1 Flash Live (Preview)', 'AnshulTheGreat.com'))
        .toBe('AnshulTheGreat.com 3.1 Flash Live (Preview)');
      expect(whitelabelModelName('gemini-3.1-flash-lite-preview', 'AnshulTheGreat.com'))
        .toBe('AnshulTheGreat.com-3.1-flash-lite-preview');
    });

    it('should return empty string for empty model labels', () => {
      expect(whitelabelModelName('   ', 'AnshulTheGreat.com')).toBe('');
    });

    it('should keep model label unchanged when website name is empty', () => {
      expect(whitelabelModelName('Custom Live Model', '   ')).toBe('Custom Live Model');
    });
  });
});
