import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../constants/config.js', () => ({
  SALES_ANALYSER_URL: 'http://analyser.test',
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

import { triggerCallAnalysis, type CallAnalysisContext } from '../services/salesAnalyserService.js';
import prisma from '../lib/prisma.js';
import { getSignedRecordingUrl } from '../services/r2Storage.js';

const mockFindAgent = (prisma as any).voiceAgent.findUnique as ReturnType<typeof vi.fn>;
const mockFindUser = (prisma as any).user.findUnique as ReturnType<typeof vi.fn>;
const mockSign = getSignedRecordingUrl as unknown as ReturnType<typeof vi.fn>;

function makeCall(overrides: Partial<CallAnalysisContext> = {}): CallAnalysisContext {
  return {
    id: 'c1',
    sessionId: 's1',
    agentId: 'a1',
    userId: 'u1',
    phoneNumber: '+910000000000',
    recordingKey: 'recordings/x.wav',
    recordingMimeType: 'audio/wav',
    ...overrides,
  };
}

function fetchResponse(
  ok: boolean,
  status: number,
  body: Record<string, unknown>,
  opts: { jsonThrows?: boolean } = {},
) {
  return {
    ok,
    status,
    json: opts.jsonThrows
      ? () => Promise.reject(new Error('not json'))
      : () => Promise.resolve(body),
  };
}

describe('salesAnalyserService.triggerCallAnalysis', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    // Sensible defaults for the happy path; individual tests override.
    mockFindAgent.mockResolvedValue({ callAnalysisEnabled: true, analysisTemplateName: 'QA Template' });
    mockFindUser.mockResolvedValue({ salesAnalyserEmail: 'a@b.com', salesAnalyserPassword: 'pw' });
    mockSign.mockResolvedValue('https://signed.example.com/rec.wav?sig=1');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('no-ops when the recording key is missing', async () => {
    await triggerCallAnalysis(makeCall({ recordingKey: null }));
    expect(mockFindAgent).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('no-ops when agentId or userId is missing', async () => {
    await triggerCallAnalysis(makeCall({ agentId: null }));
    await triggerCallAnalysis(makeCall({ userId: null }));
    expect(mockFindAgent).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('no-ops when the agent is not found', async () => {
    mockFindAgent.mockResolvedValue(null);
    await triggerCallAnalysis(makeCall());
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('no-ops when call analysis is disabled on the agent', async () => {
    mockFindAgent.mockResolvedValue({ callAnalysisEnabled: false, analysisTemplateName: 'QA' });
    await triggerCallAnalysis(makeCall());
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('no-ops when the agent has no template name', async () => {
    mockFindAgent.mockResolvedValue({ callAnalysisEnabled: true, analysisTemplateName: null });
    await triggerCallAnalysis(makeCall());
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('no-ops (with a warning) when credentials are not configured', async () => {
    mockFindUser.mockResolvedValue({ salesAnalyserEmail: null, salesAnalyserPassword: null });
    await triggerCallAnalysis(makeCall());
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('no-ops when the recording URL cannot be signed', async () => {
    mockSign.mockResolvedValue(null);
    await triggerCallAnalysis(makeCall());
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('aborts when login fails (non-ok response)', async () => {
    fetchSpy.mockResolvedValueOnce(fetchResponse(false, 401, { message: 'bad creds' }));
    await triggerCallAnalysis(makeCall());
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('aborts when login returns no token', async () => {
    fetchSpy.mockResolvedValueOnce(fetchResponse(true, 200, { user: {} }));
    await triggerCallAnalysis(makeCall());
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('submits the recording for analysis on the happy path', async () => {
    fetchSpy
      .mockResolvedValueOnce(fetchResponse(true, 200, { token: 'jwt-123' }))
      .mockResolvedValueOnce(fetchResponse(true, 202, { uploadId: 'up-1' }));

    await triggerCallAnalysis(makeCall());

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const [loginUrl, loginInit] = fetchSpy.mock.calls[0];
    expect(loginUrl).toBe('http://analyser.test/api/auth/login');
    expect(JSON.parse(loginInit.body)).toEqual({ email: 'a@b.com', password: 'pw' });

    const [analyzeUrl, analyzeInit] = fetchSpy.mock.calls[1];
    expect(analyzeUrl).toBe('http://analyser.test/api/external/analyze');
    expect(analyzeInit.headers.Authorization).toBe('Bearer jwt-123');
    const analyzeBody = JSON.parse(analyzeInit.body);
    expect(analyzeBody).toMatchObject({
      recordingUrl: 'https://signed.example.com/rec.wav?sig=1',
      templateName: 'QA Template',
      mimeType: 'audio/wav',
      phoneNumber: '+910000000000',
      externalId: 's1',
    });
  });

  it('logs an error when the analyze request fails (with an error body)', async () => {
    fetchSpy
      .mockResolvedValueOnce(fetchResponse(true, 200, { token: 'jwt' }))
      .mockResolvedValueOnce(fetchResponse(false, 400, { error: 'no params' }));
    await triggerCallAnalysis(makeCall());
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('handles an analyze failure with no error field and omits optional metadata', async () => {
    fetchSpy
      .mockResolvedValueOnce(fetchResponse(true, 200, { token: 'jwt' }))
      .mockResolvedValueOnce(fetchResponse(false, 500, {}));
    await triggerCallAnalysis(makeCall({ recordingMimeType: null, phoneNumber: null }));
    const analyzeBody = JSON.parse(fetchSpy.mock.calls[1][1].body);
    expect(analyzeBody.mimeType).toBeUndefined();
    expect(analyzeBody.phoneNumber).toBeUndefined();
  });

  it('treats a non-JSON analyze response as an empty body', async () => {
    fetchSpy
      .mockResolvedValueOnce(fetchResponse(true, 200, { token: 'jwt' }))
      .mockResolvedValueOnce(fetchResponse(true, 202, {}, { jsonThrows: true }));
    await triggerCallAnalysis(makeCall());
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('swallows thrown errors (Error instance)', async () => {
    mockSign.mockRejectedValue(new Error('sign boom'));
    await expect(triggerCallAnalysis(makeCall())).resolves.toBeUndefined();
  });

  it('swallows thrown non-Error rejections', async () => {
    mockFindAgent.mockRejectedValue('plain-string-failure');
    await expect(triggerCallAnalysis(makeCall())).resolves.toBeUndefined();
  });
});
