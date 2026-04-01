/**
 * Authentication API routes — signup, login, logout, forgot/reset password, me.
 */
import { Router, type Request, type Response } from 'express';
import prisma from '../lib/prisma.js';
import logger from '../utils/logger.js';
import {
  hashPassword,
  verifyPassword,
  generateToken,
  generateResetToken,
} from '../services/auth.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { z } from 'zod';

const router = Router();

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/',
};

// ── Validation Schemas ──
const SignupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Invalid email address').max(255),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const ForgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

const ResetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

// POST /api/auth/signup
// eslint-disable-next-line @typescript-eslint/no-explicit-any
router.post('/signup', async (req: Request, res: Response): Promise<any> => {
  try {
    const parse = SignupSchema.safeParse(req.body);
    if (!parse.success) {
      const firstError = parse.error.issues[0]?.message || 'Invalid input';
      return res.status(400).json({ error: firstError });
    }

    const { name, email, password } = parse.data;

    // Check if user exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { name, email, passwordHash },
      select: { id: true, email: true, name: true },
    });

    const token = generateToken(user.id, user.email);
    res.cookie('token', token, COOKIE_OPTIONS);
    logger.info('User signed up', { userId: user.id, email: user.email });
    res.status(201).json({ user });
  } catch (err: unknown) {
    logger.error('Signup error', { error: String(err) });
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// POST /api/auth/login
// eslint-disable-next-line @typescript-eslint/no-explicit-any
router.post('/login', async (req: Request, res: Response): Promise<any> => {
  try {
    const parse = LoginSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const { email, password } = parse.data;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken(user.id, user.email);
    res.cookie('token', token, COOKIE_OPTIONS);
    logger.info('User logged in', { userId: user.id, email: user.email });
    res.json({ user: { id: user.id, email: user.email, name: user.name } });
  } catch (err: unknown) {
    logger.error('Login error', { error: String(err) });
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/logout
router.post('/logout', (_req: Request, res: Response): void => {
  res.clearCookie('token', { path: '/' });
  res.json({ message: 'Logged out successfully' });
});

// POST /api/auth/forgot-password
// eslint-disable-next-line @typescript-eslint/no-explicit-any
router.post('/forgot-password', async (req: Request, res: Response): Promise<any> => {
  try {
    const parse = ForgotPasswordSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    const { email } = parse.data;
    const user = await prisma.user.findUnique({ where: { email } });

    // Always respond success to prevent email enumeration
    if (!user) {
      return res.json({ message: 'If an account exists with that email, a reset link has been sent.' });
    }

    const { token, expiry } = generateResetToken();
    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken: token, resetTokenExpiry: expiry },
    });

    // PLACEHOLDER: Log reset link to console (replace with email service)
    const resetUrl = `${req.protocol}://${req.get('host')}/reset-password.html?token=${token}`;
    logger.info('Password reset requested', { userId: user.id, resetUrl });
    console.log(`\n🔐 Password Reset Link for ${email}:\n   ${resetUrl}\n`);

    res.json({ message: 'If an account exists with that email, a reset link has been sent.' });
  } catch (err: unknown) {
    logger.error('Forgot password error', { error: String(err) });
    res.status(500).json({ error: 'Failed to process reset request' });
  }
});

// POST /api/auth/reset-password
// eslint-disable-next-line @typescript-eslint/no-explicit-any
router.post('/reset-password', async (req: Request, res: Response): Promise<any> => {
  try {
    const parse = ResetPasswordSchema.safeParse(req.body);
    if (!parse.success) {
      const firstError = parse.error.issues[0]?.message || 'Invalid input';
      return res.status(400).json({ error: firstError });
    }

    const { token, password } = parse.data;
    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const passwordHash = await hashPassword(password);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, resetToken: null, resetTokenExpiry: null },
    });

    logger.info('Password reset completed', { userId: user.id });
    res.json({ message: 'Password has been reset successfully' });
  } catch (err: unknown) {
    logger.error('Reset password error', { error: String(err) });
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  res.json({ user: req.user });
});

export default router;
