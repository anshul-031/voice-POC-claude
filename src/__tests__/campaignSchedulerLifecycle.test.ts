/**
 * When the campaign scheduler runs, and more importantly when it does not.
 *
 * The scheduler used to tick on a fixed interval for the lifetime of the
 * process, querying the database every minute whether or not any campaign
 * existed. A database that suspends after a few minutes of inactivity therefore
 * never got the chance to, and an idle deployment consumed its entire monthly
 * compute allowance. These cases pin down the dormancy behaviour that fixed it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import prisma from '../lib/prisma.js';
import type { SchedulableCampaign } from '../services/campaignScheduler.js';
import {
  startCampaignScheduler,
  stopCampaignScheduler,
  wakeCampaignScheduler,
  isCampaignSchedulerRunning,
} from '../services/campaignSchedulerLoop.js';
import { CAMPAIGN_STATUS, CAMPAIGN_SCHEDULER } from '../types/index.js';

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

describe('campaign scheduler lifecycle', () => {
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
    vi.unstubAllEnvs();
  });

  /** Lets the un-awaited startup probe settle before the timer is inspected. */
  const settleStartupProbe = async (): Promise<void> => {
    await vi.advanceTimersByTimeAsync(0);
  };

  describe('startup', () => {
    it('stays dormant when no campaign is scheduled', async () => {
      (prisma.campaign.count as any).mockResolvedValue(0);

      startCampaignScheduler();
      await settleStartupProbe();

      expect(isCampaignSchedulerRunning()).toBe(false);
      // The single boot probe is the only query an idle deployment should cost.
      expect(prisma.campaign.count).toHaveBeenCalledTimes(1);
      expect(prisma.campaign.findMany).not.toHaveBeenCalled();
    });

    it('issues no queries at all while dormant', async () => {
      (prisma.campaign.count as any).mockResolvedValue(0);
      startCampaignScheduler();
      await settleStartupProbe();
      vi.clearAllMocks();

      await vi.advanceTimersByTimeAsync(TICK * 30);

      expect(prisma.campaign.findMany).not.toHaveBeenCalled();
      expect(prisma.campaignContact.updateMany).not.toHaveBeenCalled();
    });

    it('resumes a campaign left running by a previous process', async () => {
      // A restart mid-campaign must not strand it, which is what the boot probe
      // pays for.
      (prisma.campaign.count as any).mockResolvedValue(1);

      startCampaignScheduler();
      await settleStartupProbe();
      expect(isCampaignSchedulerRunning()).toBe(true);

      await vi.advanceTimersByTimeAsync(TICK);
      expect(prisma.campaign.findMany).toHaveBeenCalled();
    });

    it('survives a failing probe without arming the timer', async () => {
      (prisma.campaign.count as any).mockRejectedValue(new Error('db unreachable'));

      startCampaignScheduler();
      await settleStartupProbe();

      expect(isCampaignSchedulerRunning()).toBe(false);
    });
  });

  describe('disabled by env', () => {
    it('does not start', async () => {
      vi.stubEnv('CAMPAIGN_SCHEDULER_ENABLED', 'false');

      startCampaignScheduler();
      await settleStartupProbe();

      expect(isCampaignSchedulerRunning()).toBe(false);
      expect(prisma.campaign.count).not.toHaveBeenCalled();
    });

    it('ignores a wake request', () => {
      vi.stubEnv('CAMPAIGN_SCHEDULER_ENABLED', 'false');
      wakeCampaignScheduler();
      expect(isCampaignSchedulerRunning()).toBe(false);
    });

    it('is unaffected by any other value', async () => {
      vi.stubEnv('CAMPAIGN_SCHEDULER_ENABLED', 'true');
      (prisma.campaign.count as any).mockResolvedValue(1);

      startCampaignScheduler();
      await settleStartupProbe();

      expect(isCampaignSchedulerRunning()).toBe(true);
    });
  });

  describe('waking and sleeping', () => {
    it('wakes on demand rather than waiting to be polled', async () => {
      wakeCampaignScheduler('campaign scheduled');
      // Waking twice must not stack a second interval.
      wakeCampaignScheduler('campaign scheduled');
      expect(isCampaignSchedulerRunning()).toBe(true);

      await vi.advanceTimersByTimeAsync(TICK);
      expect(prisma.campaign.findMany).toHaveBeenCalledTimes(1);
    });

    it('goes back to sleep after consecutive work-free ticks', async () => {
      wakeCampaignScheduler();

      await vi.advanceTimersByTimeAsync(TICK * CAMPAIGN_SCHEDULER.IDLE_TICKS_BEFORE_SLEEP);

      expect(isCampaignSchedulerRunning()).toBe(false);
      expect(prisma.campaign.findMany)
        .toHaveBeenCalledTimes(CAMPAIGN_SCHEDULER.IDLE_TICKS_BEFORE_SLEEP);
    });

    it('keeps ticking while a campaign is still live', async () => {
      (prisma.campaign.findMany as any).mockResolvedValue([
        baseCampaign({ status: CAMPAIGN_STATUS.RUNNING }),
      ]);
      (prisma.campaignContact.count as any).mockResolvedValue(1);
      wakeCampaignScheduler();

      await vi.advanceTimersByTimeAsync(TICK * 5);

      expect(isCampaignSchedulerRunning()).toBe(true);
    });

    it('does not sleep on a tick that failed', async () => {
      (prisma.campaign.findMany as any).mockRejectedValue(new Error('db blip'));
      wakeCampaignScheduler();

      await vi.advanceTimersByTimeAsync(TICK * (CAMPAIGN_SCHEDULER.IDLE_TICKS_BEFORE_SLEEP + 1));

      // A database blip must not be mistaken for "no campaigns left".
      expect(isCampaignSchedulerRunning()).toBe(true);
    });

    it('resets its idle budget when work reappears', async () => {
      wakeCampaignScheduler();
      // One idle tick, short of the limit.
      await vi.advanceTimersByTimeAsync(TICK);
      expect(isCampaignSchedulerRunning()).toBe(true);

      (prisma.campaign.findMany as any).mockResolvedValue([
        baseCampaign({ status: CAMPAIGN_STATUS.RUNNING }),
      ]);
      (prisma.campaignContact.count as any).mockResolvedValue(1);
      await vi.advanceTimersByTimeAsync(TICK);

      // Having seen work, the scheduler owes a full idle run before sleeping.
      (prisma.campaign.findMany as any).mockResolvedValue([]);
      await vi.advanceTimersByTimeAsync(TICK * (CAMPAIGN_SCHEDULER.IDLE_TICKS_BEFORE_SLEEP - 1));
      expect(isCampaignSchedulerRunning()).toBe(true);
    });

    it('can be woken again after going dormant', async () => {
      wakeCampaignScheduler();
      await vi.advanceTimersByTimeAsync(TICK * CAMPAIGN_SCHEDULER.IDLE_TICKS_BEFORE_SLEEP);
      expect(isCampaignSchedulerRunning()).toBe(false);

      wakeCampaignScheduler('campaign scheduled');
      expect(isCampaignSchedulerRunning()).toBe(true);
    });

    it('stops cleanly and tolerates a redundant stop', () => {
      wakeCampaignScheduler();
      stopCampaignScheduler();
      stopCampaignScheduler();
      expect(isCampaignSchedulerRunning()).toBe(false);
    });
  });
});
