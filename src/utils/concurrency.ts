/**
 * Concurrency policy shared by the campaign runner, scheduler, and routes.
 *
 * Kept out of the calling services so consumers can resolve a provider's limit
 * without pulling in the dialling machinery.
 */
import { TELEPHONY_LIMITS } from '../types/index.js';

/**
 * Clamps a provider's stored concurrency into the supported range.
 *
 * Providers created before the field existed have no value, and a hand-edited
 * database row could hold anything, so the bound is enforced here rather than
 * trusted from storage.
 */
export function resolveConcurrency(requested?: number | null): number {
  if (typeof requested !== 'number' || !Number.isFinite(requested)) {
    return TELEPHONY_LIMITS.DEFAULT_CONCURRENCY;
  }
  const whole = Math.trunc(requested);
  if (whole < TELEPHONY_LIMITS.MIN_CONCURRENCY) return TELEPHONY_LIMITS.MIN_CONCURRENCY;
  if (whole > TELEPHONY_LIMITS.MAX_CONCURRENCY) return TELEPHONY_LIMITS.MAX_CONCURRENCY;
  return whole;
}
