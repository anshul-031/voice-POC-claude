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

describe('Server initialization and Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
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
      redirect: vi.fn(),
      status: vi.fn().mockReturnThis(),
    };
    
    // Test Health Check
    if (routes[ROUTES.HEALTH_CHECK]) {
      routes[ROUTES.HEALTH_CHECK]({}, res);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'ok' }));
    }

    if (routes[ROUTES.RUNTIME_CONFIG]) {
      routes[ROUTES.RUNTIME_CONFIG]({}, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          websiteName: expect.any(String),
          theme: expect.any(String),
        }),
      );
    }

    // Test canonical page routes + preview + fallback route
    const sendFileRoutes = [
      ROUTES.DASHBOARD_PAGE,
      ROUTES.LOGIN_PAGE,
      ROUTES.SIGNUP_PAGE,
      ROUTES.FORGOT_PASSWORD_PAGE,
      ROUTES.RESET_PASSWORD_PAGE,
      `${ROUTES.PREVIEW_PAGE}/:agentId`,
      '*',
    ];
    sendFileRoutes.forEach((path) => {
      if (routes[path]) {
        routes[path]({ params: { agentId: 'abc' } }, res);
      }
    });
    expect(res.sendFile).toHaveBeenCalled();

    // Test alias + legacy redirects (301 — internal pages)
    const redirectRoutes: Array<[string, string]> = [
      [ROUTES.LEGACY_DASHBOARD_PAGE, ROUTES.DASHBOARD_PAGE],
      [ROUTES.LEGACY_LOGIN_PAGE, ROUTES.LOGIN_PAGE],
      [ROUTES.LEGACY_SIGNUP_PAGE, ROUTES.SIGNUP_PAGE],
      [ROUTES.LEGACY_FORGOT_PASSWORD_PAGE, ROUTES.FORGOT_PASSWORD_PAGE],
      [ROUTES.LEGACY_RESET_PASSWORD_PAGE, ROUTES.RESET_PASSWORD_PAGE],
    ];
    redirectRoutes.forEach(([path, target]) => {
      if (routes[path]) {
        routes[path]({}, res);
        expect(res.redirect).toHaveBeenCalledWith(301, target);
      }
    });

    // Test landing page external redirects (302)
    const landingRedirectRoutes = [
      ROUTES.LANDING_PAGE,
      ROUTES.LANDING_ALIAS_PAGE,
      ROUTES.LEGACY_LANDING_PAGE,
    ];
    landingRedirectRoutes.forEach((path) => {
      if (routes[path]) {
        routes[path]({}, res);
        expect(res.redirect).toHaveBeenCalledWith(302, expect.any(String));
      }
    });

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

    expect(consoleLogSpy).toHaveBeenCalled();
  });
});
