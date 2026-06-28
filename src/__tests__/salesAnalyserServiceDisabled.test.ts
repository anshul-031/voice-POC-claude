import { describe, it, expect, vi, afterEach } from 'vitest';

// Integration disabled at the environment level (no SALES_ANALYSER_URL).
vi.mock('../constants/config.js', () => ({
  SALES_ANALYSER_URL: null,
}));

vi.mock('../lib/prisma.js', () => ({
  default: {
    voiceAgent: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock('../services/r2Storage.js', () => ({
  getSignedRecordingUrl: vi.fn(),
}));

import { triggerCallAnalysis } from '../services/salesAnalyserService.js';
import prisma from '../lib/prisma.js';

describe('salesAnalyserService when SALES_ANALYSER_URL is unset', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('no-ops without touching the database or network', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await triggerCallAnalysis({
      id: 'c1',
      sessionId: 's1',
      agentId: 'a1',
      userId: 'u1',
      phoneNumber: null,
      recordingKey: 'recordings/x.wav',
      recordingMimeType: 'audio/wav',
    });

    expect((prisma as any).voiceAgent.findUnique).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
