/**
 * Background scheduler that drives time-scheduled, windowed campaigns.
 *
 * Unlike the immediate `POST /:id/trigger` path (which fires every pending
 * contact at once), the scheduler wakes up on a fixed interval and processes
 * campaigns incrementally in small batches. This makes long campaigns:
 *   - start at a chosen date/time (`scheduledAt`),
 *   - only place calls inside an allowed time-of-day window
 *     (`windowStart`..`windowEnd`),
 *   - and remain pausable/resumable — a campaign moved to PAUSED is simply
 *     skipped until it is resumed, leaving its remaining PENDING contacts intact.
 */
import prisma from '../lib/prisma.js';
import logger from '../utils/logger.js';
import {
  CAMPAIGN_STATUS,
  CAMPAIGN_CONTACT_STATUS,
  CAMPAIGN_SCHEDULER,
  TELEPHONY_DIRECTION,
  TELEPHONY_PROVIDER,
} from '../types/index.js';
import type { SchedulableCampaign } from '../types/index.js';
import { extractVobizCredentials } from './vobizCalling.js';
import { runCampaign } from './campaignRunner.js';
import { DEFAULT_PORT } from '../constants/index.js';
import { UI_STRINGS } from '../constants/uiStrings.js';
import { canStartWalletCall } from './walletService.js';
import { getZonedMinutesSinceMidnight, resolveTimeZone } from '../utils/timezone.js';

export type { SchedulableCampaign };

/** Converts an "HH:MM" string into minutes since midnight. */
export function parseTimeOfDay(hhmm: string): number {
  const [hours, minutes] = hhmm.split(':').map((part) => Number.parseInt(part, 10));
  return hours * 60 + minutes;
}

/**
 * Whether `now` falls inside the campaign's allowed call window.
 * A missing/incomplete window means "always allowed". Windows that wrap past
 * midnight (start > end) are supported.
 *
 * `windowStart`/`windowEnd` are wall-clock times the user typed, so they are
 * only meaningful in the campaign's own timezone. Resolving them against the
 * server process timezone instead (the old `now.getHours()` behaviour) held
 * campaigns back by the user's whole UTC offset — a 18:00 IST window was read
 * as 18:00 UTC, so the campaign only started at 23:30 IST.
 */
export function isWithinCallWindow(
  now: Date,
  windowStart?: string | null,
  windowEnd?: string | null,
  timeZone?: string | null,
): boolean {
  if (!windowStart || !windowEnd) return true;

  const nowMinutes = getZonedMinutesSinceMidnight(now, timeZone);
  const start = parseTimeOfDay(windowStart);
  const end = parseTimeOfDay(windowEnd);

  if (start <= end) {
    return nowMinutes >= start && nowMinutes < end;
  }
  // Overnight window, e.g. 22:00 -> 06:00
  return nowMinutes >= start || nowMinutes < end;
}

/** Resolves the public base URL used to build call answer webhooks. */
export function resolvePublicBaseUrl(): string {
  const configured = process.env.PUBLIC_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  return `http://localhost:${process.env.PORT || DEFAULT_PORT}`;
}

/** Builds the Vobiz answer_url carrying agent + campaign contact context. */
export function buildSchedulerAnswerUrl(agentId: string, contactId: string): string {
  const query = `agentId=${encodeURIComponent(agentId)}&contactId=${encodeURIComponent(contactId)}`;
  return `${resolvePublicBaseUrl()}/api/webhooks/vobiz/answer?${query}`;
}

/** Looks up an active outbound Vobiz provider for the campaign owner. */
async function findOutboundProvider(
  userId: string,
  providerId: string | null,
): Promise<Record<string, unknown> | null> {
  const where: Record<string, unknown> = {
    userId,
    isActive: true,
    direction: TELEPHONY_DIRECTION.OUTBOUND,
    provider: TELEPHONY_PROVIDER.VOBIZ,
  };
  if (providerId) where.id = providerId;
  const provider = await prisma.telephonyProvider.findFirst({ where });
  return provider as Record<string, unknown> | null;
}

/** Persists a new campaign status. */
async function setCampaignStatus(id: string, status: string): Promise<void> {
  await prisma.campaign.update({ where: { id }, data: { status } });
}

/**
 * Process a single scheduled/running campaign for one tick:
 *  - honour the start time and call window,
 *  - dispatch the next batch of pending contacts,
 *  - mark the campaign COMPLETED once nothing remains pending.
 */
