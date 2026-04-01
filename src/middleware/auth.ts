/**
 * Authentication middleware — validates JWT from cookie and attaches user to request.
 */
import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../services/auth.js';
import prisma from '../lib/prisma.js';
import logger from '../utils/logger.js';

/** Extends Express Request with user info from JWT */
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
  };
}

/**
 * Middleware that requires a valid JWT in the `token` cookie.
 * On success, attaches `req.user` with { id, email, name }.
 * On failure, responds with 401.
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const token = req.cookies?.token as string | undefined;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, name: true },
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    next();
  } catch (err: unknown) {
    logger.error('Auth middleware error', { error: String(err) });
    return res.status(500).json({ error: 'Authentication error' });
  }
}
