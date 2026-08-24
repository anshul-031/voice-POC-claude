/**
 * What the scheduler does while a campaign exists but is not yet dialable.
 *
 * Reporting a held campaign as "work" is what previously kept the scheduler
 * querying every minute until a future start time came around, holding a
 * scale-to-zero database open for hours or days. It now works out when the wait
 * ends and sleeps until then, which is the behaviour pinned down here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import prisma from '../lib/prisma.js';
import {
  runSchedulerTick,
  processScheduledCampaign,
  type SchedulableCampaign,
} from '../services/campaignScheduler.js';
import {
  stopCampaignScheduler,
  wakeCampaignScheduler,
  isCampaignSchedulerRunning,
} from '../services/campaignSchedulerLoop.js';
import { CAMPAIGN_STATUS, CAMPAIGN_CONTACT_STATUS, CAMPAIGN_SCHEDULER } from '../types/index.js';

vi.mock('../lib/prisma.js', () => ({
  default: {
    campaign: { findMany: vi.fn(), update: vi.fn(), count: vi.fn() },
    campaignContact: { findMany: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    user: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ walletBalance: 100, costPerMinute: 7 }),
    },
    telephonyProvider: { findFirst: vi.fn() },
  },
}));

vi.mock('../services/vobizCalling.js', () => ({
  extractVobizCredentials: vi.fn(),
}));

vi.mock('../services/campaignRunner.js', () => ({
  runCampaign: vi.fn(),
}));

const TICK = CAMPAIGN_SCHEDULER.TICK_INTERVAL_MS;

const baseCampaign = (overrides: Partial<SchedulableCampaign> = {}): SchedulableCampaign => ({
  id: 'camp-1',
  agentId: 'agent-1',
  providerId: 'prov-1',
  userId: 'user-1',
  status: CAMPAIGN_STATUS.SCHEDULED,
  scheduledAt: null,
  windowStart: null,
  windowEnd: null,
  timezone: null,
  ...overrides,
});
describe('sleeping until a campaign is due', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.campaignContact.updateMany as any).mockResolvedValue({ count: 0 });
    (prisma.campaignContact.count as any).mockResolvedValue(0);
    (prisma.campaign.findMany as any).mockResolvedValue([]);
    vi.useFakeTimers();
  });

  afterEach(() => {
    stopCampaignScheduler();
    vi.useRealTimers();
  });

  /** Holds one campaign back until `scheduledAt`, then runs a single tick. */
  const holdUntil = async (scheduledAt: string): Promise<void> => {
    (prisma.campaign.findMany as any).mockResolvedValue([
      baseCampaign({ scheduledAt: new Date(scheduledAt) }),
    ]);
    wakeCampaignScheduler();
    await vi.advanceTimersByTimeAsync(TICK);
  };

  it('reports a future campaign as pending rather than as work', async () => {
    const startsAt = new Date('2026-07-08T10:00:00Z');
    (prisma.campaign.findMany as any).mockResolvedValue([
      baseCampaign({ scheduledAt: startsAt }),
    ]);

    const result = await runSchedulerTick(new Date('2026-07-07T10:00:00Z'));

    expect(result).toEqual({ active: false, nextDueAt: startsAt });
    expect(prisma.campaign.update).not.toHaveBeenCalled();
  });

  it('reports the earliest due instant across several held campaigns', async () => {
    const soon = new Date('2026-07-07T12:00:00Z');
    (prisma.campaign.findMany as any).mockResolvedValue([
      baseCampaign({ id: 'late', scheduledAt: new Date('2026-07-09T12:00:00Z') }),
      baseCampaign({ id: 'soon', scheduledAt: soon }),
    ]);

    const result = await runSchedulerTick(new Date('2026-07-07T10:00:00Z'));

    expect(result).toEqual({ active: false, nextDueAt: soon });
  });

  it('still sweeps stale contacts on a tick where every campaign is held', async () => {
    (prisma.campaign.findMany as any).mockResolvedValue([
      baseCampaign({ scheduledAt: new Date('2026-07-09T10:00:00Z') }),
    ]);
    await runSchedulerTick(new Date('2026-07-07T10:00:00Z'));
    // A campaign paused mid-dial still needs its channels released.
    expect(prisma.campaignContact.updateMany).toHaveBeenCalled();
  });

  it('stops per-minute polling while a campaign waits for its start time', async () => {
    // This is the case that would otherwise hold the database open all night.
    vi.setSystemTime(new Date('2026-07-07T10:00:00Z'));
    await holdUntil('2026-07-07T12:00:00Z');
    vi.clearAllMocks();
    (prisma.campaign.findMany as any).mockResolvedValue([
      baseCampaign({ scheduledAt: new Date('2026-07-07T12:00:00Z') }),
    ]);

    // An hour of wall clock passes without a single query.
    await vi.advanceTimersByTimeAsync(TICK * 60);

    expect(prisma.campaign.findMany).not.toHaveBeenCalled();
    // The scheduler is still on the hook to run, just not polling.
    expect(isCampaignSchedulerRunning()).toBe(true);
  });

  it('resumes ticking once the start time arrives', async () => {
    vi.setSystemTime(new Date('2026-07-07T10:00:00Z'));
    const startsAt = '2026-07-07T11:00:00Z';
    await holdUntil(startsAt);
    vi.clearAllMocks();

    // Due by the time the sleep elapses.
    (prisma.campaign.findMany as any).mockResolvedValue([
      baseCampaign({ scheduledAt: new Date(startsAt) }),
    ]);
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

    expect(prisma.campaign.findMany).toHaveBeenCalled();
  });

  it('crosses sleep segments without querying for a far-future campaign', async () => {
    vi.setSystemTime(new Date('2026-07-07T10:00:00Z'));
    // A month out, many segments beyond the cap.
    await holdUntil('2026-08-07T10:00:00Z');
    vi.clearAllMocks();
    (prisma.campaign.findMany as any).mockResolvedValue([
      baseCampaign({ scheduledAt: new Date('2026-08-07T10:00:00Z') }),
    ]);

    // Several full segments elapse. Re-checking the clock is in-memory, so the
    // database is never contacted; a campaign scheduled years out is free.
    await vi.advanceTimersByTimeAsync(CAMPAIGN_SCHEDULER.MAX_SLEEP_MS * 4);

    expect(prisma.campaign.findMany).not.toHaveBeenCalled();
    expect(prisma.campaignContact.updateMany).not.toHaveBeenCalled();
    // Still waiting, not dormant.
    expect(isCampaignSchedulerRunning()).toBe(true);
  });

  it('costs nothing for a campaign scheduled a century out', async () => {
    // A delay that large cannot be handed to setTimeout directly: anything past
    // ~24 days overflows and fires immediately, which would spin the scheduler.
    // Segmenting the wait keeps the timer valid and the database untouched.
    vi.setSystemTime(new Date('2026-07-07T10:00:00Z'));
    await holdUntil('2126-07-07T10:00:00Z');
    vi.clearAllMocks();
    (prisma.campaign.findMany as any).mockResolvedValue([
      baseCampaign({ scheduledAt: new Date('2126-07-07T10:00:00Z') }),
    ]);

    await vi.advanceTimersByTimeAsync(CAMPAIGN_SCHEDULER.MAX_SLEEP_MS * 8);

    expect(prisma.campaign.findMany).not.toHaveBeenCalled();
    expect(prisma.campaignContact.updateMany).not.toHaveBeenCalled();
    expect(isCampaignSchedulerRunning()).toBe(true);
  });

  it('ticks once a multi-segment wait finally reaches its due time', async () => {
    vi.setSystemTime(new Date('2026-07-07T10:00:00Z'));
    // Two-and-a-bit segments out, so the wait spans several timers.
    const dueInMs = CAMPAIGN_SCHEDULER.MAX_SLEEP_MS * 2 + TICK;
    const dueAt = new Date(Date.now() + dueInMs);
    (prisma.campaign.findMany as any).mockResolvedValue([
      baseCampaign({ scheduledAt: dueAt }),
    ]);
    wakeCampaignScheduler();
    await vi.advanceTimersByTimeAsync(TICK);
    vi.clearAllMocks();
    (prisma.campaign.findMany as any).mockResolvedValue([
      baseCampaign({ scheduledAt: dueAt }),
    ]);

    await vi.advanceTimersByTimeAsync(dueInMs);

    expect(prisma.campaign.findMany).toHaveBeenCalled();
  });

  it('abandons a pending sleep when a campaign is triggered', async () => {
    vi.setSystemTime(new Date('2026-07-07T10:00:00Z'));
    await holdUntil('2026-07-09T10:00:00Z');
    vi.clearAllMocks();
    (prisma.campaign.findMany as any).mockResolvedValue([]);

    // Something due now must not wait behind a sleep set for two days out.
    wakeCampaignScheduler('campaign triggered');
    await vi.advanceTimersByTimeAsync(TICK);

    expect(prisma.campaign.findMany).toHaveBeenCalled();
  });

  it('is fully stoppable while sleeping', async () => {
    vi.setSystemTime(new Date('2026-07-07T10:00:00Z'));
    await holdUntil('2026-07-09T10:00:00Z');
    expect(isCampaignSchedulerRunning()).toBe(true);

    stopCampaignScheduler();
    expect(isCampaignSchedulerRunning()).toBe(false);

    vi.clearAllMocks();
    await vi.advanceTimersByTimeAsync(CAMPAIGN_SCHEDULER.MAX_SLEEP_MS * 2);
    expect(prisma.campaign.findMany).not.toHaveBeenCalled();
  });

  it('fails a due campaign whose owner cannot fund the calls', async () => {
    (prisma.campaignContact.count as any).mockResolvedValue(1);
    (prisma.user.findUniqueOrThrow as any).mockResolvedValue({
      walletBalance: 0,
      costPerMinute: 7,
    });

    await processScheduledCampaign(
      baseCampaign({ status: CAMPAIGN_STATUS.RUNNING }),
      new Date('2026-07-07T10:00:00Z'),
    );

    expect(prisma.campaign.update).toHaveBeenCalledWith({
      where: { id: 'camp-1' },
      data: { status: CAMPAIGN_STATUS.FAILED },
    });
    // Pending numbers are written off rather than left to look dialable.
    expect(prisma.campaignContact.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { campaignId: 'camp-1', status: CAMPAIGN_CONTACT_STATUS.PENDING },
      }),
    );
  });

  it('does not check the wallet for a campaign with nothing left to dial', async () => {
    // A campaign waiting on its last hangup callbacks used to pay for a balance
    // lookup on every tick, and could be failed for funds it no longer needed.
    (prisma.campaignContact.count as any).mockResolvedValue(0);

    await processScheduledCampaign(
      baseCampaign({ status: CAMPAIGN_STATUS.RUNNING }),
      new Date('2026-07-07T10:00:00Z'),
    );

    expect(prisma.user.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(prisma.campaign.update).toHaveBeenCalledWith({
      where: { id: 'camp-1' },
      data: { status: CAMPAIGN_STATUS.COMPLETED },
    });
  });
});
