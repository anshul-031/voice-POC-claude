import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  GeminiKeyManager,
  maskApiKey,
  parseGeminiApiKeys,
  geminiKeyManager,
} from '../services/geminiKeyManager.js';

describe('GeminiKeyManager & Key Rotation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('maskApiKey', () => {
    it('should mask keys correctly', () => {
      expect(maskApiKey('AIzaSyD123456789')).toBe('...6789');
      expect(maskApiKey('1234')).toBe('****');
      expect(maskApiKey('12')).toBe('****');
      expect(maskApiKey('')).toBe('****');
      // @ts-expect-error test undefined
      expect(maskApiKey(undefined)).toBe('****');
    });
  });

  describe('parseGeminiApiKeys', () => {
    it('should return empty array for falsy values', () => {
      expect(parseGeminiApiKeys('')).toEqual([]);
      expect(parseGeminiApiKeys(undefined)).toEqual([]);
      expect(parseGeminiApiKeys(null)).toEqual([]);
    });

    it('should parse single key without commas', () => {
      expect(parseGeminiApiKeys('test-key-1')).toEqual(['test-key-1']);
      expect(parseGeminiApiKeys('  test-key-1  ')).toEqual(['test-key-1']);
    });

    it('should parse multiple comma-separated keys and trim whitespace', () => {
      const raw = 'key1, key2 ,  key3\n, key4\t';
      expect(parseGeminiApiKeys(raw)).toEqual(['key1', 'key2', 'key3', 'key4']);
    });

    it('should filter out empty tokens and commas', () => {
      const raw = ',,key1,,,  ,key2,,';
      expect(parseGeminiApiKeys(raw)).toEqual(['key1', 'key2']);
    });

    it('should accept an array of strings directly', () => {
      expect(parseGeminiApiKeys(['key1', 'key2'])).toEqual(['key1', 'key2']);
    });

    it('should return empty array for invalid non-string non-array types', () => {
      expect(parseGeminiApiKeys(123)).toEqual([]);
      expect(parseGeminiApiKeys({})).toEqual([]);
    });
  });

  describe('GeminiKeyManager class', () => {
    it('should initialize with empty keys when none provided', () => {
      const manager = new GeminiKeyManager();
      expect(manager.getKeyCount()).toBe(0);
      expect(manager.hasKeys()).toBe(false);
      expect(manager.getKeys()).toEqual([]);
      expect(manager.getCurrentIndex()).toBe(0);
    });

    it('should initialize with a single key', () => {
      const manager = new GeminiKeyManager('key1');
      expect(manager.getKeyCount()).toBe(1);
      expect(manager.hasKeys()).toBe(true);
      expect(manager.getKeys()).toEqual(['key1']);

      const first = manager.getNextKey();
      expect(first).toEqual({ key: 'key1', index: 0, total: 1 });
      const second = manager.getNextKey();
      expect(second).toEqual({ key: 'key1', index: 0, total: 1 });
    });

    it('should initialize with comma-separated keys and rotate round-robin', () => {
      const manager = new GeminiKeyManager('keyA, keyB, keyC');
      expect(manager.getKeyCount()).toBe(3);
      expect(manager.getKeys()).toEqual(['keyA', 'keyB', 'keyC']);

      // Rotation sequence: 0 -> 1 -> 2 -> 0 -> 1 ...
      expect(manager.getNextKey()).toEqual({ key: 'keyA', index: 0, total: 3 });
      expect(manager.getCurrentIndex()).toBe(1);

      expect(manager.getNextKey()).toEqual({ key: 'keyB', index: 1, total: 3 });
      expect(manager.getCurrentIndex()).toBe(2);

      expect(manager.getNextKey()).toEqual({ key: 'keyC', index: 2, total: 3 });
      expect(manager.getCurrentIndex()).toBe(0);

      expect(manager.getNextKey()).toEqual({ key: 'keyA', index: 0, total: 3 });
      expect(manager.getCurrentIndex()).toBe(1);
    });

    it('should support array input in setKeys and reset index', () => {
      const manager = new GeminiKeyManager('key1, key2');
      manager.getNextKey();
      expect(manager.getCurrentIndex()).toBe(1);

      manager.setKeys(['newKey1', 'newKey2', 'newKey3']);
      expect(manager.getCurrentIndex()).toBe(0);
      expect(manager.getKeyCount()).toBe(3);
      expect(manager.getNextKey()).toEqual({ key: 'newKey1', index: 0, total: 3 });
    });

    it('should handle resetting rotation index', () => {
      const manager = new GeminiKeyManager('key1, key2');
      manager.getNextKey(); // advances to index 1
      expect(manager.getCurrentIndex()).toBe(1);
      manager.reset();
      expect(manager.getCurrentIndex()).toBe(0);
      expect(manager.getNextKey().index).toBe(0);
    });

    it('should throw error when getNextKey is called with no keys', () => {
      const manager = new GeminiKeyManager();
      expect(() => manager.getNextKey()).toThrow('GEMINI_API_KEY is not defined');
    });

    it('should handle setKeys with empty or invalid input', () => {
      const manager = new GeminiKeyManager('key1');
      manager.setKeys(undefined);
      expect(manager.getKeyCount()).toBe(0);
      expect(manager.hasKeys()).toBe(false);
    });

    it('should export a default instance', () => {
      expect(geminiKeyManager).toBeInstanceOf(GeminiKeyManager);
    });
  });
});