export async function processScheduledCampaign(
  campaign: SchedulableCampaign,
  now: Date,
): Promise<void> {
  // Not due yet. Both sides are absolute instants, so this needs no zone.
  if (campaign.scheduledAt && now < campaign.scheduledAt) return;

  // Outside the allowed call window — wait for a later tick.
  if (!isWithinCallWindow(now, campaign.windowStart, campaign.windowEnd, campaign.timezone)) {
    logger.debug('Scheduled campaign held outside its call window', {
      campaignId: campaign.id,
      timezone: resolveTimeZone(campaign.timezone),
      windowStart: campaign.windowStart,
      windowEnd: campaign.windowEnd,
      localMinutes: getZonedMinutesSinceMidnight(now, campaign.timezone),
    });
    return;
  }

  if (!await canStartWalletCall(campaign.userId)) {
    await setCampaignStatus(campaign.id, CAMPAIGN_STATUS.FAILED);
    await prisma.campaignContact.updateMany({
      where: { campaignId: campaign.id, status: CAMPAIGN_CONTACT_STATUS.PENDING },
      data: {
        status: CAMPAIGN_CONTACT_STATUS.FAILED,
        errorMessage: UI_STRINGS.api.errors.insufficientBalance,
      },
    });
    logger.warn('Scheduled campaign blocked by insufficient wallet balance', {
      campaignId: campaign.id,
      userId: campaign.userId,
    });
    return;
  }

  // Promote a scheduled campaign to running once it is due and in-window.
  if (campaign.status === CAMPAIGN_STATUS.SCHEDULED) {
    await setCampaignStatus(campaign.id, CAMPAIGN_STATUS.RUNNING);
  }

  const contacts = await prisma.campaignContact.findMany({
    where: { campaignId: campaign.id, status: CAMPAIGN_CONTACT_STATUS.PENDING },
    select: { id: true, phoneNumber: true },
    orderBy: { createdAt: 'asc' },
    take: CAMPAIGN_SCHEDULER.BATCH_SIZE,
  });

  // Nothing left to dial — the campaign is done.
  if (contacts.length === 0) {
    await setCampaignStatus(campaign.id, CAMPAIGN_STATUS.COMPLETED);
    logger.info('Scheduled campaign completed', { campaignId: campaign.id });
    return;
  }

  const provider = await findOutboundProvider(campaign.userId, campaign.providerId);
  if (!provider) {
    await setCampaignStatus(campaign.id, CAMPAIGN_STATUS.FAILED);
    logger.warn('Scheduled campaign has no active provider', { campaignId: campaign.id });
    return;
  }

  const creds = extractVobizCredentials(provider);
  if (!creds) {
    await setCampaignStatus(campaign.id, CAMPAIGN_STATUS.FAILED);
    logger.warn('Scheduled campaign provider missing credentials', { campaignId: campaign.id });
    return;
  }

  await runCampaign({
    campaignId: campaign.id,
    agentId: campaign.agentId,
    contacts,
    creds,
    answerUrlBuilder: buildSchedulerAnswerUrl,
  });
}

/** One scheduler pass: process every scheduled or running campaign. */
export async function runSchedulerTick(now: Date = new Date()): Promise<void> {
  const campaigns = (await prisma.campaign.findMany({
    where: { status: { in: [CAMPAIGN_STATUS.SCHEDULED, CAMPAIGN_STATUS.RUNNING] } },
    select: {
      id: true,
      agentId: true,
      providerId: true,
      userId: true,
      status: true,
      scheduledAt: true,
      windowStart: true,
      windowEnd: true,
      timezone: true,
    },
  })) as SchedulableCampaign[];

  for (const campaign of campaigns) {
    try {
      await processScheduledCampaign(campaign, now);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('Scheduler failed to process campaign', { campaignId: campaign.id, error: errMsg });
    }
  }
}

let tickTimer: ReturnType<typeof setInterval> | null = null;

/** Starts the periodic scheduler. No-op if already running. */
export function startCampaignScheduler(): void {
  if (tickTimer) return;
  tickTimer = setInterval(() => {
    void runSchedulerTick();
  }, CAMPAIGN_SCHEDULER.TICK_INTERVAL_MS);
  // Do not keep the event loop alive solely for the scheduler.
  if (typeof tickTimer.unref === 'function') tickTimer.unref();
  logger.info('Campaign scheduler started', { intervalMs: CAMPAIGN_SCHEDULER.TICK_INTERVAL_MS });
}

/** Stops the periodic scheduler. */
export function stopCampaignScheduler(): void {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}
