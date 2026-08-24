/**
 * Short-lived in-process cache for the identity behind a JWT.
 *
 * Authentication verified the token's signature and then still queried the
 * `user` table on every single request, purely to turn a user id into a name and
 * email. On a dashboard that polls, that doubled the query count for no new
 * information, and those queries were enough on their own to keep a
 * scale-to-zero database from ever suspending.
 *
 * This is intentionally a plain in-memory map, not a shared cache: it holds no
 * authority of its own. The token is what proves a session is valid, so the
 * worst a stale entry can do is serve a slightly out-of-date display name. The
 * one case that matters is a user row that has since been removed or locked,
 * which is why the TTL is short and `invalidateCachedUser` exists.
 *
 * Each process keeps its own copy, so entries simply vanish on restart.
 */
import { AUTH_CACHE } from '../types/index.js';
import type { AuthenticatedUser } from '../types/index.js';

interface CacheEntry {
  user: AuthenticatedUser;
  expiresAt: number;
}

const entries = new Map<string, CacheEntry>();

/**
 * Returns a cached identity, or null when absent or expired.
 *
 * An expired entry is dropped on read, so the map does not accumulate stale
 * users for accounts that stopped making requests.
 */
export function getCachedUser(userId: string, now: number = Date.now()): AuthenticatedUser | null {
  const entry = entries.get(userId);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    entries.delete(userId);
    return null;
  }
  return entry.user;
}

/** Stores an identity for the configured TTL. */
export function cacheUser(user: AuthenticatedUser, now: number = Date.now()): void {
  // Tokens for many distinct users would otherwise grow this map indefinitely.
  // Dropping everything is acceptable because rebuilding costs one query per
  // active user, and it keeps the cache free of eviction bookkeeping.
  if (entries.size >= AUTH_CACHE.MAX_ENTRIES && !entries.has(user.id)) {
    entries.clear();
  }
  entries.set(user.id, { user, expiresAt: now + AUTH_CACHE.TTL_MS });
}

/**
 * Forces the next request for this user to re-read the database.
 *
 * Call this wherever a change must take effect before the TTL would expire —
 * credential changes and anything that should stop an existing session.
 */
export function invalidateCachedUser(userId: string): void {
  entries.delete(userId);
}

/** Empties the cache. Used by tests and on shutdown. */
export function clearUserCache(): void {
  entries.clear();
}
