import { GEMINI_API_KEYS_SCHEMA } from '../constants/inputSchemas.js';
import type { GeminiKeySelection } from '../types/interfaces.js';
import logger from '../utils/logger.js';

/**
 * Mask an API key for safe logging (only surfacing the last 4 characters).
 */
export const maskApiKey = (key: string): string => {
  if (!key || key.length <= 4) return '****';
  return `...${key.slice(-4)}`;
};

/**
 * Parse a raw environment variable or string/array into a cleaned array of Gemini API keys.
 */
export const parseGeminiApiKeys = (raw?: unknown): string[] => {
  if (!raw) return [];
  const parseResult = GEMINI_API_KEYS_SCHEMA.safeParse(raw);
  if (!parseResult.success) return [];
  return parseResult.data;
};

/**
 * Manages rotation across multiple Gemini API keys using a sequential round-robin strategy.
 */
export class GeminiKeyManager {
  private keys: string[] = [];
  private currentIndex = 0;

  constructor(initialKeys?: unknown) {
    this.setKeys(initialKeys);
  }

  /**
   * Replace the active set of keys and reset the rotation index.
   */
  public setKeys(keysOrRaw?: unknown): void {
    if (Array.isArray(keysOrRaw)) {
      this.keys = parseGeminiApiKeys(keysOrRaw);
    } else if (typeof keysOrRaw === 'string') {
      this.keys = parseGeminiApiKeys(keysOrRaw);
    } else {
      this.keys = [];
    }
    this.currentIndex = 0;
  }

  /**
   * Retrieve the next Gemini API key in round-robin sequence.
   * Throws an Error if no keys are configured.
   */
  public getNextKey(): GeminiKeySelection {
    if (this.keys.length === 0) {
      throw new Error('GEMINI_API_KEY is not defined');
    }
    const index = this.currentIndex;
    const key = this.keys[index];
    this.currentIndex = (this.currentIndex + 1) % this.keys.length;

    logger.debug('Rotated to next Gemini API key', {
      keyIndex: index,
      totalKeys: this.keys.length,
      maskedKey: maskApiKey(key),
    });

    return {
      key,
      index,
      total: this.keys.length,
    };
  }

  /**
   * Returns the total count of configured API keys.
   */
  public getKeyCount(): number {
    return this.keys.length;
  }

  /**
   * Returns a copy of all loaded API keys.
   */
  public getKeys(): string[] {
    return [...this.keys];
  }

  /**
   * Returns whether at least one key is configured.
   */
  public hasKeys(): boolean {
    return this.keys.length > 0;
  }

  /**
   * Returns the current rotation index (next to be selected).
   */
  public getCurrentIndex(): number {
    return this.currentIndex;
  }

  /**
   * Resets the rotation index back to 0.
   */
  public reset(): void {
    this.currentIndex = 0;
  }
}

export const geminiKeyManager = new GeminiKeyManager(
  process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEYS,
);

export default geminiKeyManager;
