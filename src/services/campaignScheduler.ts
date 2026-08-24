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
import type { SchedulableCampaign, SchedulerTickResult } from '../types/index.js';
import { extractVobizCredentials, type VobizCredentials } from './vobizCalling.js';
import { runCampaign } from './campaignRunner.js';
import { resolveConcurrency } from '../utils/concurrency.js';
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

/**
 * Minutes from `from` until the campaign's call window next opens.
 *
 * Only called when the window is known to be shut. A degenerate window whose
 * start is the current minute yet reads as closed returns a full day rather
 * than zero, so it cannot spin the scheduler in a tight loop.
 */
function minutesUntilWindowOpen(from: Date, windowStart: string, timeZone?: string | null): number {
  const current = getZonedMinutesSinceMidnight(from, timeZone);
  const opensAt = parseTimeOfDay(windowStart);
  const delta = (opensAt - current + CAMPAIGN_SCHEDULER.MINUTES_PER_DAY)
    % CAMPAIGN_SCHEDULER.MINUTES_PER_DAY;
  return delta === 0 ? CAMPAIGN_SCHEDULER.MINUTES_PER_DAY : delta;
}

/**
 * When a campaign next becomes dialable, or null if it already is.
 *
 * This is what lets the scheduler sleep instead of polling. A campaign can be
 * held for two reasons — its start time has not arrived, or its call window is
 * shut — and both are predictable, so there is no need to keep asking.
 *
 * The result is a lower bound, not a guarantee: a window that opens after the
 * start time is resolved in one step, so an awkward combination may wake the
 * scheduler early. That costs a single query and is then re-evaluated, which is
 * the safe direction to be wrong in.
 */
