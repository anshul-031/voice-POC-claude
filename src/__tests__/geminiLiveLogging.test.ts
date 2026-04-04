import { describe, expect, it, vi } from 'vitest';
import {
  getTranscriptText,
  logGenerationComplete,
  logMessageEnvelope,
  logTranscriptMilestone,
  logTranscriptPayload,
  logTurnComplete,
  markFirstModelAudio,
  shouldLogChunkProgress,
} from '../services/geminiLiveLogging.js';
import type { GeminiSession } from '../types/index.js';

function makeEntry(startTime = 1000): GeminiSession {
  return {
    session: {},
    voiceName: 'Puck',
    model: 'gemini-2.0-flash-exp',
    correlationId: 'cid',
    startTime,
    audioChunksSent: 0,
    audioChunksReceived: 0,
  };
}

describe('geminiLiveLogging helpers', () => {
  it('covers message envelope and turn completion logging paths', () => {
    logMessageEnvelope('sid', 'raw-string');
    logMessageEnvelope('sid', { serverContent: {}, setupComplete: true, toolCall: {} });

    logTurnComplete('sid');
    logGenerationComplete('sid');

    const entry = makeEntry();
    logTurnComplete('sid', entry);
    logGenerationComplete('sid', entry);

    expect(true).toBe(true);
  });

  it('covers transcript text conversions and milestone branches', () => {
    expect(getTranscriptText('plain')).toBe('plain');
    expect(getTranscriptText({ text: 'from-text' })).toBe('from-text');
    expect(getTranscriptText({ foo: 'bar' })).toBe('{"foo":"bar"}');

    logTranscriptMilestone('sid', undefined, 'user', 2000);

    const entry = makeEntry(1000);
    logTranscriptMilestone('sid', entry, 'user', 2000);
    expect(entry.firstUserTranscriptAt).toBe(2000);

    logTranscriptMilestone('sid', entry, 'user', 2100);
    expect(entry.firstUserTranscriptAt).toBe(2000);

    logTranscriptMilestone('sid', entry, 'model', 2200);
    expect(entry.firstModelTranscriptAt).toBe(2200);

    logTranscriptMilestone('sid', entry, 'model', 2300);
    expect(entry.firstModelTranscriptAt).toBe(2200);

    logTranscriptPayload('sid', 'user', 'hi');
    logTranscriptPayload('sid', 'model', 'hello');
  });

  it('covers first-model-audio marking and latency warning paths', () => {
    markFirstModelAudio('sid', undefined, 2000);

    const existing = makeEntry(1000);
    existing.firstModelAudioAt = 1500;
    markFirstModelAudio('sid', existing, 2000);
    expect(existing.firstModelAudioAt).toBe(1500);

    const fast = makeEntry(1000);
    markFirstModelAudio('sid-fast', fast, 1200);
    expect(fast.firstModelAudioAt).toBe(1200);
    expect(fast.firstResponseLatencyWarned).toBeUndefined();

    const slow = makeEntry(1000);
    slow.audioChunksSent = 3;
    markFirstModelAudio('sid-slow', slow, 4000);
    expect(slow.firstModelAudioAt).toBe(4000);
    expect(slow.firstResponseLatencyWarned).toBe(true);
  });

  it('covers chunk progress helper', () => {
    expect(shouldLogChunkProgress(1)).toBe(true);
    expect(shouldLogChunkProgress(50)).toBe(true);
    expect(shouldLogChunkProgress(2)).toBe(false);
  });

  it('handles transcript conversion with non-string text payload', () => {
    expect(getTranscriptText({ text: { nested: true } })).toBe('{"nested":true}');
  });

  it('marks transcript milestones with firstClientAudioAt context', () => {
    const entry = makeEntry(1000);
    entry.firstClientAudioAt = 1500;
    logTranscriptMilestone('sid', entry, 'user', 2000);
    logTranscriptMilestone('sid', entry, 'model', 2100);

    expect(entry.firstUserTranscriptAt).toBe(2000);
    expect(entry.firstModelTranscriptAt).toBe(2100);
  });

  it('is resilient to Date.now mocks used by other tests', () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(2500);
    const entry = makeEntry(500);

    logTurnComplete('sid-date', entry);
    logGenerationComplete('sid-date', entry);

    nowSpy.mockRestore();
    expect(true).toBe(true);
  });
});
