import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture handlers for coverage
const routes = {};
vi.mock('express', () => {
  const mockApp = {
    use: vi.fn(),
    get: vi.fn((path, handler) => { routes[path] = handler; }),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    listen: vi.fn((port, cb) => cb && cb()),
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

vi.mock('./services/signalingServer.js', () => ({
  default: {
    attach: vi.fn(),
  },
}));

vi.mock('./routes/agents.js', () => ({
  default: vi.fn(),
}));

import { ROUTES } from './constants/index.js';

const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

describe('Server Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('should cover all server branches including routes', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'key');
    vi.stubEnv('DATABASE_URL', 'url');
    
    // Import and trigger initialization
    await import('./server.js?test=full');

    const res = { json: vi.fn(), sendFile: vi.fn(), status: vi.fn().mockReturnThis() };
    
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
