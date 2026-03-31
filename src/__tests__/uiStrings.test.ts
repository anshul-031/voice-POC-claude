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

  it('signaling.logs helper strings should format details', () => {
    expect(UI_STRINGS.signaling.logs.wsClosed(1000)).toBe('Signaling socket closed (1000)');
    expect(UI_STRINGS.signaling.logs.sendingStart('agent-1')).toBe('Sending start-call for agent agent-1');
    expect(UI_STRINGS.signaling.logs.recvType('call-started')).toBe('Received signaling message: call-started');
    expect(UI_STRINGS.signaling.logs.audioRelay(50)).toBe('Relayed 50 audio chunks');
    expect(UI_STRINGS.signaling.logs.startCallFailed('x')).toBe('Start call failed: x');
    expect(UI_STRINGS.signaling.logs.callEnded('done')).toBe('Call ended: done');
    expect(UI_STRINGS.signaling.logs.callError('boom')).toBe('Call error: boom');
    expect(UI_STRINGS.signaling.logs.transcriptUser(12)).toBe('User transcript chunk (12 chars)');
    expect(UI_STRINGS.signaling.logs.transcriptModel(7)).toBe('Model transcript chunk (7 chars)');
    expect(UI_STRINGS.signaling.logs.unknownType('x')).toBe('Unhandled signaling message type: x');
  });
});
