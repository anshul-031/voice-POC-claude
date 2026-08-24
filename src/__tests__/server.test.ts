import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ROUTES } from '../types/index.js';
import logger from '../utils/logger.js';

vi.mock('../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

type MockResponse = {
  json: (payload?: unknown) => unknown;
  send: (payload?: unknown) => unknown;
  sendFile: (payload?: unknown) => unknown;
  redirect: (...args: unknown[]) => unknown;
  status: (statusCode?: number) => MockResponse;
  type: (contentType?: string) => MockResponse;
};

const createMockResponse = (): MockResponse => {
  const res = {
    json: vi.fn(),
    send: vi.fn(),
    sendFile: vi.fn(),
    redirect: vi.fn(),
    status: vi.fn(),
    type: vi.fn(),
  } as unknown as MockResponse;
  res.status = vi.fn().mockReturnValue(res) as MockResponse['status'];
  res.type = vi.fn().mockReturnValue(res) as MockResponse['type'];
  return res;
};

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
  expressFunc.urlencoded = vi.fn(() => (_req: any, _res: any, next: any) => next());
  expressFunc.static = vi.fn(() => (_req: any, _res: any, next: any) => next());
  expressFunc.raw = vi.fn(() => (_req: any, _res: any, next: any) => next());
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
    urlencoded: expressFunc.urlencoded,
    static: expressFunc.static,
    raw: expressFunc.raw,
  };
});

const mocks = vi.hoisted(() => ({
  server: {
    listen: vi.fn((_port: unknown, cb?: () => void) => cb && cb()),
    close: vi.fn(),
  },
  startCampaignScheduler: vi.fn(),
  stopCampaignScheduler: vi.fn(),
  disconnectPrisma: vi.fn(async () => undefined),
  clearUserCache: vi.fn(),
}));

vi.mock('http', () => ({
  createServer: vi.fn(() => mocks.server),
}));

vi.mock('../services/signalingServer.js', () => ({
  default: {
    attach: vi.fn(),
  },
}));

// The scheduler probes the database on startup, so the real one would open a
// connection just by importing the server.
vi.mock('../services/campaignSchedulerLoop.js', () => ({
  startCampaignScheduler: mocks.startCampaignScheduler,
  stopCampaignScheduler: mocks.stopCampaignScheduler,
}));

vi.mock('../lib/prisma.js', () => ({
  default: {},
  disconnectPrisma: mocks.disconnectPrisma,
}));

vi.mock('../lib/userCache.js', () => ({
  clearUserCache: mocks.clearUserCache,
}));

