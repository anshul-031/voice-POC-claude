import { describe, it, expect } from 'vitest';
import { UI_STRINGS } from '../constants/uiStrings.js';

describe('UI_STRINGS', () => {
  it('should have a title', () => {
    expect(UI_STRINGS.header.title).toBe('VoiceForge');
  });

  it('agentList.card.createdAt should format dates', () => {
    const date = '2026-03-29T12:00:00Z';
    const formatted = UI_STRINGS.agentList.card.createdAt(date);
    expect(formatted).toContain('2026');
    expect(formatted).toMatch(/Mar 29/);
  });

  it('toasts.callStarted should replace placeholders', () => {
    const name = 'Test Agent';
    const msg = UI_STRINGS.toasts.callStarted(name);
    expect(msg).toBe('Call started with Test Agent');
  });

  it('signaling.errors.unknownMessageType should replace placeholders', () => {
    const type = 'magic-message';
    const msg = UI_STRINGS.signaling.errors.unknownMessageType(type);
    expect(msg).toBe('Unknown message type: magic-message');
  });
});
