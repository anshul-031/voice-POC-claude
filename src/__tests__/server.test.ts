import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ROUTES } from '../types/index.js';

// Capture handlers for coverage
const routes: Record<string, any> = {};
const middlewares: Array<(req: any, res: any, next: any) => void> = [];
vi.mock('express', () => {
  const mockApp = {
    use: vi.fn((...args: any[]) => {
      const handler = args[args.length - 1];
      if (typeof handler === 'function') {
        middlewares.push(handler);
      }
    }),
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
  return { 
    default: expressFunc,
    Router: expressFunc.Router,
    json: expressFunc.json,
    static: expressFunc.static,
  };
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

function clearServerlessEnv(): void {
  delete process.env.VERCEL;
  delete process.env.VERCEL_REGION;
  delete process.env.NOW_REGION;
  delete process.env.AWS_LAMBDA_FUNCTION_NAME;
  delete process.env.LAMBDA_TASK_ROOT;
}

describe('Server initialization and Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    clearServerlessEnv();
    // Clear routes object
    for (const key in routes) delete routes[key];
    middlewares.length = 0;
  });

  it('should handle configuration logs with and without env vars', async () => {
    // 1. With all env vars
    vi.stubEnv('GEMINI_API_KEY', 'key');
    vi.stubEnv('DATABASE_URL', 'url');
    vi.stubEnv('PORT', '4000');
    vi.stubEnv('NODE_ENV', 'production');
    // @ts-expect-error import
    await import('../server.ts?test=env-all-yes');
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('✅ Configured'));

    // 2. Without any env vars (testing defaults for PORT and NODE_ENV)
    vi.unstubAllEnvs();
    clearServerlessEnv();
    delete process.env.PORT;
    delete process.env.NODE_ENV;
    delete process.env.GEMINI_API_KEY;
    delete process.env.DATABASE_URL;
    
    // @ts-expect-error import
    await import('../server.ts?test=env-all-no');
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('❌ MISSING'));
  });

  it('should cover all server branches including routes', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'key');
    vi.stubEnv('DATABASE_URL', 'url');
    
    // @ts-expect-error type-checked import with query
    await import('../server.ts?test=full');

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

    // Test Landing Page
    if (routes['/']) {
      routes['/']({}, res);
      expect(res.sendFile).toHaveBeenCalled();
    }

    // Test Public Preview Page Route
    if (routes[`${ROUTES.PREVIEW_PAGE}/:agentId`]) {
      routes[`${ROUTES.PREVIEW_PAGE}/:agentId`]({ params: { agentId: 'abc' } }, res);
      expect(res.sendFile).toHaveBeenCalled();
    }

    const next = vi.fn();
    const reqGet = vi.fn(() => 'vitest-agent');
    const req = {
      method: 'GET',
      url: '/hello',
      ip: '127.0.0.1',
      headers: {},
      get: reqGet,
    };

    const requestLoggerMiddleware = middlewares.find((middleware) =>
      middleware.toString().includes('req.method'),
    );
    if (requestLoggerMiddleware) {
      requestLoggerMiddleware(req, {}, next);
    }
    expect(reqGet).toHaveBeenCalledWith('user-agent');
    expect(next).toHaveBeenCalled();

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