vi.mock('../routes/agents.js', () => ({
  default: vi.fn(),
}));

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
    vi.stubEnv('LANDING_PAGE_URL', 'https://landing.example.com');
    vi.stubEnv('NODE_ENV', 'production');
    // @ts-expect-error import
    await import('../server.ts?test=env-all-yes');
    expect(logger.info).toHaveBeenCalledWith(
      'Server started',
      expect.objectContaining({
        geminiApiKeyConfigured: true,
        databaseConfigured: true,
      }),
    );

    // 2. Without any env vars (testing defaults for PORT and NODE_ENV)
    vi.unstubAllEnvs();
    delete process.env.PORT;
    delete process.env.NODE_ENV;
    delete process.env.GEMINI_API_KEY;
    delete process.env.DATABASE_URL;
    
    // @ts-expect-error import
    await import('../server.ts?test=env-all-no');
    expect(logger.info).toHaveBeenCalledWith(
      'Server started',
      expect.objectContaining({
        geminiApiKeyConfigured: false,
        databaseConfigured: false,
      }),
    );
  });

  it('should cover all server branches including routes', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'key');
    vi.stubEnv('DATABASE_URL', 'url');
    
    // @ts-expect-error type-checked import with query
    await import('../server.ts?test=full');

    const res = createMockResponse();
    
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
    const sendHtmlRoutes = [
      ROUTES.DASHBOARD_PAGE,
      ROUTES.LOGIN_PAGE,
      ROUTES.SIGNUP_PAGE,
      ROUTES.FORGOT_PASSWORD_PAGE,
      ROUTES.RESET_PASSWORD_PAGE,
      `${ROUTES.PREVIEW_PAGE}/:agentId`,
      '*',
    ];
    sendHtmlRoutes.forEach((path) => {
      if (routes[path]) {
        routes[path]({ params: { agentId: 'abc' } }, res);
      }
    });
    expect(res.send).toHaveBeenCalled();

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

    expect(logger.info).toHaveBeenCalledWith(
      'Server started',
      expect.objectContaining({
        websiteName: expect.any(String),
        websocketPath: ROUTES.WS_PATH,
        apiPrefix: ROUTES.API_PREFIX,
      }),
    );
  });

  /**
   * A process that exits without disconnecting leaves its connections for the
   * database to reap on its own timeout, so a restarting service can sit above
   * its connection limit.
   */
  describe('graceful shutdown', () => {
    /**
     * Loads the server with signal registration captured rather than real, so a
     * test can fire the handler without terminating the test process.
     */
    const withSignals = async (
      load: () => Promise<unknown>,
    ): Promise<Map<string, () => void>> => {
      const handlers = new Map<string, () => void>();
      const onceSpy = vi.spyOn(process, 'once').mockImplementation(
        ((signal: string, handler: () => void) => {
          handlers.set(signal, handler);
          return process;
        }) as unknown as typeof process.once,
      );

      await load();

      onceSpy.mockRestore();
      return handlers;
    };

    it('registers handlers for both termination signals', async () => {
      // @ts-expect-error type-checked import with query
      const handlers = await withSignals(() => import('../server.ts?test=signals'));
      expect([...handlers.keys()]).toEqual(['SIGTERM', 'SIGINT']);
    });

    it('releases the scheduler, cache and database pool on SIGTERM', async () => {
      // @ts-expect-error type-checked import with query
      const handlers = await withSignals(() => import('../server.ts?test=sigterm'));

      handlers.get('SIGTERM')?.();
      await vi.waitFor(() => expect(mocks.disconnectPrisma).toHaveBeenCalled());

      expect(logger.info).toHaveBeenCalledWith('Shutting down', { signal: 'SIGTERM' });
      expect(mocks.stopCampaignScheduler).toHaveBeenCalled();
      expect(mocks.clearUserCache).toHaveBeenCalled();
      expect(mocks.server.close).toHaveBeenCalled();
    });

    it('ignores a second signal while already shutting down', async () => {
      // @ts-expect-error type-checked import with query
      const handlers = await withSignals(() => import('../server.ts?test=twice'));

      handlers.get('SIGTERM')?.();
      await vi.waitFor(() => expect(mocks.disconnectPrisma).toHaveBeenCalled());
      handlers.get('SIGINT')?.();

      expect(mocks.disconnectPrisma).toHaveBeenCalledTimes(1);
      expect(mocks.server.close).toHaveBeenCalledTimes(1);
    });

    it('logs but does not throw when disconnecting fails', async () => {
      mocks.disconnectPrisma.mockRejectedValueOnce(new Error('pool already gone'));
      // @ts-expect-error type-checked import with query
      const handlers = await withSignals(() => import('../server.ts?test=disconnect-fail'));

      handlers.get('SIGINT')?.();

      await vi.waitFor(() => {
        expect(logger.error).toHaveBeenCalledWith(
          'Failed to close database connections',
          { error: 'pool already gone' },
        );
      });
    });
  });

  it('should fallback to static file when SSR render fails', async () => {
    vi.doMock('../utils/ssr.js', () => ({
      renderSsrPage: vi.fn(() => {
        throw new Error('SSR fail');
      }),
    }));

    // @ts-expect-error type-checked import with query
    await import('../server.ts?test=ssr-fail');

    const res = createMockResponse();

    if (routes[ROUTES.DASHBOARD_PAGE]) {
      routes[ROUTES.DASHBOARD_PAGE]({}, res);
    }

    expect(res.sendFile).toHaveBeenCalled();
  });
});