export function nextDueInstant(campaign: SchedulableCampaign, now: Date): Date | null {
  const notBefore = campaign.scheduledAt && campaign.scheduledAt > now
    ? campaign.scheduledAt
    : now;

  if (isWithinCallWindow(notBefore, campaign.windowStart, campaign.windowEnd, campaign.timezone)) {
    return notBefore > now ? notBefore : null;
  }

  // `isWithinCallWindow` only reports false when both bounds are set.
  const minutes = minutesUntilWindowOpen(
    notBefore,
    campaign.windowStart as string,
    campaign.timezone,
  );
  return new Date(notBefore.getTime() + minutes * 60_000);
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

/** Builds the Vobiz hangup_url, the only completion signal an unanswered call has. */
export function buildSchedulerHangupUrl(agentId: string, contactId: string): string {
  const query = `agentId=${encodeURIComponent(agentId)}&contactId=${encodeURIComponent(contactId)}`;
  return `${resolvePublicBaseUrl()}/api/webhooks/vobiz/hangup?${query}`;
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

/** Counts a campaign's contacts in one status. */
async function countContacts(campaignId: string, status: string): Promise<number> {
  return prisma.campaignContact.count({ where: { campaignId, status } });
}

/**
 * Writes off contacts left on "calling" past the timeout.
 *
 * A contact leaves "calling" either when its media stream opens or when the
 * provider reports a hangup. If neither ever happens (callback lost, provider
 * misconfigured, process restarted mid-dial) the row would otherwise read
 * "Calling" indefinitely and permanently hold one of the provider's channels.
 */
export async function sweepStaleCallingContacts(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - CAMPAIGN_SCHEDULER.CALLING_TIMEOUT_MS);
  const { count } = await prisma.campaignContact.updateMany({
    where: {
      status: CAMPAIGN_CONTACT_STATUS.CALLING,
      updatedAt: { lt: cutoff },
    },
    data: {
      status: CAMPAIGN_CONTACT_STATUS.FAILED,
      errorMessage: UI_STRINGS.api.callOutcome.noProviderUpdate,
    },
  });

  if (count > 0) {
    logger.warn('Timed out campaign contacts stuck on calling', {
      count,
      timeoutMs: CAMPAIGN_SCHEDULER.CALLING_TIMEOUT_MS,
    });
  }
  return count;
}

/** Provider credentials plus the concurrency cap to dial within. */
interface CampaignDialer {
  creds: VobizCredentials;
  limit: number;
}

/**
 * Resolves the provider used to dial a campaign, failing the campaign when it
 * has no usable provider.
 */
async function resolveCampaignDialer(
  campaign: SchedulableCampaign,
): Promise<CampaignDialer | null> {
  const provider = await findOutboundProvider(campaign.userId, campaign.providerId);
  if (!provider) {
    await setCampaignStatus(campaign.id, CAMPAIGN_STATUS.FAILED);
    logger.warn('Scheduled campaign has no active provider', { campaignId: campaign.id });
    return null;
  }

  const creds = extractVobizCredentials(provider);
  if (!creds) {
    await setCampaignStatus(campaign.id, CAMPAIGN_STATUS.FAILED);
    logger.warn('Scheduled campaign provider missing credentials', { campaignId: campaign.id });
    return null;
  }

  return {
    creds,
    limit: resolveConcurrency(provider.concurrencyLimit as number | null | undefined),
  };
}

/**
 * Dials the next contacts that fit inside the provider's free channels.
 *
 * The batch is bounded by both the tick batch size and the concurrency the
 * provider still has spare, so a long campaign trickles out at the vendor's
 * rate instead of being rejected wholesale.
 */
async function dispatchNextBatch(
  campaign: SchedulableCampaign,
  dialer: CampaignDialer,
  activeCalls: number,
): Promise<void> {
  const slots = Math.max(0, dialer.limit - activeCalls);
  if (slots === 0) {
    logger.debug('Campaign held at provider concurrency limit', {
      campaignId: campaign.id,
      activeCalls,
      concurrencyLimit: dialer.limit,
    });
    return;
  }

  const contacts = await prisma.campaignContact.findMany({
    where: { campaignId: campaign.id, status: CAMPAIGN_CONTACT_STATUS.PENDING },
    select: { id: true, phoneNumber: true },
    orderBy: { createdAt: 'asc' },
    take: Math.min(CAMPAIGN_SCHEDULER.BATCH_SIZE, slots),
  });
  if (contacts.length === 0) return;

  await runCampaign({
    campaignId: campaign.id,
    agentId: campaign.agentId,
    contacts,
    creds: dialer.creds,
    concurrency: slots,
    answerUrlBuilder: buildSchedulerAnswerUrl,
    hangupUrlBuilder: buildSchedulerHangupUrl,
  });
}

/**
 * Completes a campaign with nothing left to dial — but only once its live calls
 * have reported back, so a campaign is never called finished while its numbers
 * are still ringing.
 */
async function completeWhenIdle(campaign: SchedulableCampaign, activeCalls: number): Promise<void> {
  if (activeCalls > 0) {
    logger.debug('Campaign waiting on live calls before completing', {
      campaignId: campaign.id,
      activeCalls,
    });
    return;
  }
  await setCampaignStatus(campaign.id, CAMPAIGN_STATUS.COMPLETED);
  logger.info('Scheduled campaign completed', { campaignId: campaign.id });
}

/**
 * Process a single scheduled/running campaign for one tick:
 *  - honour the start time and call window,
 *  - dispatch the next batch of pending contacts within the provider's limit,
 *  - mark the campaign COMPLETED once nothing is pending or in flight.
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

  const pending = await countContacts(campaign.id, CAMPAIGN_CONTACT_STATUS.PENDING);
  const activeCalls = await countContacts(campaign.id, CAMPAIGN_CONTACT_STATUS.CALLING);

  // Nothing left to dial — finish up once the calls already placed report back.
  // Checked before the wallet so a campaign that is merely waiting on its last
  // hangup callbacks costs no balance lookup, and so a campaign whose numbers
  // have all been dialled completes rather than being failed for funds it no
  // longer needs.
  if (pending === 0) {
    await completeWhenIdle(campaign, activeCalls);
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

  const dialer = await resolveCampaignDialer(campaign);
  if (!dialer) return;

  await dispatchNextBatch(campaign, dialer, activeCalls);
}

/**
 * One scheduler pass: process every campaign that is due right now.
 *
 * Campaigns that exist but are not yet dialable are not "work" for the purpose
 * of staying awake — reporting them as such is what previously kept a database
 * busy every minute until a future start time arrived. Their due instants are
 * returned instead so the caller can sleep until the earliest one.
 */
export async function runSchedulerTick(now: Date = new Date()): Promise<SchedulerTickResult> {
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

  // Release channels held by contacts whose hangup callback never arrived
  // before deciding how many new calls each campaign may place. This also runs
  // on a work-free tick, which is what frees contacts left mid-dial by a
  // campaign that was paused or written off after its calls went out.
  await sweepStaleCallingContacts(now);

  let active = false;
  let nextDueAt: Date | null = null;

  for (const campaign of campaigns) {
    try {
      const dueAt = nextDueInstant(campaign, now);
      if (dueAt) {
        if (!nextDueAt || dueAt < nextDueAt) nextDueAt = dueAt;
        continue;
      }
      // Due now. `processScheduledCampaign` repeats the start-time and window
      // checks, which keeps it correct when called directly.
      active = true;
      await processScheduledCampaign(campaign, now);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('Scheduler failed to process campaign', { campaignId: campaign.id, error: errMsg });
    }
  }

  return { active, nextDueAt };
}

