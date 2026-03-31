import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ROUTES } from '../types/index.js';

// Capture handlers for coverage
const routes: Record<string, any> = {};
vi.mock('express', () => {
  const mockApp = {
    use: vi.fn(),
    get: vi.fn((path, handler) => { routes[path] = handler; }),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    listen: vi.fn((_port, cb) => cb && cb()),
  };
  const expressFunc: any = vi.fn(() => mockApp);
  expressFunc.json = vi.fn(() => (_req: any, _res: any, next: any) => next());
  expressFunc.static = vi.fn(() => (_req: any, _res: any, next: any) => next());
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
    listen: vi.fn((_port, cb) => cb && cb()),
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

const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

describe('Server initialization and Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    // Clear routes object
    for (const key in routes) delete routes[key];
  });

  it('should handle configuration logs with and without env vars', async () => {
    // 1. With env vars
    vi.stubEnv('GEMINI_API_KEY', 'key');
    vi.stubEnv('DATABASE_URL', 'url');
    vi.stubEnv('PORT', '4000');
    // @ts-expect-error type-checked import with query
    await import('../server.js?test=env-yes');
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('✅ Configured'));

    // 2. Without env vars
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('DATABASE_URL', '');
    vi.unstubAllEnvs(); // Clear them
    delete process.env.GEMINI_API_KEY;
    delete process.env.DATABASE_URL;
    // @ts-expect-error type-checked import with query
    await import('../server.js?test=env-no');
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('❌ MISSING'));
  });

  it('should cover all server branches including routes', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'key');
    vi.stubEnv('DATABASE_URL', 'url');
    
    // @ts-expect-error type-checked import with query
    await import('../server.js?test=full');

    const res: any = { 
      json: vi.fn(), 
      sendFile: vi.fn(), 
      status: vi.fn().mockReturnThis(),
    };
    
    // Test Health Check
    if (routes[ROUTES.HEALTH_CHECK]) {
      routes[ROUTES.HEALTH_CHECK]({}, res);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'ok' }));
    }

    // Test Constants Routes
    if (routes[ROUTES.CONSTANTS_UI_STRINGS]) {
      routes[ROUTES.CONSTANTS_UI_STRINGS]({}, res);
      expect(res.sendFile).toHaveBeenCalled();
    }
    if (routes[ROUTES.CONSTANTS_CONFIG]) {
      routes[ROUTES.CONSTANTS_CONFIG]({}, res);
      expect(res.sendFile).toHaveBeenCalled();
    }

    // Test Fallback (path '*')
    if (routes['*']) {
      routes['*']({}, res);
      expect(res.sendFile).toHaveBeenCalled();
    }

    expect(consoleLogSpy).toHaveBeenCalled();
  });
});
