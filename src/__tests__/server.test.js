import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('express', () => {
  const mockApp = {
    use: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    listen: vi.fn(),
  };
  const expressFunc = vi.fn(() => mockApp);
  expressFunc.json = vi.fn(() => (req, res, next) => next());
  expressFunc.static = vi.fn(() => (req, res, next) => next());
  expressFunc.Router = vi.fn(() => ({
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    use: vi.fn(),
    stack: [],
  }));
  return { default: expressFunc };
});

vi.mock('http', () => ({
  createServer: vi.fn(() => ({
    listen: vi.fn((port, cb) => cb && cb()),
  })),
}));

vi.mock('../services/signalingServer.js', () => ({
  default: {
    attach: vi.fn(),
  },
}));

vi.mock('../routes/agents.js', () => ({
  default: vi.fn(),
}));

// Capture console.log to verify env var branches
const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

describe('Server initialization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('should handle configuration logs with and without env vars', async () => {
    // 1. With env vars
    vi.stubEnv('GEMINI_API_KEY', 'key');
    vi.stubEnv('DATABASE_URL', 'url');
    vi.stubEnv('PORT', '4000');
    await import('../server.js?test=env-yes');
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('✅ Configured'));

    // 2. Without env vars
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('DATABASE_URL', '');
    vi.unstubAllEnvs(); // Clear them
    delete process.env.GEMINI_API_KEY;
    delete process.env.DATABASE_URL;
    await import('../server.js?test=env-no');
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('❌ MISSING'));
  });

  it('should serve uiStrings.js', async () => {
    await import('../server.js?test=ui-strings');
    const express = (await import('express')).default;
    const mockApp = express();
    const calls = mockApp.get.mock.calls;
    const constantsCall = calls.find(c => c[0] === '/constants/uiStrings.js');
    expect(constantsCall).toBeDefined();
    const handler = constantsCall[1];
    const res = { sendFile: vi.fn() };
    handler({}, res);
    expect(res.sendFile).toHaveBeenCalledWith(expect.stringContaining('uiStrings.js'));
  });
});
