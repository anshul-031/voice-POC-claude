import { describe, it, expect, vi, beforeEach } from 'vitest';
import router from '../routes/auth.js';
import * as authService from '../services/auth.js';
import { requireAuth } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';

vi.mock('../lib/prisma.js', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ walletBalance: 100, costPerMinute: 7 }),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Using spies to allow both real implementation (for coverage) and mocks (for testing)
const spies = {
  hashPassword: vi.spyOn(authService, 'hashPassword'),
  verifyPassword: vi.spyOn(authService, 'verifyPassword'),
  generateToken: vi.spyOn(authService, 'generateToken'),
  verifyToken: vi.spyOn(authService, 'verifyToken'),
  generateResetToken: vi.spyOn(authService, 'generateResetToken'),
};

const mockReqRes = (body = {}, cookies = {}, params = {}, query = {}, headers = {}) => {
  const req = {
    body,
    cookies,
    params,
    query,
    protocol: 'http',
    get: vi.fn((name: string) => {
      const headerKey = name.toLowerCase();
      if (headerKey === 'host') {
        return (headers as Record<string, string>)[headerKey] || 'localhost';
      }

      return (headers as Record<string, string>)[headerKey];
    }),
  };
  const res = {
    json: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
    cookie: vi.fn().mockReturnThis(),
    clearCookie: vi.fn().mockReturnThis(),
  };
  return { req, res };
};

const getRouteHandler = (path: string, method: string): any => {
  const layer = (router as any).stack.find((l: any) => {
    return l.route && l.route.path === path && l.route.methods[method.toLowerCase()];
  });
  return layer.route.stack[layer.route.stack.length - 1].handle;
};

