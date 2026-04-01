/**
 * Authentication service — handles password hashing, JWT tokens, and reset tokens.
 */
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import logger from '../utils/logger.js';

const SALT_ROUNDS = 12;
const JWT_SECRET = process.env.JWT_SECRET || 'voiceforge-dev-secret-change-in-production';
const JWT_EXPIRES_IN = '7d';
const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_EXPIRY_MS = 3600000; // 1 hour

/** @typedef {{ userId: string; email: string }} JwtPayload */

/**
 * Hashes a plaintext password with bcrypt.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compares a plaintext password against a bcrypt hash.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Signs a JWT for the given user.
 */
export function generateToken(userId: string, email: string): string {
  return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verifies and decodes a JWT token.
 */
export function verifyToken(token: string): { userId: string; email: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
    return decoded;
  } catch (err: unknown) {
    logger.warn('JWT verification failed', { error: String(err) });
    return null;
  }
}

/**
 * Generates a cryptographically secure reset token + expiry date.
 */
export function generateResetToken(): { token: string; expiry: Date } {
  const token = crypto.randomBytes(RESET_TOKEN_BYTES).toString('hex');
  const expiry = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);
  return { token, expiry };
}
