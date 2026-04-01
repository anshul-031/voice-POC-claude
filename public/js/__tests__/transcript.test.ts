/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  appendTranscript, selectVoiceInGrid, appendDebugLog, clearDebugLogs, 
  updateTranscript, clearTranscript,
} from '../transcript.js';

describe('Transcript Logic (transcript.js) — 90%+ Exclusive Coverage', () => {
  beforeEach(() => {
    // Mock scrollTo on HTMLElement prototype if not exists
    if (!HTMLElement.prototype.scrollTo) {
      HTMLElement.prototype.scrollTo = vi.fn();
    } else {
      vi.spyOn(HTMLElement.prototype, 'scrollTo').mockImplementation(() => {});
    }
    
    document.body.innerHTML = `
      <div id="transcript-body" style="height: 100px; overflow: auto;">
        <div class="transcript-empty">Empty</div>
      </div>
      <div id="voice-grid">
        <label class="voice-option">
          <input type="radio" name="voiceName" value="Alice" />
        </label>
      </div>
      <div id="debug-log-body">
        <div class="debug-log-empty">No logs</div>
      </div>
      <div id="transcript-content"></div>
      <div id="transcript-container"></div>
    `;
  });

  describe('Transcript Display & Operations', () => {
    it('should append user and model transcripts and handle scroll via scrollTop', () => {
      const body = document.getElementById('transcript-body') as HTMLElement;
      // Mock scrollHeight
      Object.defineProperty(body, 'scrollHeight', { value: 500, configurable: true });
      
      appendTranscript('user', 'Hello Agent');
      expect(body.innerHTML).toContain('Hello Agent');
      expect(body.querySelector('.transcript-empty')).toBeNull();

      appendTranscript('model', 'Hello User');
      const modelMsg = body.querySelector('.transcript-msg.model');
      expect(modelMsg).not.toBeNull();
      expect(modelMsg?.querySelector('.transcript-bubble')?.textContent).toContain('Hello User');
      
      // appendTranscript uses scrollTop
      expect(body.scrollTop).toBe(500);
    });

    it('should handle last bubble merge and empty transcripts', () => {
      appendTranscript('user', 'Part 1');
      appendTranscript('user', ' Part 2');
      const body = document.getElementById('transcript-body');
      const msgs = body?.querySelectorAll('.transcript-msg.user');
      expect(msgs?.length).toBe(1);
      expect(msgs?.[0].querySelector('.transcript-bubble')?.textContent).toBe('Part 1 Part 2');
      
      appendTranscript('user', ' '); // Should be ignored due to trim()
    });

    it('should handle missing elements in transcript functions', () => {
      document.getElementById('transcript-body')?.remove();
      appendTranscript('user', 'Should not crash');
      
      document.getElementById('transcript-container')?.remove();
      updateTranscript('user', 'Should not crash'); // container null branch

      document.getElementById('transcript-content')?.remove();
      updateTranscript('user', 'Should not crash');
      clearTranscript();
    });

    it('should handle updateTranscript and use scrollTo', () => {
      const container = document.getElementById('transcript-container') as HTMLElement;
      Object.defineProperty(container, 'scrollHeight', { value: 600, configurable: true });
      
      updateTranscript('user', 'Test User');
      expect(document.getElementById('transcript-content')?.innerHTML).toContain('Test User');
      expect(container.scrollTo).toHaveBeenCalledWith(0, 600);

      updateTranscript('model', 'Test Agent');
      updateTranscript('system' as unknown as string, 'Test System');
    });
  });

  describe('Debug Logs & Voice Selection', () => {
    it('should append logs with correct classes and handle missing elements', () => {
      appendDebugLog('Log', 'info');
      const body = document.getElementById('debug-log-body');
      expect(body?.querySelector('.debug-log-item.info')).not.toBeNull();
      
      appendDebugLog('Err', 'error');
      expect(body?.querySelector('.debug-log-item.error')).not.toBeNull();
      
      // Hit the max items removal branch
      for (let i = 0; i < 160; i++) {
        appendDebugLog(`Spam Log ${i}`, 'info');
      }
      expect((body?.children.length ?? 0) <= 150).toBe(true);
      
      appendDebugLog('   ', 'info'); // empty string branch
      
      clearDebugLogs();
      expect(body?.querySelector('.debug-log-empty')).not.toBeNull();
      
      document.getElementById('debug-log-body')?.remove();
      appendDebugLog('Any');
      clearDebugLogs();
    });

    it('should handle voice selection edge cases', () => {
      selectVoiceInGrid('Bob'); 
      
      selectVoiceInGrid('Alice'); 
      const radio = document.querySelector('input[name="voiceName"][value="Alice"]') as HTMLInputElement;
      expect(radio.checked).toBe(true);
      expect(radio.closest('.voice-option')?.classList.contains('selected')).toBe(true);
      
      // Inject an isolated radio button without .voice-option
      document.getElementById('voice-grid')?.insertAdjacentHTML('beforeend', '<input type="radio" name="voiceName" value="Isolated" />');
      selectVoiceInGrid('Isolated');

      document.getElementById('voice-grid')?.remove();
      selectVoiceInGrid('Alice');
    });
  });
});