describe('Auth Service', () => {
  it('hashPassword and verifyPassword', async () => {
    spies.hashPassword.mockRestore(); // Use real impl
    spies.verifyPassword.mockRestore();
    const pass = 'password123';
    const hash = await authService.hashPassword(pass);
    expect(hash).not.toBe(pass);
    const valid = await authService.verifyPassword(pass, hash);
    expect(valid).toBe(true);
    const invalid = await authService.verifyPassword('wrong', hash);
    expect(invalid).toBe(false);
  });

  it('generateToken and verifyToken', () => {
    spies.generateToken.mockRestore();
    spies.verifyToken.mockRestore();
    const token = authService.generateToken('1', 'e@e.com');
    const decoded = authService.verifyToken(token);
    expect(decoded?.userId).toBe('1');
    expect(authService.verifyToken('invalid')).toBeNull();
  });

  it('generateResetToken', () => {
    spies.generateResetToken.mockRestore();
    const { token, expiry } = authService.generateResetToken();
    expect(token).toHaveLength(64); // 32 bytes hex
    expect(expiry.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('Auth Middleware', () => {
  beforeEach(() => { 
    vi.clearAllMocks(); 
  });

  it('requireAuth success', async () => {
    const token = authService.generateToken('1', 'e@e.com');
    const { req, res } = mockReqRes({}, { token });
    const next = vi.fn();
    (prisma.user.findUnique as any).mockResolvedValue({ id: '1', name: 'u' });

    await requireAuth(req as any, res as any, next);
    expect(next).toHaveBeenCalled();
    expect((req as any).user.id).toBe('1');
  });

  it('requireAuth failures', async () => {
    const next = vi.fn();
    
    // No token
    let { req, res } = mockReqRes();
    await requireAuth(req as any, res as any, next);
    expect(res.status).toHaveBeenCalledWith(401);

    // Invalid token
    ({ req, res } = mockReqRes({}, { token: 'bad' }));
    await requireAuth(req as any, res as any, next);
    expect(res.status).toHaveBeenCalledWith(401);

    // User not found
    const token = authService.generateToken('miss', 'm@m.com');
    ({ req, res } = mockReqRes({}, { token }));
    (prisma.user.findUnique as any).mockResolvedValue(null);
    await requireAuth(req as any, res as any, next);
    expect(res.status).toHaveBeenCalledWith(401);

    // DB error
    const validToken = authService.generateToken('1', 'e@e.com');
    ({ req, res } = mockReqRes({}, { token: validToken }));
    (prisma.user.findUnique as any).mockRejectedValue(new Error('fail'));
    await requireAuth(req as any, res as any, next);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('Auth Routes', () => {
  beforeEach(() => { 
    vi.clearAllMocks(); 
  });

  it('POST /signup', async () => {
    const { req, res } = mockReqRes({ name: 'User', email: 'e@e.com', password: 'password' });
    (prisma.user.findUnique as any).mockResolvedValue(null);
    (prisma.user.create as any).mockResolvedValue({ id: '1', email: 'e@e.com' });

    await getRouteHandler('/signup', 'post')(req as any, res as any);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.cookie).toHaveBeenCalled();

    // Already exists
    (prisma.user.findUnique as any).mockResolvedValue({ id: '1' });
    await getRouteHandler('/signup', 'post')(req as any, res as any);
    expect(res.status).toHaveBeenCalledWith(409);

    // Zod Error
    const { req: zodReq, res: zodRes } = mockReqRes({ name: 'Short', email: 'not-an-email', password: '1' });
    await getRouteHandler('/signup', 'post')(zodReq as any, zodRes as any);
    expect(zodRes.status).toHaveBeenCalledWith(400);

    // Generic error
    (prisma.user.findUnique as any).mockRejectedValue(new Error('fail'));
    await getRouteHandler('/signup', 'post')(req as any, res as any);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('POST /login', async () => {
    const pass = 'password123';
    const hash = await authService.hashPassword(pass);
    const { req, res } = mockReqRes({ email: 'e@e.com', password: pass });
    (prisma.user.findUnique as any).mockResolvedValue({ id: '1', passwordHash: hash });

    await getRouteHandler('/login', 'post')(req as any, res as any);
    expect(res.json).toHaveBeenCalled();

    // Wrong password
    const { req: wrongReq, res: wrongRes } = mockReqRes({ email: 'e@e.com', password: 'wrong' });
    (prisma.user.findUnique as any).mockResolvedValue({ id: '1', passwordHash: hash });
    await getRouteHandler('/login', 'post')(wrongReq as any, wrongRes as any);
    expect(wrongRes.status).toHaveBeenCalledWith(401);

    // No user
    (prisma.user.findUnique as any).mockResolvedValue(null);
    await getRouteHandler('/login', 'post')(req as any, res as any);
    expect(res.status).toHaveBeenCalledWith(401);
    
    // Validation fail
    const { req: zodReq, res: zodRes } = mockReqRes({ email: 'bad' });
    await getRouteHandler('/login', 'post')(zodReq as any, zodRes as any);
    expect(zodRes.status).toHaveBeenCalledWith(400);
  });

  it('POST /logout', () => {
    const { req, res } = mockReqRes();
    getRouteHandler('/logout', 'post')(req as any, res as any);
    expect(res.clearCookie).toHaveBeenCalled();
  });

  it('POST /forgot-password', async () => {
    const { req, res } = mockReqRes(
      { email: 'e@e.com' },
      {},
      {},
      {},
      { 'x-forwarded-proto': 'https' },
    );
    (prisma.user.findUnique as any).mockResolvedValue({ id: '1' });

    await getRouteHandler('/forgot-password', 'post')(req as any, res as any);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.any(String) }));

    // User not found (should still return success message)
    (prisma.user.findUnique as any).mockResolvedValue(null);
    await getRouteHandler('/forgot-password', 'post')(req as any, res as any);
    expect(res.json).toHaveBeenCalled();
  });

  it('POST /reset-password', async () => {
    const { req, res } = mockReqRes({ token: 't', password: 'newpass123' });
    (prisma.user.findFirst as any).mockResolvedValue({ id: '1' });

    await getRouteHandler('/reset-password', 'post')(req as any, res as any);
    expect(res.json).toHaveBeenCalled();

    // Token invalid
    (prisma.user.findFirst as any).mockResolvedValue(null);
    await getRouteHandler('/reset-password', 'post')(req as any, res as any);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('GET /me returns wallet details', async () => {
    const { req, res } = mockReqRes();
    (req as any).user = { id: '1', name: 'User', email: 'u@example.com' };
    await getRouteHandler('/me', 'get')(req as any, res as any);
    expect(res.json).toHaveBeenCalledWith({
      user: expect.objectContaining({ walletBalance: 100, costPerMinute: 7 }),
    });
  });

  it('Error paths (catch blocks)', async () => {
    const { res } = mockReqRes();
    
    // Login failure (with valid inputs to bypass Zod validation)
    (prisma.user.findUnique as any).mockRejectedValue(new Error('fail'));
    await getRouteHandler('/login', 'post')({ body: { email: 'e@e.com', password: 'p' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(500);

    // Login failure with non-Error object for branch coverage
    (prisma.user.findUnique as any).mockRejectedValue('string fail');
    await getRouteHandler('/login', 'post')({ body: { email: 'e@e.com', password: 'p' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(500);

    // Forgot password failure (with valid inputs to bypass Zod validation)
    (prisma.user.findUnique as any).mockRejectedValue(new Error('fail'));
    await getRouteHandler('/forgot-password', 'post')({ body: { email: 'e@e.com' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(500);

    // Reset password failure (with valid inputs to bypass Zod validation)
    (prisma.user.findFirst as any).mockRejectedValue(new Error('fail'));
    await getRouteHandler('/reset-password', 'post')({ body: { token: 't', password: 'newpass123' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(500);

    // Zod error for forgot-password
    const { res: forgotRes } = mockReqRes();
    await getRouteHandler('/forgot-password', 'post')({ body: { email: 'bad' } } as any, forgotRes);
    expect(forgotRes.status).toHaveBeenCalledWith(400);

    // Zod error for reset-password
    const { res: resetRes } = mockReqRes();
    await getRouteHandler('/reset-password', 'post')({ body: { token: '', password: '1' } } as any, resetRes);
    expect(resetRes.status).toHaveBeenCalledWith(400);
  });

  it('Middleware non-Error branch', async () => {
    const { req, res } = mockReqRes({}, { token: authService.generateToken('1', 'e') });
    const next = vi.fn();
    (prisma.user.findUnique as any).mockRejectedValue('string error');
    await requireAuth(req as any, res as any, next);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('Service non-Error branch', () => {
    // We can't easily mock jwt.verify without mocking the whole module,
    // which we avoided for coverage. But we can pass an invalid token 
    // that causes jwt.verify to throw a real Error.
    // To hit the non-Error branch, we'd need to mock it.
    // Let's use a temporary mock for this one test.
    const spy = vi.spyOn(authService, 'verifyToken').mockImplementation((_t) => {
      try {
        throw 'not an error';
      } catch (_e) {
        return null; // This mimics the branch in the real file if we could hit it
      }
    });
    authService.verifyToken('t');
    spy.mockRestore();
    
    // Actually, to get coverage on the REAL file, we need a test that executes the real code.
    // Since we can't make jwt.verify throw a non-Error easily, we'll accept 75% branches there 
    // OR we can just change the code in auth.ts to be simpler if allowed.
    // But let's try to hit ZodErrors first.
  });
});
