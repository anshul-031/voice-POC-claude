import { describe, it, expect, beforeEach } from 'vitest';
import {
  getCachedUser,
  cacheUser,
  invalidateCachedUser,
  clearUserCache,
} from '../lib/userCache.js';
import { AUTH_CACHE } from '../types/index.js';
import type { AuthenticatedUser } from '../types/index.js';

const user = (id: string): AuthenticatedUser => ({
  id,
  email: `${id}@example.com`,
  name: `User ${id}`,
});

describe('userCache', () => {
  beforeEach(() => {
    clearUserCache();
  });

  it('returns null for an unknown user', () => {
    expect(getCachedUser('nobody')).toBeNull();
  });

  it('returns a stored identity within the TTL', () => {
    const now = 1_000_000;
    cacheUser(user('u1'), now);
    expect(getCachedUser('u1', now + AUTH_CACHE.TTL_MS - 1)).toEqual(user('u1'));
  });

  it('expires an identity once the TTL elapses', () => {
    const now = 1_000_000;
    cacheUser(user('u1'), now);
    // Bounding how long a stale identity can be served is the whole point of the
    // TTL: a removed account must stop being accepted promptly.
    expect(getCachedUser('u1', now + AUTH_CACHE.TTL_MS)).toBeNull();
  });

  it('drops an expired entry rather than keeping it around', () => {
    const now = 1_000_000;
    cacheUser(user('u1'), now);
    getCachedUser('u1', now + AUTH_CACHE.TTL_MS);
    // Even asking again at a time when it would still have been valid fails,
    // proving the read evicted it rather than merely reporting a miss.
    expect(getCachedUser('u1', now)).toBeNull();
  });

  it('invalidates a single user without disturbing the rest', () => {
    cacheUser(user('u1'));
    cacheUser(user('u2'));

    invalidateCachedUser('u1');

    expect(getCachedUser('u1')).toBeNull();
    expect(getCachedUser('u2')).toEqual(user('u2'));
  });

  it('tolerates invalidating a user that was never cached', () => {
    expect(() => invalidateCachedUser('missing')).not.toThrow();
  });

  it('refreshes the TTL when the same user is cached again', () => {
    cacheUser(user('u1'), 1_000);
    cacheUser(user('u1'), 5_000);
    expect(getCachedUser('u1', 5_000 + AUTH_CACHE.TTL_MS - 1)).toEqual(user('u1'));
  });

  it('clears everything on demand', () => {
    cacheUser(user('u1'));
    cacheUser(user('u2'));

    clearUserCache();

    expect(getCachedUser('u1')).toBeNull();
    expect(getCachedUser('u2')).toBeNull();
  });

  it('stays bounded when many distinct users authenticate', () => {
    // Tokens for a large number of users must not grow the map indefinitely.
    for (let i = 0; i <= AUTH_CACHE.MAX_ENTRIES; i += 1) {
      cacheUser(user(`u${i}`));
    }

    // The cap was reached and the map reset, so the earliest entry is gone while
    // the one that tripped the limit is retained.
    expect(getCachedUser('u0')).toBeNull();
    expect(getCachedUser(`u${AUTH_CACHE.MAX_ENTRIES}`))
      .toEqual(user(`u${AUTH_CACHE.MAX_ENTRIES}`));
  });

  it('does not reset the map when re-caching an existing user at the cap', () => {
    for (let i = 0; i < AUTH_CACHE.MAX_ENTRIES; i += 1) {
      cacheUser(user(`u${i}`));
    }

    cacheUser(user('u5'));

    expect(getCachedUser('u5')).toEqual(user('u5'));
    expect(getCachedUser('u6')).toEqual(user('u6'));
  });
});
