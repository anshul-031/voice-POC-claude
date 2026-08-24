/**
 * Decides when the campaign scheduler runs.
 *
 * The dialling logic lives in `campaignScheduler.ts`; this module owns only the
 * timers around it. That separation exists because the two answer different
 * questions: what to dial, versus how often to ask.
 *
 * The scheduling policy has three states, and the point of all of it is that an
 * idle platform issues no queries at all:
 *
 *   - ticking: a campaign is due, so poll every `TICK_INTERVAL_MS`
 *   - sleeping: a campaign exists but is not dialable yet, so wait for the
 *     computed due instant rather than polling towards it
 *   - dormant: nothing is scheduled, so hold no timer and let the database
 *     suspend. Routes call `wakeCampaignScheduler` to bring it back.
 *
 * Ticking unconditionally forever was what previously exhausted a scale-to-zero
 * database's monthly compute allowance on a deployment with no traffic.
 */
import prisma from '../lib/prisma.js';
import logger from '../utils/logger.js';
import { CAMPAIGN_STATUS, CAMPAIGN_SCHEDULER } from '../types/index.js';
import { runSchedulerTick } from './campaignScheduler.js';
let tickTimer: ReturnType<typeof setInterval> | null = null;
let sleepTimer: ReturnType<typeof setTimeout> | null = null;
/** Instant the current sleep is waiting for, held so segments need no query. */
let pendingDueAt: Date | null = null;
let consecutiveIdleTicks = 0;

/** Whether the operator has switched the background scheduler off entirely. */
function isSchedulerDisabled(): boolean {
  return process.env.CAMPAIGN_SCHEDULER_ENABLED?.trim().toLowerCase() === 'false';
}

/**
 * Whether the scheduler will run again without being asked. True while ticking
 * and also while sleeping until a known due time. Exposed for tests.
 */
export function isCampaignSchedulerRunning(): boolean {
  return tickTimer !== null || sleepTimer !== null;
}

/** Cancels a pending sleep and forgets what it was waiting for. */
function clearSleep(): void {
  if (sleepTimer) {
    clearTimeout(sleepTimer);
    sleepTimer = null;
  }
  pendingDueAt = null;
}

/** Drops both timers and the idle count, leaving no scheduled work behind. */
function clearTimers(): void {
  clearSleep();
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
  consecutiveIdleTicks = 0;
}

/** Arms the recurring timer. No-op when one is already armed. */
function armTicker(reason: string): void {
  clearSleep();
  if (tickTimer) return;
  consecutiveIdleTicks = 0;
  tickTimer = setInterval(() => {
    void handleTick();
  }, CAMPAIGN_SCHEDULER.TICK_INTERVAL_MS);
  // Do not keep the event loop alive solely for the scheduler.
  tickTimer.unref();
  logger.info('Campaign scheduler armed', {
    reason,
    intervalMs: CAMPAIGN_SCHEDULER.TICK_INTERVAL_MS,
  });
}

/** Drops all timers so an idle platform issues no queries at all. */
function disarmTicker(reason: string): void {
  const wasScheduled = isCampaignSchedulerRunning();
  clearTimers();
  if (wasScheduled) logger.info('Campaign scheduler dormant', { reason });
}

/**
 * Stands down until `dueAt`, replacing the per-minute tick with a single timer.
 *
 * This is what keeps a campaign scheduled for tomorrow from holding the database
 * open all night.
 */
function sleepUntil(dueAt: Date): void {
  clearTimers();
  pendingDueAt = dueAt;
  scheduleSleepSegment();
  logger.info('Campaign scheduler sleeping until a campaign is due', {
    dueAt: dueAt.toISOString(),
  });
}

/**
 * Sets one leg of a possibly much longer wait.
 *
 * The wait is served in capped segments for two reasons: `setTimeout` cannot
 * represent a delay beyond ~24 days, and re-checking the clock periodically
 * corrects for a machine that slept or had its time changed. Segments are
 * chained in memory, so a campaign scheduled years out costs no queries while
 * it waits rather than one round trip per segment.
 */
function scheduleSleepSegment(): void {
  if (!pendingDueAt) return;
  const remaining = pendingDueAt.getTime() - Date.now();
  const delay = Math.min(Math.max(0, remaining), CAMPAIGN_SCHEDULER.MAX_SLEEP_MS);
  sleepTimer = setTimeout(onSleepSegmentElapsed, delay);
  sleepTimer.unref();
}

/** Either resumes ticking, or waits out another segment without querying. */
function onSleepSegmentElapsed(): void {
  sleepTimer = null;
  const dueAt = pendingDueAt;

  if (dueAt && dueAt.getTime() > Date.now()) {
    logger.debug('Campaign scheduler still waiting, extending sleep', {
      dueAt: dueAt.toISOString(),
    });
    scheduleSleepSegment();
    return;
  }

  pendingDueAt = null;
  armTicker('campaign due');
  void handleTick();
}

/**
 * Runs one tick and decides when the scheduler should next run.
 *
 * Errors are swallowed rather than left to reject an un-awaited promise, and a
 * failed tick is not counted as idle — a database blip should not put the
 * scheduler to sleep while campaigns are still due.
 */
async function handleTick(): Promise<void> {
  try {
    const { active, nextDueAt } = await runSchedulerTick();
    if (active) {
      consecutiveIdleTicks = 0;
      return;
    }
    if (nextDueAt) {
      sleepUntil(nextDueAt);
      return;
    }
    consecutiveIdleTicks += 1;
    if (consecutiveIdleTicks >= CAMPAIGN_SCHEDULER.IDLE_TICKS_BEFORE_SLEEP) {
      disarmTicker('no scheduled or running campaigns');
    }
  } catch (error: unknown) {
    logger.error('Campaign scheduler tick failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Wakes the scheduler because a campaign now needs it.
 *
 * Every route that moves a campaign into (or out of) a schedulable state calls
 * this, so the scheduler does not have to poll to discover the change. Waking
 * on a pause or delete is deliberate: the following tick is what sweeps up
 * contacts those campaigns left holding a provider channel.
 *
 * Any pending sleep is abandoned, because the campaign that just changed may be
 * due sooner than whatever the scheduler was waiting for.
 */
export function wakeCampaignScheduler(reason = 'campaign work queued'): void {
  if (isSchedulerDisabled()) return;
  armTicker(reason);
}

/**
 * Starts the scheduler if — and only if — the database already holds work.
 *
 * A restart in the middle of a long campaign must not strand it, so boot pays
 * for exactly one `count` to find out. When that comes back empty the scheduler
 * stays dormant and the database is left to suspend.
 */
export function startCampaignScheduler(): void {
  if (isSchedulerDisabled()) {
    logger.info('Campaign scheduler disabled by CAMPAIGN_SCHEDULER_ENABLED=false');
    return;
  }
  void resumePendingWork();
}

/** One-shot boot probe for campaigns left schedulable by a previous process. */
async function resumePendingWork(): Promise<void> {
  try {
    const pending = await prisma.campaign.count({
      where: { status: { in: [CAMPAIGN_STATUS.SCHEDULED, CAMPAIGN_STATUS.RUNNING] } },
    });
    if (pending > 0) {
      armTicker('campaigns pending at startup');
      return;
    }
    logger.info('Campaign scheduler idle at startup, staying dormant');
  } catch (error: unknown) {
    logger.error('Campaign scheduler startup probe failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Stops the periodic scheduler. */
export function stopCampaignScheduler(): void {
  disarmTicker('stopped');
}
