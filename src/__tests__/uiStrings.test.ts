import { describe, it, expect } from 'vitest';
import { UI_STRINGS } from '../constants/uiStrings.js';
import { DEFAULT_WEBSITE_NAME } from '../constants/index.js';

describe('UI_STRINGS', () => {
  it('should have a title', () => {
    expect(UI_STRINGS.header.title).toBe(DEFAULT_WEBSITE_NAME);
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
    expect(UI_STRINGS.toasts.callStartFailed('network')).toBe('Failed to start call: network');
    expect(UI_STRINGS.signaling.errors.wsConnectTimeout).toBe('Signaling connection timed out');
    expect(UI_STRINGS.signaling.errors.micAccessTimeout).toBe('Microphone access timed out');
    expect(UI_STRINGS.signaling.logs.callRunId('run-1')).toBe('Call run ID: run-1');
    expect(UI_STRINGS.signaling.logs.startupBegin).toBe('Startup sequence started');
    expect(UI_STRINGS.signaling.logs.startupComplete(100)).toBe('Startup sequence completed in 100ms');
    expect(UI_STRINGS.signaling.logs.startupFailed(245)).toBe('Startup failed after 245ms');
    expect(UI_STRINGS.signaling.logs.micRequesting).toBe('Requesting microphone access');
    expect(UI_STRINGS.signaling.logs.micReadyElapsed(12)).toBe('Microphone ready in 12ms');
    expect(UI_STRINGS.signaling.logs.wsOpenElapsed(56)).toBe('Signaling socket connected in 56ms');
    expect(UI_STRINGS.signaling.logs.wsTimeout(10000)).toBe('Signaling socket open timeout after 10000ms');
    expect(UI_STRINGS.signaling.logs.startSentElapsed(66)).toBe('start-call sent in 66ms');
    expect(UI_STRINGS.signaling.logs.firstAudioRelayElapsed(90)).toBe('First audio chunk relayed in 90ms');
    expect(UI_STRINGS.signaling.logs.firstInboundAudioElapsed(120)).toBe('First inbound audio received in 120ms');
    expect(UI_STRINGS.signaling.logs.firstInboundTranscriptElapsed(150)).toBe('First inbound transcript in 150ms');
    expect(UI_STRINGS.signaling.logs.firstPlaybackElapsed(133)).toBe('First playback started in 133ms');
    expect(UI_STRINGS.signaling.logs.modelInactivityWarn(5000)).toBe('No model response for 5s after last user audio');
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
    expect(UI_STRINGS.signaling.logs.audioQueueDepth(5)).toBe('Audio queue depth: 5');
    expect(UI_STRINGS.signaling.logs.audioChunkRelayedSize(1024)).toBe('Audio chunk relayed: 1024 bytes');
    expect(UI_STRINGS.signaling.status.inactivityNudge(2, 4)).toBe('Model silent — sending nudge 2/4');
    expect(UI_STRINGS.signaling.status.autoEndInactivity).toBe('Call ended automatically due to prolonged model inactivity.');
    expect(UI_STRINGS.signaling.status.autoEndDuration(30)).toBe('Call ended automatically — max duration of 30s reached.');
  });
});
